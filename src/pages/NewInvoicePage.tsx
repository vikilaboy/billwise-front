import {useEffect, useMemo, useState} from "react";
import {useNavigate, useParams} from "react-router";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner, TextArea} from "@heroui/react";
import {Loader2, Plus, Send, Trash2} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {AppDatePicker, AppSelect} from "../components/FormControls";
import {api, listQuery} from "../lib/api";
import type {Currency, Customer, Invoice, Product, VatCategory, VatProfile} from "../lib/types";
import {exchangeRate, money} from "../lib/format";

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

type ResolvedExchangeRate = {
  currency_code: string;
  rate: string;
  day: string;
  source: string;
};

type LineRow = {
  key: string;
  description: string;
  unit: string;
  unit_code: string;
  quantity: number;
  unit_price: number; // major units, e.g. 2500.00
  vat_rate: number; // percent: 19 | 9 | 5 | 0
  vat_profile_id: string | null;
  vat_category: VatCategory;
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
};

// Fixed unit for the whole prototype; the create request requires a UN/ECE unit_code.
const UNIT_LABEL = "buc";
const UNIT_CODE = "C62"; // "One (piece)"

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
    quantity: 1, unit_price: 0, vat_rate: 19, vat_profile_id: null,
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

function SelectBox(props: {
  name?: string;
  apiFields?: string[];
  value: string;
  onChange: (v: string) => void;
  options: {id: string; label: string}[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return <AppSelect
    name={props.name}
    apiFields={props.apiFields}
    ariaLabel={props.ariaLabel}
    value={props.value}
    options={props.options}
    placeholder={props.placeholder}
    className={props.className}
    isDisabled={props.disabled}
    onChange={props.onChange}
  />;
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
  const {id} = useParams();
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
  const currencies = useQuery({
    queryKey: ["currencies", "active"],
    queryFn: () => api<Currency[]>("/settings/currencies?_per_page=100&_sort=code"),
  });
  const vatProfiles = useQuery({
    queryKey: ["vat-profiles", company?.id],
    queryFn: () => api<VatProfile[]>(`/companies/${company!.id}/vat-profiles?_per_page=100`),
    enabled: Boolean(company?.id),
  });
  const invoiceQuery = useQuery({
    queryKey: ["invoice", company?.id, id, "edit"],
    queryFn: () => api<Invoice>(`/companies/${company!.id}/invoices/${id}`),
    enabled: Boolean(company?.id && id),
  });

  const [customerId, setCustomerId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(() => isoPlusDays(15));
  const [currency, setCurrency] = useState("RON");
  const [locale, setLocale] = useState<"ro" | "en">("ro");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<LineRow[]>(() => [newRow()]);

  useEffect(() => {
    const profile = (vatProfiles.data?.data ?? []).find((item) => item.is_active && item.is_default);
    if (!profile) return;
    setRows((current) => current.map((row) => row.vat_profile_id ? row : {
      ...row,
      vat_profile_id: profile.id,
      vat_rate: Number(profile.rate),
      vat_category: profile.vat_category,
      vat_exemption_code: profile.vat_exemption_code,
      vat_exemption_reason: profile.vat_exemption_reason,
    }));
  }, [vatProfiles.data]);

  useEffect(() => {
    const invoice = invoiceQuery.data?.data;
    if (!invoice) return;
    if (invoice.status !== "draft") {
      navigate(`/facturi/${invoice.id}`, {replace: true});
      return;
    }
    setCustomerId(invoice.customer?.id ?? "");
    setIssueDate(invoice.issue_date ?? todayIso());
    setDueDate(invoice.due_date ?? "");
    setCurrency(invoice.currency);
    setLocale(invoice.locale);
    setNotes(invoice.notes ?? "");
    setRows(invoice.lines.map((line) => ({
      key: line.id,
      description: line.description,
      unit: line.unit ?? UNIT_LABEL,
      unit_code: line.unit_code ?? UNIT_CODE,
      quantity: Number(line.quantity),
      unit_price: line.unit_price_cents / 100,
      vat_rate: Number(line.vat_rate),
      vat_profile_id: line.vat_profile_id,
      vat_category: line.vat_category,
      vat_exemption_code: line.vat_exemption_code,
      vat_exemption_reason: line.vat_exemption_reason,
    })));
  }, [invoiceQuery.data, navigate]);

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
  const exchangeRatePreview = useQuery({
    queryKey: ["exchange-rate-preview", currency, issueDate],
    queryFn: () => api<ResolvedExchangeRate>(
      `/exchange-rates/resolve?currency=${encodeURIComponent(currency)}&date=${encodeURIComponent(issueDate)}`,
    ),
    enabled: isForeign && Boolean(issueDate),
    retry: false,
  });

  const totals = useMemo(() => {
    const subtotal = rows.reduce((sum, r) => sum + lineNetCents(r), 0);
    const vat = rows.reduce((sum, r) => sum + lineVatCents(r), 0);
    return {subtotal, vat, total: subtotal + vat};
  }, [rows]);

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
      vat_profile_id: product.vat_profile_id,
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
        vat_profile_id: r.vat_profile_id,
        vat_category: r.vat_category,
        vat_exemption_code: r.vat_exemption_code,
        vat_exemption_reason: r.vat_exemption_reason,
      })),
    };
  }

  const mutation = useMutation({
    mutationFn: async (opts: {issue: boolean}) => {
      const created = await api<Invoice>(`/companies/${company!.id}/invoices${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
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
  });

  function submit(issue: boolean) {
    mutation.mutate({issue});
  }

  const pending = mutation.isPending;
  const disabled = pending || !company?.id;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        {/* LEFT COLUMN */}
        <div className="flex flex-col gap-5">
          {/* 1. Invoice details */}
          <section className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">{id ? "Editează ciorna" : "Detalii factură"}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Client</FieldLabel>
                <SelectBox
                  name="customer_id"
                  ariaLabel="Client"
                  value={customerId}
                  onChange={(value) => {
                    setCustomerId(value);
                    setLocale(customerList.find((customer) => customer.id === value)?.locale ?? "ro");
                  }}
                  disabled={customers.isLoading}
                  placeholder={customers.isLoading ? "Se încarcă clienții…" : "Selectează clientul"}
                  options={customerList.map((customer) => ({id: customer.id, label: customer.name}))}
                />
              </div>

              <div>
                <FieldLabel>Serie</FieldLabel>
                <SelectBox
                  name="invoice_series_id"
                  ariaLabel="Serie"
                  value={selectedSeries?.id ?? ""}
                  onChange={setSeriesId}
                  disabled={series.isLoading}
                  placeholder={series.isLoading ? "Se încarcă…" : "Selectează seria"}
                  options={seriesList.map((item) => ({id: item.id, label: `${item.name} (${item.prefix})`}))}
                />
              </div>

              <div>
                <FieldLabel>Număr</FieldLabel>
                <input
                  name="issue_date"
                  disabled
                  aria-label="Număr factură"
                  value={numberPreview}
                  readOnly
                  className={inputBase + " font-semibold tabular-nums"}
                />
              </div>

              <div>
                <FieldLabel>Data emiterii</FieldLabel>
                <AppDatePicker name="issue_date" ariaLabel="Data emiterii" value={issueDate} onChange={setIssueDate} />
              </div>

              <div>
                <FieldLabel>Scadență</FieldLabel>
                <AppDatePicker name="due_date" ariaLabel="Scadență" value={dueDate} minValue={issueDate} onChange={setDueDate} />
              </div>

              <div>
                <FieldLabel>Monedă</FieldLabel>
                <SelectBox name="currency" ariaLabel="Monedă" value={currency} onChange={setCurrency} options={(currencies.data?.data ?? []).filter((item) => item.is_active).map((item) => ({id: item.code, label: `${item.code} — ${item.name}`}))} />
              </div>

              <div>
                <FieldLabel>Limba documentului</FieldLabel>
                <SelectBox name="locale" ariaLabel="Limba documentului" value={locale} onChange={(value) => setLocale(value as "ro" | "en")} options={[{id: "ro", label: "Română"}, {id: "en", label: "Română + Engleză"}]} />
              </div>

              {isForeign && <div className="self-end text-xs text-[var(--text-muted)]">
                {exchangeRatePreview.isPending
                  ? "Se verifică cursul care ar fi folosit…"
                  : exchangeRatePreview.data
                    ? <>Preview: 1 {currency} = {exchangeRate(exchangeRatePreview.data.data.rate)} RON · {exchangeRatePreview.data.data.source.toUpperCase()} · {exchangeRatePreview.data.data.day}</>
                    : "Nu există acum un curs eligibil pentru această dată. Emiterea va rămâne blocată până la disponibilitatea lui."}
                <span className="mt-1 block">Preview-ul este informativ; la emitere serverul recalculează și salvează definitiv cursul.</span>
              </div>}
            </div>
          </section>

          {/* 2. Line items */}
          <section className={cardClass}>
            <h2 className="mb-4 text-[15px] font-bold tracking-tight">Produse / servicii</h2>
            <div className="mb-4">
              <FieldLabel>Adaugă din catalog</FieldLabel>
              <SelectBox ariaLabel="Adaugă din catalog" value="" onChange={addProduct} disabled={products.isLoading} placeholder={products.isLoading ? "Se încarcă…" : "Selectează un produs sau serviciu"} options={(products.data?.data ?? []).map((product) => ({id: product.id, label: `${product.name} · ${money(product.unit_price_cents, product.currency)}`}))} />
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
                  {rows.map((row, index) => (
                    <tr key={row.key} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2.5 pr-3 align-top">
                        <input
                          name={`lines.${index}.description`}
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
                            name={`lines.${index}.quantity`}
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
                          name={`lines.${index}.unit_price_cents`}
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
                          name={`lines.${index}.vat_profile_id`}
                          apiFields={[`lines.${index}.vat_rate`, `lines.${index}.vat_category`, `lines.${index}.vat_exemption_code`, `lines.${index}.vat_exemption_reason`]}
                          ariaLabel="Cotă TVA"
                          className="w-[150px]"
                          value={row.vat_profile_id ?? ""}
                          onChange={(v) => {
                            const profile = (vatProfiles.data?.data ?? []).find((item) => item.id === v);
                            if (!profile) return;
                            updateRow(row.key, {
                              vat_profile_id: profile.id,
                              vat_rate: Number(profile.rate),
                              vat_category: profile.vat_category,
                              vat_exemption_code: profile.vat_exemption_code,
                              vat_exemption_reason: profile.vat_exemption_reason,
                            });
                          }}
                          placeholder="Selectează TVA"
                          options={(vatProfiles.data?.data ?? []).filter((profile) => profile.is_active).map((profile) => ({id: profile.id, label: `${profile.name} · ${Number(profile.rate)}%`}))}
                        />
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
              name="notes"
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
              {isForeign && exchangeRatePreview.data ? <>
                <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                  <dt>Subtotal estimat RON</dt>
                  <dd>{money(Math.round(totals.subtotal * Number(exchangeRatePreview.data.data.rate)), "RON")}</dd>
                </div>
                <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                  <dt>Total estimat RON</dt>
                  <dd>{money(Math.round(totals.total * Number(exchangeRatePreview.data.data.rate)), "RON")}</dd>
                </div>
              </> : isForeign ? <div className="text-right text-[12px] text-[var(--text-muted)]">
                Echivalentul RON va apărea după emitere.
              </div> : null}
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
