import {useMemo, useState} from "react";
import {useNavigate} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {RefreshCw, RotateCcw, Search, ShoppingCart} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, apiErrorMessage, listQuery} from "../lib/api";
import {date, money} from "../lib/format";
import type {PurchaseInvoice, SpvConnection} from "../lib/types";
import {useServerDataGridState} from "../lib/useServerDataGridState";

type Filter = "toate" | "nevalidate" | "validate" | "atentie";
const DEFAULT_SORT: DataGridSortDescriptor = {column: "issue_date", direction: "descending"};
const FILTERS: Array<{key: Filter; label: string; value?: string}> = [{key: "toate", label: "Toate"}, {key: "nevalidate", label: "De verificat", value: "unreviewed"}, {key: "validate", label: "Verificate", value: "reviewed"}, {key: "atentie", label: "Necesită atenție", value: "needs_attention"}];
export const PURCHASE_INVOICE_SYNC_POLLING_MS = 30_000;
export const shouldPollPurchaseInvoices = (pollingUntil: number, now = Date.now()) => now < pollingUntil;

export function PurchaseInvoicesPage() {
  const {company, can} = useCompany(); const navigate = useNavigate(); const client = useQueryClient();
  const [syncPollingUntil, setSyncPollingUntil] = useState(0);
  const grid = useServerDataGridState<Filter>({defaultSort: DEFAULT_SORT, sortColumns: ["number", "issue_date", "due_date", "total_cents"], filter: {param: "status", defaultValue: "toate", values: FILTERS.map((f) => f.key)}});
  const active = FILTERS.find((item) => item.key === (grid.filter ?? "toate"));
  const invoices = useQuery({queryKey: ["purchase-invoices", company?.id, grid.page, grid.filter, grid.debouncedSearch, grid.apiSort], enabled: Boolean(company?.id && can("purchase_invoice.view")), placeholderData: (previous) => previous, refetchInterval: () => shouldPollPurchaseInvoices(syncPollingUntil) ? 2500 : false, queryFn: () => api<PurchaseInvoice[]>(`/companies/${company!.id}/purchase-invoices${listQuery({page: grid.page, perPage: 20, sort: grid.apiSort, filter: {...(active?.value ? {review_status: active.value} : {}), ...(grid.debouncedSearch ? {search: {contains: grid.debouncedSearch}} : {})}})}`)});
  const connection = useQuery({queryKey: ["spv-connection", company?.id], enabled: Boolean(company?.id && can("purchase_invoice.view")), refetchInterval: () => shouldPollPurchaseInvoices(syncPollingUntil) ? 2500 : false, queryFn: () => api<SpvConnection>(`/efactura/spv/connection?company_profile_id=${company!.id}`)});
  const sync = useMutation({mutationFn: () => api<{queued: boolean}>(`/companies/${company!.id}/efactura/inbox/sync`, {method: "POST"}), onSuccess: () => {setSyncPollingUntil(Date.now() + PURCHASE_INVOICE_SYNC_POLLING_MS); void client.invalidateQueries({queryKey: ["purchase-invoices", company?.id]}); void client.invalidateQueries({queryKey: ["spv-connection", company?.id]});}});
  const rows = invoices.data?.data ?? [];
  const columns = useMemo<DataGridColumn<PurchaseInvoice>[]>(() => [
    {id: "number", header: "Număr", accessorKey: "number", allowsSorting: true, minWidth: 150, cellClassName: "font-semibold"},
    {id: "supplier", header: "Furnizor", minWidth: 240, cell: (invoice) => <div><div className="font-medium">{invoice.supplier?.name ?? "—"}</div><div className="text-xs text-[var(--text-muted)]">{invoice.supplier?.tax_id}</div></div>},
    {id: "issue_date", header: "Emitere", accessorKey: "issue_date", allowsSorting: true, minWidth: 125, cell: (invoice) => date(invoice.issue_date)},
    {id: "due_date", header: "Scadență", accessorKey: "due_date", allowsSorting: true, minWidth: 125, cell: (invoice) => date(invoice.due_date)},
    {id: "total_cents", header: "Total", accessorKey: "total_cents", allowsSorting: true, align: "end", minWidth: 150, cellClassName: "font-semibold tabular-nums", cell: (invoice) => money(invoice.total_cents, invoice.currency)},
    {id: "review_status", header: "Verificare", minWidth: 150, cell: (invoice) => <Chip size="sm" variant="soft" color={invoice.review_status === "reviewed" ? "success" : invoice.review_status === "needs_attention" ? "danger" : "warning"}><Chip.Label>{invoice.review_status === "reviewed" ? "Verificată" : invoice.review_status === "needs_attention" ? "Necesită atenție" : "De verificat"}</Chip.Label></Chip>},
  ], []);
  if (!can("purchase_invoice.view")) return <p className="text-[var(--danger)]">Nu ai permisiunea necesară pentru facturile furnizorilor.</p>;
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{FILTERS.map((item) => <Button key={item.key} size="sm" variant={(grid.filter ?? "toate") === item.key ? "primary" : "outline"} onPress={() => grid.setFilter(item.key)}>{item.label}</Button>)}
      <label className="flex h-10 min-w-[240px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3"><Search size={16}/><input className="w-full bg-transparent text-sm outline-none" placeholder="Număr, furnizor sau CUI…" value={grid.search} onChange={(event) => grid.setSearch(event.target.value)}/></label>
      <Button size="sm" variant="outline" isDisabled={!grid.isDirty} onPress={grid.reset}><RotateCcw size={15}/> Resetează</Button></div>
      {!company?.archived_at && can("efactura_inbox.sync") ? <Button variant="primary" isPending={sync.isPending} onPress={() => sync.mutate()}><RefreshCw size={16}/> Sincronizează e-Factura</Button> : null}</div>
    {connection.data?.data.inbox_last_error_code ? <p role="alert" className="text-sm text-[var(--danger)]">Ultima sincronizare ANAF a eșuat: <span className="font-mono">{connection.data.data.inbox_last_error_code}</span>.</p> : connection.data?.data.inbox_last_synced_at ? <p className="text-sm text-[var(--text-muted)]">Ultima sincronizare ANAF: {new Date(connection.data.data.inbox_last_synced_at).toLocaleString("ro-RO")}.</p> : connection.data?.data.inbox_enabled_at ? <p className="text-sm text-[var(--text-muted)]">Importul automat este activ; prima sincronizare completă este în așteptare.</p> : null}
    {sync.isSuccess ? <p role="status" className="text-sm text-[var(--success)]">Sincronizarea a fost pusă în coadă. Sunt preluate numai documentele sosite după activare.</p> : null}
    {sync.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{apiErrorMessage(sync.error, "Sincronizarea e-Factura nu a putut fi pornită.")}</p> : null}
    <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]"><DataTableLoadingOverlay isLoading={invoices.isFetching && !invoices.isLoading}/>
      {invoices.isLoading ? <div className="flex justify-center gap-2 py-24"><Spinner size="sm"/> Se încarcă…</div> : invoices.isError ? <div className="py-24 text-center text-[var(--danger)]">Facturile nu au putut fi încărcate.</div> : rows.length === 0 ? <EmptyState className="py-16"><EmptyState.Header><EmptyState.Media variant="icon"><ShoppingCart size={22}/></EmptyState.Media><EmptyState.Title>Nicio factură primită</EmptyState.Title><EmptyState.Description>Documentele noi vor apărea automat după sincronizarea cu ANAF.</EmptyState.Description></EmptyState.Header></EmptyState> : <DataGrid aria-label="Facturi furnizori" className="w-full" contentClassName="min-w-[900px]" columns={columns} data={rows} getRowId={(row) => row.id} sortDescriptor={grid.sort} onSortChange={grid.setSort} onRowAction={(key) => navigate(`/achizitii/${String(key)}`)}/>}<DataTablePagination pagination={invoices.data?.meta?.pagination} onPageChange={grid.setPage}/></div>
  </div>;
}
