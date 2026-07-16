import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {
  DataGrid,
  type DataGridColumn,
  type DataGridSelection,
  type DataGridSortDescriptor,
} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {
  Check,
  Download,
  FileText,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, listQuery} from "../lib/api";
import type {Invoice} from "../lib/types";
import {date, displayStatus, displayStatusLabels, money, statusTone} from "../lib/format";
import {useServerDataGridState} from "../lib/useServerDataGridState";

type FilterKey = "toate" | "ciorne" | "emise" | "restante" | "anulate";

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: "toate", label: "Toate"},
  {key: "ciorne", label: "Ciorne"},
  {key: "emise", label: "Emise"},
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

const displayFilter: Record<Exclude<FilterKey, "toate">, string> = {
  ciorne: "draft",
  emise: "issued",
  restante: "overdue",
  anulate: "cancelled",
};

export function InvoicesPage() {
  const {company} = useCompany();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
            ...(filter === "toate" ? {} : {display_status: displayFilter[filter]}),
            ...(grid.debouncedSearch ? {formatted_number: {contains: grid.debouncedSearch}} : {}),
          },
        })}`,
      ),
    enabled: Boolean(company?.id),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => invoices.data?.data ?? [], [invoices.data]);

  // Keep selection consistent if the underlying data changes.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(rows.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

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
        id: "status",
        header: "Status",
        minWidth: 130,
        cell: (invoice) => {
          const status = displayStatus(invoice);
          return (
            <Chip size="sm" color={statusTone[status]} variant="soft">
              <Chip.Label>{displayStatusLabels[status]}</Chip.Label>
            </Chip>
          );
        },
      },
      {
        id: "efactura",
        header: "e-Factura",
        minWidth: 140,
        cell: () => (
          <Chip size="sm" color="default" variant="soft">
            <Chip.Label>Nedepusă</Chip.Label>
          </Chip>
        ),
      },
      {
        id: "actions",
        header: "",
        width: 64,
        minWidth: 64,
        pinned: "end",
        cell: (invoice) => (
          <Button
            isIconOnly
            variant="ghost"
            size="sm"
            aria-label={`Acțiuni pentru ${invoice.formatted_number}`}
            onClick={(event) => event.stopPropagation()}
            onPress={() => console.log("actions", invoice.id)}
          >
            <MoreHorizontal size={17} />
          </Button>
        ),
      },
    ],
    [],
  );

  function changeSelection(keys: DataGridSelection) {
    setSelected(keys === "all" ? new Set(rows.map((invoice) => invoice.id)) : new Set([...keys].map(String)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedCount = selected.size;

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
            contentClassName="min-w-[1120px]"
            columns={columns}
            data={rows}
            getRowId={(invoice) => invoice.id}
            selectionMode="multiple"
            showSelectionCheckboxes
            selectedKeys={selected}
            onSelectionChange={changeSelection}
            sortDescriptor={grid.sort}
            onSortChange={grid.setSort}
            onRowAction={(key) => navigate(`/facturi/${String(key)}`)}
          />
        )}
        <DataTablePagination pagination={invoices.data?.meta?.pagination} onPageChange={grid.setPage} />
      </div>

      {/* Floating selection action bar */}
      {selectedCount > 0 && (
        <div
          className="fixed bottom-6 left-1/2 z-[45] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[var(--text)] px-3 py-2.5 text-[var(--bg)] shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
          role="toolbar"
          aria-label="Acțiuni pentru facturile selectate"
        >
          <span className="px-2 text-[13px] font-semibold tabular-nums">{selectedCount} selectate</span>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <button
            type="button"
            onClick={() => console.log("mark paid", [...selected])}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/10"
          >
            <Check size={15} /> Marchează plătit
          </button>
          <button
            type="button"
            onClick={() => console.log("export", [...selected])}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/10"
          >
            <Download size={15} /> Exportă
          </button>
          <button
            type="button"
            onClick={() => console.log("delete", [...selected])}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-[var(--danger)] transition-colors hover:bg-white/10"
          >
            <Trash2 size={15} /> Șterge
          </button>
          <span className="mx-1 h-5 w-px bg-white/20" />
          <button
            type="button"
            aria-label="Anulează selecția"
            onClick={clearSelection}
            className="inline-flex items-center justify-center rounded-lg p-1.5 transition-colors hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
