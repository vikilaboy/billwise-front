import {useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Avatar, Button, Input, Spinner} from "@heroui/react";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Building2, ChevronDown, ChevronUp, Plus, Search, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ApiError, api, listQuery} from "../lib/api";
import type {Customer} from "../lib/types";

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
type SortKey = "name" | "tax_id";
type SortDir = "asc" | "desc";

const COLUMNS: {key: SortKey | null; label: string; align?: "start"; sortable?: boolean}[] = [
  {key: "name", label: "Firmă", sortable: true},
  {key: "tax_id", label: "CUI", sortable: true},
  {key: null, label: "Reg. Com."},
  {key: null, label: "Adresă"},
  {key: null, label: "Email"},
];

function compareCustomers(a: Customer, b: Customer, key: SortKey): number {
  if (key === "name") return a.name.localeCompare(b.name, "ro");
  return (a.tax_id ?? "").localeCompare(b.tax_id ?? "", "ro");
}

export function CustomersPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();

  const customers = useQuery({
    queryKey: ["customers", company?.id, "list"],
    queryFn: () =>
      api<Customer[]>(`/companies/${company!.id}/customers${listQuery({perPage: 100, sort: "name"})}`),
    enabled: Boolean(company?.id),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [sort, setSort] = useState<{key: SortKey; dir: SortDir}>({key: "name", dir: "asc"});

  const all = useMemo(() => customers.data?.data ?? [], [customers.data]);

  const visible = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...all].sort((a, b) => compareCustomers(a, b, sort.key) * dir);
  }, [all, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? {key, dir: prev.dir === "asc" ? "desc" : "asc"} : {key, dir: "asc"}));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Top row: primary action */}
      <div className="flex items-center justify-end">
        <Button variant="primary" onPress={() => setModalOpen(true)}>
          <Plus size={17} /> Adaugă firmă
        </Button>
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {customers.isLoading ? (
          <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
            <Spinner size="sm" /> Se încarcă clienții…
          </div>
        ) : customers.isError ? (
          <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
            {problemMessage(customers.error)}
          </div>
        ) : visible.length === 0 ? (
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--subtle)]">
                  {COLUMNS.map((col, i) => {
                    const activeSort = col.key !== null && sort.key === col.key;
                    return (
                      <th
                        key={i}
                        className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]"
                      >
                        {col.sortable && col.key ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key as SortKey)}
                            className={
                              "inline-flex items-center gap-1 uppercase transition-colors hover:text-[var(--text)] " +
                              (activeSort ? "text-[var(--text)]" : "")
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
                        ) : (
                          col.label
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--subtle)]"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 shrink-0 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                          <Avatar.Fallback className="text-[12px] font-bold">{initials(c.name)}</Avatar.Fallback>
                        </Avatar>
                        <span className="font-semibold text-[var(--text)]">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--text-muted)]">{c.tax_id ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.registration_number ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{oneLineAddress(c)}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{c.email ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
