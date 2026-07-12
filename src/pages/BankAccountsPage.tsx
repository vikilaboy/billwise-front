import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Spinner} from "@heroui/react";
import {EmptyState} from "@heroui-pro/react/empty-state";
import {Landmark, Pencil, Plus, Star, X} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ApiError, api} from "../lib/api";
import type {BankAccount} from "../lib/types";

// Payment-scheme union mirrors App\Enums\Banking\BankAccountScheme.
type Scheme = "iban" | "uk_domestic" | "us_domestic";

type CurrencyOption = {id: string; code: string; name?: string | null};

const SCHEMES: {value: Scheme; label: string}[] = [
  {value: "iban", label: "IBAN (internațional)"},
  {value: "uk_domestic", label: "Cont UK (sort code)"},
  {value: "us_domestic", label: "Cont US (routing)"},
];

const SCHEME_LABELS: Record<string, string> = {
  iban: "IBAN",
  uk_domestic: "Cont UK",
  us_domestic: "Cont US",
};

// Editable form shape — empty strings stand in for "not provided".
type FormState = {
  bank_name: string;
  scheme: Scheme;
  currency_id: string;
  iban: string;
  swift_bic: string;
  sort_code: string;
  account_number: string;
  routing_number: string;
  is_active: boolean;
  is_primary: boolean;
};

const EMPTY_FORM: FormState = {
  bank_name: "",
  scheme: "iban",
  currency_id: "",
  iban: "",
  swift_bic: "",
  sort_code: "",
  account_number: "",
  routing_number: "",
  is_active: true,
  is_primary: false,
};

function toForm(account: BankAccount): FormState {
  const scheme: Scheme =
    account.scheme === "uk_domestic" || account.scheme === "us_domestic" ? account.scheme : "iban";
  return {
    bank_name: account.bank_name ?? "",
    scheme,
    currency_id: account.currency_id ?? "",
    iban: account.iban ?? "",
    swift_bic: account.swift_bic ?? "",
    sort_code: account.sort_code ?? "",
    account_number: account.account_number ?? "",
    routing_number: account.routing_number ?? "",
    is_active: account.is_active,
    is_primary: account.is_primary,
  };
}

// Only send the fields the chosen scheme allows — the API rejects "forbidden"
// fields carrying a value for the selected scheme.
function buildPayload(form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    scheme: form.scheme,
    bank_name: form.bank_name.trim(),
    currency_id: form.currency_id || null,
    is_active: form.is_active,
    is_primary: form.is_primary,
  };
  if (form.scheme === "iban") {
    payload.iban = form.iban.trim();
    if (form.swift_bic.trim()) payload.swift_bic = form.swift_bic.trim();
  } else if (form.scheme === "uk_domestic") {
    payload.sort_code = form.sort_code.trim();
    payload.account_number = form.account_number.trim();
  } else {
    payload.routing_number = form.routing_number.trim();
    payload.account_number = form.account_number.trim();
  }
  return payload;
}

// A compact "Detaliu cont" line describing an account by its scheme.
function accountIdentifier(account: BankAccount): {label: string; value: string} {
  if (account.scheme === "uk_domestic") {
    return {
      label: "Sort code / Cont",
      value: [account.sort_code, account.account_number].filter(Boolean).join(" · ") || "—",
    };
  }
  if (account.scheme === "us_domestic") {
    return {
      label: "Routing / Cont",
      value: [account.routing_number, account.account_number].filter(Boolean).join(" · ") || "—",
    };
  }
  return {label: "IBAN", value: account.iban || "—"};
}

// Lightweight role="switch" toggle so the modal stays dependency-light.
function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[var(--text)]">{label}</span>
        {hint ? <span className="block text-[11.5px] text-[var(--text-muted)]">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
          (checked ? "bg-[var(--accent)]" : "bg-[var(--strong)]")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform " +
            (checked ? "translate-x-[22px]" : "translate-x-[2px]")
          }
        />
      </button>
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  mono,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  error?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--text-muted)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          "h-10 rounded-[10px] border bg-[var(--surface)] px-3 text-[13.5px] text-[var(--text)] outline-none transition-colors placeholder:text-[var(--faint)] focus:border-[var(--accent)] " +
          (error ? "border-[var(--danger)]" : "border-[var(--border)]") +
          (mono ? " font-mono tabular-nums tracking-wide" : "")
        }
      />
      {error ? <span className="text-[11.5px] font-medium text-[var(--danger)]">{error}</span> : null}
    </label>
  );
}

export function BankAccountsPage() {
  const {company} = useCompany();
  const qc = useQueryClient();

  const accounts = useQuery({
    queryKey: ["bank-accounts", company?.id],
    queryFn: () => api<BankAccount[]>(`/companies/${company!.id}/bank-accounts`),
    enabled: Boolean(company?.id),
  });

  // Currency reference — degrades gracefully if the endpoint is unavailable.
  const currencies = useQuery({
    queryKey: ["currencies", company?.id],
    queryFn: () => api<CurrencyOption[]>("/settings/currencies"),
    enabled: Boolean(company?.id),
  });

  const currencyCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of currencies.data?.data ?? []) map.set(c.id, c.code);
    return map;
  }, [currencies.data]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({...prev, [key]: value}));

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    save.reset();
    setOpen(true);
  }

  function openEdit(account: BankAccount) {
    setEditing(account);
    setForm(toForm(account));
    save.reset();
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
  }

  const save = useMutation({
    mutationFn: (vars: {id: string | null; body: Record<string, unknown>}) =>
      api<BankAccount>(
        vars.id
          ? `/companies/${company!.id}/bank-accounts/${vars.id}`
          : `/companies/${company!.id}/bank-accounts`,
        {method: vars.id ? "PUT" : "POST", body: JSON.stringify(vars.body)},
      ),
    onSuccess: () => {
      qc.invalidateQueries({queryKey: ["bank-accounts"]});
      closeModal();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api<void>(`/companies/${company!.id}/bank-accounts/${id}`, {method: "DELETE"}),
    onSuccess: () => qc.invalidateQueries({queryKey: ["bank-accounts"]}),
  });

  // Close the modal on Escape while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const problem = save.error instanceof ApiError ? save.error.problem : null;
  const fieldError = (field: string) => problem?.errors?.[field]?.[0];
  const generalError = problem && !problem.errors ? (problem.detail ?? problem.title) : null;

  function submit() {
    if (!company?.id) return;
    save.mutate({id: editing?.id ?? null, body: buildPayload(form)});
  }

  function onDelete() {
    if (!editing) return;
    if (!window.confirm("Ștergi definitiv acest cont bancar?")) return;
    remove.mutate(editing.id, {onSuccess: () => closeModal()});
  }

  const list = accounts.data?.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-end">
        <Button variant="primary" onPress={openCreate}>
          <Plus size={17} /> Adaugă cont
        </Button>
      </div>

      {accounts.isLoading ? (
        <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
          <Spinner size="sm" /> Se încarcă conturile…
        </div>
      ) : accounts.isError ? (
        <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
          {accounts.error instanceof ApiError
            ? (accounts.error.problem.detail ?? accounts.error.problem.title)
            : "Conturile bancare nu au putut fi încărcate."}
        </div>
      ) : list.length === 0 ? (
        <EmptyState className="py-16">
          <EmptyState.Header>
            <EmptyState.Media variant="icon">
              <Landmark size={22} />
            </EmptyState.Media>
            <EmptyState.Title>Niciun cont bancar</EmptyState.Title>
            <EmptyState.Description>
              Adaugă conturile pe care vrei să le afișezi pe facturile emise.
            </EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button variant="primary" onPress={openCreate}>
              <Plus size={17} /> Adaugă cont
            </Button>
          </EmptyState.Content>
        </EmptyState>
      ) : (
        <div
          className="grid gap-4"
          style={{gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))"}}
        >
          {list.map((account) => {
            const id = accountIdentifier(account);
            const code = account.currency_id ? currencyCode.get(account.currency_id) : undefined;
            return (
              <div
                key={account.id}
                className={
                  "flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] transition-opacity " +
                  (account.is_active ? "" : "opacity-60")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-bold text-[var(--text)]">
                      {account.bank_name || "Cont bancar"}
                    </div>
                    <div className="text-[11.5px] font-medium text-[var(--text-muted)]">
                      {SCHEME_LABELS[account.scheme] ?? account.scheme}
                    </div>
                  </div>
                  {account.is_primary ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[11px] font-bold text-[var(--accent)]">
                      <Star size={11} /> Implicit
                    </span>
                  ) : null}
                </div>

                <div className="rounded-xl bg-[var(--subtle)] px-3.5 py-3">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    {id.label}
                  </div>
                  <div className="mt-0.5 break-all font-mono text-[13.5px] tabular-nums tracking-wide text-[var(--text)]">
                    {id.value}
                  </div>
                  {account.scheme === "iban" && account.swift_bic ? (
                    <div className="mt-1 text-[11.5px] text-[var(--text-muted)]">
                      SWIFT/BIC: <span className="font-mono">{account.swift_bic}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-3">
                  {code ? (
                    <span className="rounded-lg bg-[var(--bg-muted)] px-2.5 py-1 text-[11.5px] font-bold text-[var(--text-muted)]">
                      {code}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(account)}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--accent)] transition-opacity hover:opacity-80"
                  >
                    <Pencil size={13} /> Editează
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={editing ? "Editează contul bancar" : "Adaugă cont bancar"}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="text-[15px] font-bold text-[var(--text)]">
                {editing ? "Editează cont bancar" : "Adaugă cont bancar"}
              </div>
              <button
                type="button"
                aria-label="Închide"
                onClick={closeModal}
                className="text-[var(--faint)] transition-colors hover:text-[var(--text)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-4 overflow-y-auto px-5 py-5">
              {generalError ? (
                <div className="rounded-lg border border-[var(--danger)] bg-[var(--danger)]/10 px-3 py-2 text-[12.5px] font-medium text-[var(--danger)]">
                  {generalError}
                </div>
              ) : null}

              <Field
                label="Bancă"
                value={form.bank_name}
                onChange={(v) => set("bank_name", v)}
                placeholder="ex. Banca Transilvania"
                error={fieldError("bank_name")}
              />

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--text-muted)]">Schemă</span>
                <select
                  value={form.scheme}
                  onChange={(e) => set("scheme", e.target.value as Scheme)}
                  className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                >
                  {SCHEMES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {fieldError("scheme") ? (
                  <span className="text-[11.5px] font-medium text-[var(--danger)]">
                    {fieldError("scheme")}
                  </span>
                ) : null}
              </label>

              {form.scheme === "iban" ? (
                <>
                  <Field
                    label="IBAN"
                    value={form.iban}
                    onChange={(v) => set("iban", v)}
                    placeholder="RO49 AAAA 1B31 0075 9384 0000"
                    error={fieldError("iban")}
                    mono
                  />
                  <Field
                    label="SWIFT / BIC (opțional)"
                    value={form.swift_bic}
                    onChange={(v) => set("swift_bic", v)}
                    placeholder="BTRLRO22"
                    error={fieldError("swift_bic")}
                    mono
                  />
                </>
              ) : form.scheme === "uk_domestic" ? (
                <>
                  <Field
                    label="Sort code"
                    value={form.sort_code}
                    onChange={(v) => set("sort_code", v)}
                    placeholder="123456"
                    error={fieldError("sort_code")}
                    mono
                  />
                  <Field
                    label="Număr cont"
                    value={form.account_number}
                    onChange={(v) => set("account_number", v)}
                    placeholder="12345678"
                    error={fieldError("account_number")}
                    mono
                  />
                </>
              ) : (
                <>
                  <Field
                    label="Routing number"
                    value={form.routing_number}
                    onChange={(v) => set("routing_number", v)}
                    placeholder="123456789"
                    error={fieldError("routing_number")}
                    mono
                  />
                  <Field
                    label="Număr cont"
                    value={form.account_number}
                    onChange={(v) => set("account_number", v)}
                    placeholder="Număr cont"
                    error={fieldError("account_number")}
                    mono
                  />
                </>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-[12px] font-semibold text-[var(--text-muted)]">Monedă</span>
                <select
                  value={form.currency_id}
                  onChange={(e) => set("currency_id", e.target.value)}
                  className="h-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                >
                  <option value="">Fără monedă preferată</option>
                  {(currencies.data?.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                      {c.name ? ` — ${c.name}` : ""}
                    </option>
                  ))}
                </select>
                {fieldError("currency_id") ? (
                  <span className="text-[11.5px] font-medium text-[var(--danger)]">
                    {fieldError("currency_id")}
                  </span>
                ) : null}
              </label>

              <div className="flex flex-col gap-3 rounded-xl bg-[var(--subtle)] px-4 py-3.5">
                <Toggle
                  label="Cont activ"
                  hint="Disponibil pentru a fi afișat pe facturi."
                  checked={form.is_active}
                  onChange={(v) => set("is_active", v)}
                />
                <Toggle
                  label="Cont implicit"
                  hint="Folosit pentru e-Factura și afișat prima dată."
                  checked={form.is_primary}
                  onChange={(v) => set("is_primary", v)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
              {editing ? (
                <Button
                  variant="outline"
                  onPress={onDelete}
                  isDisabled={remove.isPending}
                  className="text-[var(--danger)]"
                >
                  {remove.isPending ? "Se șterge…" : "Șterge"}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                <Button variant="outline" onPress={closeModal}>
                  Anulează
                </Button>
                <Button variant="primary" onPress={submit} isDisabled={save.isPending}>
                  {save.isPending ? "Se salvează…" : editing ? "Salvează" : "Adaugă cont"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
