import {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router";
import {useQuery} from "@tanstack/react-query";
import {Button, Chip, Spinner} from "@heroui/react";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api, listQuery} from "../lib/api";
import type {Invoice} from "../lib/types";
import {date, displayStatus, displayStatusLabels, money, statusTone} from "../lib/format";

// Real filters: the API has no "paid" concept, so "Emise"/"Restante" are derived
// client-side from displayStatus (issued vs. overdue). Counts come from the full list.
type FilterKey = "toate" | "ciorne" | "emise" | "restante" | "anulate";

const FILTERS: {key: FilterKey; label: string}[] = [
  {key: "toate", label: "Toate"},
  {key: "ciorne", label: "Ciorne"},
  {key: "emise", label: "Emise"},
  {key: "restante", label: "Restante"},
  {key: "anulate", label: "Anulate"},
];

function matchesFilter(inv: Invoice, key: FilterKey): boolean {
  if (key === "toate") return true;
  const ds = displayStatus(inv);
  if (key === "ciorne") return ds === "draft";
  if (key === "emise") return ds === "issued";
  if (key === "restante") return ds === "overdue";
  return ds === "cancelled"; // anulate
}

type SortKey = "number" | "customer" | "issue_date" | "due_date" | "total";
type SortDir = "asc" | "desc";

const COLUMNS: {key: SortKey; label: string; align: "start" | "end"}[] = [
  {key: "number", label: "Număr", align: "start"},
  {key: "customer", label: "Client", align: "start"},
  {key: "issue_date", label: "Emitere", align: "start"},
  {key: "due_date", label: "Scadență", align: "start"},
  {key: "total", label: "Valoare", align: "end"},
];

function compareInvoices(a: Invoice, b: Invoice, key: SortKey): number {
  switch (key) {
    case "number":
      return a.number - b.number;
    case "customer":
      return (a.customer?.name ?? "").localeCompare(b.customer?.name ?? "", "ro");
    case "issue_date":
      return (a.issue_date ?? "").localeCompare(b.issue_date ?? "");
    case "due_date":
      return (a.due_date ?? "").localeCompare(b.due_date ?? "");
    case "total":
      return a.total_cents - b.total_cents;
  }
}

export function InvoicesPage() {
  const {company} = useCompany();
  const navigate = useNavigate();

  const invoices = useQuery({
    queryKey: ["invoices", company?.id, "list"],
    queryFn: () =>
      api<Invoice[]>(`/companies/${company!.id}/invoices${listQuery({perPage: 100, sort: "-issue_date"})}`),
    enabled: Boolean(company?.id),
  });

  const [filter, setFilter] = useState<FilterKey>("toate");
  const [sort, setSort] = useState<{key: SortKey; dir: SortDir}>({key: "issue_date", dir: "desc"});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const all = useMemo(() => invoices.data?.data ?? [], [invoices.data]);

  const counts = useMemo(() => {
    const acc: Record<FilterKey, number> = {toate: 0, ciorne: 0, emise: 0, restante: 0, anulate: 0};
    for (const inv of all) {
      acc.toate += 1;
      const ds = displayStatus(inv);
      if (ds === "draft") acc.ciorne += 1;
      else if (ds === "issued") acc.emise += 1;
      else if (ds === "overdue") acc.restante += 1;
      else if (ds === "cancelled") acc.anulate += 1;
    }
    return acc;
  }, [all]);

  const visible = useMemo(() => {
    const rows = all.filter((inv) => matchesFilter(inv, filter));
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compareInvoices(a, b, sort.key) * dir);
  }, [all, filter, sort]);

  // Keep selection consistent if the underlying data changes.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(all.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [all]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? {key, dir: prev.dir === "asc" ? "desc" : "asc"} : {key, dir: "asc"},
    );
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleIds = visible.map((i) => i.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected = visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  const headerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someVisibleSelected;
  }, [someVisibleSelected]);

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: segmented filters + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-[3px] rounded-xl bg-[var(--muted)] p-[3px]">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors " +
                  (active
                    ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow)]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]")
                }
              >
                {f.label}
                <span
                  className={
                    "inline-flex min-w-[20px] justify-center rounded-full px-1.5 py-px text-[11px] font-bold tabular-nums " +
                    (active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-soft-foreground)]"
                      : "bg-[var(--strong)] text-[var(--text-muted)]")
                  }
                >
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>

        <Button variant="primary" onPress={() => navigate("/facturi/noi")}>
          <Plus size={17} /> Emite factură
        </Button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {invoices.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă facturile…
          </div>
        ) : invoices.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            Facturile nu au putut fi încărcate.
          </div>
        ) : visible.length === 0 ? (
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--subtle)]">
                  <th className="w-[44px] px-4 py-3">
                    <input
                      ref={headerRef}
                      type="checkbox"
                      aria-label="Selectează toate"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisible}
                      className="h-4 w-4 cursor-pointer align-middle accent-[var(--accent)]"
                    />
                  </th>
                  {COLUMNS.map((col) => {
                    const activeSort = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        className={
                          "px-4 py-3 text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)] " +
                          (col.align === "end" ? "text-right" : "text-left")
                        }
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={
                            "inline-flex items-center gap-1 uppercase transition-colors hover:text-[var(--text)] " +
                            (activeSort ? "text-[var(--text)]" : "") +
                            (col.align === "end" ? " flex-row-reverse" : "")
                          }
                        >
                          {col.label}
                          {activeSort ? (
                            sort.dir === "asc" ? (
                              <ChevronUp size={13} />
                            ) : (
                              <ChevronDown size={13} />
                            )
                          ) : null}
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    e-Factura
                  </th>
                  <th className="w-[52px] px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((inv) => {
                  const ds = displayStatus(inv);
                  const isSelected = selected.has(inv.id);
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/facturi/${inv.id}`)}
                      className={
                        "cursor-pointer border-b border-[var(--border)] transition-colors last:border-0 " +
                        (isSelected ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--subtle)]")
                      }
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Selectează factura ${inv.formatted_number}`}
                          checked={isSelected}
                          onChange={() => toggleRow(inv.id)}
                          className="h-4 w-4 cursor-pointer align-middle accent-[var(--accent)]"
                        />
                      </td>
                      <td className="px-4 py-3 font-semibold text-[var(--text)]">
                        {inv.formatted_number}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-muted)]">{inv.customer?.name ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {date(inv.issue_date)}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">
                        {date(inv.due_date)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text)]">
                        {money(inv.total_cents, inv.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Chip size="sm" color={statusTone[ds]} variant="soft">
                          <Chip.Label>{displayStatusLabels[ds]}</Chip.Label>
                        </Chip>
                      </td>
                      <td className="px-4 py-3">
                        <Chip size="sm" color="default" variant="soft">
                          <Chip.Label>Nedepusă</Chip.Label>
                        </Chip>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          aria-label="Acțiuni factură"
                          onPress={() => console.log("actions", inv.id)}
                        >
                          <MoreHorizontal size={17} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
