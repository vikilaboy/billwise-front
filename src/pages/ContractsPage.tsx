import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner, TextArea, Tooltip} from "@heroui/react";
import {Archive, ArchiveRestore, FileSignature, GitBranch, Pencil, Play, Plus, Search, Square} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {ConfirmDialog} from "../components/ConfirmDialog";
import {AppDatePicker, AppSelect} from "../components/FormControls";
import {api, apiErrorMessage, listQuery} from "../lib/api";
import {date, money} from "../lib/format";
import type {Contract, ContractBillingModel, ContractVersion, ContractVersionLine, Currency, Customer, VatCategory, VatProfile} from "../lib/types";

type ContractForm = {
  customer_id: string; number: string; name: string; signed_on: string; starts_on: string; ends_on: string;
  currency: string; payment_terms_days: string; default_hours_per_day: string;
  line_name: string; description_template: string; billing_model: ContractBillingModel;
  quantity: string; hours_per_day: string; unit_price: string;
  vat_profile_id: string; vat_rate: string; vat_category: VatCategory;
  vat_exemption_code: string | null; vat_exemption_reason: string | null;
};
type ContractOperation = "activate" | "end" | "archive" | "restore";
type ContractAction = {contract: Contract; operation: ContractOperation};
type ContractConfirmation = {contract: Contract; operation: Exclude<ContractOperation, "restore">};

const today = () => new Date().toISOString().slice(0, 10);
const NO_VAT_PROFILE = "__no_vat__";
const EMPTY: ContractForm = {
  customer_id: "", number: "", name: "", signed_on: today(), starts_on: today(), ends_on: "",
  currency: "RON", payment_terms_days: "15", default_hours_per_day: "8.00",
  line_name: "Servicii", description_template: "Servicii în perioada {{period.start}}–{{period.end}}: {{period.working_days}} zile × {{billing.hours_per_day}} ore = {{billing.billable_hours}} ore",
  billing_model: "working_days_hours", quantity: "1.00", hours_per_day: "", unit_price: "0",
  vat_profile_id: "", vat_rate: "0.00", vat_category: "O", vat_exemption_code: null,
  vat_exemption_reason: "Neînregistrat în scopuri de TVA / Not registered for VAT",
};

const statusLabel = (status: Contract["status"]) => ({draft: "Ciornă", active: "Activ", ended: "Încheiat", archived: "Arhivat"})[status];
const unchangedLinePayload = (line: ContractVersionLine) => ({
  product_id: line.product_id, name: line.name, description_template: line.description_template, billing_model: line.billing_model,
  quantity: line.quantity, hours_per_day: line.hours_per_day, unit: line.unit, unit_code: line.unit_code,
  unit_price_cents: line.unit_price_cents, vat_profile_id: line.vat_profile_id, vat_rate: line.vat_rate,
  vat_category: line.vat_category, vat_exemption_code: line.vat_exemption_code, vat_exemption_reason: line.vat_exemption_reason,
});

export function ContractsPage() {
  const {company, can} = useCompany();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Contract | null | undefined>(undefined);
  const [versioning, setVersioning] = useState<Contract | null>(null);
  const [confirmation, setConfirmation] = useState<ContractConfirmation | null>(null);
  const contracts = useQuery({
    queryKey: ["contracts", company?.id, search],
    queryFn: () => api<Contract[]>(`/companies/${company!.id}/contracts${listQuery({perPage: 100, filter: search ? {search: {contains: search}} : undefined})}`),
    enabled: Boolean(company?.id && can("contract.view")),
  });
  const action = useMutation({
    mutationFn: ({contract, operation}: ContractAction) =>
      api<Contract>(`/companies/${company!.id}/contracts/${contract.id}/${operation}`, {method: "POST"}),
    onSuccess: () => {
      setConfirmation(null);
      return queryClient.invalidateQueries({queryKey: ["contracts", company?.id]});
    },
  });
  if (!can("contract.view")) return <p className="text-[var(--danger)]">Nu ai permisiunea necesară pentru contracte.</p>;
  const rows = contracts.data?.data ?? [];

  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="flex h-10 min-w-[280px] items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3"><Search size={16}/><input className="w-full bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Caută după număr, nume sau client…" /></label>
      {can("contract.manage") ? <Button variant="primary" onPress={() => setEditing(null)}><Plus size={16}/> Contract nou</Button> : null}
    </div>
    {action.isError ? <p role="alert" className="rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{apiErrorMessage(action.error, "Starea contractului nu a putut fi modificată.")}</p> : null}
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      {contracts.isLoading ? <div className="flex justify-center gap-2 py-20"><Spinner size="sm"/> Se încarcă…</div>
        : rows.length === 0 ? <div className="flex flex-col items-center gap-2 py-20"><FileSignature size={28}/><b>Niciun contract</b><span className="text-sm text-[var(--text-muted)]">Definește termenii comerciali care vor alimenta facturile recurente.</span></div>
          : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-[var(--bg-muted)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="p-3">Contract</th><th className="p-3">Client</th><th className="p-3">Valabilitate</th><th className="p-3">Model</th><th className="p-3">Stare</th><th className="p-3 text-right">Acțiuni</th></tr></thead><tbody>{rows.map((contract) => <tr key={contract.id} className="border-t border-[var(--border)]">
            <td className="p-3"><b>{contract.number}</b><div className="text-xs text-[var(--text-muted)]">din {date(contract.signed_on)} · {contract.name} · v{contract.current_version?.version ?? "—"}</div></td>
            <td className="p-3">{contract.customer?.name ?? "—"}</td><td className="p-3">{contract.starts_on} – {contract.ends_on ?? "fără termen"}</td>
            <td className="p-3">{contract.current_version?.lines.some((line) => line.billing_model === "working_days_hours") ? "Zile lucrătoare × ore" : "Cantitate fixă"}</td><td className="p-3">{statusLabel(contract.status)}</td>
            <td className="p-3"><div className="flex justify-end gap-1"><Tooltip delay={300}><Button isIconOnly size="sm" variant="ghost" aria-label={`${contract.status === "draft" ? "Editează" : "Vezi"} contractul ${contract.number}`} onPress={() => setEditing(contract)}><Pencil size={15}/></Button><Tooltip.Content>{contract.status === "draft" ? "Editează contractul" : "Vezi contractul"}</Tooltip.Content></Tooltip>
              {contract.status === "draft" && can("contract.version") ? <Button size="sm" variant="outline" onPress={() => setConfirmation({contract, operation: "activate"})}><Play size={14}/> Activează</Button> : null}
              {contract.status === "active" && can("contract.version") ? <Button size="sm" variant="outline" onPress={() => setVersioning(contract)}><GitBranch size={14}/> Versiune nouă</Button> : null}
              {contract.status === "active" && can("contract.operate") ? <Button size="sm" variant="outline" onPress={() => setConfirmation({contract, operation: "end"})}><Square size={14}/> Încheie</Button> : null}
              {(contract.status === "ended" || contract.status === "draft") && can("contract.operate") ? <Tooltip delay={300}><Button isIconOnly size="sm" variant="ghost" aria-label={`Arhivează contractul ${contract.number}`} onPress={() => setConfirmation({contract, operation: "archive"})}><Archive size={15}/></Button><Tooltip.Content>Arhivează contractul</Tooltip.Content></Tooltip> : null}
              {contract.status === "archived" && can("contract.operate") ? <Tooltip delay={300}><Button isIconOnly size="sm" variant="ghost" aria-label={`Restaurează contractul ${contract.number}`} isDisabled={action.isPending} onPress={() => action.mutate({contract, operation: "restore"})}><ArchiveRestore size={15}/></Button><Tooltip.Content>Restaurează contractul</Tooltip.Content></Tooltip> : null}
            </div></td></tr>)}</tbody></table></div>}
    </div>
    {editing !== undefined && company?.id ? <ContractModal companyId={company.id} companyIsVatPayer={company.is_vat_payer} contract={editing} onClose={() => setEditing(undefined)} onSaved={() => {void queryClient.invalidateQueries({queryKey: ["contracts", company.id]}); setEditing(undefined);}} /> : null}
    {versioning && company?.id ? <ContractVersionModal companyId={company.id} companyIsVatPayer={company.is_vat_payer} contract={versioning} onClose={() => setVersioning(null)} onSaved={() => {void queryClient.invalidateQueries({queryKey: ["contracts", company.id]}); setVersioning(null);}} /> : null}
    <ConfirmDialog
      isOpen={confirmation !== null}
      title={confirmation?.operation === "activate" ? `Activezi contractul ${confirmation.contract.number}?` : confirmation?.operation === "end" ? `Închei contractul ${confirmation.contract.number}?` : `Arhivezi contractul ${confirmation?.contract.number ?? ""}?`}
      description={confirmation?.operation === "activate" ? "Contractul va deveni activ, iar termenii versiunii curente nu vor mai putea fi editați direct. Modificările ulterioare se fac printr-o versiune nouă." : confirmation?.operation === "end" ? "Contractul va trece în starea Încheiat și nu va mai putea fi reactivat din aplicație." : "Contractul va fi arhivat și scos din fluxul curent. Istoricul contractual și facturile existente rămân păstrate, iar contractul va putea fi restaurat ulterior."}
      confirmLabel={confirmation?.operation === "activate" ? "Activează contractul" : confirmation?.operation === "end" ? "Încheie contractul" : "Arhivează contractul"}
      tone={confirmation?.operation === "archive" ? "danger" : "warning"}
      isPending={action.isPending}
      onOpenChange={(isOpen) => {if (!isOpen) setConfirmation(null);}}
      onConfirm={() => {if (confirmation) action.mutate(confirmation);}}
    />
  </div>;
}

function ContractVersionModal({companyId, companyIsVatPayer, contract, onClose, onSaved}: {companyId: string; companyIsVatPayer: boolean; contract: Contract; onClose: () => void; onSaved: () => void}) {
  const queryClient = useQueryClient();
  const detail = useQuery({queryKey: ["contract", companyId, contract.id], queryFn: () => api<Contract>(`/companies/${companyId}/contracts/${contract.id}`)});
  const create = useMutation({
    mutationFn: () => api<ContractVersion>(`/companies/${companyId}/contracts/${contract.id}/versions`, {method: "POST"}),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["contract", companyId, contract.id]}),
  });
  const loaded = detail.data?.data;
  const draft = loaded?.versions.find((version) => version.status === "draft");
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-3xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]">
    <header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">Versiune nouă · {contract.number}</h2><p className="text-xs text-[var(--text-muted)]">Versiunea activă rămâne neschimbată până când activezi succesorul.</p></div><Button isIconOnly variant="ghost" onPress={onClose}>×</Button></header>
    {detail.isLoading ? <div className="flex justify-center gap-2 p-12"><Spinner size="sm"/> Se încarcă…</div> : draft && loaded ? <ContractVersionEditor companyId={companyId} companyIsVatPayer={companyIsVatPayer} contract={loaded} version={draft} onSaved={onSaved}/> : <div className="p-6"><p className="text-sm">Se va clona versiunea activă într-o ciornă editabilă. Setezi data de intrare în vigoare, tariful și formula, apoi o activezi separat.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onPress={onClose}>Închide</Button><Button variant="primary" isDisabled={create.isPending} onPress={() => create.mutate()}>{create.isPending ? <Spinner size="sm"/> : <GitBranch size={15}/>} Creează ciorna</Button></div></div>}
  </div></div>;
}

function ContractVersionEditor({companyId, companyIsVatPayer, contract, version, onSaved}: {companyId: string; companyIsVatPayer: boolean; contract: Contract; version: ContractVersion; onSaved: () => void}) {
  const queryClient = useQueryClient();
  const [confirmActivation, setConfirmActivation] = useState(false);
  const sourceLine = version.lines[0];
  const [form, setForm] = useState<ContractForm>(() => ({
    customer_id: contract.customer_id, number: contract.number, name: contract.name, signed_on: contract.signed_on ?? "", starts_on: version.effective_from, ends_on: contract.ends_on ?? "",
    currency: version.currency, payment_terms_days: String(version.payment_terms_days), default_hours_per_day: version.default_hours_per_day ?? "8.00",
    line_name: sourceLine.name, description_template: sourceLine.description_template, billing_model: sourceLine.billing_model, quantity: sourceLine.quantity ?? "1.00", hours_per_day: sourceLine.hours_per_day ?? "", unit_price: String(sourceLine.unit_price_cents / 100),
    vat_profile_id: sourceLine.vat_profile_id ?? (sourceLine.vat_category === "O" ? NO_VAT_PROFILE : ""), vat_rate: sourceLine.vat_rate, vat_category: sourceLine.vat_category, vat_exemption_code: sourceLine.vat_exemption_code, vat_exemption_reason: sourceLine.vat_exemption_reason,
  }));
  const currencies = useQuery({queryKey: ["currencies", "active"], queryFn: () => api<Currency[]>("/settings/currencies?_per_page=100&_sort=code")});
  const vatProfiles = useQuery({queryKey: ["vat-profiles", companyId], queryFn: () => api<VatProfile[]>(`/companies/${companyId}/vat-profiles?_per_page=100`)});
  const activeCurrencies = useMemo(() => (currencies.data?.data ?? []).filter((currency) => currency.is_active), [currencies.data?.data]);
  const activeVatProfiles = useMemo(() => (vatProfiles.data?.data ?? []).filter((profile) => profile.is_active), [vatProfiles.data?.data]);
  const missingVatConfiguration = companyIsVatPayer && !vatProfiles.isLoading && activeVatProfiles.length === 0;
  useEffect(() => {
    if (form.vat_profile_id || vatProfiles.isLoading) return;
    const profile = activeVatProfiles.find((item) => item.is_default) ?? activeVatProfiles[0];
    if (profile) setForm((current) => ({...current, vat_profile_id: profile.id, vat_rate: profile.rate, vat_category: profile.vat_category, vat_exemption_code: profile.vat_exemption_code, vat_exemption_reason: profile.vat_exemption_reason}));
    else if (!companyIsVatPayer) setForm((current) => ({...current, vat_profile_id: NO_VAT_PROFILE, vat_rate: "0.00", vat_category: "O", vat_exemption_code: null, vat_exemption_reason: "Neînregistrat în scopuri de TVA / Not registered for VAT"}));
  }, [activeVatProfiles, companyIsVatPayer, form.vat_profile_id, vatProfiles.isLoading]);
  const set = <K extends keyof ContractForm>(key: K, value: ContractForm[K]) => setForm((current) => ({...current, [key]: value}));
  const payload = {
    effective_from: form.starts_on, currency: form.currency, payment_terms_days: Number(form.payment_terms_days), locale: version.locale, timezone: version.timezone, working_weekdays: version.working_weekdays, holiday_calendar_code: form.billing_model === "working_days_hours" ? (version.holiday_calendar_code ?? "RO") : version.holiday_calendar_code, default_hours_per_day: form.default_hours_per_day || null, notes: version.notes,
    lines: [{product_id: sourceLine.product_id, name: form.line_name.trim(), description_template: form.description_template.trim(), billing_model: form.billing_model, quantity: form.billing_model === "fixed_quantity" ? form.quantity : null, hours_per_day: form.hours_per_day || null, unit: form.billing_model === "working_days_hours" ? "ore" : sourceLine.unit, unit_code: form.billing_model === "working_days_hours" ? "HUR" : sourceLine.unit_code, unit_price_cents: Math.round(Number(form.unit_price) * 100), vat_profile_id: form.vat_profile_id === NO_VAT_PROFILE ? null : (form.vat_profile_id || null), vat_rate: form.vat_rate, vat_category: form.vat_category, vat_exemption_code: form.vat_exemption_code, vat_exemption_reason: form.vat_exemption_reason}, ...version.lines.slice(1).map(unchangedLinePayload)],
  };
  const save = useMutation({mutationFn: () => api<ContractVersion>(`/companies/${companyId}/contracts/${contract.id}/versions/${version.id}`, {method: "PUT", body: JSON.stringify(payload)}), onSuccess: () => queryClient.invalidateQueries({queryKey: ["contract", companyId, contract.id]})});
  const activate = useMutation({mutationFn: async () => {
    await api<ContractVersion>(`/companies/${companyId}/contracts/${contract.id}/versions/${version.id}`, {method: "PUT", body: JSON.stringify(payload)});
    return api<Contract>(`/companies/${companyId}/contracts/${contract.id}/versions/${version.id}/activate`, {method: "POST"});
  }, onSuccess: onSaved});
  return <><div className="grid gap-4 p-5 sm:grid-cols-2">
    <div className="rounded-xl bg-[var(--bg-muted)] p-3 text-sm sm:col-span-2"><b>Ciornă v{version.version}</b><span className="ml-2 text-[var(--text-muted)]">bazată pe v{contract.current_version?.version}</span></div>
    <Field label="Intră în vigoare la"><AppDatePicker name="effective_from" ariaLabel="Intră în vigoare la" value={form.starts_on} minValue={contract.starts_on} maxValue={contract.ends_on ?? undefined} onChange={(value) => set("starts_on", value)}/></Field>
    <Field label="Termen de plată (zile)"><Input type="number" min="0" max="365" value={form.payment_terms_days} onChange={(e) => set("payment_terms_days", e.target.value)}/></Field>
    <Field label="Monedă"><AppSelect name="currency" ariaLabel="Monedă" value={form.currency} onChange={(value) => set("currency", value)} options={activeCurrencies.map((currency) => ({id: currency.code, label: `${currency.code} — ${currency.name}`}))}/></Field>
    <Field label="Model de facturare"><AppSelect ariaLabel="Model" value={form.billing_model} onChange={(value) => set("billing_model", value as ContractBillingModel)} options={[{id:"working_days_hours",label:"Zile lucrătoare × ore/zi"},{id:"fixed_quantity",label:"Cantitate fixă"}]}/></Field>
    <Field label={form.billing_model === "working_days_hours" ? "Ore/zi implicite" : "Cantitate"}><Input type="number" step="0.01" value={form.billing_model === "working_days_hours" ? form.default_hours_per_day : form.quantity} onChange={(e) => set(form.billing_model === "working_days_hours" ? "default_hours_per_day" : "quantity", e.target.value)}/></Field>
    <Field label="Denumire poziție"><Input value={form.line_name} onChange={(e) => set("line_name", e.target.value)}/></Field><Field label="Tarif pe oră / unitate"><Input type="number" min="0" step="0.01" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)}/></Field>
    <Field label="Descriere dinamică" className="sm:col-span-2"><TextArea value={form.description_template} onChange={(e) => set("description_template", e.target.value)}/></Field>
    <Field label="Profil TVA"><AppSelect ariaLabel="TVA" value={form.vat_profile_id} onChange={(value) => {if(value===NO_VAT_PROFILE){setForm((current)=>({...current,vat_profile_id:NO_VAT_PROFILE,vat_rate:"0.00",vat_category:"O",vat_exemption_code:null,vat_exemption_reason:"Neînregistrat în scopuri de TVA / Not registered for VAT"}));return;} const profile=activeVatProfiles.find((item)=>item.id===value); if(profile) setForm((current)=>({...current,vat_profile_id:profile.id,vat_rate:profile.rate,vat_category:profile.vat_category,vat_exemption_code:profile.vat_exemption_code,vat_exemption_reason:profile.vat_exemption_reason}));}} options={[...(!companyIsVatPayer ? [{id:NO_VAT_PROFILE,label:"Fără TVA · 0%"}] : []),...activeVatProfiles.map((item)=>({id:item.id,label:`${item.name} · ${Number(item.rate)}%`}))]}/></Field>
    {missingVatConfiguration ? <div className="rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)] sm:col-span-2">Firma este plătitoare de TVA, dar nu are niciun profil TVA activ. Configurează profilurile în Setări înainte de salvare.</div> : null}
  </div><footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" isDisabled={save.isPending || missingVatConfiguration} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm"/> : null} Salvează ciorna</Button><Button variant="primary" isDisabled={save.isPending || activate.isPending || missingVatConfiguration || !form.vat_profile_id || !form.starts_on || !form.line_name.trim()} onPress={() => setConfirmActivation(true)}>{activate.isPending ? <Spinner size="sm"/> : <Play size={14}/>} Activează v{version.version}</Button></footer><ConfirmDialog isOpen={confirmActivation} title={`Activezi versiunea v${version.version}?`} description={`Versiunea v${version.version} va deveni sursa contractuală activă de la ${form.starts_on}. Versiunea curentă rămâne în istoric și această activare nu poate fi anulată.`} confirmLabel="Activează versiunea" tone="warning" isPending={activate.isPending} onOpenChange={setConfirmActivation} onConfirm={() => activate.mutate()}/></>;
}

function ContractModal({companyId, companyIsVatPayer, contract, onClose, onSaved}: {companyId: string; companyIsVatPayer: boolean; contract: Contract | null; onClose: () => void; onSaved: () => void}) {
  const line = contract?.current_version?.lines[0];
  const [form, setForm] = useState<ContractForm>(() => contract && contract.current_version && line ? {
    customer_id: contract.customer_id, number: contract.number, name: contract.name, signed_on: contract.signed_on ?? "", starts_on: contract.starts_on, ends_on: contract.ends_on ?? "",
    currency: contract.current_version.currency, payment_terms_days: String(contract.current_version.payment_terms_days), default_hours_per_day: contract.current_version.default_hours_per_day ?? "8.00",
    line_name: line.name, description_template: line.description_template, billing_model: line.billing_model, quantity: line.quantity ?? "1.00", hours_per_day: line.hours_per_day ?? "", unit_price: String(line.unit_price_cents / 100),
    vat_profile_id: line.vat_profile_id ?? (line.vat_category === "O" ? NO_VAT_PROFILE : ""), vat_rate: line.vat_rate, vat_category: line.vat_category, vat_exemption_code: line.vat_exemption_code, vat_exemption_reason: line.vat_exemption_reason,
  } : EMPTY);
  const customers = useQuery({queryKey: ["customers", companyId, "contracts"], queryFn: () => api<Customer[]>(`/companies/${companyId}/customers?_per_page=100&_sort=name`)});
  const currencies = useQuery({queryKey: ["currencies", "active"], queryFn: () => api<Currency[]>("/settings/currencies?_per_page=100&_sort=code")});
  const vatProfiles = useQuery({queryKey: ["vat-profiles", companyId], queryFn: () => api<VatProfile[]>(`/companies/${companyId}/vat-profiles?_per_page=100`)});
  const activeCurrencies = useMemo(() => (currencies.data?.data ?? []).filter((currency) => currency.is_active), [currencies.data?.data]);
  const activeVatProfiles = useMemo(() => (vatProfiles.data?.data ?? []).filter((profile) => profile.is_active), [vatProfiles.data?.data]);
  const missingVatConfiguration = companyIsVatPayer && !vatProfiles.isLoading && activeVatProfiles.length === 0;
  useEffect(() => {
    if (contract || activeCurrencies.length === 0 || activeCurrencies.some((currency) => currency.code === form.currency)) return;
    const preferred = activeCurrencies.find((currency) => currency.is_local) ?? activeCurrencies[0];
    setForm((current) => ({...current, currency: preferred.code}));
  }, [activeCurrencies, contract, form.currency]);
  useEffect(() => {
    if (form.vat_profile_id || vatProfiles.isLoading) return;
    const profile = activeVatProfiles.find((item) => item.is_default) ?? activeVatProfiles[0];
    if (profile) setForm((current) => ({...current, vat_profile_id: profile.id, vat_rate: profile.rate, vat_category: profile.vat_category, vat_exemption_code: profile.vat_exemption_code, vat_exemption_reason: profile.vat_exemption_reason}));
    else if (!companyIsVatPayer) setForm((current) => ({...current, vat_profile_id: NO_VAT_PROFILE, vat_rate: "0.00", vat_category: "O", vat_exemption_code: null, vat_exemption_reason: "Neînregistrat în scopuri de TVA / Not registered for VAT"}));
  }, [activeVatProfiles, companyIsVatPayer, form.vat_profile_id, vatProfiles.isLoading]);
  const set = <K extends keyof ContractForm>(key: K, value: ContractForm[K]) => setForm((current) => ({...current, [key]: value}));
  const payload = {customer_id: form.customer_id, number: form.number.trim(), name: form.name.trim(), signed_on: form.signed_on, starts_on: form.starts_on, ends_on: form.ends_on || null, version: {
    effective_from: contract?.current_version?.effective_from ?? form.starts_on, currency: form.currency, payment_terms_days: Number(form.payment_terms_days), locale: "ro", timezone: "Europe/Bucharest", working_weekdays: [1,2,3,4,5], holiday_calendar_code: "RO", default_hours_per_day: form.default_hours_per_day || null, notes: null,
    lines: [{product_id: line?.product_id ?? null, name: form.line_name.trim(), description_template: form.description_template.trim(), billing_model: form.billing_model, quantity: form.billing_model === "fixed_quantity" ? form.quantity : null, hours_per_day: form.hours_per_day || null, unit: form.billing_model === "working_days_hours" ? "ore" : (line?.unit ?? "buc"), unit_code: form.billing_model === "working_days_hours" ? "HUR" : (line?.unit_code ?? "C62"), unit_price_cents: Math.round(Number(form.unit_price) * 100), vat_profile_id: form.vat_profile_id === NO_VAT_PROFILE ? null : (form.vat_profile_id || null), vat_rate: form.vat_rate, vat_category: form.vat_category, vat_exemption_code: form.vat_exemption_code, vat_exemption_reason: form.vat_exemption_reason}, ...(contract?.current_version?.lines.slice(1).map(unchangedLinePayload) ?? [])],
  }};
  const save = useMutation({mutationFn: () => api<Contract>(`/companies/${companyId}/contracts${contract ? `/${contract.id}` : ""}`, {method: contract ? "PUT" : "POST", body: JSON.stringify(payload)}), onSuccess: onSaved});
  const preview = useMutation({mutationFn: () => api<{working_days: {working_days: number}; lines: Array<{quantity: string; description: string}>; totals: {total_cents: number}}>(`/companies/${companyId}/contracts/${contract!.id}/versions/${contract!.current_version!.id}/preview`, {method: "POST", body: JSON.stringify({period_start: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2,"0")}-01`, period_end: today()})})});
  const editable = !contract || contract.status === "draft";
  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-3xl rounded-2xl bg-[var(--surface)] shadow-[var(--shadow-lg)]"><header className="flex items-center justify-between border-b border-[var(--border)] p-5"><div><h2 className="font-semibold">{contract ? `${contract.number} · ${contract.name}` : "Contract nou"}</h2><p className="text-xs text-[var(--text-muted)]">Termenii activi sunt versionați; recurența păstrează versiunea exactă.</p></div><Button isIconOnly variant="ghost" onPress={onClose}>×</Button></header>
    <div className="grid gap-4 p-5 sm:grid-cols-2">
      <Field label="Client"><AppSelect ariaLabel="Client" value={form.customer_id} isDisabled={!editable} onChange={(value) => set("customer_id", value)} options={(customers.data?.data ?? []).map((item) => ({id: item.id, label: item.name}))}/></Field>
      <Field label="Număr"><Input value={form.number} disabled={!editable} onChange={(e) => set("number", e.target.value)}/></Field><Field label="Denumire"><Input value={form.name} disabled={!editable} onChange={(e) => set("name", e.target.value)}/></Field>
      <Field label="Data semnării *"><AppDatePicker name="signed_on" ariaLabel="Data semnării" value={form.signed_on} isDisabled={!editable} isRequired onChange={(value) => set("signed_on", value)}/></Field><Field label="Începe la"><AppDatePicker name="starts_on" ariaLabel="Începe la" value={form.starts_on} maxValue={form.ends_on || undefined} isDisabled={!editable} onChange={(value) => set("starts_on", value)}/></Field><Field label="Se încheie la"><AppDatePicker name="ends_on" ariaLabel="Se încheie la" value={form.ends_on} minValue={form.starts_on || undefined} isDisabled={!editable} onChange={(value) => set("ends_on", value)}/></Field>
      <Field label="Monedă"><AppSelect name="currency" ariaLabel="Monedă" value={form.currency} isDisabled={!editable} onChange={(value) => set("currency", value)} options={activeCurrencies.map((currency) => ({id:currency.code,label:`${currency.code} — ${currency.name}`}))}/></Field>
      <Field label="Model de facturare"><AppSelect ariaLabel="Model" value={form.billing_model} isDisabled={!editable} onChange={(value) => set("billing_model", value as ContractBillingModel)} options={[{id:"working_days_hours",label:"Zile lucrătoare × ore/zi"},{id:"fixed_quantity",label:"Cantitate fixă"}]}/></Field>
      <Field label={form.billing_model === "working_days_hours" ? "Ore/zi implicite" : "Cantitate"}><Input type="number" step="0.01" value={form.billing_model === "working_days_hours" ? form.default_hours_per_day : form.quantity} disabled={!editable} onChange={(e) => set(form.billing_model === "working_days_hours" ? "default_hours_per_day" : "quantity", e.target.value)}/></Field>
      <Field label="Denumire poziție"><Input value={form.line_name} disabled={!editable} onChange={(e) => set("line_name", e.target.value)}/></Field><Field label="Tarif pe oră / unitate"><Input type="number" step="0.01" value={form.unit_price} disabled={!editable} onChange={(e) => set("unit_price", e.target.value)}/></Field>
      <Field label="Descriere dinamică" className="sm:col-span-2"><TextArea value={form.description_template} disabled={!editable} onChange={(e) => set("description_template", e.target.value)}/><span className="text-xs text-[var(--text-muted)]">Variabile: period.start, period.end, period.working_days, billing.hours_per_day, billing.billable_hours.</span></Field>
      <Field label="Profil TVA"><AppSelect ariaLabel="TVA" value={form.vat_profile_id} isDisabled={!editable} onChange={(value) => {if(value===NO_VAT_PROFILE){setForm((current)=>({...current,vat_profile_id:NO_VAT_PROFILE,vat_rate:"0.00",vat_category:"O",vat_exemption_code:null,vat_exemption_reason:"Neînregistrat în scopuri de TVA / Not registered for VAT"}));return;} const profile=activeVatProfiles.find((item)=>item.id===value); if(profile) setForm((current)=>({...current,vat_profile_id:profile.id,vat_rate:profile.rate,vat_category:profile.vat_category,vat_exemption_code:profile.vat_exemption_code,vat_exemption_reason:profile.vat_exemption_reason}));}} options={[...(!companyIsVatPayer ? [{id:NO_VAT_PROFILE,label:"Fără TVA · 0%"}] : []),...activeVatProfiles.map((item)=>({id:item.id,label:`${item.name} · ${Number(item.rate)}%`}))]}/></Field>
      {missingVatConfiguration ? <div className="rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)] sm:col-span-2">Firma este plătitoare de TVA, dar nu are niciun profil TVA activ. Configurează profilurile în Setări înainte de salvare.</div> : null}
      {preview.data ? <div className="rounded-xl bg-[var(--bg-muted)] p-4 text-sm sm:col-span-2"><b>Calcul curent</b><div>{preview.data.data.working_days.working_days} zile lucrătoare · {preview.data.data.lines[0]?.quantity} ore/unități · {money(preview.data.data.totals.total_cents, form.currency)}</div><p className="mt-1 text-xs">{preview.data.data.lines[0]?.description}</p></div> : null}
    </div>{save.isError ? <p role="alert" className="mx-5 mb-4 rounded-xl bg-[var(--danger-soft)] p-3 text-sm text-[var(--danger)]">{apiErrorMessage(save.error, "Contractul nu a putut fi salvat.")}</p> : null}<footer className="flex justify-end gap-2 border-t border-[var(--border)] p-4"><Button variant="outline" onPress={onClose}>Închide</Button>{contract?.status === "active" ? <Button variant="outline" isDisabled={preview.isPending} onPress={() => preview.mutate()}>Simulează luna curentă</Button> : null}{editable ? <Button variant="primary" isDisabled={save.isPending || missingVatConfiguration || !form.vat_profile_id || !form.currency || !form.customer_id || !form.number.trim() || !form.name.trim() || !form.signed_on || !form.starts_on || !form.line_name.trim()} onPress={() => save.mutate()}>{save.isPending ? <Spinner size="sm"/> : null} Salvează ciorna</Button> : null}</footer>
  </div></div>;
}

function Field({label,className,children}:{label:string;className?:string;children:React.ReactNode}) {return <label className={`flex flex-col gap-1.5 ${className ?? ""}`}><span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span>{children}</label>;}
