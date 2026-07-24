import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Spinner} from "@heroui/react";
import {Pause, Pencil, Play, Plus, Repeat, Trash2, X} from "lucide-react";
import {useNavigate, useSearchParams} from "react-router";
import {useCompany} from "../components/AppShell";
import {DataTablePagination} from "../components/DataTablePagination";
import {api, apiErrorMessage, ApiError, listQuery} from "../lib/api";
import type {Currency, Customer, RecurringInvoiceTemplate, VatProfile} from "../lib/types";

type Series = {id: string; name: string; is_active: boolean};
type RecurringRunResult = {status: string; error: string | null; invoice_id: string | null};
type RecurringLineForm = {description_template: string; quantity: string; unit_price: string; vat_profile_id: string};
type Form = {
  name: string; customer_id: string; invoice_series_id: string;
  cadence: "weekly" | "biweekly" | "monthly" | "twice_monthly" | "quarterly" | "custom_week" | "custom_month";
  cadence_interval: string; weekdays: number[]; month_days: Array<number | "last_day">;
  weekday: string; month_day: string; month_day_second: string; run_time: string; start_date: string; end_date: string;
  payment_terms_days: string; currency: string; locale: "ro" | "en";
  contract_number: string; contract_date: string; lines: RecurringLineForm[]; notes: string;
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
const scheduleLabel = (template: RecurringInvoiceTemplate) => {
  const schedule = template.schedule;
  if (!schedule) return template.frequency === "quarterly" ? "Trimestrial" : "Lunar";
  if (schedule.unit === "week") return schedule.interval === 1 ? "Săptămânal" : `La ${schedule.interval} săptămâni`;
  return schedule.interval === 1 ? "Lunar" : schedule.interval === 3 ? "Trimestrial" : `La ${schedule.interval} luni`;
};
const EMPTY: Form = {
  name: "", customer_id: "", invoice_series_id: "", cadence: "monthly", weekday: "1",
  cadence_interval: "1", weekdays: [1], month_days: [1],
  month_day: "1", month_day_second: "15", run_time: "09:00", start_date: today(), end_date: "",
  payment_terms_days: "15", currency: "RON", locale: "ro",
  contract_number: "", contract_date: "",
  lines: [{description_template: "Servicii prestate în perioada {{period.start}} - {{period.end}} conform contract nr. {{contract.number}} din {{contract.date}} / Services delivered for period {{period.start}} - {{period.end}} including stated dates, under contract no. {{contract.number}} dated {{contract.date}}", quantity: "1", unit_price: "0", vat_profile_id: ""}], notes: "",
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
      return api(`/companies/${company!.id}/recurring-invoices/${template.id}/${template.status === "active" ? "pause" : "resume"}`, {
        method: "POST",
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
            {rows.map((template) => <tr key={template.id} className="border-t border-[var(--border)]"><td className="p-3 font-semibold">{template.name}{template.is_locked ? <span className="ml-2 text-xs text-[var(--text-muted)]">versiune blocată</span> : null}</td><td className="p-3">{template.customer?.name ?? "—"}</td><td className="p-3">{scheduleLabel(template)}</td><td className="p-3">{recurringDate(template.next_run_at, template.schedule?.timezone ?? template.timezone)}</td><td className="p-3">{template.status === "active" ? "Activ" : template.status === "paused" ? "Pauzat" : "Arhivat"}</td><td className="p-3"><div className="flex justify-end gap-1">
              <Button isIconOnly size="sm" variant="ghost" aria-label={template.is_locked ? "Creează versiune nouă" : "Editează"} onPress={() => setEditing(template)}><Pencil size={14} /></Button>
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
  const [previewedPayload, setPreviewedPayload] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => template ? {
    name: template.name, customer_id: template.customer_id, invoice_series_id: template.invoice_series_id,
    cadence: template.schedule?.unit === "week"
      ? (template.schedule.interval === 1 && template.schedule.weekdays?.length === 1 ? "weekly"
        : template.schedule.interval === 2 && template.schedule.weekdays?.length === 1 ? "biweekly" : "custom_week")
      : template.schedule?.interval === 1 && template.schedule.month_days?.length === 2 ? "twice_monthly"
        : template.schedule?.interval === 1 && template.schedule.month_days?.length === 1 ? "monthly"
          : template.schedule?.interval === 3 && template.schedule.month_days?.length === 1 ? "quarterly" : "custom_month",
    cadence_interval: String(template.schedule?.interval ?? 1),
    weekdays: template.schedule?.weekdays ?? [1],
    month_days: template.schedule?.month_days ?? [1],
    weekday: String(template.schedule?.weekdays?.[0] ?? 1),
    month_day: String(template.schedule?.month_days?.[0] ?? 1),
    month_day_second: String(template.schedule?.month_days?.[1] ?? 15),
    run_time: template.schedule?.run_time ?? "09:00",
    start_date: template.schedule?.start_date ?? template.start_date,
    end_date: template.schedule?.end_date ?? template.end_date ?? "",
    payment_terms_days: String(template.payment_terms_days), currency: template.currency, locale: template.locale,
    lines: template.lines.map((line) => ({
      description_template: line.description_template ?? line.description,
      quantity: line.quantity,
      unit_price: String(line.unit_price_cents / 100),
      vat_profile_id: line.vat_profile_id ?? "",
    })),
    contract_number: template.contract_number ?? "",
    contract_date: template.contract_date ?? "",
    notes: template.notes ?? "",
  } : EMPTY);
  const detail = useQuery({
    queryKey: ["recurring-invoice", companyId, template?.id],
    queryFn: () => api<RecurringInvoiceTemplate>(`/companies/${companyId}/recurring-invoices/${template!.id}`),
    enabled: Boolean(template?.id),
  });
  const customers = useQuery({queryKey: ["customers", companyId, "recurring"], queryFn: () => api<Customer[]>(`/companies/${companyId}/customers?_per_page=100&_sort=name`)});
  const series = useQuery({queryKey: ["invoice-series", companyId, "recurring"], queryFn: () => api<Series[]>(`/companies/${companyId}/invoice-series?_per_page=100`)});
  const currencies = useQuery({queryKey: ["currencies", "active"], queryFn: () => api<Currency[]>("/settings/currencies?_per_page=100&_sort=code")});
  const vatProfiles = useQuery({queryKey: ["vat-profiles", companyId], queryFn: () => api<VatProfile[]>(`/companies/${companyId}/vat-profiles?_per_page=100`)});
  const payload = () => ({
    name: form.name.trim(), customer_id: form.customer_id, invoice_series_id: form.invoice_series_id,
    schedule: {
      unit: form.cadence === "weekly" || form.cadence === "biweekly" || form.cadence === "custom_week" ? "week" : "month",
      interval: form.cadence === "biweekly" ? 2 : form.cadence === "quarterly" ? 3
        : form.cadence === "custom_week" || form.cadence === "custom_month" ? Number(form.cadence_interval) : 1,
      weekdays: form.cadence === "weekly" || form.cadence === "biweekly" ? [Number(form.weekday)]
        : form.cadence === "custom_week" ? form.weekdays : null,
      month_days: form.cadence === "monthly" || form.cadence === "twice_monthly" || form.cadence === "quarterly"
        ? [
            form.month_day === "last_day" ? "last_day" : Number(form.month_day),
            ...(form.cadence === "twice_monthly" ? [form.month_day_second === "last_day" ? "last_day" : Number(form.month_day_second)] : []),
          ]
        : form.cadence === "custom_month" ? form.month_days : null,
      run_time: form.run_time, timezone: "Europe/Bucharest", start_date: form.start_date,
      end_date: form.end_date || null,
    },
    period_strategy: "previous_schedule_window",
    payment_terms_days: Number(form.payment_terms_days), currency: form.currency, locale: form.locale,
    contract_number: form.contract_number.trim() || null,
    contract_date: form.contract_date || null,
    notes: form.notes.trim() || null, status: template?.status === "paused" ? "paused" : "active",
    lines: form.lines.map((line) => ({
      description_template: line.description_template.trim(), quantity: line.quantity, unit: "h", unit_code: "HUR",
      unit_price_cents: Math.round(Number(line.unit_price) * 100), vat_profile_id: line.vat_profile_id,
    })),
  });
  const save = useMutation({
    mutationFn: () => api<RecurringInvoiceTemplate>(`/companies/${companyId}/recurring-invoices${template ? `/${template.id}${template.is_locked ? "/new-version" : ""}` : ""}`, {
      method: template?.is_locked ? "POST" : template ? "PUT" : "POST",
      body: JSON.stringify(payload()),
    }),
    onSuccess: onSaved,
  });
  const preview = useMutation({
    mutationFn: () => api<{
      scheduled_for: string; issue_date: string; due_date: string;
      period: {start: string; end: string}; lines: Array<{description: string}>;
    }>(`/companies/${companyId}/recurring-invoices/preview`, {
      method: "POST",
      body: JSON.stringify(payload()),
    }),
    onSuccess: () => setPreviewedPayload(JSON.stringify(payload())),
  });
  const recover = useMutation({
    mutationFn: (runId: string) => api<RecurringRunResult[]>(
      `/companies/${companyId}/recurring-invoices/${template!.id}/recover`,
      {method: "POST", body: JSON.stringify({run_ids: [runId]})},
    ),
    onSuccess: () => void detail.refetch(),
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
      <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">{template?.is_locked ? "Versiune nouă a șablonului" : template ? "Editează șablonul" : "Șablon recurent nou"}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{template?.is_locked ? "Versiunea folosită la facturile emise rămâne neschimbată." : "Următoarea generare va crea numai o ciornă."}</p></div><Button isIconOnly variant="ghost" onPress={onClose}><X size={17} /></Button></header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Denumire"><input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Client"><select className={input} value={form.customer_id} onChange={(e) => set("customer_id", e.target.value)}><option value="">Selectează</option>{(customers.data?.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Serie"><select className={input} value={form.invoice_series_id} onChange={(e) => set("invoice_series_id", e.target.value)}><option value="">Selectează</option>{(series.data?.data ?? []).filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Frecvență"><select className={input} value={form.cadence} onChange={(e) => set("cadence", e.target.value as Form["cadence"])}><option value="weekly">Săptămânal</option><option value="biweekly">La 2 săptămâni</option><option value="monthly">Lunar</option><option value="twice_monthly">De două ori pe lună</option><option value="quarterly">Trimestrial</option><option value="custom_week">Personalizat · săptămâni</option><option value="custom_month">Personalizat · luni</option></select></Field>
        {form.cadence === "weekly" || form.cadence === "biweekly"
          ? <Field label="Ziua săptămânii"><select className={input} value={form.weekday} onChange={(e) => set("weekday", e.target.value)}>{["Luni","Marți","Miercuri","Joi","Vineri","Sâmbătă","Duminică"].map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></Field>
          : form.cadence !== "custom_week" && form.cadence !== "custom_month" ? <Field label="Ziua lunii"><select className={input} value={form.month_day} onChange={(e) => set("month_day", e.target.value)}>{Array.from({length: 31}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}<option value="last_day">Ultima zi</option></select></Field> : null}
        {form.cadence === "twice_monthly" ? <Field label="A doua zi a lunii"><select className={input} value={form.month_day_second} onChange={(e) => set("month_day_second", e.target.value)}>{Array.from({length: 31}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}<option value="last_day">Ultima zi</option></select></Field> : null}
        {form.cadence === "custom_week" ? <>
          <Field label="La fiecare N săptămâni"><input type="number" min="1" max="52" className={input} value={form.cadence_interval} onChange={(e) => set("cadence_interval", e.target.value)} /></Field>
          <Field label="Zilele săptămânii" className="sm:col-span-2"><span className="flex flex-wrap gap-3">{["L","Ma","Mi","J","V","S","D"].map((day, index) => <label key={day} className="flex items-center gap-1 font-normal"><input type="checkbox" checked={form.weekdays.includes(index + 1)} onChange={(event) => set("weekdays", event.target.checked ? [...form.weekdays, index + 1].sort() : form.weekdays.filter((value) => value !== index + 1))} /> {day}</label>)}</span></Field>
        </> : null}
        {form.cadence === "custom_month" ? <>
          <Field label="La fiecare N luni"><input type="number" min="1" max="12" className={input} value={form.cadence_interval} onChange={(e) => set("cadence_interval", e.target.value)} /></Field>
          <Field label="Zilele lunii (selecție multiplă)" className="sm:col-span-2"><select multiple className={`${input} h-36 py-2`} value={form.month_days.map(String)} onChange={(event) => set("month_days", Array.from(event.target.selectedOptions).map((option) => option.value === "last_day" ? "last_day" : Number(option.value)))}>{Array.from({length: 31}, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}<option value="last_day">Ultima zi</option></select></Field>
        </> : null}
        <Field label="Prima rulare"><input type="date" className={input} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field>
        <Field label="Data finală (opțional)"><input type="date" className={input} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field>
        <Field label="Ora generării"><input type="time" className={input} value={form.run_time} onChange={(e) => set("run_time", e.target.value)} /></Field>
        <Field label="Termen de plată (zile)"><input type="number" className={input} value={form.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
        <Field label="Monedă"><select className={input} value={form.currency} onChange={(e) => set("currency", e.target.value)}>{(currencies.data?.data ?? []).filter((currency) => currency.is_active).map((currency) => <option key={currency.id} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></Field>
        <Field label="Nr. contract"><input className={input} value={form.contract_number} onChange={(e) => set("contract_number", e.target.value)} /></Field>
        <Field label="Data contractului"><input type="date" className={input} value={form.contract_date} onChange={(e) => set("contract_date", e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Liniile facturii</span>
            <Button size="sm" variant="outline" onPress={() => set("lines", [...form.lines, {description_template: "", quantity: "1", unit_price: "0", vat_profile_id: ""}])}><Plus size={14} /> Adaugă linie</Button>
          </div>
          <div className="grid gap-3">
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-3 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[1fr_90px_120px_170px_auto]">
                <Field label="Descriere cu variabile"><textarea rows={4} className={`${input} h-auto py-2`} value={line.description_template} onChange={(event) => setLine(index, "description_template", event.target.value)} /><span className="font-normal">Variabile: {"{{period.start}}"}, {"{{period.end}}"}, {"{{invoice.issue_date}}"}, {"{{invoice.due_date}}"}, {"{{customer.name}}"}, {"{{contract.number}}"}, {"{{contract.date}}"}</span></Field>
                <Field label="Cantitate"><input type="number" min="0.01" step="0.01" className={input} value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} /></Field>
                <Field label="Preț unitar"><input type="number" step="0.01" className={input} value={line.unit_price} onChange={(event) => setLine(index, "unit_price", event.target.value)} /></Field>
                <Field label="Profil TVA"><select className={input} value={line.vat_profile_id} onChange={(event) => setLine(index, "vat_profile_id", event.target.value)}><option value="">Selectează</option>{(vatProfiles.data?.data ?? []).filter((profile) => profile.is_active).map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {Number(profile.rate)}%</option>)}</select></Field>
                <Button className="self-end" isIconOnly variant="ghost" aria-label={`Șterge linia ${index + 1}`} isDisabled={form.lines.length === 1} onPress={() => set("lines", form.lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></Button>
              </div>
            ))}
          </div>
        </div>
        <Field label="Limbă"><select className={input} value={form.locale} onChange={(e) => set("locale", e.target.value as Form["locale"])}><option value="ro">Română</option><option value="en">Bilingv</option></select></Field>
        {preview.data ? <div className="rounded-xl bg-[var(--bg-muted)] p-4 text-xs sm:col-span-2">
          <b>Previzualizare</b>
          <div className="mt-2">Generare: {recurringDate(preview.data.data.scheduled_for)} · perioadă: {preview.data.data.period.start} – {preview.data.data.period.end} · scadență: {preview.data.data.due_date}</div>
          {preview.data.data.lines.map((line, index) => <pre key={index} className="mt-2 whitespace-pre-wrap font-sans">{line.description}</pre>)}
        </div> : null}
        {preview.isError ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{apiErrorMessage(preview.error, "Previzualizarea nu a putut fi calculată.")}</p> : null}
        {error ? <p className="text-sm text-[var(--danger)] sm:col-span-2">{error}</p> : null}
        {template && (detail.data?.data.runs ?? []).length > 0 ? <div className="sm:col-span-2"><b className="text-xs">Istoric rulări</b>{detail.data!.data.runs.map((run) => <div key={run.id} className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs"><button type="button" disabled={!run.invoice_id} onClick={() => run.invoice_id && onOpenInvoice(run.invoice_id)} className="flex flex-1 justify-between text-left"><span>{recurringDate(run.scheduled_for, template.timezone)}</span><span>{run.status === "created" ? "Ciornă creată" : run.error ?? run.status}</span></button>{run.status === "skipped" ? <Button size="sm" variant="outline" isDisabled={recover.isPending} onPress={() => {
          if (window.confirm(`Recuperezi perioada omisă din ${recurringDate(run.scheduled_for, template.timezone)}? Se va genera numai o ciornă.`)) recover.mutate(run.id);
        }}>Recuperează</Button> : null}</div>)}</div> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="outline" isDisabled={preview.isPending} onPress={() => preview.mutate()}>{preview.isPending ? <Spinner size="sm" /> : null} Previzualizează</Button><Button variant="primary" isDisabled={save.isPending || previewedPayload !== JSON.stringify(payload()) || !form.name.trim() || !form.customer_id || !form.invoice_series_id || (form.cadence === "custom_week" && form.weekdays.length === 0) || (form.cadence === "custom_month" && form.month_days.length === 0) || form.lines.some((line) => !line.description_template.trim() || !line.vat_profile_id || Number(line.quantity) <= 0)} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm" /> : null} {template?.is_locked ? "Creează versiunea" : "Salvează"}</Button></footer>
    </div>
  </div>;
}

function Field({label, className, children}: {label: string; className?: string; children: React.ReactNode}) {
  return <label className={`flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)] ${className ?? ""}`}>{label}{children}</label>;
}
