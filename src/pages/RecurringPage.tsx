import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Spinner} from "@heroui/react";
import {Pause, Pencil, Play, Plus, Repeat, Trash2, X} from "lucide-react";
import {useNavigate, useSearchParams} from "react-router";
import {useCompany} from "../components/AppShell";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, apiErrorMessage, ApiError, listQuery} from "../lib/api";
import type {Customer, RecurringInvoiceTemplate} from "../lib/types";

type Series = {id: string; name: string; is_active: boolean};
type RecurringRunResult = {status: string; error: string | null; invoice_id: string | null};
type RecurringLineForm = {description: string; quantity: string; unit_price: string; vat_rate: string};
type Form = {
  name: string; customer_id: string; invoice_series_id: string;
  frequency: "monthly" | "quarterly"; start_date: string; end_date: string;
  payment_terms_days: string; currency: string; locale: "ro" | "en";
  lines: RecurringLineForm[]; notes: string;
};
const today = () => new Date().toISOString().slice(0, 10);
export const bucharestRunAt = (date: string) => {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Bucharest",
    timeZoneName: "longOffset",
  }).formatToParts(new Date(`${date}T12:00:00Z`)).find((part) => part.type === "timeZoneName")?.value.replace("GMT", "");

  return `${date}T09:00:00${offset || "+02:00"}`;
};
const recurringDate = (value: string, timezone = "Europe/Bucharest") =>
  new Date(value).toLocaleString("ro-RO", {timeZone: timezone});
const EMPTY: Form = {
  name: "", customer_id: "", invoice_series_id: "", frequency: "monthly",
  start_date: today(), end_date: "", payment_terms_days: "15", currency: "RON",
  locale: "ro", lines: [{description: "", quantity: "1", unit_price: "0", vat_rate: "19"}], notes: "",
};

export function RecurringPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get("status");
  const status: "all" | "active" | "paused" = requestedStatus === "active" || requestedStatus === "paused" ? requestedStatus : "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState<RecurringInvoiceTemplate | null | undefined>(undefined);
  const templates = useQuery({
    queryKey: ["recurring-invoices", company?.id, status, page],
    queryFn: () => api<RecurringInvoiceTemplate[]>(`/companies/${company!.id}/recurring-invoices${listQuery({page, perPage: 20, filter: status === "all" ? undefined : {status}})}`),
    enabled: Boolean(company?.id),
  });
  const mutate = useMutation({
    mutationFn: async ({template, action}: {template: RecurringInvoiceTemplate; action: "toggle" | "run" | "delete"}) => {
      if (action === "delete") return api<void>(`/companies/${company!.id}/recurring-invoices/${template.id}`, {method: "DELETE"});
      if (action === "run") {
        const result = await api<RecurringRunResult>(`/companies/${company!.id}/recurring-invoices/${template.id}/run`, {method: "POST"});
        if (result.data.status !== "created" || !result.data.invoice_id) {
          throw new Error(result.data.error ?? "Ciorna recurentă nu a putut fi generată.");
        }
        return result;
      }
      return api(`/companies/${company!.id}/recurring-invoices/${template.id}`, {
        method: "PUT",
        body: JSON.stringify({...template, status: template.status === "active" ? "paused" : "active", customer: undefined, series: undefined, runs: undefined, mode: undefined}),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["recurring-invoices", company?.id]}),
  });
  const rows = templates.data?.data ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Șabloanele generează numai ciorne. Emiterea, emailul și SPV rămân acțiuni explicite.</p>
          <select className="mt-3 h-10 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm" value={status} onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value === "all") next.delete("status"); else next.set("status", event.target.value);
            next.delete("page");
            setParams(next);
          }}>
            <option value="all">Toate</option><option value="active">Active</option><option value="paused">Pauzate</option>
          </select>
        </div>
        <Button variant="primary" onPress={() => setEditing(null)}><Plus size={16} /> Șablon nou</Button>
      </div>
      {mutate.isError ? (
        <p role="alert" className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {apiErrorMessage(mutate.error, "Operația asupra șablonului recurent a eșuat.")}
        </p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        {templates.isLoading ? <div className="flex justify-center gap-2 py-20"><Spinner size="sm" /> Se încarcă…</div>
          : templates.isError ? <div className="py-20 text-center text-sm text-[var(--danger)]">Șabloanele nu au putut fi încărcate.</div>
          : rows.length === 0 ? <div className="flex flex-col items-center gap-2 py-20 text-center"><Repeat size={26} className="text-[var(--faint)]" /><b>Niciun șablon recurent</b><span className="text-sm text-[var(--text-muted)]">Configurează prima generare controlată de ciorne.</span></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--bg-muted)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="p-3">Șablon</th><th className="p-3">Client</th><th className="p-3">Frecvență</th><th className="p-3">Următoarea rulare</th><th className="p-3">Status</th><th className="p-3 text-right">Acțiuni</th></tr></thead><tbody>
            {rows.map((template) => <tr key={template.id} className="border-t border-[var(--border)]"><td className="p-3 font-semibold">{template.name}</td><td className="p-3">{template.customer?.name ?? "—"}</td><td className="p-3">{template.frequency === "monthly" ? "Lunar" : "Trimestrial"}</td><td className="p-3">{recurringDate(template.next_run_at, template.timezone)}</td><td className="p-3">{template.status === "active" ? "Activ" : "Pauzat"}</td><td className="p-3"><div className="flex justify-end gap-1">
              <Button isIconOnly size="sm" variant="ghost" aria-label="Editează" onPress={() => setEditing(template)}><Pencil size={14} /></Button>
              <Button isIconOnly size="sm" variant="ghost" aria-label={template.status === "active" ? "Pauză" : "Reia"} onPress={() => mutate.mutate({template, action: "toggle"})}>{template.status === "active" ? <Pause size={14} /> : <Play size={14} />}</Button>
              <Button size="sm" variant="outline" isDisabled={template.status !== "active"} onPress={() => {
                if (window.confirm("Generezi acum o ciornă? Nu se va emite și nu se va trimite automat.")) mutate.mutate({template, action: "run"});
              }}><Play size={14} /> Generează acum</Button>
              <Button isIconOnly size="sm" variant="ghost" aria-label="Șterge" onPress={() => {
                if (window.confirm("Ștergi șablonul? Facturile deja generate rămân neschimbate.")) mutate.mutate({template, action: "delete"});
              }}><Trash2 size={14} className="text-[var(--danger)]" /></Button>
            </div></td></tr>)}
          </tbody></table></div>}
        <DataTablePagination pagination={templates.data?.meta?.pagination} onPageChange={(nextPage) => {
          const next = new URLSearchParams(params);
          if (nextPage <= 1) next.delete("page"); else next.set("page", String(nextPage));
          setParams(next);
        }} />
      </div>
      {editing !== undefined && company?.id ? <TemplateModal companyId={company.id} template={editing} onClose={() => setEditing(undefined)} onSaved={() => {
        void queryClient.invalidateQueries({queryKey: ["recurring-invoices", company.id]});
        setEditing(undefined);
      }} onOpenInvoice={(id) => navigate(`/facturi/${id}`)} /> : null}
    </div>
  );
}

function TemplateModal({companyId, template, onClose, onSaved, onOpenInvoice}: {
  companyId: string; template: RecurringInvoiceTemplate | null; onClose: () => void; onSaved: () => void; onOpenInvoice: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(() => template ? {
    name: template.name, customer_id: template.customer_id, invoice_series_id: template.invoice_series_id,
    frequency: template.frequency, start_date: template.start_date, end_date: template.end_date ?? "",
    payment_terms_days: String(template.payment_terms_days), currency: template.currency, locale: template.locale,
    lines: template.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: String(line.unit_price_cents / 100),
      vat_rate: line.vat_rate,
    })),
    notes: template.notes ?? "",
  } : EMPTY);
  const detail = useQuery({
    queryKey: ["recurring-invoice", companyId, template?.id],
    queryFn: () => api<RecurringInvoiceTemplate>(`/companies/${companyId}/recurring-invoices/${template!.id}`),
    enabled: Boolean(template?.id),
  });
  const customers = useQuery({queryKey: ["customers", companyId, "recurring"], queryFn: () => api<Customer[]>(`/companies/${companyId}/customers?_per_page=100&_sort=name`)});
  const series = useQuery({queryKey: ["invoice-series", companyId, "recurring"], queryFn: () => api<Series[]>(`/companies/${companyId}/invoice-series?_per_page=100`)});
  const save = useMutation({
    mutationFn: () => api<RecurringInvoiceTemplate>(`/companies/${companyId}/recurring-invoices${template ? `/${template.id}` : ""}`, {
      method: template ? "PUT" : "POST",
      body: JSON.stringify({
        name: form.name.trim(), customer_id: form.customer_id, invoice_series_id: form.invoice_series_id,
        frequency: form.frequency, timezone: "Europe/Bucharest", start_date: form.start_date,
        end_date: form.end_date || null, next_run_at: bucharestRunAt(form.start_date),
        payment_terms_days: Number(form.payment_terms_days), currency: form.currency, locale: form.locale,
        notes: form.notes.trim() || null, status: template?.status ?? "active",
        lines: form.lines.map((line) => ({
          description: line.description.trim(), quantity: line.quantity, unit: "buc", unit_code: "C62",
          unit_price_cents: Math.round(Number(line.unit_price) * 100), vat_rate: line.vat_rate,
          vat_category: Number(line.vat_rate) > 0 ? "S" : "Z", vat_exemption_code: null, vat_exemption_reason: null,
        })),
      }),
    }),
    onSuccess: onSaved,
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({...current, [key]: value}));
  const setLine = (index: number, key: keyof RecurringLineForm, value: string) => setForm((current) => ({
    ...current,
    lines: current.lines.map((line, lineIndex) => lineIndex === index ? {...line, [key]: value} : line),
  }));
  const input = "h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm";
  const error = save.error instanceof ApiError ? save.error.problem.detail ?? save.error.problem.title : null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true">
    <div className="w-full max-w-2xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">{template ? "Editează șablonul" : "Șablon recurent nou"}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">Preview: următoarea factură va fi o ciornă cu scadență la {form.payment_terms_days || 0} zile.</p></div><Button isIconOnly variant="ghost" onPress={onClose}><X size={17} /></Button></header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Denumire"><input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Client"><select className={input} value={form.customer_id} onChange={(e) => set("customer_id", e.target.value)}><option value="">Selectează</option>{(customers.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Serie"><select className={input} value={form.invoice_series_id} onChange={(e) => set("invoice_series_id", e.target.value)}><option value="">Selectează</option>{(series.data?.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Frecvență"><select className={input} value={form.frequency} onChange={(e) => set("frequency", e.target.value as Form["frequency"])}><option value="monthly">Lunar</option><option value="quarterly">Trimestrial</option></select></Field>
        <Field label="Prima rulare"><input type="date" className={input} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="Data finală (opțional)"><input type="date" className={input} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
        <Field label="Termen de plată (zile)"><input type="number" className={input} value={form.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
        <Field label="Monedă"><input className={input} value={form.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Liniile facturii</span>
            <Button size="sm" variant="outline" onPress={() => set("lines", [...form.lines, {description: "", quantity: "1", unit_price: "0", vat_rate: "19"}])}><Plus size={14} /> Adaugă linie</Button>
          </div>
          <div className="grid gap-3">
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_90px_120px_80px_auto]">
                <Field label="Descriere"><input className={input} value={line.description} onChange={(event) => setLine(index, "description", event.target.value)} /></Field>
                <Field label="Cantitate"><input type="number" min="0.01" step="0.01" className={input} value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} /></Field>
                <Field label="Preț unitar"><input type="number" step="0.01" className={input} value={line.unit_price} onChange={(event) => setLine(index, "unit_price", event.target.value)} /></Field>
                <Field label="TVA %"><input type="number" min="0" max="100" className={input} value={line.vat_rate} onChange={(event) => setLine(index, "vat_rate", event.target.value)} /></Field>
                <Button className="self-end" isIconOnly variant="ghost" aria-label={`Șterge linia ${index + 1}`} isDisabled={form.lines.length === 1} onPress={() => set("lines", form.lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></Button>
              </div>
            ))}
          </div>
        </div>
        <Field label="Limbă"><select className={input} value={form.locale} onChange={(e) => set("locale", e.target.value as Form["locale"])}><option value="ro">Română</option><option value="en">Bilingv</option></select></Field>
        {error ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
        {template && (detail.data?.data.runs ?? []).length > 0 ? <div className="sm:col-span-2"><b className="text-xs">Istoric rulări</b>{detail.data!.data.runs.map((run) => <button key={run.id} type="button" disabled={!run.invoice_id} onClick={() => run.invoice_id && onOpenInvoice(run.invoice_id)} className="mt-2 flex w-full justify-between rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs"><span>{recurringDate(run.scheduled_for, template.timezone)}</span><span>{run.status === "created" ? "Ciornă creată" : run.error ?? run.status}</span></button>)}</div> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="primary" isDisabled={save.isPending || !form.name.trim() || !form.customer_id || !form.invoice_series_id || form.lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0)} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm" /> : null} Salvează</Button></footer>
    </div>
  </div>;
}

function Field({label, className, children}: {label: string; className?: string; children: React.ReactNode}) {
  return <label className={`flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)] ${className ?? ""}`}>{label}{children}</label>;
}
