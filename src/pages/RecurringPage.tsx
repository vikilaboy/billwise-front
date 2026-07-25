import {useRef, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Calendar, DateField, DatePicker, Label, ListBox, Select, Spinner, TextArea, TextField} from "@heroui/react";
import {parseDate} from "@internationalized/date";
import {Pause, Pencil, Play, Plus, Repeat, Trash2, X} from "lucide-react";
import {useNavigate, useSearchParams} from "react-router";
import {useCompany} from "../components/AppShell";
import {DataTablePagination} from "../components/DataTablePagination";
import {AppCheckbox, AppSelect} from "../components/FormControls";
import {api, listQuery, reportApiError} from "../lib/api";
import type {Currency, Customer, RecurringInvoiceTemplate, VatProfile} from "../lib/types";

type Series = {id: string; name: string; is_active: boolean};
type RecurringRunResult = {status: string; error: string | null; invoice_id: string | null};
type RecurringLineForm = {
  description_template: string;
  quantity: string;
  unit_price: string;
  vat_option_id: string;
  vat_profile_id: string | null;
  vat_rate: string;
  vat_category: VatProfile["vat_category"];
  vat_exemption_code: string | null;
  vat_exemption_reason: string | null;
};
type Form = {
  name: string; customer_id: string; invoice_series_id: string;
  cadence: "weekly" | "biweekly" | "monthly" | "twice_monthly" | "quarterly" | "custom_week" | "custom_month";
  cadence_interval: string; weekdays: number[]; month_days: Array<number | "last_day">;
  weekday: string; month_day: string; month_day_second: string; run_time: string; start_date: string; end_date: string;
  payment_terms_days: string; currency: string; locale: "ro" | "en";
  contract_number: string; contract_date: string; lines: RecurringLineForm[]; notes: string;
};
const today = () => new Date().toISOString().slice(0, 10);
const NO_VAT_OPTION = "__no_vat__";
const SNAPSHOT_VAT_OPTION = "__snapshot_vat__";
const NO_VAT_REASON = "Neînregistrat în scopuri de TVA / Not registered for VAT";
const emptyLine = (): RecurringLineForm => ({
  description_template: "",
  quantity: "1",
  unit_price: "0",
  vat_option_id: NO_VAT_OPTION,
  vat_profile_id: null,
  vat_rate: "0.00",
  vat_category: "O",
  vat_exemption_code: null,
  vat_exemption_reason: NO_VAT_REASON,
});
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
  lines: [{
    ...emptyLine(),
    description_template: "Servicii prestate în perioada {{period.start}} - {{period.end}} conform contract nr. {{contract.number}} din {{contract.date}} / Services delivered for period {{period.start}} - {{period.end}} including stated dates, under contract no. {{contract.number}} dated {{contract.date}}",
  }],
  notes: "",
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
          throw reportApiError({
            title: "Ciorna recurentă nu a putut fi generată",
            status: 422,
            detail: result.data.error ?? "Operațiunea a eșuat.",
          });
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
          <AppSelect ariaLabel="Starea șabloanelor recurente" className="mt-3 w-48" value={status} options={[
            {id: "all", label: "Toate"},
            {id: "active", label: "Active"},
            {id: "paused", label: "Pauzate"},
          ]} onChange={(value) => {
            const next = new URLSearchParams(params);
            if (value === "all") next.delete("status"); else next.set("status", value);
            next.delete("page");
            setParams(next);
          }} />
        </div>
        <Button variant="primary" onPress={() => setEditing(null)}><Plus size={16} /> Șablon nou</Button>
      </div>
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
      vat_option_id: line.vat_profile_id
        ?? (line.vat_category === "O" && Number(line.vat_rate) === 0 ? NO_VAT_OPTION : SNAPSHOT_VAT_OPTION),
      vat_profile_id: line.vat_profile_id,
      vat_rate: line.vat_rate,
      vat_category: line.vat_category,
      vat_exemption_code: line.vat_exemption_code,
      vat_exemption_reason: line.vat_exemption_reason,
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
      unit_price_cents: Math.round(Number(line.unit_price) * 100),
      vat_profile_id: line.vat_profile_id,
      vat_rate: line.vat_rate,
      vat_category: line.vat_category,
      vat_exemption_code: line.vat_exemption_code,
      vat_exemption_reason: line.vat_exemption_reason,
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
  const setLine = <K extends keyof RecurringLineForm>(index: number, key: K, value: RecurringLineForm[K]) => setForm((current) => ({
    ...current,
    lines: current.lines.map((line, lineIndex) => lineIndex === index ? {...line, [key]: value} : line),
  }));
  const setLineVat = (index: number, optionId: string) => {
    const profile = (vatProfiles.data?.data ?? []).find((item) => item.id === optionId);
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (!profile) {
          return {
            ...line,
            vat_option_id: NO_VAT_OPTION,
            vat_profile_id: null,
            vat_rate: "0.00",
            vat_category: "O",
            vat_exemption_code: null,
            vat_exemption_reason: NO_VAT_REASON,
          };
        }
        return {
          ...line,
          vat_option_id: profile.id,
          vat_profile_id: profile.id,
          vat_rate: profile.rate,
          vat_category: profile.vat_category,
          vat_exemption_code: profile.vat_exemption_code,
          vat_exemption_reason: profile.vat_exemption_reason,
        };
      }),
    }));
  };
  const input = "h-10 w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm";
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true">
    <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">{template?.is_locked ? "Versiune nouă a șablonului" : template ? "Editează șablonul" : "Șablon recurent nou"}</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{template?.is_locked ? "Versiunea folosită la facturile emise rămâne neschimbată." : "Următoarea generare va crea numai o ciornă."}</p></div><Button isIconOnly variant="ghost" onPress={onClose}><X size={17} /></Button></header>
      <div className="grid flex-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
        <Field label="Denumire"><input name="name" className={input} value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <HeroSelectField name="customer_id" label="Client" value={form.customer_id} onChange={(value) => set("customer_id", value)} placeholder="Selectează clientul" options={(customers.data?.data ?? []).map((customer) => ({id: customer.id, label: customer.name}))} />
        <HeroSelectField name="invoice_series_id" label="Serie" value={form.invoice_series_id} onChange={(value) => set("invoice_series_id", value)} placeholder="Selectează seria" options={(series.data?.data ?? []).filter((item) => item.is_active).map((item) => ({id: item.id, label: item.name}))} />
        <HeroSelectField name="schedule.unit" label="Frecvență" value={form.cadence} onChange={(value) => set("cadence", value as Form["cadence"])} options={[
          {id: "weekly", label: "Săptămânal"},
          {id: "biweekly", label: "La 2 săptămâni"},
          {id: "monthly", label: "Lunar"},
          {id: "twice_monthly", label: "De două ori pe lună"},
          {id: "quarterly", label: "Trimestrial"},
          {id: "custom_week", label: "Personalizat · săptămâni"},
          {id: "custom_month", label: "Personalizat · luni"},
        ]} />
        {form.cadence === "weekly" || form.cadence === "biweekly"
          ? <HeroSelectField name="schedule.weekdays" label="Ziua săptămânii" value={form.weekday} onChange={(value) => set("weekday", value)} options={["Luni","Marți","Miercuri","Joi","Vineri","Sâmbătă","Duminică"].map((day, index) => ({id: String(index + 1), label: day}))} />
          : form.cadence !== "custom_week" && form.cadence !== "custom_month"
            ? <HeroSelectField name="schedule.month_days" label="Ziua lunii" value={form.month_day} onChange={(value) => set("month_day", value)} options={monthDayOptions} />
            : null}
        {form.cadence === "twice_monthly" ? <HeroSelectField name="schedule.month_days" label="A doua zi a lunii" value={form.month_day_second} onChange={(value) => set("month_day_second", value)} options={monthDayOptions} /> : null}
        {form.cadence === "custom_week" ? <>
          <Field label="La fiecare N săptămâni"><input name="schedule.interval" type="number" min="1" max="52" className={input} value={form.cadence_interval} onChange={(e) => set("cadence_interval", e.target.value)} /></Field>
          <Field label="Zilele săptămânii" className="sm:col-span-2"><span className="flex flex-wrap gap-3">{["L","Ma","Mi","J","V","S","D"].map((day, index) => <AppCheckbox key={day} name="schedule.weekdays" value={String(index + 1)} isSelected={form.weekdays.includes(index + 1)} onChange={(selected) => set("weekdays", selected ? [...form.weekdays, index + 1].sort() : form.weekdays.filter((value) => value !== index + 1))}>{day}</AppCheckbox>)}</span></Field>
        </> : null}
        {form.cadence === "custom_month" ? <>
          <Field label="La fiecare N luni"><input name="schedule.interval" type="number" min="1" max="12" className={input} value={form.cadence_interval} onChange={(e) => set("cadence_interval", e.target.value)} /></Field>
          <Field label="Zilele lunii" className="sm:col-span-2"><span className="grid grid-cols-8 gap-1 sm:grid-cols-16">{monthDayOptions.map((option) => {
            const day = option.id === "last_day" ? "last_day" : Number(option.id);
            const selected = form.month_days.includes(day);
            return <Button key={option.id} size="sm" variant={selected ? "primary" : "outline"} aria-pressed={selected} onPress={() => set("month_days", selected ? form.month_days.filter((value) => value !== day) : [...form.month_days, day])}>{option.id === "last_day" ? "Ult." : option.label}</Button>;
          })}</span></Field>
        </> : null}
        <HeroDatePicker name="schedule.start_date" label="Prima rulare" value={form.start_date} onChange={(value) => set("start_date", value)} />
        <HeroDatePicker name="schedule.end_date" label="Data finală (opțional)" value={form.end_date} onChange={(value) => set("end_date", value)} />
        <Field label="Ora generării"><input name="schedule.run_time" type="time" className={input} value={form.run_time} onChange={(e) => set("run_time", e.target.value)} /></Field>
        <Field label="Termen de plată (zile)"><input name="payment_terms_days" type="number" className={input} value={form.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)} /></Field>
        <HeroSelectField name="currency" label="Monedă" value={form.currency} onChange={(value) => set("currency", value)} options={(currencies.data?.data ?? []).filter((currency) => currency.is_active).map((currency) => ({id: currency.code, label: `${currency.code} — ${currency.name}`}))} />
        <Field label="Nr. contract"><input name="contract_number" className={input} value={form.contract_number} onChange={(e) => set("contract_number", e.target.value)} /></Field>
        <HeroDatePicker name="contract_date" label="Data contractului" value={form.contract_date} onChange={(value) => set("contract_date", value)} />
        <div className="sm:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">Liniile facturii</span>
            <Button size="sm" variant="outline" onPress={() => set("lines", [...form.lines, emptyLine()])}><Plus size={14} /> Adaugă linie</Button>
          </div>
          <div className="grid gap-3">
            {form.lines.map((line, index) => (
              <div key={index} className="grid gap-4 rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between"><b className="text-sm">Linia {index + 1}</b><Button isIconOnly size="sm" variant="ghost" aria-label={`Șterge linia ${index + 1}`} isDisabled={form.lines.length === 1} onPress={() => set("lines", form.lines.filter((_, lineIndex) => lineIndex !== index))}><Trash2 size={15} /></Button></div>
                <DescriptionTemplateEditor name={`lines.${index}.description_template`} value={line.description_template} onChange={(value) => setLine(index, "description_template", value)} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Cantitate"><input name={`lines.${index}.quantity`} type="number" min="0.01" step="0.01" className={input} value={line.quantity} onChange={(event) => setLine(index, "quantity", event.target.value)} /></Field>
                  <Field label="Preț unitar"><input name={`lines.${index}.unit_price_cents`} type="number" step="0.01" className={input} value={line.unit_price} onChange={(event) => setLine(index, "unit_price", event.target.value)} /></Field>
                  <HeroSelectField name={`lines.${index}.vat_profile_id`} apiFields={[`lines.${index}.vat_rate`, `lines.${index}.vat_category`, `lines.${index}.vat_exemption_code`, `lines.${index}.vat_exemption_reason`]} label="TVA" value={line.vat_option_id} onChange={(value) => setLineVat(index, value)} options={[
                    {id: NO_VAT_OPTION, label: "Nu aplic TVA · 0%"},
                    ...(line.vat_option_id === SNAPSHOT_VAT_OPTION ? [{id: SNAPSHOT_VAT_OPTION, label: `TVA existent · ${Number(line.vat_rate)}% (${line.vat_category})`}] : []),
                    ...(vatProfiles.data?.data ?? []).filter((profile) => profile.is_active).map((profile) => ({id: profile.id, label: `${profile.name} · ${Number(profile.rate)}%`})),
                  ]} />
                </div>
                {(vatProfiles.data?.data ?? []).filter((profile) => profile.is_active).length === 0 ? <p className="text-xs text-[var(--text-muted)]">Nu există profiluri TVA configurate. Poți continua cu „Nu aplic TVA”; cotele folosite de firmă se pot adăuga din Setări.</p> : null}
              </div>
            ))}
          </div>
        </div>
        <HeroSelectField name="locale" label="Limbă" value={form.locale} onChange={(value) => set("locale", value as Form["locale"])} options={[{id: "ro", label: "Română"}, {id: "en", label: "Bilingv · română și engleză"}]} />
        {preview.data ? <div className="rounded-xl bg-[var(--bg-muted)] p-4 text-xs sm:col-span-2">
          <b>Previzualizare</b>
          <div className="mt-2">Generare: {recurringDate(preview.data.data.scheduled_for)} · perioadă: {preview.data.data.period.start} – {preview.data.data.period.end} · scadență: {preview.data.data.due_date}</div>
          {preview.data.data.lines.map((line, index) => <pre key={index} className="mt-2 whitespace-pre-wrap font-sans">{line.description}</pre>)}
        </div> : null}
        {template && (detail.data?.data.runs ?? []).length > 0 ? <div className="sm:col-span-2"><b className="text-xs">Istoric rulări</b>{detail.data!.data.runs.map((run) => <div key={run.id} className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-xs"><button type="button" disabled={!run.invoice_id} onClick={() => run.invoice_id && onOpenInvoice(run.invoice_id)} className="flex flex-1 justify-between text-left"><span>{recurringDate(run.scheduled_for, template.timezone)}</span><span>{run.status === "created" ? "Ciornă creată" : run.error ?? run.status}</span></button>{run.status === "skipped" ? <Button size="sm" variant="outline" isDisabled={recover.isPending} onPress={() => {
          if (window.confirm(`Recuperezi perioada omisă din ${recurringDate(run.scheduled_for, template.timezone)}? Se va genera numai o ciornă.`)) recover.mutate(run.id);
        }}>Recuperează</Button> : null}</div>)}</div> : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Anulează</Button><Button variant="outline" isDisabled={preview.isPending} onPress={() => preview.mutate()}>{preview.isPending ? <Spinner size="sm" /> : null} Previzualizează</Button><Button variant="primary" isDisabled={save.isPending || previewedPayload !== JSON.stringify(payload()) || !form.name.trim() || !form.customer_id || !form.invoice_series_id || (form.cadence === "custom_week" && form.weekdays.length === 0) || (form.cadence === "custom_month" && form.month_days.length === 0) || form.lines.some((line) => !line.description_template.trim() || !line.vat_option_id || Number(line.quantity) <= 0)} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm" /> : null} {template?.is_locked ? "Creează versiunea" : "Salvează"}</Button></footer>
    </div>
  </div>;
}

type SelectOption = {id: string; label: string};
const monthDayOptions: SelectOption[] = [
  ...Array.from({length: 31}, (_, index) => ({id: String(index + 1), label: String(index + 1)})),
  {id: "last_day", label: "Ultima zi"},
];

function HeroSelectField({name, apiFields, label, value, options, placeholder, onChange}: {
  name: string;
  apiFields?: string[];
  label: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return <div data-api-fields={apiFields?.join(" ")}>
    <Select name={name} value={value || null} onChange={(nextValue) => onChange(String(nextValue ?? ""))} placeholder={placeholder ?? "Selectează"}>
    <Label>{label}</Label>
    <Select.Trigger className="w-full">
      <Select.Value />
      <Select.Indicator />
    </Select.Trigger>
    <Select.Popover>
      <ListBox>
        {options.map((option) => <ListBox.Item key={option.id} id={option.id} textValue={option.label}>
          {option.label}
          <ListBox.ItemIndicator />
        </ListBox.Item>)}
      </ListBox>
    </Select.Popover>
    </Select>
  </div>;
}

function HeroDatePicker({name, label, value, onChange}: {name: string; label: string; value: string; onChange: (value: string) => void}) {
  return <DatePicker name={name} value={value ? parseDate(value) : null} onChange={(nextValue) => onChange(nextValue?.toString() ?? "")}>
    <Label>{label}</Label>
    <DateField.Group fullWidth>
      <DateField.Input>{(segment) => <DateField.Segment segment={segment} />}</DateField.Input>
      <DateField.Suffix>
        <DatePicker.Trigger>
          <DatePicker.TriggerIndicator />
        </DatePicker.Trigger>
      </DateField.Suffix>
    </DateField.Group>
    <DatePicker.Popover>
      <Calendar aria-label={label}>
        <Calendar.Header>
          <Calendar.YearPickerTrigger>
            <Calendar.YearPickerTriggerHeading />
            <Calendar.YearPickerTriggerIndicator />
          </Calendar.YearPickerTrigger>
          <Calendar.NavButton slot="previous" />
          <Calendar.NavButton slot="next" />
        </Calendar.Header>
        <Calendar.Grid>
          <Calendar.GridHeader>{(day) => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader>
          <Calendar.GridBody>{(date) => <Calendar.Cell date={date} />}</Calendar.GridBody>
        </Calendar.Grid>
        <Calendar.YearPickerGrid>
          <Calendar.YearPickerGridBody>{({year}) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
        </Calendar.YearPickerGrid>
      </Calendar>
    </DatePicker.Popover>
  </DatePicker>;
}

const templateVariables = [
  {token: "{{period.start}}", label: "Început perioadă"},
  {token: "{{period.end}}", label: "Sfârșit perioadă"},
  {token: "{{invoice.issue_date}}", label: "Data emiterii"},
  {token: "{{invoice.due_date}}", label: "Scadență"},
  {token: "{{customer.name}}", label: "Client"},
  {token: "{{contract.number}}", label: "Nr. contract"},
  {token: "{{contract.date}}", label: "Data contractului"},
];

function DescriptionTemplateEditor({name, value, onChange}: {name: string; value: string; onChange: (value: string) => void}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const element = textarea.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      textarea.current?.focus();
      textarea.current?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return <div className="grid gap-2">
    <TextField name={name} value={value} onChange={onChange}>
      <Label>Descriere cu variabile</Label>
      <TextArea ref={textarea} rows={6} className="min-h-32 w-full resize-y" />
    </TextField>
    <div>
      <span className="text-xs font-medium text-[var(--text-muted)]">Inserează o variabilă la poziția cursorului</span>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {templateVariables.map((variable) => <Button key={variable.token} size="sm" variant="outline" onPress={() => insert(variable.token)} aria-label={`${variable.label}: ${variable.token}`}>{variable.label}</Button>)}
      </div>
    </div>
  </div>;
}

function Field({label, className, children}: {label: string; className?: string; children: React.ReactNode}) {
  return <label className={`flex flex-col gap-1.5 text-xs font-semibold text-[var(--text-muted)] ${className ?? ""}`}>{label}{children}</label>;
}
