import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useSearchParams} from "react-router";
import {I18nProvider} from "react-aria-components";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Chip, Dropdown, Label, Separator, Spinner, Tooltip, type Selection} from "@heroui/react";
import {ActionBar} from "@heroui-pro/react/action-bar";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Banknote, Copy, Download, Eye, FileText, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Send, Trash2, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ConfirmDialog} from "../components/ConfirmDialog";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {AppCheckbox, AppDatePicker, AppSelect} from "../components/FormControls";
import {invoiceMonth, validInvoiceDate, loadInvoiceCustomers, loadFilteredInvoices, MAX_PDF_EXPORT, type InvoicePdfExport} from "../lib/invoiceExport";
import {useInvoiceSelection} from "../lib/useInvoiceSelection";
import {api, downloadApiFile, listQuery, openApiFile, type ListParams} from "../lib/api";
import type {Invoice, InvoiceDocumentType, InvoicePayment} from "../lib/types";
import {date, displayStatus, displayStatusLabels, money, statusTone} from "../lib/format";
import {useServerDataGridState} from "../lib/useServerDataGridState";

type FilterKey = "toate" | "ciorne" | "emise" | "neachitate" | "partiale" | "achitate" | "restante" | "anulate";

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: "toate", label: "Toate"},
  {key: "ciorne", label: "Ciorne"},
  {key: "emise", label: "Emise"},
  {key: "neachitate", label: "Neîncasate"},
  {key: "partiale", label: "Parțial încasate"},
  {key: "achitate", label: "Încasate"},
  {key: "restante", label: "Restante"},
  {key: "anulate", label: "Anulate"},
];
const DOCUMENT_FILTERS: Array<{key: "all" | InvoiceDocumentType; label: string}> = [
  {key: "all", label: "Toate documentele"},
  {key: "invoice", label: "Facturi"},
  {key: "correction", label: "Storno"},
  {key: "credit_note", label: "Note de credit"},
];
const DOCUMENT_LABELS: Record<InvoiceDocumentType, string> = {invoice: "Factură", correction: "Storno", credit_note: "Notă de credit"};

const PER_PAGE = 20;
const DEFAULT_SORT: DataGridSortDescriptor = {column: "issue_date", direction: "descending"};
const SORT_COLUMNS = ["formatted_number", "customer_name", "issue_date", "due_date", "total_cents"] as const;
const FILTER_CONFIG = {
  param: "status",
  defaultValue: "toate" as FilterKey,
  values: FILTERS.map((item) => item.key),
};

const displayFilter: Partial<Record<FilterKey, string>> = {
  ciorne: "draft",
  emise: "issued",
  anulate: "cancelled",
};

const paymentFilter: Partial<Record<FilterKey, Invoice["payment_status"]>> = {
  neachitate: "unpaid",
  partiale: "partial",
  achitate: "paid",
  restante: "overdue",
};

type Confirmation =
  | {kind: "issue"; invoice: Invoice}
  | {kind: "delete"; invoice: Invoice}
  | {kind: "settle"; invoice: Invoice}
  | {kind: "bulk-delete"; invoices: Invoice[]}
  | {kind: "bulk-settle"; invoices: Invoice[]}
  | null;

type BatchResult = {id: string; label: string; success: boolean};

function isSelectable(invoice: Invoice): boolean {
  return invoice.status === "draft" || invoice.status === "issued";
}

function canSettle(invoice: Invoice): boolean {
  return invoice.status === "issued" && invoice.document_type === "invoice" && invoice.balance_cents > 0;
}

export function InvoicesPage() {
  const {company} = useCompany();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [batchResult, setBatchResult] = useState<{kind: "delete" | "settle"; results: BatchResult[]} | null>(null);
  const [previewingPdfId, setPreviewingPdfId] = useState<string | null>(null);
  const grid = useServerDataGridState<FilterKey>({
    defaultSort: DEFAULT_SORT,
    sortColumns: SORT_COLUMNS,
    filter: FILTER_CONFIG,
    extraParams: ["payment_status", "efactura_status", "issue_from", "issue_to", "aging", "document_type", "customer_id"],
  });
  const filter = grid.filter ?? "toate";
  const dashboardPaymentStatus = searchParams.get("payment_status");
  const efacturaStatus = searchParams.get("efactura_status");
  const issueFrom = validInvoiceDate(searchParams.get("issue_from"));
  const issueTo = validInvoiceDate(searchParams.get("issue_to"));
  const customerId = searchParams.get("customer_id") ?? "";
  const malformedDate = Boolean((searchParams.get('issue_from') && !issueFrom) || (searchParams.get('issue_to') && !issueTo));
  const invalidPeriod = malformedDate || Boolean(issueFrom && issueTo && issueFrom > issueTo);
  const customers = useQuery({queryKey: ["invoice-filter-customers", company?.id],
    queryFn: ({signal}) => loadInvoiceCustomers(company!.id, signal), enabled: Boolean(company?.id)});
  const agingBucket = searchParams.get("aging");
  const requestedDocumentType = searchParams.get("document_type");
  const documentType = DOCUMENT_FILTERS.some((item) => item.key === requestedDocumentType) ? requestedDocumentType as "all" | InvoiceDocumentType : "all";
  const issueDateFilter: Record<string, string | number> = {};
  if (issueFrom) issueDateFilter.gte = issueFrom;
  if (issueTo) issueDateFilter.lte = issueTo;
  const dashboardFilters: NonNullable<ListParams["filter"]> = {
    ...(customerId ? {customer_id: customerId} : {}),
    ...(dashboardPaymentStatus ? {payment_status: dashboardPaymentStatus} : {}),
    ...(efacturaStatus ? {efactura_status: efacturaStatus} : {}),
    ...(issueFrom || issueTo ? {issue_date: issueDateFilter} : {}),
      ...(agingBucket ? {receivables_age: agingBucket} : {}),
      ...(documentType !== "all" ? {document_type: documentType} : {}),
  };
  const exportQuery = listQuery({
    sort: grid.apiSort,
    filter: {
      ...(filter in displayFilter ? {display_status: displayFilter[filter as keyof typeof displayFilter]} : {}),
      ...(paymentFilter[filter] ? {payment_status: paymentFilter[filter]} : {}),
      ...(grid.debouncedSearch ? {formatted_number: {contains: grid.debouncedSearch}} : {}),
      ...dashboardFilters,
    },
  });

  const invoices = useQuery({
    queryKey: ["invoices", company?.id, "list", grid.page, filter, documentType, grid.debouncedSearch, grid.apiSort, dashboardPaymentStatus, efacturaStatus, issueFrom, issueTo, agingBucket, customerId],
    queryFn: ({signal}) =>
      api<Invoice[]>(
        `/companies/${company!.id}/invoices${listQuery({
          page: grid.page,
          perPage: PER_PAGE,
          sort: grid.apiSort,
          filter: {
            ...(filter in displayFilter ? {display_status: displayFilter[filter as keyof typeof displayFilter]} : {}),
            ...(paymentFilter[filter] ? {payment_status: paymentFilter[filter]} : {}),
            ...(grid.debouncedSearch ? {formatted_number: {contains: grid.debouncedSearch}} : {}),
            ...dashboardFilters,
          },
        })}`,
        {signal},
      ),
    enabled: Boolean(company?.id) && !invalidPeriod,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === company?.id ? previous : undefined,
  });

  const rows = useMemo(() => invoices.data?.data ?? [], [invoices.data]);
  const selectionReady = Boolean(company?.id) && !invalidPeriod && !invoices.isFetching && !invoices.isPlaceholderData
    && invoices.isSuccess && grid.search.trim() === grid.debouncedSearch;
  const selectionScope = JSON.stringify([company?.id, filter, documentType, grid.search, dashboardPaymentStatus, efacturaStatus, issueFrom, issueTo, agingBucket, customerId]);
  const {selectedIds, selectedRows, setSelectedIds, selectRows} = useInvoiceSelection(rows, selectionScope);
  const selectableRows = useMemo(() => rows.filter(isSelectable), [rows]);
  const selectedDrafts = useMemo(() => selectedRows.filter((invoice) => invoice.status === "draft"), [selectedRows]);
  const selectedOutstanding = useMemo(() => selectedRows.filter(canSettle), [selectedRows]);
  const allSelectableSelected = selectableRows.length > 0 && selectableRows.every((invoice) => selectedIds.has(invoice.id));

  const selectionRequest = useRef<AbortController | null>(null);
  useEffect(() => () => selectionRequest.current?.abort(), [selectionScope]);
  const selectFiltered = useMutation({
    mutationFn: async () => {
      selectionRequest.current?.abort();
      const controller = new AbortController();
      selectionRequest.current = controller;
      const result = await loadFilteredInvoices(company!.id, {sort: grid.apiSort, filter: {
        ...(filter in displayFilter ? {display_status: displayFilter[filter]} : {}),
        ...(paymentFilter[filter] ? {payment_status: paymentFilter[filter]} : {}),
        ...(grid.debouncedSearch ? {formatted_number: {contains: grid.debouncedSearch}} : {}),
        ...dashboardFilters,
      }}, controller.signal);
      if (!controller.signal.aborted) {
        if (!result.length) throw new Error('Nu există documente emise pentru filtrele selectate.');
        selectRows(result);
      }
    },
  });
  const exportKey = ["invoice-pdf-export", company?.id];
  const pdfExport = useQuery({
    queryKey: exportKey,
    queryFn: ({signal}) => api<InvoicePdfExport | null>(`/companies/${company!.id}/invoice-pdf-exports/current`, {signal}),
    enabled: Boolean(company?.id),
    refetchInterval: (query) => ['queued', 'processing'].includes(query.state.data?.data?.status ?? '') ? 2000 : false,
  });
  const currentExport = pdfExport.data?.data;
  const exportBusy = currentExport?.status === 'queued' || currentExport?.status === 'processing';
  const createPdfExport = useMutation({
    onMutate: ({companyId}: {companyId: string; ids: string[]}) => queryClient.cancelQueries({queryKey: ["invoice-pdf-export", companyId]}),
    mutationFn: ({companyId, ids}: {companyId: string; ids: string[]}) => api<InvoicePdfExport>(`/companies/${companyId}/invoice-pdf-exports`, {
      method: 'POST', body: JSON.stringify({invoice_ids: ids}),
    }),
    onSuccess: async (result, variables) => {
      const key = ["invoice-pdf-export", variables.companyId];
      await queryClient.cancelQueries({queryKey: key});
      queryClient.setQueryData(key, result);
    },
    onError: () => { void queryClient.invalidateQueries({queryKey: exportKey}); },
  });
  const downloadPdfExport = useMutation({
    mutationFn: () => downloadApiFile(`/companies/${company!.id}/invoice-pdf-exports/${currentExport!.id}/download`, currentExport!.filename),
    onError: () => { void queryClient.invalidateQueries({queryKey: exportKey}); },
  });
  const exportUnavailable = selectedRows.some((invoice) => invoice.status !== 'issued')
    ? 'Exportul PDF acceptă doar documente emise. Elimină ciornele și documentele anulate din selecție.'
    : selectedRows.length > MAX_PDF_EXPORT ? `Selectează maximum ${MAX_PDF_EXPORT} de documente.` : null;

  function setInvoiceFilters(values: Record<string, string>) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
      next.delete('page');
      return next;
    });
  }

  const invalidateInvoiceData = () => {
    void queryClient.invalidateQueries({queryKey: ["invoices", company?.id]});
    void queryClient.invalidateQueries({queryKey: ["dashboard", company?.id]});
  };

  const action = useMutation({
    mutationFn: async ({invoice, kind}: {invoice: Invoice; kind: "issue" | "duplicate" | "delete"}) => {
      if (kind === "delete") {
        await api<void>(`/companies/${company!.id}/invoices/${invoice.id}`, {method: "DELETE"});
        return null;
      }
      return api<Invoice>(`/companies/${company!.id}/invoices/${invoice.id}/${kind}`, {method: "POST"});
    },
    onSuccess: (result, variables) => {
      invalidateInvoiceData();
      setConfirmation(null);
      if (variables.kind === "duplicate" && result) navigate(`/facturi/${result.data.id}`);
    },
  });
  const bulkDelete = useMutation({
    mutationFn: async (targets: Invoice[]) => {
      const results = await Promise.allSettled(targets.map((invoice) =>
        api<void>(`/companies/${company!.id}/invoices/${invoice.id}`, {method: "DELETE"})));
      return results.map((result, index) => ({
        id: targets[index].id,
        label: targets[index].formatted_number,
        success: result.status === "fulfilled",
      }));
    },
    onSuccess: (results) => {
      setSelectedIds(new Set(results.filter((result) => !result.success).map((result) => result.id)));
      setBatchResult({kind: "delete", results});
      setConfirmation(null);
      invalidateInvoiceData();
    },
  });
  const settleInvoices = useMutation({
    mutationFn: async (targets: Invoice[]) => {
      const results = await Promise.allSettled(targets.map((invoice) =>
        api<InvoicePayment>(`/companies/${company!.id}/invoices/${invoice.id}/payments`, {
          method: "POST",
          body: JSON.stringify({
            amount_cents: invoice.balance_cents,
            currency: invoice.currency,
            paid_at: new Date().toISOString().slice(0, 10),
            method: "bank_transfer",
            reference: null,
            notes: "Încasare integrală din lista de facturi",
          }),
        })));
      return results.map((result, index) => ({
        id: targets[index].id,
        label: targets[index].formatted_number,
        success: result.status === "fulfilled",
      }));
    },
    onSuccess: (results) => {
      setSelectedIds(new Set(results.filter((result) => !result.success).map((result) => result.id)));
      setBatchResult({kind: "settle", results});
      setConfirmation(null);
      invalidateInvoiceData();
    },
  });
  const exportInvoices = useMutation({
    mutationFn: () => downloadApiFile(`/companies/${company!.id}/invoices/export${exportQuery}`, "facturi.csv"),
  });

  async function previewPdf(invoice: Invoice) {
    setPreviewingPdfId(invoice.id);
    try {
      await openApiFile(`/companies/${company!.id}/invoices/${invoice.id}/pdf`);
    } finally {
      setPreviewingPdfId(null);
    }
  }

  function confirmAction() {
    if (!confirmation) return;
    if (confirmation.kind === "issue" || confirmation.kind === "delete") {
      action.mutate({invoice: confirmation.invoice, kind: confirmation.kind});
    } else if (confirmation.kind === "settle") {
      settleInvoices.mutate([confirmation.invoice]);
    } else if (confirmation.kind === "bulk-delete") {
      bulkDelete.mutate(confirmation.invoices);
    } else {
      settleInvoices.mutate(confirmation.invoices);
    }
  }

  const columns = useMemo<DataGridColumn<Invoice>[]>(
    () => [
      {
        id: "select",
        header: selectableRows.length > 0 ? (
          <AppCheckbox
            name="select_all_invoices"
            slot="selection"
            ariaLabel="Selectează facturile eligibile de pe pagină"
            isDisabled={!selectionReady}
            isSelected={allSelectableSelected}
            isIndeterminate={!allSelectableSelected && selectableRows.some((invoice) => selectedIds.has(invoice.id))}
            onChange={(selected) => setSelectedIds((previous) => {
              const next = new Set(previous);
              selectableRows.forEach((invoice) => selected ? next.add(invoice.id) : next.delete(invoice.id));
              return next;
            })}
          >
            <span className="sr-only">Selectează pagina</span>
          </AppCheckbox>
        ) : "",
        minWidth: 48,
        cell: (invoice) => isSelectable(invoice) ? (
          <AppCheckbox
            name="selected_invoices"
            slot="selection"
            value={invoice.id}
            ariaLabel={`Selectează ${invoice.formatted_number}`}
            isDisabled={!selectionReady}
            isSelected={selectedIds.has(invoice.id)}
            onChange={(selected) => setSelectedIds((current) => {
              const next = new Set(current);
              if (selected) next.add(invoice.id); else next.delete(invoice.id);
              return next;
            })}
          ><span className="sr-only">{`Selectează ${invoice.formatted_number}`}</span></AppCheckbox>
        ) : null,
      },
      {
        id: "formatted_number",
        header: "Număr",
        accessorKey: "formatted_number",
        isRowHeader: true,
        allowsSorting: true,
        minWidth: 140,
        cellClassName: "font-semibold",
      },
      {
        id: "customer_name",
        header: "Client",
        allowsSorting: true,
        minWidth: 220,
        cell: (invoice) => invoice.customer?.name ?? "—",
      },
      {
        id: "document_type",
        header: "Tip",
        minWidth: 130,
        cell: (invoice) => <Chip size="sm" variant="soft" color={invoice.document_type === "invoice" ? "default" : "accent"}><Chip.Label>{DOCUMENT_LABELS[invoice.document_type]}</Chip.Label></Chip>,
      },
      {
        id: "issue_date",
        header: "Emitere",
        accessorKey: "issue_date",
        allowsSorting: true,
        minWidth: 130,
        cellClassName: "tabular-nums",
        cell: (invoice) => date(invoice.issue_date),
      },
      {
        id: "due_date",
        header: "Scadență",
        accessorKey: "due_date",
        allowsSorting: true,
        minWidth: 130,
        cellClassName: "tabular-nums",
        cell: (invoice) => date(invoice.due_date),
      },
      {
        id: "total_cents",
        header: "Valoare",
        accessorKey: "total_cents",
        allowsSorting: true,
        align: "end",
        minWidth: 160,
        cellClassName: "font-semibold tabular-nums",
        cell: (invoice) => <span className={invoice.financial_direction === "credit" ? "text-[var(--accent)]" : undefined}>{money(invoice.signed_total_cents, invoice.currency)}</span>,
      },
      {
        id: "balance",
        header: "Sold",
        align: "end",
        minWidth: 150,
        cellClassName: "font-semibold tabular-nums",
        cell: (invoice) => money(invoice.balance_cents, invoice.currency),
      },
      {
        id: "status",
        header: "Status",
        minWidth: 130,
        cell: (invoice) => {
          const status = displayStatus(invoice);
          const paymentLabels = {unpaid: "Neîncasată", partial: "Parțial încasată", paid: "Încasată", overdue: "Restantă", not_applicable: DOCUMENT_LABELS[invoice.document_type]};
          const label = invoice.status === "issued" ? paymentLabels[invoice.payment_status] : displayStatusLabels[status];
          return (
            <Chip size="sm" color={invoice.payment_status === "paid" ? "success" : statusTone[status]} variant="soft">
              <Chip.Label>{label}</Chip.Label>
            </Chip>
          );
        },
      },
      {
        id: "actions",
        header: "Acțiuni",
        align: "end",
        minWidth: 180,
        cell: (invoice) => (
          <div className="flex justify-end gap-1">
            {invoice.status !== "draft" ? (
              <Tooltip delay={300}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Vezi PDF ${invoice.formatted_number}`}
                  isDisabled={previewingPdfId === invoice.id}
                  onPress={() => void previewPdf(invoice)}
                >
                  {previewingPdfId === invoice.id ? <Spinner size="sm" /> : <Eye size={15} />}
                </Button>
                <Tooltip.Content>Vezi PDF</Tooltip.Content>
              </Tooltip>
            ) : null}
            {canSettle(invoice) ? (
              <Tooltip delay={300}>
                <Button
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  aria-label={`Marchează ${invoice.formatted_number} ca încasată`}
                  onPress={() => setConfirmation({kind: "settle", invoice})}
                >
                  <Banknote size={15} className="text-[var(--success)]" />
                </Button>
                <Tooltip.Content>Marchează ca încasată</Tooltip.Content>
              </Tooltip>
            ) : null}
            <Dropdown>
              <Tooltip delay={300}>
                <Button isIconOnly size="sm" variant="ghost" aria-label={`Mai multe acțiuni pentru ${invoice.formatted_number}`}>
                  <MoreHorizontal size={16} />
                </Button>
                <Tooltip.Content>Mai multe acțiuni</Tooltip.Content>
              </Tooltip>
              <Dropdown.Popover placement="bottom end" className="min-w-[200px]">
                <Dropdown.Menu onAction={(key) => {
                  if (key === "open") navigate(`/facturi/${invoice.id}`);
                  if (key === "edit") navigate(invoice.document_type === "correction" ? `/facturi/${invoice.id}` : `/facturi/${invoice.id}/editeaza`);
                  if (key === "issue") setConfirmation({kind: "issue", invoice});
                  if (key === "duplicate") action.mutate({invoice, kind: "duplicate"});
                  if (key === "delete") setConfirmation({kind: "delete", invoice});
                }}>
                  <Dropdown.Item id="open" textValue="Deschide factura">
                    <FileText size={15} /><Label>Deschide factura</Label>
                  </Dropdown.Item>
                  {invoice.status === "draft" ? (
                    <Dropdown.Item id="edit" textValue="Editează">
                      <Pencil size={15} /><Label>Editează</Label>
                    </Dropdown.Item>
                  ) : null}
                  {invoice.status === "draft" ? (
                    <Dropdown.Item id="issue" textValue="Emite">
                      <Send size={15} /><Label>Emite</Label>
                    </Dropdown.Item>
                  ) : null}
                  {invoice.document_type === "invoice" ? (
                    <Dropdown.Item id="duplicate" textValue="Duplică">
                      <Copy size={15} /><Label>Duplică</Label>
                    </Dropdown.Item>
                  ) : null}
                  {invoice.status === "draft" ? (
                    <Dropdown.Item id="delete" textValue="Șterge" variant="danger">
                      <Trash2 size={15} /><Label>Șterge</Label>
                    </Dropdown.Item>
                  ) : null}
                </Dropdown.Menu>
              </Dropdown.Popover>
            </Dropdown>
          </div>
        ),
      },
    ],
    [action, allSelectableSelected, navigate, previewingPdfId, selectableRows, selectedIds, selectedRows.length, setSelectedIds, selectionReady],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: segmented filters + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex flex-wrap gap-[3px] rounded-xl bg-[var(--bg-muted)] p-[3px]">
            {FILTERS.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => grid.setFilter(item.key)}
                  aria-pressed={active}
                  className={
                    "rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors " +
                    (active
                      ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text)]")
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <label className="flex h-10 min-w-[220px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3">
            <Search size={16} className="text-[var(--faint)]" />
            <input
              value={grid.search}
              onChange={(event) => grid.setSearch(event.target.value)}
              placeholder="Caută după număr…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
            />
          </label>
          <Button variant="outline" size="sm" isDisabled={!grid.isDirty} onPress={grid.reset}>
            <RotateCcw size={15} /> Resetează
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" isDisabled={exportInvoices.isPending || !selectionReady} onPress={() => exportInvoices.mutate()}>
            <Download size={16} /> Exportă CSV
          </Button>
          <Button variant="primary" onPress={() => navigate("/facturi/noi")}>
            <Plus size={17} /> Emite factură
          </Button>
          <Button variant="outline" onPress={() => navigate("/facturi/noi?type=credit_note")}>
            <Plus size={17} /> Notă de credit
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Filtru tip document">
        {DOCUMENT_FILTERS.map((item) => <button key={item.key} type="button" aria-pressed={documentType === item.key} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${documentType === item.key ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)]"}`} onClick={() => {
          const next = new URLSearchParams(searchParams);
          if (item.key === "all") next.delete("document_type"); else next.set("document_type", item.key);
          next.delete("page");
          setSearchParams(next);
        }}>{item.label}</button>)}
      </div>
      <div className="flex flex-wrap items-end gap-3" aria-label="Filtre facturi">
        <AppSelect ariaLabel="Filtrează după client" label="Client" className="w-full sm:w-64" value={customerId || 'all'}
          isDisabled={customers.isLoading} options={[{id: 'all', label: 'Toți clienții'}, ...(customers.data ?? []).map((customer) => ({id: customer.id, label: customer.name}))]}
          onChange={(value) => setInvoiceFilters({customer_id: value === 'all' ? '' : value})} />
        <I18nProvider locale="ro-RO">
          <AppDatePicker name="issue_from" label="Emise de la" ariaLabel="Emise de la" className="w-full min-w-0 sm:w-44" value={issueFrom} maxValue={issueTo || undefined} onChange={(value) => setInvoiceFilters({issue_from: value})} />
          <AppDatePicker name="issue_to" label="Până la" ariaLabel="Emise până la" className="w-full min-w-0 sm:w-44" value={issueTo} minValue={issueFrom || undefined} onChange={(value) => setInvoiceFilters({issue_to: value})} />
        </I18nProvider>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onPress={() => setInvoiceFilters(invoiceMonth(0))}>Luna curentă</Button>
          <Button variant="ghost" onPress={() => setInvoiceFilters(invoiceMonth(-1))}>Luna trecută</Button>
        </div>
      </div>
      {customers.isError ? <p role="alert" className="text-sm text-[var(--danger)]">Clienții nu au putut fi încărcați. <Button variant="ghost" onPress={() => void customers.refetch()}>Reîncearcă</Button></p> : null}
      {invalidPeriod ? <p role="alert" className="text-sm text-[var(--danger)]">{malformedDate ? 'Perioada din adresă conține o dată invalidă. Alege din nou perioada sau resetează filtrele.' : 'Data de început trebuie să fie înaintea datei de sfârșit.'}</p> : null}
      {currentExport ? <div role="status" className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
        {exportBusy ? <><Spinner size="sm" /> Se pregătesc {currentExport.document_count} PDF-uri. Poți reveni aici pentru descărcare.</> : null}
        {currentExport.status === 'ready' ? <>{currentExport.document_count} PDF-uri pregătite · Disponibile până la {date(currentExport.expires_at)}
          <Button variant="outline" isDisabled={downloadPdfExport.isPending} onPress={() => downloadPdfExport.mutate()}><Download size={16} /> Descarcă arhiva ZIP</Button></> : null}
        {currentExport.status === 'failed' ? <span className="text-[var(--danger)]">{currentExport.failure}</span> : null}
      </div> : null}
      {selectedRows.length > 0 ? <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
        <span>{selectedRows.length} documente selectate, inclusiv de pe alte pagini.</span>
        <Button variant="ghost" isDisabled={selectFiltered.isPending || !selectionReady}
          className="h-auto max-w-full whitespace-normal text-left" onPress={() => selectFiltered.mutate()}>Selectează toate documentele emise pentru PDF</Button>
        {exportUnavailable ? <span>{exportUnavailable}</span> : null}
      </div> : null}
      {selectFiltered.isError && !(selectFiltered.error instanceof DOMException && selectFiltered.error.name === 'AbortError') ? <p role="alert" className="text-sm text-[var(--danger)]">{selectFiltered.error.message}</p> : null}
      {batchResult ? (
        <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {batchResult.results.filter((result) => result.success).length} facturi {
            batchResult.kind === "settle" ? "marcate ca încasate" : "șterse"
          }.
          {batchResult.results.some((result) => !result.success)
            ? ` Operația a eșuat pentru: ${batchResult.results.filter((result) => !result.success).map((result) => result.label).join(", ")}.`
            : ""}
        </p>
      ) : null}
      {/* Table card */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <DataTableLoadingOverlay isLoading={invoices.isFetching && !invoices.isLoading} />
        {invalidPeriod ? <p className="p-8 text-sm">Corectează perioada pentru a afișa facturile.</p> : invoices.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă facturile…
          </div>
        ) : invoices.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            Facturile nu au putut fi încărcate.
          </div>
        ) : rows.length === 0 ? (
          <EmptyState className="py-16">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <FileText size={22} />
              </EmptyState.Media>
              <EmptyState.Title>Nicio factură aici</EmptyState.Title>
              <EmptyState.Description>
                Nu există documente pentru filtrul selectat. Emite prima factură pentru a începe.
              </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <Button variant="primary" onPress={() => navigate("/facturi/noi")}>
                <Plus size={17} /> Emite factură
              </Button>
              <Button variant="outline" onPress={() => navigate("/facturi/noi?type=credit_note")}>
                <Plus size={17} /> Creează notă de credit
              </Button>
            </EmptyState.Content>
          </EmptyState>
        ) : (
          <DataGrid
            aria-label="Facturi"
            className="w-full"
            contentClassName="min-w-[900px]"
            columns={columns}
            data={rows}
            getRowId={(invoice) => invoice.id}
            selectedKeys={new Set(rows.filter((invoice) => selectedIds.has(invoice.id)).map((invoice) => invoice.id))}
            selectionBehavior="toggle"
            selectionMode="multiple"
            disabledKeys={!selectionReady ? rows.map((invoice) => invoice.id) : []}
            sortDescriptor={grid.sort}
            onSelectionChange={(keys: Selection) => {
              if (!selectionReady) return;
              if (keys === "all") {
                setSelectedIds((previous) => new Set([...previous, ...selectableRows.map((invoice) => invoice.id)]));
                return;
              }
              const eligibleIds = new Set(selectableRows.map((invoice) => invoice.id));
              setSelectedIds((previous) => new Set([
                ...[...previous].filter((id) => !rows.some((row) => row.id === id)),
                ...[...keys].map(String).filter((id) => eligibleIds.has(id)),
              ]));
            }}
            onSortChange={grid.setSort}
            onRowAction={(key) => navigate(`/facturi/${String(key)}`)}
          />
        )}
        <DataTablePagination pagination={invoices.data?.meta?.pagination} onPageChange={grid.setPage} />
      </div>

      <ActionBar aria-label="Acțiuni pentru facturile selectate" isOpen={selectedRows.length > 0}>
        <ActionBar.Prefix>
          <Chip size="sm" className="shrink-0 tabular-nums">
            <Chip.Label>{selectedRows.length} selectate</Chip.Label>
          </Chip>
        </ActionBar.Prefix>
        <Separator orientation="vertical" />
        <ActionBar.Content>
          <Button size="sm" variant="ghost" aria-label="Exportă PDF-urile selectate"
            isDisabled={Boolean(exportUnavailable) || exportBusy || createPdfExport.isPending || selectFiltered.isPending || !selectionReady}
            onPress={() => createPdfExport.mutate({companyId: company!.id, ids: [...selectedIds]})}>
            <Download size={15} /><span className="action-bar__label">Exportă PDF-uri</span>
          </Button>
          {selectedOutstanding.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={selectedOutstanding.length === 1
                ? "Marchează factura selectată ca încasată"
                : `Marchează ${selectedOutstanding.length} facturi ca încasate`}
              onPress={() => setConfirmation({kind: "bulk-settle", invoices: selectedOutstanding})}
            >
              <Banknote size={15} />
              <span className="action-bar__label">Marchează încasate ({selectedOutstanding.length})</span>
            </Button>
          ) : null}
          {selectedDrafts.length > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-[var(--danger)]"
              aria-label={`Șterge ${selectedDrafts.length} ciorne`}
              onPress={() => setConfirmation({kind: "bulk-delete", invoices: selectedDrafts})}
            >
              <Trash2 size={15} />
              <span className="action-bar__label">Șterge ciorne ({selectedDrafts.length})</span>
            </Button>
          ) : null}
        </ActionBar.Content>
        <Separator orientation="vertical" />
        <ActionBar.Suffix>
          <Tooltip delay={300}>
            <Button isIconOnly size="sm" variant="ghost" aria-label="Golește selecția" onPress={() => setSelectedIds(new Set())}>
              <X size={15} />
            </Button>
            <Tooltip.Content>Golește selecția</Tooltip.Content>
          </Tooltip>
        </ActionBar.Suffix>
      </ActionBar>

      <ConfirmDialog
        isOpen={confirmation !== null}
        title={
          confirmation?.kind === "issue" ? "Emiți această factură?"
            : confirmation?.kind === "delete" ? "Ștergi această ciornă?"
              : confirmation?.kind === "bulk-delete" ? `Ștergi ${confirmation.invoices.length} ciorne?`
                : confirmation?.kind === "bulk-settle"
                  ? confirmation.invoices.length === 1
                    ? "Marchezi factura selectată ca încasată?"
                    : `Marchezi ${confirmation.invoices.length} facturi ca încasate?`
                  : "Marchezi factura ca încasată?"
        }
        description={
          confirmation?.kind === "issue"
            ? "După emitere, conținutul fiscal nu mai poate fi editat."
            : confirmation?.kind === "delete" || confirmation?.kind === "bulk-delete"
              ? "Ciornele selectate vor fi șterse definitiv. Facturile emise nu sunt afectate."
              : "Se înregistrează soldul integral ca transfer bancar, cu data de azi. Fiecare factură își păstrează moneda."
        }
        confirmLabel={
          confirmation?.kind === "issue" ? "Emite factura"
            : confirmation?.kind === "delete" || confirmation?.kind === "bulk-delete" ? "Șterge"
              : "Marchează încasată"
        }
        tone={
          confirmation?.kind === "delete" || confirmation?.kind === "bulk-delete"
            ? "danger"
            : confirmation?.kind === "settle" || confirmation?.kind === "bulk-settle" ? "success" : "warning"
        }
        isPending={action.isPending || bulkDelete.isPending || settleInvoices.isPending}
        onOpenChange={(isOpen) => {
          if (!isOpen) setConfirmation(null);
        }}
        onConfirm={confirmAction}
      />
    </div>
  );
}
