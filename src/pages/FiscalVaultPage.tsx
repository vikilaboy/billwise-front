import {useMemo} from "react";
import {useMutation, useQuery} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Archive, Download, RotateCcw, Search, Shield, ShieldOff} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, apiErrorMessage, downloadApiFile, listQuery} from "../lib/api";
import {date, integer} from "../lib/format";
import type {FiscalVaultExport, FiscalVaultItem} from "../lib/types";
import {useServerDataGridState} from "../lib/useServerDataGridState";

const DEFAULT_SORT: DataGridSortDescriptor = {column: "archived_at", direction: "descending"};
const VAULT_STATUS = {
  archiving: {color: "warning", label: "În curs de arhivare"},
  archived: {color: "default", label: "Arhivat"},
  imported: {color: "success", label: "Importat"},
  needs_attention: {color: "warning", label: "Necesită atenție"},
  storage_failed: {color: "danger", label: "Salvare eșuată"},
  unsupported: {color: "default", label: "Format nesuportat"},
} as const;

export function FiscalVaultPage() {
  const {company, can} = useCompany(); const grid = useServerDataGridState({defaultSort: DEFAULT_SORT, sortColumns: ["archived_at", "issue_date", "supplier_name", "document_number"]});
  const items = useQuery({queryKey: ["fiscal-vault", company?.id, grid.page, grid.debouncedSearch, grid.apiSort], enabled: Boolean(company?.id && can("fiscal_vault.view")), placeholderData: (previous) => previous, queryFn: () => api<FiscalVaultItem[]>(`/companies/${company!.id}/vault${listQuery({page: grid.page, perPage: 20, sort: grid.apiSort, filter: grid.debouncedSearch ? {document_number: {contains: grid.debouncedSearch}} : {}})}`)});
  const download = useMutation({mutationFn: (item: FiscalVaultItem) => downloadApiFile(`/companies/${company!.id}/vault/${item.id}/download`, item.original?.filename ?? "document-anaf.zip")});
  const createExport = useMutation({mutationFn: () => api<FiscalVaultExport>(`/companies/${company!.id}/vault-exports`, {method: "POST"})});
  const exportStatus = useQuery({queryKey: ["fiscal-vault-export", company?.id, createExport.data?.data.id], enabled: Boolean(company?.id && createExport.data?.data.id), refetchInterval: (query) => query.state.data?.data.status === "ready" || query.state.data?.data.status === "failed" ? false : 2500, queryFn: () => api<FiscalVaultExport>(`/companies/${company!.id}/vault-exports/${createExport.data!.data.id}`)});
  const downloadExport = useMutation({mutationFn: () => downloadApiFile(`/companies/${company!.id}/vault-exports/${createExport.data!.data.id}/download`, "seif-fiscal.zip")});
  const legalHold = useMutation({
    mutationFn: (item: FiscalVaultItem) => api<FiscalVaultItem>(`/companies/${company!.id}/vault/${item.id}/retention`, {method: "PATCH", body: JSON.stringify({legal_hold: !item.legal_hold_at})}),
    onSuccess: () => items.refetch(),
  });
  const rows = items.data?.data ?? []; const storage = items.data?.meta?.storage as {used_bytes?: number; disk?: string} | undefined;
  const columns = useMemo<DataGridColumn<FiscalVaultItem>[]>(() => [
    {id: "document_number", header: "Document", accessorKey: "document_number", allowsSorting: true, minWidth: 170, cellClassName: "font-semibold", cell: (item) => item.document_number ?? "Document ANAF"},
    {id: "supplier_name", header: "Furnizor", accessorKey: "supplier_name", allowsSorting: true, minWidth: 230, cell: (item) => <div><div>{item.supplier_name ?? "—"}</div><div className="text-xs text-[var(--text-muted)]">{item.supplier_tax_id}</div></div>},
    {id: "issue_date", header: "Emitere", accessorKey: "issue_date", allowsSorting: true, minWidth: 120, cell: (item) => date(item.issue_date)},
    {id: "archived_at", header: "Arhivat", accessorKey: "archived_at", allowsSorting: true, minWidth: 130, cell: (item) => date(item.archived_at)},
    {id: "status", header: "Status", minWidth: 150, cell: (item) => { const status = VAULT_STATUS[item.status]; return <Chip size="sm" variant="soft" color={status.color}><Chip.Label>{status.label}</Chip.Label></Chip>; }},
    {id: "size", header: "Mărime", align: "end", minWidth: 110, cell: (item) => `${integer(Math.ceil((item.original?.size_bytes ?? 0) / 1024))} KB`},
    {id: "actions", header: "", align: "end", minWidth: 110, cell: (item) => <div className="flex justify-end gap-1">{can("fiscal_vault.manage_retention") ? <Button isIconOnly size="sm" variant="ghost" aria-label={item.legal_hold_at ? "Elimină blocajul legal" : "Activează blocajul legal"} isDisabled={legalHold.isPending} onPress={() => legalHold.mutate(item)}>{item.legal_hold_at ? <ShieldOff size={16}/> : <Shield size={16}/>}</Button> : null}{can("fiscal_vault.download") ? <Button isIconOnly size="sm" variant="ghost" aria-label={`Descarcă ${item.document_number ?? "documentul"}`} isDisabled={!item.original || download.isPending} onPress={() => download.mutate(item)}><Download size={16}/></Button> : null}</div>},
  ], [can, download, legalHold]);
  if (!can("fiscal_vault.view")) return <p className="text-[var(--danger)]">Nu ai permisiunea necesară pentru Seiful fiscal.</p>;
  return <div className="flex flex-col gap-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-semibold">Spațiu utilizat: {integer(Math.ceil((storage?.used_bytes ?? 0) / 1024 / 1024))} MB</div><div className="text-xs text-[var(--text-muted)]">Originalele ZIP sunt read-only, cu hash SHA-256 și retenție fiscală.</div></div><div className="flex flex-wrap gap-2"><label className="flex h-10 min-w-[240px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3"><Search size={16}/><input className="w-full bg-transparent text-sm outline-none" placeholder="Caută numărul documentului…" value={grid.search} onChange={(event) => grid.setSearch(event.target.value)}/></label><Button size="sm" variant="outline" isDisabled={!grid.isDirty} onPress={grid.reset}><RotateCcw size={15}/> Resetează</Button>{can("fiscal_vault.export") ? exportStatus.data?.data.status === "ready" ? <Button variant="primary" isPending={downloadExport.isPending} onPress={() => downloadExport.mutate()}><Download size={16}/> Descarcă exportul</Button> : <Button variant="outline" isPending={createExport.isPending || exportStatus.data?.data.status === "queued" || exportStatus.data?.data.status === "processing"} onPress={() => createExport.mutate()}><Archive size={16}/> Exportă Seiful</Button> : null}</div></div>
    {createExport.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(createExport.error, "Exportul nu a putut fi pornit.")}</p> : null}
    {createExport.isSuccess && exportStatus.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(exportStatus.error, "Starea exportului nu a putut fi verificată.")}</p> : null}
    {exportStatus.data?.data.status === "failed" ? <p role="alert" className="text-sm text-[var(--danger)]">Exportul a eșuat. Încearcă din nou.</p> : null}
    {createExport.isSuccess && !exportStatus.isError && exportStatus.data?.data.status !== "ready" && exportStatus.data?.data.status !== "failed" ? <p role="status" className="text-sm text-[var(--text-muted)]">Exportul cu manifest și hash-uri este în pregătire.</p> : null}
    {download.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(download.error, "Documentul nu a putut fi descărcat.")}</p> : null}
    {legalHold.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(legalHold.error, "Politica de retenție nu a putut fi actualizată.")}</p> : null}
    {downloadExport.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(downloadExport.error, "Exportul nu a putut fi descărcat.")}</p> : null}
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"><DataTableLoadingOverlay isLoading={items.isFetching && !items.isLoading}/>{items.isLoading ? <div className="flex justify-center gap-2 py-24"><Spinner size="sm"/> Se încarcă…</div> : items.isError ? <EmptyState className="py-16"><EmptyState.Header><EmptyState.Media variant="icon"><Archive size={22}/></EmptyState.Media><EmptyState.Title>Seiful nu a putut fi încărcat</EmptyState.Title><EmptyState.Description>{apiErrorMessage(items.error, "Încearcă din nou în câteva momente.")}</EmptyState.Description></EmptyState.Header></EmptyState> : rows.length === 0 ? <EmptyState className="py-16"><EmptyState.Header><EmptyState.Media variant="icon"><Archive size={22}/></EmptyState.Media><EmptyState.Title>Seiful este gol</EmptyState.Title><EmptyState.Description>Primele documente vor fi salvate automat după sincronizarea e-Factura.</EmptyState.Description></EmptyState.Header></EmptyState> : <DataGrid aria-label="Seif fiscal" className="w-full" contentClassName="min-w-[920px]" columns={columns} data={rows} getRowId={(row) => row.id} sortDescriptor={grid.sort} onSortChange={grid.setSort}/>}<DataTablePagination pagination={items.data?.meta?.pagination} onPageChange={grid.setPage}/></div>
  </div>;
}
