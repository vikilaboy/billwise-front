import {FormEvent, useEffect, useState} from "react";
import {Link, Navigate, useNavigate, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {ApiError, api, session} from "../lib/api";
import type {AuthPayload} from "../lib/types";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const justReset = params.get("reset") === "1";

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);
    setResendMessage("");
    try {
      const r = await api<AuthPayload>("/auth/login", {
        method: "POST",
        body: JSON.stringify({email, password}),
      });
      session.save(r.data.access_token);
      navigate("/dashboard", {replace: true});
    } catch (c) {
      if (c instanceof ApiError && c.problem.type?.endsWith("/email-not-verified")) {
        setNeedsVerification(true);
      }
    } finally {
      setLoading(false);
    }
  };

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
