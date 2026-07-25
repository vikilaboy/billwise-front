import {useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner, Switch} from "@heroui/react";
import {useNavigate, useSearchParams} from "react-router";
import {BadgePercent, Building2, Check, CircleAlert, Globe, Landmark, Link2, Link2Off, MapPin, RefreshCw, Trash2} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {AppCheckbox} from "../components/FormControls";
import {api} from "../lib/api";
import type {Address, CompanyProfile, Currency, SpvAuthorize, SpvConnection, VatProfile} from "../lib/types";
import {exchangeRate} from "../lib/format";

// Editable shape mirrors PUT /companies/{companyProfile} (UpdateCompanyProfileRequest).
// The nested `address` requires RO nomenclature (state_id/locality_id) which this
// simple settings form can't resolve — so we only edit the free-text `address.street`
// and resubmit the profile's existing address parts to keep the payload valid.
type FormState = {
  legal_name: string;
  tax_id: string;
  registration_number: string;
  is_vat_payer: boolean;
  email: string;
  phone: string;
  website: string;
  street: string;
};

type SettingsSection = "company" | "fiscal" | "preferences";

const THEME_KEY = "billwise_theme";
const SETTINGS_SECTIONS: Array<{id: SettingsSection; label: string}> = [
  {id: "company", label: "Firmă"},
  {id: "fiscal", label: "Fiscalitate"},
  {id: "preferences", label: "Preferințe"},
];

function emptyForm(): FormState {
  return {
    legal_name: "",
    tax_id: "",
    registration_number: "",
    is_vat_payer: false,
    email: "",
    phone: "",
    website: "",
    street: "",
  };
}

function toForm(p: CompanyProfile): FormState {
  return {
    legal_name: p.legal_name ?? "",
    tax_id: p.tax_id ?? "",
    registration_number: p.registration_number ?? "",
    is_vat_payer: Boolean(p.is_vat_payer),
    email: p.email ?? "",
    phone: p.phone ?? "",
    website: p.website ?? "",
    street: p.address?.street ?? "",
  };
}

// Human-readable one-line summary of the fixed (non-street) address parts.
function addressSummary(a: Address | null): string {
  if (!a) return "Nicio adresă salvată pentru firmă";
  const parts = [
    a.postal_code,
    a.resolved_city ?? a.city_name,
    a.resolved_region ?? a.region_name,
    a.country_code,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Adresă fără localizare completă";
}

// Reusable HeroUI Switch (compound) wired to a boolean value.
function Toggle({
  name,
  isSelected,
  onChange,
  label,
}: {
  name?: string;
  isSelected: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Switch name={name} isSelected={isSelected} onChange={onChange} aria-label={label}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

function Field({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function spvCallbackErrorMessage(reason: string | null): string {
  switch (reason) {
    case "access_denied":
    case "denied":
      return "ANAF a respins autorizarea sau aceasta a fost anulată. Verifică certificatul digital și drepturile SPV.";
    case "unauthorized_client":
    case "anaf_reauthorization_required":
      return "Aplicația Billwise nu este autorizată de ANAF pentru acest serviciu. Contactează suportul Billwise.";
    case "invalid_request":
    case "invalid_scope":
    case "unsupported_response_type":
      return "ANAF nu a acceptat cererea de autorizare. Contactează suportul Billwise.";
    case "anaf_temporarily_unavailable":
      return "Serviciul de autorizare ANAF este temporar indisponibil. Încearcă din nou.";
    case "invalid_state":
    case "invalid_callback":
      return "Sesiunea de conectare a expirat. Pornește din nou conectarea.";
    case "anaf_service_unavailable":
    case "anaf_token_unavailable":
      return "ANAF nu a putut finaliza conectarea. Încearcă din nou.";
    default:
      return "Conectarea SPV nu a reușit. Încearcă din nou.";
  }
}

export function SettingsPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [spvFeedback] = useState(() => searchParams.get("spv"));
  const [spvReason] = useState(() => searchParams.get("reason"));
  const requestedSection = searchParams.get("section");
  const activeSection: SettingsSection = SETTINGS_SECTIONS.some(({id}) => id === requestedSection)
    ? requestedSection as SettingsSection
    : spvFeedback
      ? "fiscal"
      : "company";

  const profileQuery = useQuery({
    queryKey: ["company", company?.id],
    queryFn: () => api<CompanyProfile>(`/companies/${company!.id}`),
    enabled: Boolean(company?.id),
  });

  const profile = profileQuery.data?.data;
  const archivedCompaniesQuery = useQuery({
    queryKey: ["companies", "archived"],
    queryFn: () => api<CompanyProfile[]>("/companies?include_archived=1"),
  });
  const archivedCompanies = (archivedCompaniesQuery.data?.data ?? []).filter((item) => item.archived_at !== null);
  const spvQuery = useQuery({
    queryKey: ["spv-connection", company?.id],
    queryFn: () => api<SpvConnection>(`/efactura/spv/connection?company_profile_id=${company!.id}`),
    enabled: Boolean(company?.id),
  });
  const currenciesQuery = useQuery({
    queryKey: ["currencies"],
    queryFn: () => api<Currency[]>("/settings/currencies?_per_page=100&_sort=code"),
  });
  const currencyMutation = useMutation({
    mutationFn: (currency: Currency) =>
      api<Currency>(`/settings/currencies/${currency.id}`, {
        method: "PUT",
        body: JSON.stringify({
          code: currency.code,
          name: currency.name,
          symbol: currency.symbol,
          auto_update: currency.auto_update,
          is_local: currency.is_local,
          is_active: currency.is_active,
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["currencies"]}),
  });
  const vatProfilesQuery = useQuery({
    queryKey: ["vat-profiles", company?.id],
    queryFn: () => api<VatProfile[]>(`/companies/${company!.id}/vat-profiles`),
    enabled: Boolean(company?.id),
  });
  const vatProfiles = Array.isArray(vatProfilesQuery.data?.data) ? vatProfilesQuery.data.data : [];
  const [newVatName, setNewVatName] = useState("");
  const [newVatRate, setNewVatRate] = useState("19");
  const vatProfileMutation = useMutation({
    mutationFn: (input: {profile?: VatProfile; create?: boolean}) => input.create
      ? api<VatProfile>(`/companies/${company!.id}/vat-profiles`, {
          method: "POST",
          body: JSON.stringify({
            name: newVatName.trim(),
            rate: newVatRate,
            vat_category: Number(newVatRate) > 0 ? "S" : "Z",
            vat_exemption_code: null,
            vat_exemption_reason: null,
            is_active: true,
            is_default: vatProfiles.length === 0,
            position: vatProfiles.length,
          }),
        })
      : api<VatProfile>(`/companies/${company!.id}/vat-profiles/${input.profile!.id}`, {
          method: "PUT",
          body: JSON.stringify({...input.profile, is_active: !input.profile!.is_active}),
        }),
    onSuccess: () => {
      setNewVatName("");
      void queryClient.invalidateQueries({queryKey: ["vat-profiles", company?.id]});
    },
  });

  const connectMutation = useMutation({
    mutationFn: () => api<SpvAuthorize>(`/efactura/spv/authorize?company_profile_id=${company!.id}`),
    onSuccess: ({data}) => window.location.assign(data.authorize_url),
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      api<void>(`/efactura/spv/connection?company_profile_id=${company!.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({queryKey: ["spv-connection", company?.id]}),
  });
  const archiveMutation = useMutation({
    mutationFn: () => api<void>(`/companies/${company!.id}`, {method: "DELETE"}),
    onSuccess: async () => {
      localStorage.removeItem("billwise_active_company_id");
      await queryClient.invalidateQueries({queryKey: ["companies"]});
      navigate("/dashboard", {replace: true});
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (companyId: string) =>
      api<CompanyProfile>(`/companies/${companyId}/restore`, {method: "POST"}),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ["companies"]}),
        queryClient.invalidateQueries({queryKey: ["companies", "archived"]}),
      ]);
    },
  });

  useEffect(() => {
    if (!spvFeedback) return;
    const next = new URLSearchParams(searchParams);
    next.delete("spv");
    next.delete("reason");
    if (!next.has("section")) next.set("section", "fiscal");
    setSearchParams(next, {replace: true});
    void queryClient.invalidateQueries({queryKey: ["spv-connection", company?.id]});
  }, [company?.id, queryClient, searchParams, setSearchParams, spvFeedback]);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [justSaved, setJustSaved] = useState(false);

  // Theme is a device-local display preference.
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem(THEME_KEY) === "dark");

  // Hydrate the form once the profile loads (or the active company changes).
  useEffect(() => {
    if (profile) setForm(toForm(profile));
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api<CompanyProfile>(`/companies/${company!.id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (result) => {
      setJustSaved(true);
      queryClient.setQueryData(["company", company?.id], result);
      queryClient.invalidateQueries({queryKey: ["companies"]});
      queryClient.invalidateQueries({queryKey: ["company"]});
    },
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
    if (justSaved) setJustSaved(false);
  }

  function handleThemeChange(checked: boolean) {
    setDarkTheme(checked);
    document.documentElement.classList.toggle("dark", checked);
    localStorage.setItem(THEME_KEY, checked ? "dark" : "light");
  }

  function selectSection(section: SettingsSection) {
    const next = new URLSearchParams(searchParams);
    next.set("section", section);
    setSearchParams(next, {replace: true});
  }

  function handleSave() {
    if (!company?.id || !profile) return;
    const payload: Record<string, unknown> = {
      legal_name: form.legal_name.trim(),
      // Preserve the trade name (not surfaced in this form) to avoid clearing it.
      trade_name: profile.trade_name,
      tax_id: form.tax_id.trim() || null,
      registration_number: form.registration_number.trim() || null,
      is_vat_payer: form.is_vat_payer,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      website: form.website.trim() || null,
    };
    // Only resubmit an address when one already exists, reusing its nomenclature
    // parts (country/state/locality) and updating just the free-text street.
    if (profile.address) {
      payload.address = {
        country_code: profile.address.country_code,
        state_id: profile.address.state_id,
        locality_id: profile.address.locality_id,
        region_name: profile.address.region_name,
        city_name: profile.address.city_name,
        street: form.street.trim(),
        street_details: profile.address.street_details,
        postal_code: profile.address.postal_code,
      };
    }
    saveMutation.mutate(payload);
  }

  if (!company?.id) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Building2 size={16} /> Selectează o firmă pentru a-i vedea setările.
      </div>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2.5 py-24 text-sm text-[var(--text-muted)]">
        <Spinner size="sm" /> Se încarcă datele firmei…
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className="py-24 text-center text-sm font-medium text-[var(--danger)]">
        Datele firmei nu au putut fi încărcate.
      </div>
    );
  }

  const cardClass =
    "min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-[22px]";

  return (
    <div className="space-y-4">
      <nav
        aria-label="Secțiuni setări"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow)]"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              aria-pressed={isActive}
              className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--accent)] text-white shadow-sm"
                  : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
              }`}
              onClick={() => selectSection(section.id)}
            >
              {section.label}
            </button>
          );
        })}
      </nav>

      <div>
      {/* Card 1 — issuer company data */}
      <section className={`${cardClass} max-w-6xl ${activeSection === "company" ? "" : "hidden"}`}>
        <header className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-muted)] text-[var(--accent)]">
            <Building2 size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Date firmă emitentă</h2>
            <p className="text-[12.5px] text-[var(--text-muted)]">Apar pe facturi și în e-Factura</p>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <Field label="Denumire" htmlFor="legal_name" className="sm:col-span-2">
            <Input
              id="legal_name"
              name="legal_name"
              value={form.legal_name}
              onChange={(e) => update("legal_name", e.target.value)}
              placeholder="Denumirea legală a firmei"
              className="w-full"
            />
          </Field>

          <Field label="CUI" htmlFor="tax_id">
            <Input
              id="tax_id"
              name="tax_id"
              value={form.tax_id}
              onChange={(e) => update("tax_id", e.target.value)}
              placeholder="RO12345678"
              className="w-full tabular-nums"
            />
          </Field>

          <Field label="Reg. Com." htmlFor="registration_number">
            <Input
              id="registration_number"
              name="registration_number"
              value={form.registration_number}
              onChange={(e) => update("registration_number", e.target.value)}
              placeholder="J40/1234/2020"
              className="w-full"
            />
          </Field>

          <Field
            label="Adresă sediu"
            htmlFor="street"
            className="sm:col-span-2"
          >
            <Input
              id="street"
              name="address.street"
              value={form.street}
              onChange={(e) => update("street", e.target.value)}
              placeholder="Stradă, număr"
              className="w-full"
              disabled={!profile.address}
            />
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--text-faint)]">
              <MapPin size={13} className="shrink-0" />
              {addressSummary(profile.address)}
            </p>
          </Field>

          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3.5 py-3 sm:col-span-2">
            <div>
              <div className="text-[13.5px] font-semibold">Plătitor de TVA</div>
              <div className="text-[12px] text-[var(--text-muted)]">Firma colectează și declară TVA</div>
            </div>
            <Toggle
              name="is_vat_payer"
              isSelected={form.is_vat_payer}
              onChange={(v) => update("is_vat_payer", v)}
              label="Plătitor de TVA"
            />
          </div>

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="contact@firma.ro"
              className="w-full"
            />
          </Field>

          <Field label="Telefon" htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+40 700 000 000"
              className="w-full"
            />
          </Field>

          <Field label="Website" htmlFor="website" className="sm:col-span-2">
            <Input
              id="website"
              name="website"
              type="url"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://firma.ro"
              className="w-full"
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3 border-t border-[var(--border)] pt-4">
          <Button
            variant="primary"
            onPress={handleSave}
            isDisabled={saveMutation.isPending || form.legal_name.trim() === ""}
          >
            {saveMutation.isPending ? <Spinner size="sm" /> : null}
            Salvează
          </Button>
          {justSaved && !saveMutation.isPending ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]">
              <Check size={16} /> Salvat
            </span>
          ) : null}
        </div>
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[13.5px] font-semibold">Arhivează firma</div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Doar firmele fără istoric de facturare pot fi arhivate. Recurențele active vor fi pauzate, iar firma poate fi restaurată ulterior.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              isDisabled={archiveMutation.isPending}
              onPress={() => {
                if (window.confirm(`Arhivezi firma „${profile.legal_name}”? Datele istorice nu vor fi șterse.`)) archiveMutation.mutate();
              }}
            >
              <Trash2 size={14} /> Arhivează
            </Button>
          </div>
          {archivedCompanies.length > 0 ? (
            <div className="mt-4 border-t border-[var(--border)] pt-4">
              <div className="text-[13px] font-semibold">Firme arhivate</div>
              <div className="mt-2 flex flex-col gap-2">
                {archivedCompanies.map((archived) => (
                  <div key={archived.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-muted)] px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium">{archived.legal_name}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{archived.tax_id ?? "Fără CUI"}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      isDisabled={restoreMutation.isPending}
                      onPress={() => restoreMutation.mutate(archived.id)}
                    >
                      <RefreshCw size={13} /> Restaurează
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <aside>
      <section className={`${cardClass} max-w-3xl ${activeSection === "preferences" ? "" : "hidden"}`}>
        <header className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-muted)] text-[var(--accent)]">
            <Landmark size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Preferințe</h2>
            <p className="text-[12.5px] text-[var(--text-muted)]">Aspect și automatizări</p>
          </div>
        </header>

        <div className="divide-y divide-[var(--border)]">
          <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0">
            <div>
              <div className="text-[13.5px] font-semibold">Temă întunecată</div>
              <div className="text-[12px] text-[var(--text-muted)]">Comută aspectul aplicației</div>
            </div>
            <Toggle isSelected={darkTheme} onChange={handleThemeChange} label="Temă întunecată" />
          </div>

          <div className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <div className="text-[13.5px] font-semibold">Limbă</div>
              <div className="text-[12px] text-[var(--text-muted)]">Interfața aplicației</div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-1 text-[12.5px] font-semibold text-[var(--text-muted)]">
              <Globe size={13} /> Română (RO)
            </span>
          </div>

        </div>
      </section>

      <section className={`${cardClass} max-w-3xl ${activeSection === "fiscal" ? "" : "hidden"}`}>
        <header className="mb-4 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-muted)] text-[var(--accent)]">
            <Link2 size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Conexiune ANAF SPV</h2>
            <p className="text-[12.5px] text-[var(--text-muted)]">Configurată pentru firma selectată</p>
          </div>
        </header>

        {spvFeedback === "connected" ? (
          <p role="status" className="mb-3 rounded-lg bg-[var(--success-soft)] px-3 py-2 text-[12.5px] font-medium text-[var(--success)]">
            Conexiunea SPV a fost realizată.
          </p>
        ) : null}
        {spvFeedback === "error" ? (
          <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl bg-[var(--danger-soft)] px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-[var(--danger)]">
            <CircleAlert size={16} className="mt-0.5 shrink-0" />
            <span>{spvCallbackErrorMessage(spvReason)}</span>
          </div>
        ) : null}

        {spvQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]"><Spinner size="sm" /> Verificăm conexiunea…</div>
        ) : spvQuery.isError ? (
          <div className="space-y-3">
            <p className="text-[12.5px] text-[var(--danger)]">Starea conexiunii nu a putut fi verificată.</p>
            <Button size="sm" variant="outline" onPress={() => spvQuery.refetch()}><RefreshCw size={14} /> Reîncearcă</Button>
          </div>
        ) : (() => {
          const connection = spvQuery.data?.data;
          const reconnectRequired = connection?.status === "reconnect_required";
          if (connection?.connected) {
            return (
              <div>
                <div className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--success)]">
                  <Check size={16} /> Conectat
                </div>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  {connection.status === "refreshable"
                    ? "Access tokenul va fi reînnoit automat la următoarea transmitere."
                    : connection.access_token_expires_at
                      ? `Token valabil până la ${new Date(connection.access_token_expires_at).toLocaleString("ro-RO")}.`
                      : "Conexiune activă."}
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  variant="outline"
                  isDisabled={disconnectMutation.isPending}
                  onPress={() => {
                    if (window.confirm("Deconectezi firma selectată de la ANAF SPV?")) disconnectMutation.mutate();
                  }}
                >
                  <Link2Off size={14} /> Deconectează
                </Button>
              </div>
            );
          }
          return (
            <div>
              {spvFeedback !== "error" ? (
                <p className="text-[12.5px] text-[var(--text-muted)]">
                  {reconnectRequired
                    ? "Autorizarea SPV trebuie refăcută pentru această firmă."
                    : "Firma selectată nu este conectată la ANAF SPV."}
                </p>
              ) : null}
              <Button
                className={`${spvFeedback === "error" ? "" : "mt-4"} w-full sm:w-auto`}
                size="sm"
                variant="primary"
                isDisabled={connectMutation.isPending}
                onPress={() => connectMutation.mutate()}
              >
                {connectMutation.isPending ? <Spinner size="sm" /> : <Link2 size={14} />}
                {reconnectRequired ? "Reconectează" : "Conectează SPV"}
              </Button>
            </div>
          );
        })()}

      </section>
      </aside>
      </div>

      <section className={`${cardClass} ${activeSection === "fiscal" ? "" : "hidden"}`}>
        <header className="mb-5 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--bg-muted)] text-[var(--accent)]">
            <BadgePercent size={18} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold tracking-tight">Configurări fiscale</h2>
            <p className="text-[12.5px] text-[var(--text-muted)]">Monede și cote TVA disponibile în documente</p>
          </div>
        </header>

        <div className="grid gap-6 min-[1050px]:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
      <section className="min-w-0 min-[1050px]:border-r min-[1050px]:border-[var(--border)] min-[1050px]:pr-6">
        <header className="mb-4">
          <h3 className="text-[14px] font-bold tracking-tight">Monede</h3>
          <p className="text-[12.5px] text-[var(--text-muted)]">Configurare la nivelul întregului cont</p>
        </header>
        {currenciesQuery.isLoading ? <Spinner size="sm" /> : currenciesQuery.isError ? (
          <p className="text-sm text-[var(--danger)]">Monedele nu au putut fi încărcate.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {(currenciesQuery.data?.data ?? []).map((currency) => (
              <div key={currency.id} className="py-3 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13.5px] font-semibold">{currency.code} · {currency.name}</div>
                    <div className="text-[11.5px] text-[var(--text-muted)]">
                      {currency.is_local ? "Monedă locală" : currency.latest_rate ? `Ultimul curs: ${exchangeRate(currency.latest_rate.rate)} · ${currency.latest_rate.day}` : "Fără curs disponibil"}
                    </div>
                  </div>
                  <AppCheckbox name={`currencies.${currency.id}.is_active`} isSelected={currency.is_active} isDisabled={currencyMutation.isPending || currency.is_local} onChange={(selected) => currencyMutation.mutate({...currency, is_active: selected})}>
                    Activă
                  </AppCheckbox>
                </div>
                {!currency.is_local ? (
                  <AppCheckbox className="mt-2 text-xs text-[var(--text-muted)]" name={`currencies.${currency.id}.auto_update`} isSelected={currency.auto_update} isDisabled={currencyMutation.isPending} onChange={(selected) => currencyMutation.mutate({...currency, auto_update: selected})}>
                    Actualizare automată BNR
                  </AppCheckbox>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
      <section className="min-w-0 border-t border-[var(--border)] pt-6 min-[1050px]:border-t-0 min-[1050px]:pt-0">
        <header className="mb-4">
          <h3 className="text-[14px] font-bold tracking-tight">Profiluri TVA</h3>
          <p className="text-[12.5px] text-[var(--text-muted)]">Cotele și tratamentele fiscale selectabile pe produse, facturi și recurențe</p>
        </header>
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]">
          <Input name="name" aria-label="Denumire profil TVA" placeholder="TVA standard" value={newVatName} onChange={(event) => setNewVatName(event.target.value)} />
          <Input name="rate" aria-label="Cotă TVA" type="number" min="0" max="100" value={newVatRate} onChange={(event) => setNewVatRate(event.target.value)} />
          <Button variant="primary" isDisabled={!newVatName.trim() || vatProfileMutation.isPending} onPress={() => vatProfileMutation.mutate({create: true})}>Adaugă</Button>
        </div>
        {vatProfilesQuery.isLoading ? <Spinner size="sm" /> : (
          <div className="divide-y divide-[var(--border)]">
            {vatProfiles.map((profile) => <div key={profile.id} className="flex items-center justify-between py-3">
              <div><div className="text-[13.5px] font-semibold">{profile.name} · {Number(profile.rate)}%</div><div className="text-xs text-[var(--text-muted)]">{profile.vat_category}{profile.is_default ? " · implicit" : ""}{profile.is_referenced ? " · utilizat" : ""}</div></div>
              <AppCheckbox name={`vat_profiles.${profile.id}.is_active`} isSelected={profile.is_active} isDisabled={vatProfileMutation.isPending} onChange={() => vatProfileMutation.mutate({profile})}>Activ</AppCheckbox>
            </div>)}
          </div>
        )}
      </section>
        </div>
      </section>
    </div>
  );
}
