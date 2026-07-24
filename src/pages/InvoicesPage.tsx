import {useMemo} from "react";
import {useNavigate} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {FileText, Plus, RotateCcw, Search} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, listQuery} from "../lib/api";
import type {Invoice} from "../lib/types";
import {date, displayStatus, displayStatusLabels, money, statusTone} from "../lib/format";
import {useServerDataGridState} from "../lib/useServerDataGridState";

type FilterKey = "toate" | "ciorne" | "emise" | "neachitate" | "partiale" | "achitate" | "restante" | "anulate";

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: "toate", label: "Toate"},
  {key: "ciorne", label: "Ciorne"},
  {key: "emise", label: "Emise"},
  {key: "neachitate", label: "Neachitate"},
  {key: "partiale", label: "Parțiale"},
  {key: "achitate", label: "Achitate"},
  {key: "restante", label: "Restante"},
  {key: "anulate", label: "Anulate"},
];

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

export function InvoicesPage() {
  const {company} = useCompany();
  const navigate = useNavigate();
  const grid = useServerDataGridState<FilterKey>({
    defaultSort: DEFAULT_SORT,
    sortColumns: SORT_COLUMNS,
    filter: FILTER_CONFIG,
  });
  const filter = grid.filter ?? "toate";

  const invoices = useQuery({
    queryKey: ["invoices", company?.id, "list", grid.page, filter, grid.debouncedSearch, grid.apiSort],
    queryFn: () =>
      api<Invoice[]>(
        `/companies/${company!.id}/invoices${listQuery({
          page: grid.page,
          perPage: PER_PAGE,
          sort: grid.apiSort,
          filter: {
            ...(filter in displayFilter ? {display_status: displayFilter[filter as keyof typeof displayFilter]} : {}),
            ...(paymentFilter[filter] ? {payment_status: paymentFilter[filter]} : {}),
            ...(grid.debouncedSearch ? {formatted_number: {contains: grid.debouncedSearch}} : {}),
          },
        })}`,
      ),
    enabled: Boolean(company?.id),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => invoices.data?.data ?? [], [invoices.data]);

  const columns = useMemo<DataGridColumn<Invoice>[]>(
    () => [
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
        cell: (invoice) => money(invoice.total_cents, invoice.currency),
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
          const paymentLabels = {unpaid: "Neachitată", partial: "Parțială", paid: "Achitată", overdue: "Restantă"};
          const label = invoice.status === "issued" ? paymentLabels[invoice.payment_status] : displayStatusLabels[status];
          return (
            <Chip size="sm" color={invoice.payment_status === "paid" ? "success" : statusTone[status]} variant="soft">
              <Chip.Label>{label}</Chip.Label>
            </Chip>
          );
        },
      },
    ],
    [],
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

        <Button variant="primary" onPress={() => navigate("/facturi/noi")}>
          <Plus size={17} /> Emite factură
        </Button>
      </div>

      {/* Table card */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <DataTableLoadingOverlay isLoading={invoices.isFetching && !invoices.isLoading} />
        {invoices.isLoading ? (
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
            sortDescriptor={grid.sort}
            onSortChange={grid.setSort}
            onRowAction={(key) => navigate(`/facturi/${String(key)}`)}
          />
        )}
        <DataTablePagination pagination={invoices.data?.meta?.pagination} onPageChange={grid.setPage} />
      </div>
    </div>
  );
}
