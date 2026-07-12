import {useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Input, Spinner, Switch} from "@heroui/react";
import {Building2, Check, Globe, Landmark, MapPin} from "lucide-react";
import {useCompany} from "../components/AppShell";
import {api, ApiError} from "../lib/api";
import type {Address, CompanyProfile} from "../lib/types";

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

const AUTO_EFACTURA_KEY = "billwise_auto_efactura";
const THEME_KEY = "billwise_theme";

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
  isSelected,
  onChange,
  label,
}: {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} aria-label={label}>
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
  error,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-muted)]">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-[12px] font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function SettingsPage() {
  const {company} = useCompany();
  const queryClient = useQueryClient();

  const profileQuery = useQuery({
    queryKey: ["company", company?.id],
    queryFn: () => api<CompanyProfile>(`/companies/${company!.id}`),
    enabled: Boolean(company?.id),
  });

  const profile = profileQuery.data?.data;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [justSaved, setJustSaved] = useState(false);

  // Preferences (local-only, no API).
  const [darkTheme, setDarkTheme] = useState(() => localStorage.getItem(THEME_KEY) === "dark");
  const [autoEfactura, setAutoEfactura] = useState(() => localStorage.getItem(AUTO_EFACTURA_KEY) === "true");

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

  const fieldErrors = useMemo<Record<string, string[]>>(() => {
    const err = saveMutation.error;
    if (err instanceof ApiError && err.problem.errors) return err.problem.errors;
    return {};
  }, [saveMutation.error]);

  const errorFor = (key: string): string | undefined => fieldErrors[key]?.[0];

  // A non-field-level failure (network, 500, or 422 without `errors`).
  const generalError =
    saveMutation.error instanceof ApiError && !saveMutation.error.problem.errors
      ? saveMutation.error.problem.detail ?? saveMutation.error.problem.title
      : saveMutation.error && !(saveMutation.error instanceof ApiError)
        ? "A apărut o eroare la salvare. Încearcă din nou."
        : undefined;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({...prev, [key]: value}));
    if (justSaved) setJustSaved(false);
  }

  function handleThemeChange(checked: boolean) {
    setDarkTheme(checked);
    document.documentElement.classList.toggle("dark", checked);
    localStorage.setItem(THEME_KEY, checked ? "dark" : "light");
  }

  function handleAutoEfacturaChange(checked: boolean) {
    setAutoEfactura(checked);
    localStorage.setItem(AUTO_EFACTURA_KEY, checked ? "true" : "false");
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
    "self-start rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-[22px] shadow-[var(--shadow)]";

  return (
    <div className="grid items-start gap-4 [grid-template-columns:1fr] min-[900px]:[grid-template-columns:minmax(0,3fr)_minmax(0,2fr)]">
      {/* Card 1 — issuer company data */}
      <section className={cardClass}>
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
          <Field label="Denumire" htmlFor="legal_name" error={errorFor("legal_name")} className="sm:col-span-2">
            <Input
              id="legal_name"
              value={form.legal_name}
              onChange={(e) => update("legal_name", e.target.value)}
              placeholder="Denumirea legală a firmei"
              className="w-full"
            />
          </Field>

          <Field label="CUI" htmlFor="tax_id" error={errorFor("tax_id")}>
            <Input
              id="tax_id"
              value={form.tax_id}
              onChange={(e) => update("tax_id", e.target.value)}
              placeholder="RO12345678"
              className="w-full tabular-nums"
            />
          </Field>

          <Field label="Reg. Com." htmlFor="registration_number" error={errorFor("registration_number")}>
            <Input
              id="registration_number"
              value={form.registration_number}
              onChange={(e) => update("registration_number", e.target.value)}
              placeholder="J40/1234/2020"
              className="w-full"
            />
          </Field>

          <Field
            label="Adresă sediu"
            htmlFor="street"
            error={errorFor("address.street")}
            className="sm:col-span-2"
          >
            <Input
              id="street"
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
              isSelected={form.is_vat_payer}
              onChange={(v) => update("is_vat_payer", v)}
              label="Plătitor de TVA"
            />
          </div>

          <Field label="Email" htmlFor="email" error={errorFor("email")}>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="contact@firma.ro"
              className="w-full"
            />
          </Field>

          <Field label="Telefon" htmlFor="phone" error={errorFor("phone")}>
            <Input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+40 700 000 000"
              className="w-full"
            />
          </Field>

          <Field label="Website" htmlFor="website" error={errorFor("website")} className="sm:col-span-2">
            <Input
              id="website"
              type="url"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
              placeholder="https://firma.ro"
              className="w-full"
            />
          </Field>
        </div>

        {generalError ? (
          <p className="mt-4 text-[12.5px] font-medium text-[var(--danger)]">{generalError}</p>
        ) : null}

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
      </section>

      {/* Card 2 — preferences */}
      <section className={cardClass}>
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

          <div className="flex items-center justify-between gap-4 py-3.5 last:pb-0">
            <div>
              <div className="text-[13.5px] font-semibold">Depunere automată e-Factura</div>
              <div className="text-[12px] text-[var(--text-muted)]">Trimite în SPV la emitere</div>
            </div>
            <Toggle
              isSelected={autoEfactura}
              onChange={handleAutoEfacturaChange}
              label="Depunere automată e-Factura"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
