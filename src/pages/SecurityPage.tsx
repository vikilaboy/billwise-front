import {type FormEvent, useEffect, useState} from "react";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {QRCodeSVG} from "qrcode.react";
import {useBlocker, useSearchParams} from "react-router";
import {api, setCsrfToken} from "../lib/api";
import {ConfirmDialog} from "../components/ConfirmDialog";
import {DataTablePagination} from "../components/DataTablePagination";

type SecuritySummary = {
  mfa: {enabled: boolean; type: string | null; confirmed_at: string | null; recovery_codes_remaining: number};
  password_changed_at: string | null;
  active_sessions: number;
};
type BrowserSession = {
  id: string; current: boolean; device: string | null; ip_prefix: string | null;
  created_at: string; last_seen_at: string; absolute_expires_at: string;
};
type AuthEvent = {
  id: string;
  type: string;
  outcome: string;
  device: string | null;
  ip_address: string | null;
  user_agent: string | null;
  request_id: string | null;
  context: Record<string, string | number | boolean | null> | null;
  created_at: string;
};
type MfaSetup = {factor_id: string; secret: string; provisioning_uri: string};
type MobileGrant = {id: string; client_name: string | null; device_name: string | null; last_used_at: string | null; expires_at: string | null};
type Confirmation = {action: "disable_mfa" | "regenerate_codes" | "logout_all" | "revoke_session" | "revoke_grant"; id?: string} | null;
type SecuritySection = "access" | "sessions" | "history";

const SECURITY_SECTIONS: Array<{id: SecuritySection; label: string}> = [
  {id: "access", label: "Acces și parolă"},
  {id: "sessions", label: "Sesiuni și aplicații"},
  {id: "history", label: "Istoric"},
];

const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]";
const cardClass = "rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6";

const AUTH_EVENT_LABELS: Record<string, string> = {
  login: "Autentificare",
  logout: "Deconectare",
  session_revoked: "Sesiune revocată",
  password_changed: "Parolă schimbată",
  password_reset: "Parolă resetată",
  email_change_requested: "Schimbare email solicitată",
  email_changed: "Adresă de email schimbată",
  mfa_challenge: "Verificare MFA",
  mfa_enabled: "MFA activat",
  mfa_disabled: "MFA dezactivat",
  mfa_recovered: "MFA recuperat",
  recovery_code_used: "Cod de recuperare utilizat",
  recovery_codes_regenerated: "Coduri de recuperare regenerate",
  token_exchanged: "Token transferat într-o sesiune",
  mobile_grant_created: "Aplicație mobilă autorizată",
  mobile_grant_revoked: "Acces mobil revocat",
  refresh_token_replay: "Reutilizare refresh token detectată",
};

const AUTH_OUTCOME_LABELS: Record<string, string> = {
  success: "Reușit",
  failure: "Eșuat",
  denied: "Respins",
};

const AUTH_CONTEXT_LABELS: Record<string, string> = {
  mfa: "Metodă MFA",
  scope: "Domeniu",
  count: "Sesiuni afectate",
  client_id: "Client OAuth",
};

function authEventLabel(type: string) {
  return AUTH_EVENT_LABELS[type] ?? type.replaceAll("_", " ");
}

function authContextValue(key: string, value: string | number | boolean) {
  if (key === "mfa" && value === "totp") return "Aplicație Authenticator (TOTP)";
  if (key === "scope" && value === "session_limit") return "Limită de sesiuni active";
  if (key === "scope" && value === "single") return "O singură sesiune";
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  return String(value);
}

export function SecurityPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section");
  const activeSection: SecuritySection = SECURITY_SECTIONS.some(({id}) => id === requestedSection)
    ? requestedSection as SecuritySection
    : "access";
  const [verificationPassword, setVerificationPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const blocker = useBlocker(recoveryCodes.length > 0);

  const security = useQuery({queryKey: ["account", "security"], queryFn: () => api<SecuritySummary>("/account/security")});
  const sessions = useQuery({queryKey: ["account", "sessions"], queryFn: () => api<BrowserSession[]>("/session/list"), enabled: activeSection === "sessions"});
  const history = useQuery({
    queryKey: ["account", "auth-history", historyPage],
    queryFn: () => api<AuthEvent[]>(`/account/auth-history?_page=${historyPage}&_per_page=10`),
    placeholderData: keepPreviousData,
    enabled: activeSection === "history",
  });
  const mobileGrants = useQuery({queryKey: ["account", "mobile-grants"], queryFn: () => api<MobileGrant[]>("/account/mobile-grants"), enabled: activeSection === "sessions"});

  useEffect(() => {
    const protectCodes = (event: BeforeUnloadEvent) => {
      if (recoveryCodes.length === 0) return;
      event.preventDefault();
    };
    window.addEventListener("beforeunload", protectCodes);
    return () => window.removeEventListener("beforeunload", protectCodes);
  }, [recoveryCodes.length]);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setMessage("Confirmă că ai salvat codurile de recuperare înainte să părăsești pagina.");
    }
  }, [blocker.state]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: ["account", "security"]}),
      queryClient.invalidateQueries({queryKey: ["account", "sessions"]}),
      queryClient.invalidateQueries({queryKey: ["account", "auth-history"]}),
      queryClient.invalidateQueries({queryKey: ["account", "mobile-grants"]}),
    ]);
  };

  const stepUp = useMutation({
    mutationFn: () => api<{status: string; csrf_token: string}>("/account/step-up", {
      method: "POST", body: JSON.stringify({password: verificationPassword, code: otp || undefined}),
    }),
    onSuccess: (response) => { setCsrfToken(response.data.csrf_token); setMessage("Identitatea a fost reconfirmată pentru 10 minute."); },
  });
  const changePassword = useMutation({
    mutationFn: () => api("/account/password", {
      method: "PUT",
      body: JSON.stringify({current_password: currentPassword, password: newPassword, password_confirmation: confirmPassword}),
    }),
    onSuccess: async () => { setMessage("Parola a fost schimbată, iar celelalte sesiuni au fost revocate."); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); await refresh(); },
  });
  const startMfa = useMutation({
    mutationFn: () => api<MfaSetup>("/account/mfa/setup", {method: "POST"}),
    onSuccess: (response) => { setSetup(response.data); setRecoveryCodes([]); },
  });
  const confirmMfa = useMutation({
    mutationFn: () => api<{status: string; csrf_token: string; recovery_codes: string[]}>("/account/mfa/confirm", {
      method: "POST", body: JSON.stringify({factor_id: setup?.factor_id, code: otp}),
    }),
    onSuccess: async (response) => {
      setCsrfToken(response.data.csrf_token);
      setRecoveryCodes(response.data.recovery_codes);
      setSetup(null);
      setOtp("");
      await refresh();
    },
  });
  const disableMfa = useMutation({
    mutationFn: () => api("/account/mfa", {method: "DELETE", body: JSON.stringify({password: verificationPassword})}),
    onSuccess: async () => { setConfirmation(null); setMessage("MFA a fost dezactivat, iar celelalte sesiuni au fost revocate."); await refresh(); },
  });
  const regenerateCodes = useMutation({
    mutationFn: () => api<{recovery_codes: string[]}>("/account/mfa/recovery-codes", {method: "POST", body: JSON.stringify({password: verificationPassword})}),
    onSuccess: async (response) => { setConfirmation(null); setRecoveryCodes(response.data.recovery_codes); await refresh(); },
  });
  const revokeSession = useMutation({
    mutationFn: (id: string) => api(`/session/${id}`, {method: "DELETE", body: JSON.stringify({password: verificationPassword})}),
    onSuccess: async () => { setConfirmation(null); await refresh(); },
  });
  const logoutAll = useMutation({
    mutationFn: () => api("/session/logout-all", {method: "POST", body: JSON.stringify({password: verificationPassword})}),
    onSuccess: () => window.dispatchEvent(new Event("billwise:auth-expired")),
  });
  const revokeGrant = useMutation({
    mutationFn: (id: string) => api(`/account/mobile-grants/${id}`, {method: "DELETE"}),
    onSuccess: async () => { setConfirmation(null); await refresh(); },
  });

  const submitPassword = (event: FormEvent) => { event.preventDefault(); setMessage(""); changePassword.mutate(); };
  const summary = security.data?.data;
  const acknowledgeRecoveryCodes = () => {
    setRecoveryCodes([]);
    if (blocker.state === "blocked") blocker.proceed();
  };
  const runConfirmedAction = () => {
    if (!confirmation) return;
    if (confirmation.action === "disable_mfa") disableMfa.mutate();
    if (confirmation.action === "regenerate_codes") regenerateCodes.mutate();
    if (confirmation.action === "logout_all") logoutAll.mutate();
    if (confirmation.action === "revoke_session" && confirmation.id) revokeSession.mutate(confirmation.id);
    if (confirmation.action === "revoke_grant" && confirmation.id) revokeGrant.mutate(confirmation.id);
  };
  const confirmationCopy = confirmation ? {
    disable_mfa: ["Dezactivezi MFA?", "Celelalte sesiuni vor fi revocate, iar contul va pierde al doilea factor.", "Dezactivează MFA"],
    regenerate_codes: ["Înlocuiești codurile de recuperare?", "Codurile existente devin imediat invalide.", "Generează coduri noi"],
    logout_all: ["Deconectezi toate sesiunile?", "Vei fi deconectat inclusiv de pe dispozitivul curent.", "Deconectează toate"],
    revoke_session: ["Revoci această sesiune?", "Dispozitivul respectiv va pierde imediat accesul.", "Revocă sesiunea"],
    revoke_grant: ["Revoci acest grant mobil?", "Access tokenul și toate refresh tokenurile dispozitivului vor deveni invalide.", "Revocă grantul"],
  }[confirmation.action] : null;
  const destructivePending = disableMfa.isPending || regenerateCodes.isPending || logoutAll.isPending || revokeSession.isPending || revokeGrant.isPending;
  const selectSection = (section: SecuritySection) => {
    const next = new URLSearchParams(searchParams);
    if (section === "access") next.delete("section"); else next.set("section", section);
    setSearchParams(next, {replace: true});
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <nav
        aria-label="Secțiuni securitate"
        className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[var(--shadow)]"
      >
        {SECURITY_SECTIONS.map((section) => {
          const isActive = activeSection === section.id;

          return (
            <button
              key={section.id}
              type="button"
              aria-pressed={isActive}
              className={`cursor-pointer rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors ${
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

      {activeSection !== "history" ? <section className={cardClass}>
        <h2 className="text-lg font-bold">Reconfirmarea identității</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Acțiunile sensibile cer o verificare recentă. Dacă ai MFA, completează și codul TOTP.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
          <input name="step_up_password" type="password" autoComplete="current-password" aria-label="Parola pentru reconfirmare" placeholder="Parola curentă" className={inputClass} value={verificationPassword} onChange={(event) => setVerificationPassword(event.target.value)} />
          <input inputMode="numeric" aria-label="Cod TOTP" placeholder="Cod TOTP, dacă există" className={inputClass} value={otp} onChange={(event) => setOtp(event.target.value)} />
          <Button variant="outline" onPress={() => stepUp.mutate()} isPending={stepUp.isPending}>Reconfirmă</Button>
        </div>
      </section> : null}

      <div className={activeSection === "access" ? "space-y-6" : "hidden"}>
      <section className={cardClass}>
        <h2 className="text-lg font-bold">Parolă</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Ultima schimbare: {summary?.password_changed_at ? new Date(summary.password_changed_at).toLocaleString("ro-RO") : "necunoscută"}</p>
        <form onSubmit={submitPassword} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-muted)] sm:col-span-2">
            Parola actuală
            <input name="current_password" type="password" autoComplete="current-password" placeholder="Introdu parola actuală" className={inputClass} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
            Parola nouă
            <input name="password" type="password" autoComplete="new-password" placeholder="Minimum 12 caractere" minLength={12} className={inputClass} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--text-muted)]">
            Confirmă parola nouă
            <input name="password_confirmation" type="password" autoComplete="new-password" placeholder="Repetă parola nouă" minLength={12} className={inputClass} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" isPending={changePassword.isPending}>Schimbă parola</Button></div>
        </form>
      </section>

      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold">Autentificare în doi pași</h2><p className="mt-1 text-sm text-[var(--text-muted)]">TOTP și coduri de recuperare single-use.</p></div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${summary?.mfa.enabled ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--bg-muted)] text-[var(--text-muted)]"}`}>{summary?.mfa.enabled ? "Activ" : "Inactiv"}</span>
        </div>
        {!summary?.mfa.enabled && !setup ? <Button className="mt-4" variant="primary" onPress={() => startMfa.mutate()} isPending={startMfa.isPending}>Activează MFA</Button> : null}
        {setup ? <div className="mt-5 grid gap-5 rounded-xl bg-[var(--bg-subtle)] p-5 sm:grid-cols-[160px_1fr]">
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={setup.provisioning_uri} size={136} level="M" /></div>
          <div><p className="text-sm font-semibold">Scanează codul în aplicația Authenticator</p><p className="mt-2 break-all font-mono text-xs text-[var(--text-muted)]">{setup.secret}</p>
            <div className="mt-4 flex gap-2"><input inputMode="numeric" placeholder="Codul de 6 cifre" className={inputClass} value={otp} onChange={(event) => setOtp(event.target.value)} /><Button variant="primary" onPress={() => confirmMfa.mutate()} isPending={confirmMfa.isPending}>Confirmă</Button></div>
          </div>
        </div> : null}
        {summary?.mfa.enabled ? <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onPress={() => setConfirmation({action: "regenerate_codes"})}>Generează coduri noi</Button><Button variant="danger" onPress={() => setConfirmation({action: "disable_mfa"})}>Dezactivează MFA</Button><span className="self-center text-xs text-[var(--text-muted)]">{summary.mfa.recovery_codes_remaining} coduri rămase</span></div> : null}
        {recoveryCodes.length ? <div className="mt-5 rounded-xl border border-[var(--warning)] bg-[var(--bg-subtle)] p-4"><p className="text-sm font-bold">Salvează acum codurile. Navigarea este blocată până confirmi salvarea.</p><pre className="mt-3 grid gap-1 whitespace-pre-wrap font-mono text-sm">{recoveryCodes.join("\n")}</pre><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" onPress={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}>Copiază codurile</Button><Button variant="primary" onPress={acknowledgeRecoveryCodes}>Am salvat codurile</Button></div></div> : null}
      </section>
      </div>

      <div className={activeSection === "sessions" ? "space-y-6" : "hidden"}>
      <section className={cardClass}>
        <div className="flex items-start justify-between"><div><h2 className="text-lg font-bold">Sesiuni active</h2><p className="mt-1 text-sm text-[var(--text-muted)]">IP-urile sunt mascate, iar identificatorii reali nu sunt expuși.</p></div><Button variant="danger" onPress={() => setConfirmation({action: "logout_all"})}>Deconectează toate</Button></div>
        <div className="mt-4 divide-y divide-[var(--border)]">{sessions.data?.data.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-sm font-semibold">{item.device ?? "Dispozitiv necunoscut"} {item.current ? "· sesiunea curentă" : ""}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{item.ip_prefix ?? "IP indisponibil"} · activă {new Date(item.last_seen_at).toLocaleString("ro-RO")}</div></div>{!item.current ? <Button size="sm" variant="outline" onPress={() => setConfirmation({action: "revoke_session", id: item.id})}>Revocă</Button> : null}</div>)}</div>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold">Aplicații mobile autorizate</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Fiecare dispozitiv are un grant separat. Revocarea invalidează întreaga familie de refresh tokenuri.</p>
        <div className="mt-4 divide-y divide-[var(--border)]">{mobileGrants.data?.data.length ? mobileGrants.data.data.map((grant) => <div key={grant.id} className="flex items-center justify-between gap-4 py-3"><div><div className="text-sm font-semibold">{grant.device_name ?? grant.client_name ?? "Aplicație mobilă"}</div><div className="mt-1 text-xs text-[var(--text-muted)]">{grant.client_name ?? "Client OAuth"}{grant.last_used_at ? ` · activ ${new Date(grant.last_used_at).toLocaleString("ro-RO")}` : ""}</div></div><Button size="sm" variant="outline" onPress={() => setConfirmation({action: "revoke_grant", id: grant.id})}>Revocă</Button></div>) : <p className="py-4 text-sm text-[var(--text-muted)]">Nu există granturi mobile active.</p>}</div>
      </section>
      </div>

      <div className={activeSection === "history" ? "space-y-6" : "hidden"}>
      <section className={cardClass}>
        <h2 className="text-lg font-bold">Istoric de autentificare</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Evenimentele contului includ sursa, dispozitivul și detaliile tehnice disponibile la momentul acțiunii.</p>
        {history.isLoading ? <p className="py-6 text-sm text-[var(--text-muted)]">Se încarcă istoricul…</p> : null}
        {history.isError ? <p className="py-6 text-sm text-[var(--danger)]">Istoricul nu a putut fi încărcat.</p> : null}
        <div className="mt-4 divide-y divide-[var(--border)]">{history.data?.data.map((event) => {
          const context = Object.entries(event.context ?? {}).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null);
          const successful = event.outcome === "success";

          return <article key={event.id} className="py-4 first:pt-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold">{authEventLabel(event.type)}</h3>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${successful ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[var(--danger)]"}`}>
                  {AUTH_OUTCOME_LABELS[event.outcome] ?? event.outcome}
                </span>
              </div>
              <time className="text-sm text-[var(--text-muted)]" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString("ro-RO")}</time>
            </div>
            <dl className="mt-3 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Adresă IP</dt>
                <dd className="mt-1 font-mono text-xs">{event.ip_address ?? "Indisponibilă pentru acest eveniment"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">Browser și sistem</dt>
                <dd className="mt-1">{event.device ?? "Dispozitiv necunoscut"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">User agent</dt>
                <dd className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{event.user_agent ?? "Indisponibil pentru acest eveniment"}</dd>
              </div>
              {context.map(([key, value]) => <div key={key}>
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{AUTH_CONTEXT_LABELS[key] ?? key.replaceAll("_", " ")}</dt>
                <dd className="mt-1 break-all">{authContextValue(key, value)}</dd>
              </div>)}
            </dl>
            <details className="mt-3 text-xs text-[var(--text-muted)]">
              <summary className="w-fit cursor-pointer select-none font-semibold">Identificatori tehnici</summary>
              <div className="mt-2 grid gap-1 font-mono">
                <span className="break-all">Eveniment: {event.id}</span>
                <span className="break-all">Cerere: {event.request_id ?? "indisponibilă"}</span>
              </div>
            </details>
          </article>;
        })}</div>
        {!history.isLoading && history.data?.data.length === 0 ? <p className="py-6 text-sm text-[var(--text-muted)]">Nu există evenimente de autentificare în perioada păstrată.</p> : null}
        <DataTablePagination pagination={history.data?.meta?.pagination} onPageChange={setHistoryPage} />
      </section>
      </div>
      {message ? <div className="rounded-xl bg-[var(--success-soft)] px-4 py-3 text-sm font-semibold text-[var(--success)]">{message}</div> : null}
      <ConfirmDialog
        isOpen={Boolean(confirmation)}
        title={confirmationCopy?.[0] ?? "Confirmă acțiunea"}
        description={confirmationCopy?.[1] ?? ""}
        confirmLabel={confirmationCopy?.[2] ?? "Confirmă"}
        tone="danger"
        isPending={destructivePending}
        onOpenChange={(open) => { if (!open && !destructivePending) setConfirmation(null); }}
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}
