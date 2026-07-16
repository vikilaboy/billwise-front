import {useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Chip, Input, Spinner, Switch} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Hash, Plus, Search, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, ApiError, listQuery} from "../lib/api";
import {useDebouncedValue} from "../lib/useDebouncedValue";

// The API models `document_type` as a free-form string (max 50); only `invoice`
// is used in practice. These are the document kinds the UI offers, with RO labels.
type DocumentType = "invoice" | "proforma" | "storno" | "receipt";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  invoice: "Factură",
  proforma: "Proformă",
  storno: "Storno",
  credit_note: "Storno",
  receipt: "Chitanță",
};

const DOCUMENT_TYPE_OPTIONS: {value: DocumentType; label: string}[] = [
  {value: "invoice", label: "Factură"},
  {value: "proforma", label: "Proformă"},
  {value: "storno", label: "Storno"},
  {value: "receipt", label: "Chitanță"},
];

// Shape of `InvoiceSeriesResource` (billwise-api).
type Series = {
  id: string;
  company_profile_id: string;
  document_type: string;
  name: string;
  prefix: string | null;
  next_number: number;
  formatted_next_number: string;
  padding: number;
  is_default: boolean;
  is_active: boolean;
};

function documentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type] ?? type;
}

// Compose the next document number for display. Prefer the API-computed value;
// otherwise mirror its rule (`prefix` + zero-padded number, or plain concat).
function nextNumberDisplay(s: Series): string {
  if (s.formatted_next_number) return s.formatted_next_number;
  const prefix = s.prefix ?? "";
  return s.padding
    ? prefix + String(s.next_number).padStart(s.padding, "0")
    : prefix + String(s.next_number);
}

type FormState = {
  name: string;
  document_type: DocumentType;
  prefix: string;
  next_number: string;
  padding: string;
  is_default: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  document_type: "invoice",
  prefix: "",
  next_number: "1",
  padding: "4",
  is_default: false,
  is_active: true,
};

const PER_PAGE = 20;
type ActiveFilter = "all" | "active" | "inactive";

export function InvoiceSeriesPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim());
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [sort, setSort] = useState<DataGridSortDescriptor>({column: "name", direction: "ascending"});
  const apiSort = `${sort.direction === "descending" ? "-" : ""}${String(sort.column)}`;

  const series = useQuery({
    queryKey: ["invoice-series", company?.id, page, debouncedSearch, activeFilter, apiSort],
    queryFn: () =>
      api<Series[]>(
        `/companies/${company!.id}/invoice-series${listQuery({
          page,
          perPage: PER_PAGE,
          sort: apiSort,
          filter: {
            ...(debouncedSearch ? {name: {contains: debouncedSearch}} : {}),
            ...(activeFilter === "all" ? {} : {is_active: activeFilter === "active" ? 1 : 0}),
          },
        })}`,
      ),
    enabled: Boolean(company?.id),
    placeholderData: (previous) => previous,
  });

  const rows = series.data?.data ?? [];
  const columns = useMemo<DataGridColumn<Series>[]>(
    () => [
      {
        id: "name",
        header: "Denumire",
        accessorKey: "name",
        isRowHeader: true,
        allowsSorting: true,
        minWidth: 220,
        cell: (item) => (
          <span className="inline-flex items-center gap-2 font-semibold text-[var(--text)]">
            {item.name}
            {item.is_default ? (
              <Chip size="sm" color="success" variant="soft">
                <Chip.Label>Implicită</Chip.Label>
              </Chip>
            ) : null}
          </span>
        ),
      },
      {
        id: "document_type",
        header: "Tip document",
        accessorKey: "document_type",
        allowsSorting: true,
        minWidth: 170,
        cell: (item) => documentTypeLabel(item.document_type),
      },
      {
        id: "prefix",
        header: "Prefix",
        accessorKey: "prefix",
        allowsSorting: true,
        minWidth: 120,
        cell: (item) =>
          item.prefix ? (
            <span className="rounded bg-[var(--bg-muted)] px-2 py-0.5 font-semibold tabular-nums">{item.prefix}</span>
          ) : (
            "—"
          ),
      },
      {
        id: "next_number",
        header: "Următorul număr",
        accessorKey: "next_number",
        allowsSorting: true,
        align: "end",
        minWidth: 170,
        cellClassName: "font-semibold tabular-nums",
        cell: nextNumberDisplay,
      },
      {
        id: "status",
        header: "Stare",
        minWidth: 130,
        cell: (item) => (
          <Chip size="sm" color={item.is_active ? "success" : "default"} variant="soft">
            <Chip.Label>{item.is_active ? "Activă" : "Inactivă"}</Chip.Label>
          </Chip>
        ),
      },
    ],
    [],
  );

  function resetPage() {
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3">
            <Search size={16} className="text-[var(--faint)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                resetPage();
              }}
              placeholder="Caută o serie…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
            />
          </label>
          <select
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as ActiveFilter);
              resetPage();
            }}
            aria-label="Filtrează după stare"
            className="h-10 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm outline-none"
          >
            <option value="all">Toate stările</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <Button variant="primary" onPress={() => setModalOpen(true)}>
          <Plus size={17} /> Serie nouă
        </Button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {series.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă seriile…
          </div>
        ) : series.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            {series.error instanceof ApiError
              ? (series.error.problem.detail ?? series.error.problem.title)
              : "Seriile nu au putut fi încărcate."}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState className="py-16">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <Hash size={22} />
              </EmptyState.Media>
              <EmptyState.Title>Nicio serie de documente</EmptyState.Title>
              <EmptyState.Description>
                Creează prima serie pentru a numerota automat facturile emise.
              </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <Button variant="primary" onPress={() => setModalOpen(true)}>
                <Plus size={17} /> Serie nouă
              </Button>
            </EmptyState.Content>
          </EmptyState>
        ) : (
          <DataGrid
            aria-label="Serii de documente"
            className="w-full"
            contentClassName="min-w-[820px]"
            columns={columns}
            data={rows}
            getRowId={(item) => item.id}
            sortDescriptor={sort}
            onSortChange={(descriptor) => {
              setSort(descriptor);
              resetPage();
            }}
          />
        )}
        <DataTablePagination pagination={series.data?.meta?.pagination} onPageChange={setPage} />
      </div>

      {modalOpen && company?.id && (
        <SeriesModal
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({queryKey: ["invoice-series"]});
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SeriesModal({
  companyId,
  onClose,
  onSaved,
}: {
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: () =>
      api<Series>(`/companies/${companyId}/invoice-series`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          document_type: form.document_type,
          prefix: form.prefix,
          next_number: Number(form.next_number) || 1,
          padding: Number(form.padding) || 0,
          is_default: form.is_default,
          is_active: form.is_active,
        }),
      }),
    onSuccess: onSaved,
  });

  const problem = mutation.error instanceof ApiError ? mutation.error.problem : undefined;
  const fieldErrors = problem?.errors ?? {};

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
  }

  function submit() {
    mutation.mutate();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Serie nouă"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Serie nouă</h2>
          <Button isIconOnly variant="ghost" size="sm" aria-label="Închide" onPress={onClose}>
            <X size={17} />
          </Button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <Field label="Denumire" error={fieldErrors.name?.[0]}>
            <Input
              fullWidth
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="ex. Facturi 2026"
            />
          </Field>

          <Field label="Tip document" error={fieldErrors.document_type?.[0]}>
            <select
              value={form.document_type}
              onChange={(e) => update("document_type", e.target.value as DocumentType)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            >
              {DOCUMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prefix" error={fieldErrors.prefix?.[0]}>
            <Input
              fullWidth
              value={form.prefix}
              onChange={(e) => update("prefix", e.target.value)}
              placeholder="ex. FCT"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Următorul număr de start" error={fieldErrors.next_number?.[0]}>
              <Input
                fullWidth
                type="number"
                min={1}
                value={form.next_number}
                onChange={(e) => update("next_number", e.target.value)}
              />
            </Field>
            <Field label="Padding" error={fieldErrors.padding?.[0]}>
              <Input
                fullWidth
                type="number"
                min={0}
                value={form.padding}
                onChange={(e) => update("padding", e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--text)]">Serie implicită</span>
            <Switch
              isSelected={form.is_default}
              onChange={(v) => update("is_default", v)}
              aria-label="Serie implicită"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </label>

          <label className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-[var(--text)]">Activă</span>
            <Switch
              isSelected={form.is_active}
              onChange={(v) => update("is_active", v)}
              aria-label="Activă"
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
              </Switch.Content>
            </Switch>
          </label>

          {problem && !problem.errors && (
            <div className="rounded-lg bg-[var(--danger-soft,var(--bg-muted))] px-3 py-2 text-[12.5px] font-medium text-[var(--danger)]">
              {problem.detail ?? problem.title}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <Button variant="outline" onPress={onClose}>
            Anulează
          </Button>
          <Button
            variant="primary"
            onPress={submit}
            isDisabled={mutation.isPending || !form.name.trim()}
          >
            {mutation.isPending ? "Se salvează…" : "Salvează"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
      {error && <span className="text-[11.5px] font-medium text-[var(--danger)]">{error}</span>}
    </div>
  );
}
