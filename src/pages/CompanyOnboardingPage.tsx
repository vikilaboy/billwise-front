import {FormEvent, useEffect, useMemo, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button, Spinner} from "@heroui/react";
import {Building2, CheckCircle2, Search} from "lucide-react";
import {useNavigate} from "react-router";
import {AppCheckbox, AppSelect} from "../components/FormControls";
import {api, apiErrorMessage, listQuery} from "../lib/api";
import {suggestAnafAddress} from "../lib/anafAddress";
import type {CompanyProfile, FiscalEntity, Locality, State, User} from "../lib/types";

type CompanyForm = {
  legalName: string;
  registrationNumber: string;
  isVatPayer: boolean;
  stateId: string;
  localityId: string;
  localitySearch: string;
  street: string;
  postalCode: string;
  email: string;
  phone: string;
  confirmed: boolean;
};

const inputClass =
  "h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 text-sm outline-none transition focus:border-[var(--accent)]";
const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-[var(--text-muted)]";

const emptyForm: CompanyForm = {
  legalName: "",
  registrationNumber: "",
  isVatPayer: false,
  stateId: "",
  localityId: "",
  localitySearch: "",
  street: "",
  postalCode: "",
  email: "",
  phone: "",
  confirmed: false,
};

export function CompanyOnboardingPage({mode = "first"}: {mode?: "first" | "additional"}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cui, setCui] = useState("");
  const [fiscal, setFiscal] = useState<FiscalEntity | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(emptyForm);

  const me = useQuery({queryKey: ["me"], queryFn: () => api<User>("/me")});
  const states = useQuery({
    queryKey: ["states", "RO"],
    queryFn: () =>
      api<State[]>(
        `/states${listQuery({perPage: 100, sort: "name", filter: {country_code: {eq: "RO"}}})}`,
      ),
  });

  const localityFilter = useMemo<Record<string, string | Record<string, string>>>(() => {
    const filter: Record<string, string | Record<string, string>> = {state_id: {eq: form.stateId}};
    if (form.localitySearch.trim().length >= 2) {
      filter.name = {contains: form.localitySearch.trim()};
    }
    return filter;
  }, [form.localitySearch, form.stateId]);

  const localities = useQuery({
    queryKey: ["localities", form.stateId, form.localitySearch.trim()],
    queryFn: () =>
      api<Locality[]>(
        `/localities${listQuery({perPage: 100, sort: "name", filter: localityFilter})}`,
      ),
    enabled: Boolean(form.stateId),
  });

  const addressSuggestions = useMemo(
    () =>
      suggestAnafAddress(
        fiscal?.address ?? null,
        states.data?.data ?? [],
        localities.data?.data ?? [],
      ),
    [fiscal?.address, localities.data?.data, states.data?.data],
  );

  useEffect(() => {
    const user = me.data?.data;
    if (!user) return;

    setForm((current) => ({
      ...current,
      email: current.email || user.email,
      phone: current.phone || user.phone || "",
    }));
  }, [me.data?.data]);

  const lookup = useMutation({
    mutationFn: () => api<FiscalEntity>(`/fiscal/lookup?cui=${encodeURIComponent(cui)}`),
    onSuccess: ({data}) => {
      setLookupError(null);
      setFiscal(data);
      setCheckedAt(new Date());
      setForm((current) => ({
        ...current,
        legalName: data.name,
        registrationNumber: data.registration_number ?? "",
        isVatPayer: data.is_vat_payer,
        street: data.address ?? "",
        email: current.email || me.data?.data.email || "",
        phone: current.phone || me.data?.data.phone || "",
        confirmed: false,
      }));
    },
    onError: (error) => {
      setLookupError(apiErrorMessage(error, "Registrul ANAF nu este disponibil momentan."));
    },
  });

  const create = useMutation({
    mutationFn: () =>
      api<CompanyProfile>("/companies", {
        method: "POST",
        body: JSON.stringify({
          legal_name: form.legalName.trim(),
          tax_id: fiscal?.cui,
          registration_number: form.registrationNumber.trim() || null,
          is_vat_payer: form.isVatPayer,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: {
            country_code: "RO",
            state_id: form.stateId,
            locality_id: form.localityId,
            street: form.street.trim(),
            postal_code: form.postalCode.trim() || null,
          },
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ["companies"]});
      navigate(mode === "first" ? "/dashboard?onboarding=complete" : "/setari?company=created", {replace: true});
    },
  });

  const update = <K extends keyof CompanyForm>(key: K, value: CompanyForm[K]) =>
    setForm((current) => ({...current, [key]: value}));

  const submitCui = (event: FormEvent) => {
    event.preventDefault();
    lookup.mutate();
  };

  const submitCompany = (event: FormEvent) => {
    event.preventDefault();
    if (!fiscal?.is_active || !form.confirmed) return;
    create.mutate();
  };

  return (
    <div className="min-h-screen bg-[var(--bg-subtle)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] font-extrabold text-white">
            B
          </span>
          <div>
            <div className="font-bold">BillWise</div>
            <div className="text-xs text-[var(--text-muted)]">
              {mode === "first" ? "Configurarea primei firme" : "Adăugarea unei firme"}
            </div>
          </div>
        </div>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)] sm:p-8">
          <div className="mb-7 flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Building2 size={20} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Adaugă firma emitentă</h1>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                Verificăm CUI-ul la ANAF, apoi confirmi adresa structurată folosită pe facturi și în e-Factura.
              </p>
            </div>
          </div>

          {!fiscal ? (
            <form onSubmit={submitCui}>
              <label htmlFor="onboarding-cui" className={labelClass}>
                CUI / CIF
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  id="onboarding-cui"
                  name="cui"
                  required
                  value={cui}
                  onChange={(event) => setCui(event.target.value)}
                  placeholder="RO12345678"
                  className={inputClass}
                />
                <Button type="submit" variant="primary" isPending={lookup.isPending}>
                  <Search size={17} /> Verifică la ANAF
                </Button>
              </div>
              {lookupError ? (
                <div className="mt-3 rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
                  <p>{lookupError}</p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      setFiscal({
                        cui: cui.trim().replace(/^RO/i, ""),
                        name: "",
                        is_vat_payer: false,
                        registration_number: null,
                        address: null,
                        is_active: true,
                      });
                      setCheckedAt(null);
                      setForm((current) => ({...current, confirmed: false}));
                    }}
                  >
                    Continuă cu introducerea manuală
                  </Button>
                </div>
              ) : null}
            </form>
          ) : (
            <form onSubmit={submitCompany}>
              <div
                data-api-fields="tax_id"
                className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
                  fiscal.is_active
                    ? "border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]"
                    : "border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 size={17} />
                  {fiscal.is_active ? "Firmă activă identificată" : "Firma figurează ca inactivă"}
                </div>
                <div className="mt-1 opacity-80">CUI {fiscal.cui}</div>
                {checkedAt ? (
                  <div className="mt-1 text-xs opacity-75">
                    Verificat prin ANAF la {checkedAt.toLocaleString("ro-RO")}
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="company-name" className={labelClass}>
                    Denumire legală
                  </label>
                  <input
                    id="company-name"
                    name="legal_name"
                    required
                    value={form.legalName}
                    onChange={(event) => update("legalName", event.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="registration-number" className={labelClass}>
                    Nr. Registrul Comerțului
                  </label>
                  <input
                    id="registration-number"
                    name="registration_number"
                    readOnly
                    value={form.registrationNumber}
                    className={`${inputClass} bg-[var(--bg-muted)]`}
                  />
                </div>

                <div>
                  <span className={labelClass}>Statut TVA</span>
                  <AppCheckbox className="flex h-11 items-center rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-3.5 text-sm" name="is_vat_payer" isSelected={form.isVatPayer} isDisabled onChange={() => {}}>
                    Plătitoare de TVA
                  </AppCheckbox>
                </div>

                <div>
                  <label htmlFor="state" className={labelClass}>
                    Județ
                  </label>
                  <AppSelect
                    name="address.state_id"
                    ariaLabel="Județ"
                    value={form.stateId}
                    options={(states.data?.data ?? []).map((state) => ({id: state.id, label: state.name}))}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        stateId: value,
                        localityId: "",
                        localitySearch: "",
                      }))
                    }
                  />
                  {addressSuggestions.state && addressSuggestions.state.id !== form.stateId ? (
                    <button
                      type="button"
                      className="mt-1.5 text-xs font-semibold text-[var(--accent)]"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          stateId: addressSuggestions.state!.id,
                          localityId: "",
                        }))
                      }
                    >
                      Folosește sugestia ANAF: {addressSuggestions.state.name}
                    </button>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="locality-search" className={labelClass}>
                    Caută localitatea
                  </label>
                  <input
                    id="locality-search"
                    disabled={!form.stateId}
                    value={form.localitySearch}
                    onChange={(event) => {
                      update("localitySearch", event.target.value);
                      update("localityId", "");
                    }}
                    placeholder="Tastează cel puțin 2 caractere"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="locality" className={labelClass}>
                    Localitate
                  </label>
                  <div className="relative">
                    <AppSelect
                      name="address.locality_id"
                      ariaLabel="Localitate"
                      isDisabled={!form.stateId || localities.isLoading}
                      value={form.localityId}
                      options={(localities.data?.data ?? []).map((locality) => ({id: locality.id, label: locality.name}))}
                      onChange={(value) => update("localityId", value)}
                    />
                    {localities.isLoading ? (
                      <Spinner size="sm" className="absolute right-3 top-3" />
                    ) : null}
                  </div>
                  {addressSuggestions.locality && addressSuggestions.locality.id !== form.localityId ? (
                    <button
                      type="button"
                      className="mt-1.5 text-xs font-semibold text-[var(--accent)]"
                      onClick={() => update("localityId", addressSuggestions.locality!.id)}
                    >
                      Folosește sugestia ANAF: {addressSuggestions.locality.name}
                    </button>
                  ) : null}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="street" className={labelClass}>
                    Adresă
                  </label>
                  <input
                    id="street"
                    name="address.street"
                    required
                    value={form.street}
                    onChange={(event) => update("street", event.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                    Adresa ANAF este precompletată ca text; confirmă separat județul și localitatea.
                  </p>
                </div>

                <div>
                  <label htmlFor="postal-code" className={labelClass}>
                    Cod poștal (opțional)
                  </label>
                  <input
                    id="postal-code"
                    name="address.postal_code"
                    value={form.postalCode}
                    onChange={(event) => update("postalCode", event.target.value)}
                    className={inputClass}
                  />
                  {addressSuggestions.postalCode && addressSuggestions.postalCode !== form.postalCode ? (
                    <button
                      type="button"
                      className="mt-1.5 text-xs font-semibold text-[var(--accent)]"
                      onClick={() => update("postalCode", addressSuggestions.postalCode!)}
                    >
                      Folosește sugestia ANAF: {addressSuggestions.postalCode}
                    </button>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="company-email" className={labelClass}>
                    Email firmă
                  </label>
                  <input
                    id="company-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={(event) => update("email", event.target.value)}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="company-phone" className={labelClass}>
                    Telefon firmă
                  </label>
                  <input
                    id="company-phone"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(event) => update("phone", event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <AppCheckbox className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-4 text-sm" name="confirmed" isSelected={form.confirmed} onChange={(selected) => update("confirmed", selected)}>
                <span>
                  <span className="block font-semibold">Confirm datele firmei și adresa structurată</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">
                    Sugestiile sunt preluate din textul ANAF, dar alegerea județului și localității îți aparține.
                  </span>
                </span>
              </AppCheckbox>

              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onPress={() => {
                    setFiscal(null);
                    setCheckedAt(null);
                    setForm(emptyForm);
                  }}
                >
                  Schimbă CUI-ul
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isPending={create.isPending}
                  isDisabled={!fiscal.is_active || !form.confirmed}
                >
                  Salvează firma și continuă
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
