import {FormEvent, useEffect, useState} from "react";
import {Link, Navigate, useNavigate, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {QRCodeSVG} from "qrcode.react";
import {ApiError, api} from "../lib/api";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";
import {useSession} from "../components/SessionProvider";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [params] = useSearchParams();
  const justReset = params.get("reset") === "1";
  const oauthReturn = validOauthReturn(params.get("oauth_return"));
  const auth = useSession();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if ((auth.status === "authenticated" || auth.status === "legacy_authenticated") && oauthReturn) {
    window.location.assign(oauthReturn);
    return null;
  }

  if (auth.status === "authenticated" || auth.status === "legacy_authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);
    setResendMessage("");
    try {
      const result = await auth.signIn({email, password});
      if (result.status === "authenticated") {
        if (oauthReturn) window.location.assign(oauthReturn);
        else navigate("/dashboard", {replace: true});
      }
    } catch (c) {
      if (c instanceof ApiError && c.problem.type?.endsWith("/email-not-verified")) {
        setNeedsVerification(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitMfa = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const status = await auth.completeMfa(useRecoveryCode ? {recovery_code: mfaCode} : {code: mfaCode});
      if (status === "authenticated") navigate("/dashboard", {replace: true});
    } catch {
      // The API client presents the validation problem globally.
    } finally {
      setLoading(false);
    }
  };

  const confirmReenrollment = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.confirmMfaReenrollment(mfaCode);
      setMfaCode("");
    } catch {
      // The API client presents the validation problem globally.
    } finally {
      setLoading(false);
    }
  };

  if (auth.status === "mfa_reenrollment_required" && auth.mfaReenrollment) {
    return (
      <AuthLayout>
        <form onSubmit={confirmReenrollment}>
          <h2 className="mb-2 text-[26px] font-bold tracking-tight text-[var(--text)]">Înlocuiește autentificatorul</h2>
          <p className="mb-5 text-[14px] text-[var(--text-muted)]">Codul de recuperare a revocat toate sesiunile și granturile vechi. Scanează noul cod înainte de a continua.</p>
          <div className="mb-4 flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={auth.mfaReenrollment.provisioning_uri} size={180} /></div>
          <code className="mb-5 block break-all rounded-lg bg-[var(--bg-muted)] p-3 text-center text-[12px]">{auth.mfaReenrollment.secret}</code>
          <label className={authLabelCls}>Codul nou de 6 cifre</label>
          <input inputMode="numeric" autoComplete="one-time-code" required value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} className={`${authInputCls} mb-5`} />
          <Button type="submit" variant="primary" fullWidth isPending={loading}>Activează noul factor</Button>
        </form>
      </AuthLayout>
    );
  }

  if (auth.status === "mfa_recovery_codes") {
    return (
      <AuthLayout>
        <div>
          <h2 className="mb-2 text-[26px] font-bold tracking-tight text-[var(--text)]">Salvează noile coduri</h2>
          <p className="mb-4 text-[14px] text-[var(--text-muted)]">Aceste coduri sunt afișate o singură dată. Păstrează-le într-un manager de parole.</p>
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-[var(--bg-muted)] p-4 font-mono text-[12px]">
            {auth.recoveryCodes.map((code) => <span key={code}>{code}</span>)}
          </div>
          <Button variant="primary" fullWidth onPress={() => { auth.acknowledgeRecoveryCodes(); navigate("/dashboard", {replace: true}); }}>Am salvat codurile</Button>
        </div>
      </AuthLayout>
    );
  }

  if (auth.status === "mfa_required") {
    return (
      <AuthLayout>
        <form onSubmit={submitMfa}>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Verificare în doi pași</h2>
          <p className="mb-6 text-[14.5px] text-[var(--text-muted)]">
            {useRecoveryCode ? "Introdu unul dintre codurile de recuperare salvate." : "Introdu codul din aplicația Authenticator."}
          </p>
          <label className={authLabelCls}>{useRecoveryCode ? "Cod de recuperare" : "Cod de 6 cifre"}</label>
          <input
            name={useRecoveryCode ? "recovery_code" : "code"}
            inputMode={useRecoveryCode ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            value={mfaCode}
            onChange={(event) => setMfaCode(event.target.value)}
            className={`${authInputCls} mb-5`}
          />
          <Button type="submit" variant="primary" fullWidth isPending={loading}>Continuă</Button>
          <button
            type="button"
            className="mt-4 w-full text-center text-[13px] font-semibold text-[var(--accent)]"
            onClick={() => { setUseRecoveryCode((value) => !value); setMfaCode(""); }}
          >
            {useRecoveryCode ? "Folosește aplicația Authenticator" : "Folosește un cod de recuperare"}
          </button>
        </form>
      </AuthLayout>
    );
  }

  const resend = async () => {
    setResending(true);
    setResendMessage("");
    try {
      const response = await api<{message: string}>("/auth/email/verification-notification", {
        method: "POST",
        body: JSON.stringify({email}),
      });
      setResendMessage(response.data.message);
      setResendCooldown(60);
    } catch {
      // The API client presents the error globally.
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Bine ai revenit</h2>
        <p className="mb-7 text-[14.5px] text-[var(--text-muted)]">Autentifică-te în contul BillWise.</p>

        {justReset && (
          <div className="mb-5 rounded-[11px] bg-[var(--success-soft)] px-3.5 py-3 text-[13px] font-medium text-[var(--success)]">
            Parola a fost resetată. Autentifică-te cu noua parolă.
          </div>
        )}

        <label className={authLabelCls}>Email</label>
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nume@firma.ro"
          className={`${authInputCls} mb-4`}
        />

        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[12.5px] font-semibold text-[var(--text-muted)]">Parolă</label>
          <Link to="/recuperare-parola" className="text-[12.5px] font-semibold text-[var(--accent)]">
            Ai uitat parola?
          </Link>
        </div>
        <input
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={`${authInputCls} mb-5`}
        />


        {needsVerification ? (
          <div className="mb-4">
            <Button
              type="button"
              variant="outline"
              fullWidth
              isPending={resending}
              isDisabled={resendCooldown > 0}
              onPress={resend}
            >
              {resendCooldown > 0 ? `Poți retrimite în ${resendCooldown}s` : "Retrimite linkul de activare"}
            </Button>
            {resendMessage ? (
              <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">{resendMessage}</p>
            ) : null}
          </div>
        ) : null}

        <Button type="submit" variant="primary" fullWidth isPending={loading}>
          Autentificare
        </Button>

        <div className="mt-5.5 text-center text-[14px] text-[var(--text-muted)]">
          Nu ai cont?{" "}
          <Link to="/inregistrare" className="font-semibold text-[var(--accent)]">
            Creează unul
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}

function validOauthReturn(value: string | null): string | null {
  if (!value) return null;

  try {
    const target = new URL(value);
    const apiOrigin = new URL(import.meta.env.VITE_API_URL || window.location.origin, window.location.origin).origin;
    return target.origin === apiOrigin && target.pathname === "/oauth/authorize" ? target.toString() : null;
  } catch {
    return null;
  }
}
