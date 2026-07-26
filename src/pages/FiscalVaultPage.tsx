import {useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Archive, Download, Eye, RotateCcw, Search, Shield, ShieldOff} from "lucide-react";
import {useNavigate} from "react-router";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {AppDatePicker} from "../components/FormControls";
import {api, apiErrorMessage, downloadApiFile, downloadApiFileOrTemporaryUrl, listQuery} from "../lib/api";
import {date, integer} from "../lib/format";
import type {FiscalVaultExport, FiscalVaultItem} from "../lib/types";
import {useServerDataGridState} from "../lib/useServerDataGridState";

const DEFAULT_SORT: DataGridSortDescriptor = {column: "archived_at", direction: "descending"};
export const FISCAL_VAULT_MAX_EXPORT_DAYS = 366;
export const FISCAL_VAULT_MAX_EXPORT_DOCUMENTS = 20;
export const FISCAL_VAULT_MAX_EXPORT_MB = 200;
const DAY_MS = 86_400_000;
const VAULT_STATUS = {
  archiving: {color: "warning", label: "În curs de arhivare"},
  archived: {color: "default", label: "Arhivat"},
  imported: {color: "success", label: "Importat"},
  needs_attention: {color: "warning", label: "Necesită atenție"},
  storage_failed: {color: "danger", label: "Salvare eșuată"},
  unsupported: {color: "default", label: "Format nesuportat"},
} as const;

export function isCurrentExportDownload(
  variables: {companyId: string; exportId: string} | undefined,
  companyId: string | undefined,
  exportId: string | undefined,
): boolean {
  return variables !== undefined
    && companyId !== undefined
    && exportId !== undefined
    && variables.companyId === companyId
    && variables.exportId === exportId;
}

function dateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function fiscalVaultExportRangeError(from: string, to: string): string | null {
  if (!from || !to) return "Selectează ambele date pentru export.";
  const intervalDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
  if (intervalDays < 1) return "Data de sfârșit trebuie să fie după data de început.";
  if (intervalDays > FISCAL_VAULT_MAX_EXPORT_DAYS) return `Intervalul nu poate depăși ${FISCAL_VAULT_MAX_EXPORT_DAYS} zile.`;
  return null;
}

export function FiscalVaultPage() {
  const {company, can} = useCompany(); const navigate = useNavigate(); const client = useQueryClient(); const grid = useServerDataGridState({defaultSort: DEFAULT_SORT, sortColumns: ["archived_at", "issue_date", "supplier_name", "document_number"]});
  const [exportFrom, setExportFrom] = useState(() => dateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [exportTo, setExportTo] = useState(() => dateInputValue(new Date()));
  const [ignoredExportId, setIgnoredExportId] = useState<string | null>(null);
  const exportIntervalError = fiscalVaultExportRangeError(exportFrom, exportTo);
  const items = useQuery({queryKey: ["fiscal-vault", company?.id, grid.page, grid.debouncedSearch, grid.apiSort], enabled: Boolean(company?.id && can("fiscal_vault.view")), placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === company?.id ? previous : undefined, queryFn: () => api<FiscalVaultItem[]>(`/companies/${company!.id}/vault${listQuery({page: grid.page, perPage: 20, sort: grid.apiSort, filter: grid.debouncedSearch ? {document_number: {contains: grid.debouncedSearch}} : {}})}`)});
  const download = useMutation({mutationFn: ({companyId, item}: {companyId: string; item: FiscalVaultItem}) => downloadApiFile(`/companies/${companyId}/vault/${item.id}/download`, item.original?.filename ?? "document-anaf.zip")});
  const currentExport = useQuery({
    queryKey: ["fiscal-vault-export-current", company?.id],
    enabled: Boolean(company?.id && can("fiscal_vault.export")),
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status;
      return status === "queued" || status === "processing" ? 2500 : false;
    },
    queryFn: () => api<FiscalVaultExport | null>(`/companies/${company!.id}/vault-exports/current`),
  });
  const createExport = useMutation({
    mutationFn: ({companyId, from, to}: {companyId: string; from: string; to: string}) => api<FiscalVaultExport>(`/companies/${companyId}/vault-exports`, {method: "POST", body: JSON.stringify({from_date: from, to_date: to})}),
    onMutate: async ({companyId}) => {
      setIgnoredExportId(null);
      await client.cancelQueries({queryKey: ["fiscal-vault-export-current", companyId]});
    },
    onSuccess: (response, target) => client.setQueryData(["fiscal-vault-export-current", target.companyId], response),
  });
  const downloadExport = useMutation({mutationFn: ({companyId, exportId}: {companyId: string; exportId: string}) => downloadApiFileOrTemporaryUrl(`/companies/${companyId}/vault-exports/${exportId}/download`, "seif-fiscal.zip")});
  const legalHold = useMutation({
    mutationFn: ({companyId, item}: {companyId: string; item: FiscalVaultItem}) => api<FiscalVaultItem>(`/companies/${companyId}/vault/${item.id}/retention`, {method: "PATCH", body: JSON.stringify({legal_hold: !item.legal_hold_at})}),
    onSuccess: (_response, target) => { void client.invalidateQueries({queryKey: ["fiscal-vault", target.companyId]}); },
  });
  const createdExport = createExport.variables?.companyId === company?.id ? createExport.data?.data : null;
  const recoveredExport = createdExport && currentExport.data?.data?.id === createdExport.id
    ? currentExport.data.data
    : createdExport ?? currentExport.data?.data;
  const preparedExport = recoveredExport?.id === ignoredExportId ? null : recoveredExport;
  const downloadBelongsToCurrentCompany = download.variables?.companyId === company?.id;
  const legalHoldBelongsToCurrentCompany = legalHold.variables?.companyId === company?.id;
  const createExportBelongsToCurrentCompany = createExport.variables?.companyId === company?.id;
  const exportDownloadBelongsToCurrentExport = isCurrentExportDownload(
    downloadExport.variables,
    company?.id,
    preparedExport?.id,
  );
  const exportBusy = (createExportBelongsToCurrentCompany && createExport.isPending) || preparedExport?.status === "queued" || preparedExport?.status === "processing";
  const exportReady = preparedExport?.status === "ready";
  const resetPreparedExport = () => {
    createExport.reset();
    if (preparedExport?.status === "ready" || preparedExport?.status === "failed") setIgnoredExportId(preparedExport.id);
  };
  const rows = items.data?.data ?? []; const storage = items.data?.meta?.storage as {used_bytes?: number; disk?: string} | undefined;
  const columns = useMemo<DataGridColumn<FiscalVaultItem>[]>(() => [
    {id: "document_number", header: "Document", accessorKey: "document_number", allowsSorting: true, minWidth: 170, cellClassName: "font-semibold", cell: (item) => item.document_number ?? "Document ANAF"},
    {id: "supplier_name", header: "Furnizor", accessorKey: "supplier_name", allowsSorting: true, minWidth: 230, cell: (item) => <div><div>{item.supplier_name ?? "—"}</div><div className="text-xs text-[var(--text-muted)]">{item.supplier_tax_id}</div></div>},
    {id: "issue_date", header: "Emitere", accessorKey: "issue_date", allowsSorting: true, minWidth: 120, cell: (item) => date(item.issue_date)},
    {id: "archived_at", header: "Arhivat", accessorKey: "archived_at", allowsSorting: true, minWidth: 130, cell: (item) => date(item.archived_at)},
    {id: "status", header: "Status", minWidth: 150, cell: (item) => { const status = VAULT_STATUS[item.status]; return <Chip size="sm" variant="soft" color={status.color}><Chip.Label>{status.label}</Chip.Label></Chip>; }},
    {id: "signature_status", header: "Sigiliu MF", minWidth: 180, cell: () => <Chip size="sm" variant="soft" color="warning"><Chip.Label>Păstrat, neverificat</Chip.Label></Chip>},
    {id: "size", header: "Mărime", align: "end", minWidth: 110, cell: (item) => `${integer(Math.ceil((item.original?.size_bytes ?? 0) / 1024))} KB`},
    {id: "actions", header: "", align: "end", minWidth: 150, cell: (item) => <div className="flex justify-end gap-1"><Button isIconOnly size="sm" variant="ghost" aria-label={`Vezi detalii ${item.document_number ?? "document ANAF"}`} onPress={() => navigate(`/seif-fiscal/${item.id}`)}><Eye size={16}/></Button>{can("fiscal_vault.manage_retention") ? <Button isIconOnly size="sm" variant="ghost" aria-label={item.legal_hold_at ? "Elimină blocajul legal" : "Activează blocajul legal"} isDisabled={legalHold.isPending && legalHoldBelongsToCurrentCompany} onPress={() => {
      if (item.legal_hold_at && !window.confirm("Elimini blocajul legal pentru acest document? Acțiunea va fi înregistrată în audit.")) return;
      if (company) legalHold.mutate({companyId: company.id, item});
    }}>{item.legal_hold_at ? <ShieldOff size={16}/> : <Shield size={16}/>}</Button> : null}{can("fiscal_vault.download") ? <Button isIconOnly size="sm" variant="ghost" aria-label={`Descarcă ${item.document_number ?? "documentul"}`} isDisabled={!item.original || (download.isPending && downloadBelongsToCurrentCompany)} onPress={() => company && download.mutate({companyId: company.id, item})}><Download size={16}/></Button> : null}</div>},
  ], [can, company, download, downloadBelongsToCurrentCompany, legalHold, legalHoldBelongsToCurrentCompany, navigate]);
  if (!can("fiscal_vault.view")) return <p className="text-[var(--danger)]">Nu ai permisiunea necesară pentru Seiful fiscal.</p>;
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold">Spațiu utilizat: {integer(Math.ceil((storage?.used_bytes ?? 0) / 1024 / 1024))} MB</div><div className="text-xs text-[var(--text-muted)]">Originalele ZIP sunt read-only, cu hash SHA-256 și retenție fiscală.</div></div><div className="flex flex-wrap gap-2"><label className="flex h-10 min-w-[240px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3"><Search size={16}/><input className="w-full bg-transparent text-sm outline-none" placeholder="Caută numărul documentului…" value={grid.search} onChange={(event) => grid.setSearch(event.target.value)}/></label><Button size="sm" variant="outline" isDisabled={!grid.isDirty} onPress={grid.reset}><RotateCcw size={15}/> Resetează</Button></div></div>
    {can("fiscal_vault.export") ? <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"><AppDatePicker name="export_from" label="De la" ariaLabel="Export de la" className="min-w-[180px]" value={exportFrom} isDisabled={exportBusy} onChange={(value) => {resetPreparedExport(); setExportFrom(value);}}/><AppDatePicker name="export_to" label="Până la" ariaLabel="Export până la" className="min-w-[180px]" value={exportTo} minValue={exportFrom || undefined} maxValue={exportFrom ? addDays(exportFrom, FISCAL_VAULT_MAX_EXPORT_DAYS - 1) : undefined} isDisabled={exportBusy} onChange={(value) => {resetPreparedExport(); setExportTo(value);}}/>{exportReady ? <Button variant="primary" isPending={downloadExport.isPending && exportDownloadBelongsToCurrentExport} onPress={() => company && preparedExport && downloadExport.mutate({companyId: company.id, exportId: preparedExport.id})}><Download size={16}/> Descarcă exportul</Button> : <Button variant="outline" isDisabled={exportIntervalError !== null || currentExport.isLoading} isPending={exportBusy} onPress={() => company && createExport.mutate({companyId: company.id, from: exportFrom, to: exportTo})}><Archive size={16}/> Exportă Seiful</Button>}<p className={`text-xs ${exportIntervalError ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>{exportIntervalError ?? `Maximum ${FISCAL_VAULT_MAX_EXPORT_DOCUMENTS} documente și ${FISCAL_VAULT_MAX_EXPORT_MB} MB per export. Dacă perioada depășește limita, restrânge intervalul.`}</p></section> : null}
    {createExportBelongsToCurrentCompany && createExport.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(createExport.error, "Exportul nu a putut fi pornit.")}</p> : null}
    {currentExport.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(currentExport.error, "Starea exportului nu a putut fi verificată.")}</p> : null}
    {preparedExport?.status === "failed" ? <p role="alert" className="text-sm text-[var(--danger)]">Exportul a eșuat. Încearcă din nou.</p> : null}
    {(preparedExport?.status === "queued" || preparedExport?.status === "processing") ? <p role="status" className="text-sm text-[var(--text-muted)]">Exportul pentru {preparedExport.document_count} {preparedExport.document_count === 1 ? "document" : "documente"} este în pregătire pe o coadă separată.</p> : null}
    {download.isError && downloadBelongsToCurrentCompany ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(download.error, "Documentul nu a putut fi descărcat.")}</p> : null}
    {legalHold.isError && legalHoldBelongsToCurrentCompany ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(legalHold.error, "Politica de retenție nu a putut fi actualizată.")}</p> : null}
    {exportDownloadBelongsToCurrentExport && downloadExport.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(downloadExport.error, "Exportul nu a putut fi descărcat.")}</p> : null}
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"><DataTableLoadingOverlay isLoading={items.isFetching && !items.isLoading}/>{items.isLoading ? <div className="flex justify-center gap-2 py-24"><Spinner size="sm"/> Se încarcă…</div> : items.isError ? <EmptyState className="py-16"><EmptyState.Header><EmptyState.Media variant="icon"><Archive size={22}/></EmptyState.Media><EmptyState.Title>Seiful nu a putut fi încărcat</EmptyState.Title><EmptyState.Description>{apiErrorMessage(items.error, "Încearcă din nou în câteva momente.")}</EmptyState.Description></EmptyState.Header></EmptyState> : rows.length === 0 ? <EmptyState className="py-16"><EmptyState.Header><EmptyState.Media variant="icon"><Archive size={22}/></EmptyState.Media><EmptyState.Title>Seiful este gol</EmptyState.Title><EmptyState.Description>Primele documente vor fi salvate automat după sincronizarea e-Factura.</EmptyState.Description></EmptyState.Header></EmptyState> : <DataGrid aria-label="Seif fiscal" className="w-full" contentClassName="min-w-[1100px]" columns={columns} data={rows} getRowId={(row) => row.id} sortDescriptor={grid.sort} onSortChange={grid.setSort}/>}<DataTablePagination pagination={items.data?.meta?.pagination} onPageChange={grid.setPage}/></div>
  </div>;
}
