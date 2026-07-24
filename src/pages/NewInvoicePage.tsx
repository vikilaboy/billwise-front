import {useMemo, useState} from "react";
import {useNavigate} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner, TextArea} from "@heroui/react";
import {ChevronDown, Loader2, Plus, Send, Trash2} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ApiError, api, listQuery} from "../lib/api";
import type {Customer, Invoice, Product, VatCategory} from "../lib/types";
import {money} from "../lib/format";

// The API create contract (StoreInvoiceRequest) accepts NO invoice_series_id — the
// series is resolved server-side from the company's default series. We still show a
// Serie select for the number preview, but it is intentionally not part of the payload.
type InvoiceSeries = {
  id: string;
  name: string;
  prefix: string;
  document_type: string;
  next_number: number;
  formatted_next_number: string;
  is_default: boolean;
  is_active: boolean;
};

type LineRow = {
  key: string;
  description: string;
  unit: string;
  unit_code: string;
  quantity: number;
  unit_price: number; // major units, e.g. 2500.00
  vat_rate: number; // percent: 19 | 9 | 5 | 0
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
};

// Fixed unit for the whole prototype; the create request requires a UN/ECE unit_code.
const UNIT_LABEL = "buc";
const UNIT_CODE = "C62"; // "One (piece)"

const VAT_RATES = [19, 9, 5, 0];

const CURRENCIES = [
  {code: "RON", label: "RON — Leu românesc"},
  {code: "EUR", label: "EUR — Euro"},
  {code: "USD", label: "USD — Dolar american"},
];

// vat_rate → EN 16931 VAT category (UNCL5305). 0% is zero-rated (Z), which — unlike
// the exemption categories — carries no VATEX code / reason (BR-Z).
function vatCategoryFor(rate: number): "S" | "Z" {
  return rate > 0 ? "S" : "Z";
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function newRow(): LineRow {
  return {
    key: crypto.randomUUID(), description: "", unit: UNIT_LABEL, unit_code: UNIT_CODE,
    quantity: 1, unit_price: 0, vat_rate: 19,
    vat_category: "S", vat_exemption_code: null, vat_exemption_reason: null,
  };
}

// Integer-cent math so the live summary matches the server snapshot logic.
function lineNetCents(row: LineRow): number {
  const unitPriceCents = Math.round(row.unit_price * 100);
  return Math.round(row.quantity * unitPriceCents);
}

function lineVatCents(row: LineRow): number {
  return Math.round((lineNetCents(row) * row.vat_rate) / 100);
}

const cardClass =
  "bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-[var(--shadow)]";

const inputBase =
  "h-10 w-full rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[13.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--subtle)] disabled:text-[var(--text-muted)]";

// Styled native select (the mockup uses native selects; the HeroUI Select compound
// API is avoided here for robustness).
function SelectBox(props: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={props.ariaLabel}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.value)}
        className={
          inputBase + " cursor-pointer appearance-none pr-9 " + (props.className ?? "")
        }
      >
        {props.children}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
      />
    </div>
  );
}

function FieldLabel({children}: {children: React.ReactNode}) {
  return (
    <label className="mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--faint)]">
      {children}
    </label>
  );
}

export function NewInvoicePage() {
  const {company} = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const customers = useQuery({
    queryKey: ["customers", company?.id, "select"],
    queryFn: () =>
      api<Customer[]>(`/companies/${company!.id}/customers${listQuery({perPage: 100, sort: "name"})}`),
    enabled: Boolean(company?.id),
  });

  const series = useQuery({
    queryKey: ["invoice-series", company?.id],
    queryFn: () => api<InvoiceSeries[]>(`/companies/${company!.id}/invoice-series`),
    enabled: Boolean(company?.id),
  });
  const products = useQuery({
    queryKey: ["products", company?.id, "invoice-autocomplete"],
    queryFn: () => api<Product[]>(`/companies/${company!.id}/products${listQuery({perPage: 100, sort: "name", filter: {is_active: {eq: 1}}})}`),
    enabled: Boolean(company?.id),
  });

  const [customerId, setCustomerId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(() => isoPlusDays(15));
  const [currency, setCurrency] = useState("RON");
  const [locale, setLocale] = useState<"ro" | "en">("ro");
  const [exchangeRate, setExchangeRate] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>(() => [newRow()]);
  const [error, setError] = useState<ApiError | null>(null);

  const customerList = customers.data?.data ?? [];
  const seriesList = series.data?.data ?? [];

  // Default-select the client's default series once loaded.
  const selectedSeries =
    seriesList.find((s) => s.id === seriesId) ??
    seriesList.find((s) => s.is_default) ??
    seriesList[0];

  const numberPreview = selectedSeries
    ? selectedSeries.formatted_next_number ?? `${selectedSeries.prefix}${selectedSeries.next_number}`
    : "—";

  const isForeign = currency !== "RON";
  const rate = Number(exchangeRate.replace(",", "."));

  const totals = useMemo(() => {
    const subtotal = rows.reduce((sum, r) => sum + lineNetCents(r), 0);
    const vat = rows.reduce((sum, r) => sum + lineVatCents(r), 0);
    return {subtotal, vat, total: subtotal + vat};
  }, [rows]);

  const ronTotal =
    isForeign && Number.isFinite(rate) && rate > 0 ? Math.round(totals.total * rate) : null;

  // Field-level errors from the API problem+json (keys like "lines.0.description").
  const fieldErrors = error?.problem.errors ?? {};

  function updateRow(key: string, patch: Partial<LineRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? {...r, ...patch} : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }

  function addProduct(productId: string) {
    const product = products.data?.data.find((item) => item.id === productId);
    if (!product) return;
    const row: LineRow = {
      key: crypto.randomUUID(),
      description: product.name,
      unit: product.unit,
      unit_code: product.unit_code,
      quantity: 1,
      unit_price: product.unit_price_cents / 100,
      vat_rate: Number(product.vat_rate),
      vat_category: product.vat_category,
      vat_exemption_code: product.vat_exemption_code,
      vat_exemption_reason: product.vat_exemption_reason,
    };
    setRows((current) => current.length === 1 && !current[0].description ? [row] : [...current, row]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  function buildPayload() {
    return {
      customer_id: customerId,
      status: "draft" as const,
      issue_date: issueDate,
      due_date: dueDate || null,
      currency,
      locale,
      notes: notes.trim() ? notes.trim() : null,
      lines: rows.map((r) => ({
        description: r.description,
        quantity: r.quantity,
        unit: r.unit,
        unit_code: r.unit_code,
        unit_price_cents: Math.round(r.unit_price * 100),
        vat_rate: r.vat_rate,
        vat_category: r.vat_category,
        vat_exemption_code: r.vat_exemption_code,
        vat_exemption_reason: r.vat_exemption_reason,
      })),
    };
  }

  const mutation = useMutation({
    mutationFn: async (opts: {issue: boolean}) => {
      const created = await api<Invoice>(`/companies/${company!.id}/invoices`, {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      let invoice = created.data;
      if (opts.issue) {
        const issued = await api<Invoice>(
          `/companies/${company!.id}/invoices/${invoice.id}/issue`,
          {method: "POST"},
        );
        invoice = issued.data;
      }
      return invoice;
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({queryKey: ["invoices"]});
      navigate(`/facturi/${invoice.id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err : null);
      window.scrollTo({top: 0, behavior: "smooth"});
    },
  });

  function submit(issue: boolean) {
    setError(null);
    mutation.mutate({issue});
  }

  const pending = mutation.isPending;
  const disabled = pending || !company?.id;

  return (
    <div className="flex flex-col gap-5">
      {/* Error banner (RFC7807 problem details) */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft,var(--surface))] p-4 text-[13px]"
        >
          <div className="font-semibold text-[var(--danger)]">
            {error.problem.detail ?? error.problem.title}
          </div>
          {Object.keys(fieldErrors).length > 0 && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[var(--text-muted)]">
              {Object.entries(fieldErrors).map(([field, msgs]) => (
                <li key={field}>{msgs.join(" ")}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-5">
          {/* 1. Invoice details */}
          <section className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">Detalii factură</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Client</FieldLabel>
                <SelectBox
                  ariaLabel="Client"
                  value={customerId}
                  onChange={(value) => {
                    setCustomerId(value);
                    setLocale(customerList.find((customer) => customer.id === value)?.locale ?? "ro");
                  }}
                  disabled={customers.isLoading}
                >
                  <option value="">
                    {customers.isLoading ? "Se încarcă clienții…" : "Selectează clientul"}
                  </option>
                  {customerList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectBox>
              </div>

              <div>
                <FieldLabel>Serie</FieldLabel>
                <SelectBox
                  ariaLabel="Serie"
                  value={selectedSeries?.id ?? ""}
                  onChange={setSeriesId}
                  disabled={series.isLoading}
                >
                  <option value="">
                    {series.isLoading ? "Se încarcă…" : "Selectează seria"}
                  </option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.prefix})
                    </option>
                  ))}
                </SelectBox>
              </div>

              <div>
                <FieldLabel>Număr</FieldLabel>
                <input
                  disabled
                  aria-label="Număr factură"
                  value={numberPreview}
                  readOnly
                  className={inputBase + " font-semibold tabular-nums"}
                />
              </div>

              <div>
                <FieldLabel>Data emiterii</FieldLabel>
                <input
                  type="date"
                  aria-label="Data emiterii"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className={inputBase + " tabular-nums"}
                />
              </div>

              <div>
                <FieldLabel>Scadență</FieldLabel>
                <input
                  type="date"
                  aria-label="Scadență"
                  value={dueDate}
                  min={issueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className={inputBase + " tabular-nums"}
                />
              </div>

              <div>
                <FieldLabel>Monedă</FieldLabel>
                <SelectBox ariaLabel="Monedă" value={currency} onChange={setCurrency}>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </SelectBox>
              </div>

              <div>
                <FieldLabel>Limba documentului</FieldLabel>
                <SelectBox ariaLabel="Limba documentului" value={locale} onChange={(value) => setLocale(value as "ro" | "en")}>
                  <option value="ro">Română</option>
                  <option value="en">Română + Engleză</option>
                </SelectBox>
              </div>

              {isForeign && (
                <div>
                  <FieldLabel>Curs BNR (1 {currency} = ? RON)</FieldLabel>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    min="0"
                    aria-label="Curs BNR"
                    placeholder="4.9772"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className={inputBase + " tabular-nums"}
                  />
                </div>
              )}
            </div>
          </section>

          {/* 2. Line items */}
          <section className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">Produse / servicii</h2>
            <div className="mb-4">
              <FieldLabel>Adaugă din catalog</FieldLabel>
              <SelectBox ariaLabel="Adaugă din catalog" value="" onChange={addProduct} disabled={products.isLoading}>
                <option value="">{products.isLoading ? "Se încarcă…" : "Selectează un produs sau serviciu"}</option>
                {(products.data?.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.unit_price_cents, product.currency)}</option>)}
              </SelectBox>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--faint)]">
                    <th className="pb-2 pr-3 font-bold">Descriere</th>
                    <th className="pb-2 px-2 text-center font-bold">Cant.</th>
                    <th className="pb-2 px-2 text-right font-bold">Preț</th>
                    <th className="pb-2 px-2 font-bold">TVA</th>
                    <th className="pb-2 px-2 text-right font-bold">Valoare</th>
                    <th className="w-9 pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2.5 pr-3 align-top">
                        <input
                          aria-label="Descriere linie"
                          placeholder="Descriere produs sau serviciu"
                          value={row.description}
                          onChange={(e) => updateRow(row.key, {description: e.target.value})}
                          className={inputBase}
                        />
                      </td>
                      <td className="py-2.5 px-2 align-top">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Scade cantitatea"
                            onClick={() =>
                              updateRow(row.key, {quantity: Math.max(1, row.quantity - 1)})
                            }
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--subtle)]"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            aria-label="Cantitate"
                            min="0"
                            step="1"
                            value={row.quantity}
                            onChange={(e) =>
                              updateRow(row.key, {quantity: Number(e.target.value) || 0})
                            }
                            className={inputBase + " w-16 px-2 text-center tabular-nums"}
                          />
                          <button
                            type="button"
                            aria-label="Crește cantitatea"
                            onClick={() => updateRow(row.key, {quantity: row.quantity + 1})}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border-strong)] text-[var(--text-muted)] transition-colors hover:bg-[var(--subtle)]"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 align-top">
                        <input
                          type="number"
                          aria-label="Preț unitar"
                          min="0"
                          step="0.01"
                          value={row.unit_price}
                          onChange={(e) =>
                            updateRow(row.key, {unit_price: Number(e.target.value) || 0})
                          }
                          className={inputBase + " w-28 text-right tabular-nums"}
                        />
                      </td>
                      <td className="py-2.5 px-2 align-top">
                        <SelectBox
                          ariaLabel="Cotă TVA"
                          className="w-[86px]"
                          value={String(row.vat_rate)}
                          onChange={(v) => updateRow(row.key, {
                            vat_rate: Number(v),
                            vat_category: vatCategoryFor(Number(v)),
                            vat_exemption_code: null,
                            vat_exemption_reason: null,
                          })}
                        >
                          {VAT_RATES.map((r) => (
                            <option key={r} value={r}>
                              {r}%
                            </option>
                          ))}
                        </SelectBox>
                      </td>
                      <td className="py-2.5 px-2 text-right align-middle font-semibold tabular-nums text-[var(--text)]">
                        {money(lineNetCents(row), currency)}
                      </td>
                      <td className="py-2.5 pl-1 text-right align-middle">
                        <Button
                          isIconOnly
                          variant="ghost"
                          size="sm"
                          aria-label="Șterge linia"
                          isDisabled={rows.length === 1}
                          onPress={() => removeRow(row.key)}
                        >
                          <Trash2 size={16} className="text-[var(--danger)]" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addRow}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] py-2.5 text-[13px] font-semibold text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <Plus size={16} /> Adaugă linie
            </button>
          </section>

          {/* 3. Notes */}
          <section className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">Observații / mențiuni</h2>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Mențiuni afișate pe factură (opțional)…"
              rows={4}
              className="w-full resize-y rounded-[10px] border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[13.5px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
            />
          </section>
        </div>

        {/* RIGHT COLUMN — sticky summary */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">Sumar</h2>

            <dl className="space-y-2.5 text-[13.5px]">
              <div className="flex items-center justify-between">
                <dt className="text-[var(--text-muted)]">Subtotal</dt>
                <dd className="font-semibold tabular-nums">{money(totals.subtotal, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[var(--text-muted)]">TVA</dt>
                <dd className="font-semibold tabular-nums">{money(totals.vat, currency)}</dd>
              </div>
              <div className="my-1 h-px bg-[var(--border)]" />
              <div className="flex items-center justify-between">
                <dt className="text-[15px] font-bold">Total</dt>
                <dd className="text-[15px] font-bold tabular-nums text-[var(--accent)]">
                  {money(totals.total, currency)}
                </dd>
              </div>
              {ronTotal !== null && (
                <div className="flex items-center justify-end text-[12px] text-[var(--text-muted)]">
                  ≈ {money(ronTotal, "RON")}
                </div>
              )}
            </dl>

            <div className="mt-4 flex flex-col gap-2.5">
              <Button
                variant="primary"
                fullWidth
                isDisabled={disabled}
                onPress={() => submit(true)}
              >
                {pending ? <Spinner size="sm" /> : <Send size={16} />} Emite factura
              </Button>
              <Button
                variant="outline"
                fullWidth
                isDisabled={disabled}
                onPress={() => submit(false)}
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : null} Salvează ca ciornă
              </Button>
            </div>

            <p className="mt-3 text-center text-[11px] text-[var(--text-faint)]">
              Seria și numărul se atribuie automat la salvare.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
