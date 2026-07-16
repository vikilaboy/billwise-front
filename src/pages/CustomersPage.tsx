import {useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Avatar, Button, Input, Spinner} from "@heroui/react";
import {DataGrid, type DataGridColumn, type DataGridSortDescriptor} from "@heroui-pro/react/data-grid";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Building2, Plus, RotateCcw, Search, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {DataTableLoadingOverlay} from "../components/DataTableLoadingOverlay";
import {DataTablePagination} from "../components/DataTablePagination";
import {ApiError, api, listQuery} from "../lib/api";
import type {Customer} from "../lib/types";
import {useServerDataGridState} from "../lib/useServerDataGridState";

// ---------------------------------------------------------------------------
// ANAF fiscal lookup response (GET /fiscal/lookup?cui=) — mirrors FiscalEntityData.
type FiscalEntity = {
  cui: string;
  name: string;
  is_vat_payer: boolean;
  registration_number: string | null;
  address: string | null; // single free-text line from the registry
  is_active: boolean;
};

// Create payload. `address` is intentionally omitted: the API's StoreCustomerRequest
// marks it nullable, and a valid RO address requires nomenclature IDs
// (address.state_id / address.locality_id) that need dedicated county/locality
// pickers out of scope for this simple form. Sending free-text is rejected for RO.
// So we persist the fiscal identity here; the collected address fields stay in the
// form for parity + ANAF display until the nomenclature pickers land.
type CreatePayload = {
  name: string;
  tax_id: string | null;
  registration_number: string | null;
  is_vat_payer: boolean;
};

function initials(name?: string | null): string {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function oneLineAddress(customer: Customer): string {
  const a = customer.address;
  if (!a) return "—";
  const line = [a.street, a.resolved_city, a.resolved_region].filter(Boolean).join(", ");
  return line || "—";
}

function problemMessage(error: unknown): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  return "A apărut o eroare neașteptată.";
}

// ---------------------------------------------------------------------------
const PER_PAGE = 20;
const DEFAULT_SORT: DataGridSortDescriptor = {column: "name", direction: "ascending"};
const SORT_COLUMNS = ["name", "tax_id"] as const;

export function CustomersPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const grid = useServerDataGridState({defaultSort: DEFAULT_SORT, sortColumns: SORT_COLUMNS});

  const customers = useQuery({
    queryKey: ["customers", company?.id, "list", grid.page, grid.debouncedSearch, grid.apiSort],
    queryFn: () =>
      api<Customer[]>(
        `/companies/${company!.id}/customers${listQuery({
          page: grid.page,
          perPage: PER_PAGE,
          sort: grid.apiSort,
          filter: grid.debouncedSearch ? {name: {contains: grid.debouncedSearch}} : undefined,
        })}`,
      ),
    enabled: Boolean(company?.id),
    placeholderData: (previous) => previous,
  });

  const rows = customers.data?.data ?? [];
  const columns = useMemo<DataGridColumn<Customer>[]>(
    () => [
      {
        id: "name",
        header: "Firmă",
        accessorKey: "name",
        isRowHeader: true,
        allowsSorting: true,
        minWidth: 220,
        cell: (customer) => (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 shrink-0 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
              <Avatar.Fallback className="text-[12px] font-bold">{initials(customer.name)}</Avatar.Fallback>
            </Avatar>
            <span className="font-semibold text-[var(--text)]">{customer.name}</span>
          </div>
        ),
      },
      {id: "tax_id", header: "CUI", accessorKey: "tax_id", allowsSorting: true, minWidth: 140},
      {id: "registration_number", header: "Reg. Com.", accessorKey: "registration_number", minWidth: 150},
      {id: "address", header: "Adresă", minWidth: 240, cell: oneLineAddress},
      {id: "email", header: "Email", accessorKey: "email", minWidth: 200},
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 min-w-[260px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3">
            <Search size={16} className="text-[var(--faint)]" />
            <input
              value={grid.search}
              onChange={(event) => grid.setSearch(event.target.value)}
              placeholder="Caută după denumire…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
            />
          </label>
          <Button variant="outline" size="sm" isDisabled={!grid.isDirty} onPress={grid.reset}>
            <RotateCcw size={15} /> Resetează
          </Button>
        </div>
        <Button variant="primary" onPress={() => setModalOpen(true)}>
          <Plus size={17} /> Adaugă firmă
        </Button>
      </div>

      {/* Table card */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <DataTableLoadingOverlay isLoading={customers.isFetching && !customers.isLoading} />
        {customers.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă clienții…
          </div>
        ) : customers.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            {problemMessage(customers.error)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState className="py-16">
            <EmptyState.Header>
              <EmptyState.Media variant="icon">
                <Building2 size={22} />
              </EmptyState.Media>
              <EmptyState.Title>Niciun client încă</EmptyState.Title>
              <EmptyState.Description>
                Adaugă prima firmă cu care lucrezi pentru a o putea factura.
              </EmptyState.Description>
            </EmptyState.Header>
            <EmptyState.Content>
              <Button variant="primary" onPress={() => setModalOpen(true)}>
                <Plus size={17} /> Adaugă firmă
              </Button>
            </EmptyState.Content>
          </EmptyState>
        ) : (
          <DataGrid
            aria-label="Clienți"
            className="w-full"
            contentClassName="min-w-[900px]"
            columns={columns}
            data={rows}
            getRowId={(customer) => customer.id}
            sortDescriptor={grid.sort}
            onSortChange={grid.setSort}
          />
        )}
        <DataTablePagination pagination={customers.data?.meta?.pagination} onPageChange={grid.setPage} />
      </div>

      {modalOpen && company?.id ? (
        <AddCustomerModal
          companyId={company.id}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({queryKey: ["customers"]});
            setModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
type FormState = {
  cui: string;
  name: string;
  registration_number: string;
  locality: string;
  street: string;
  is_vat_payer: boolean;
};

const EMPTY_FORM: FormState = {
  cui: "",
  name: "",
  registration_number: "",
  locality: "",
  street: "",
  is_vat_payer: false,
};

function fieldLabel(label: string, children: React.ReactNode, error?: string) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-[var(--text-muted)]">{label}</span>
      {children}
      {error ? <span className="text-[11.5px] font-medium text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

function AddCustomerModal({
  companyId,
  onClose,
  onSuccess,
}: {
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [lookupError, setLookupError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
  }

  const lookup = useMutation({
    mutationFn: (cui: string) => api<FiscalEntity>(`/fiscal/lookup?cui=${encodeURIComponent(cui)}`),
    onSuccess: ({data}) => {
      setLookupError(null);
      setForm((prev) => ({
        ...prev,
        name: data.name || prev.name,
        registration_number: data.registration_number ?? prev.registration_number,
        street: data.address ?? prev.street,
        is_vat_payer: data.is_vat_payer,
      }));
    },
    onError: (error) => setLookupError(problemMessage(error)),
  });

  const create = useMutation({
    mutationFn: (payload: CreatePayload) =>
      api<Customer>(`/companies/${companyId}/customers`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess,
    onError: (error) => {
      if (error instanceof ApiError && error.problem.errors) setFieldErrors(error.problem.errors);
    },
  });

  function runLookup() {
    const cui = form.cui.trim();
    if (!cui) {
      setLookupError("Introdu un CUI pentru a prelua datele.");
      return;
    }
    lookup.mutate(cui);
  }

  function submit() {
    setFieldErrors({});
    create.mutate({
      name: form.name.trim(),
      tax_id: form.cui.trim() || null,
      registration_number: form.registration_number.trim() || null,
      is_vat_payer: form.is_vat_payer,
    });
  }

  const inputCls =
    "h-10 w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] placeholder:text-[var(--faint)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă firmă nouă"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-[520px] rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <div className="text-[16px] font-bold tracking-tight text-[var(--text)]">Adaugă firmă nouă</div>
            <div className="text-[12.5px] text-[var(--text-muted)]">Preia datele din registrul ANAF sau completează manual.</div>
          </div>
          <Button isIconOnly variant="outline" size="sm" aria-label="Închide" onPress={onClose}>
            <X size={17} />
          </Button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 px-6 py-5">
          {/* CUI + ANAF lookup */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[var(--text-muted)]">CUI</span>
            <div className="flex items-stretch gap-2">
              <Input
                className={inputCls + " flex-1"}
                placeholder="RO12345678"
                value={form.cui}
                onChange={(e) => set("cui", e.target.value)}
              />
              <Button variant="outline" onPress={runLookup} isDisabled={lookup.isPending}>
                {lookup.isPending ? <Spinner size="sm" /> : <Search size={16} />}
                Preia ANAF
              </Button>
            </div>
            {fieldErrors["tax_id"] ? (
              <span className="text-[11.5px] font-medium text-[var(--danger)]">{fieldErrors["tax_id"][0]}</span>
            ) : null}
            {lookupError ? (
              <span className="text-[11.5px] font-medium text-[var(--danger)]">{lookupError}</span>
            ) : null}
          </div>

          {fieldLabel(
            "Denumire",
            <Input
              className={inputCls}
              placeholder="SC Exemplu SRL"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />,
            fieldErrors["name"]?.[0],
          )}

          {fieldLabel(
            "Reg. Com.",
            <Input
              className={inputCls}
              placeholder="J40/1234/2020"
              value={form.registration_number}
              onChange={(e) => set("registration_number", e.target.value)}
            />,
            fieldErrors["registration_number"]?.[0],
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fieldLabel(
              "Localitate",
              <Input
                className={inputCls}
                placeholder="București"
                value={form.locality}
                onChange={(e) => set("locality", e.target.value)}
              />,
            )}
            {fieldLabel(
              "Adresă",
              <Input
                className={inputCls}
                placeholder="Str. Exemplu nr. 1"
                value={form.street}
                onChange={(e) => set("street", e.target.value)}
              />,
            )}
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.is_vat_payer}
              onChange={(e) => set("is_vat_payer", e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
            />
            <span className="text-[13px] font-medium text-[var(--text)]">Plătitor de TVA</span>
          </label>

          {create.isError && !(create.error instanceof ApiError && create.error.problem.errors) ? (
            <div className="rounded-lg bg-[var(--danger-soft,var(--bg-muted))] px-3 py-2 text-[12.5px] font-medium text-[var(--danger)]">
              {problemMessage(create.error)}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-[var(--border)] px-6 py-4">
          <Button variant="outline" onPress={onClose}>
            Anulează
          </Button>
          <Button variant="primary" onPress={submit} isDisabled={create.isPending || !form.name.trim()}>
            {create.isPending ? <Spinner size="sm" /> : null}
            Salvează firma
          </Button>
        </div>
      </div>
    </div>
  );
}
