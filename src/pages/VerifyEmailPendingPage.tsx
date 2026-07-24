import {FormEvent, useEffect, useState} from "react";
import {Button} from "@heroui/react";
import {Link, Navigate, useSearchParams} from "react-router";
import {MailCheck} from "lucide-react";
import {ApiError, api, session} from "../lib/api";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function VerifyEmailPendingPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const resend = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api<{message: string}>("/auth/email/verification-notification", {
        method: "POST",
        body: JSON.stringify({email}),
      });
      setMessage(response.data.message);
      setCooldown(60);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Nu am putut retrimite emailul.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <MailCheck size={24} />
      </div>
      <h2 className="mb-2 text-[26px] font-bold tracking-tight text-[var(--text)]">Verifică emailul</h2>
      <p className="mb-6 text-[14.5px] leading-6 text-[var(--text-muted)]">
        Am trimis linkul de activare la <strong className="text-[var(--text)]">{email || "adresa ta"}</strong>.
        După activare te poți autentifica și adăuga prima firmă.
      </p>

      <form onSubmit={resend}>
        <label className={authLabelCls}>Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`${authInputCls} mb-4`}
        />

        {message ? (
          <div className="mb-4 rounded-xl bg-[var(--success-soft)] px-3.5 py-3 text-[13px] text-[var(--success)]">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mb-4 text-[13px] font-medium text-[var(--danger)]" role="alert">
            {error}
          </div>
        ) : null}

        <Button type="submit" variant="outline" fullWidth isPending={loading} isDisabled={cooldown > 0}>
          {cooldown > 0 ? `Poți retrimite în ${cooldown}s` : "Retrimite linkul"}
        </Button>
      </form>

      <div className="mt-5 text-center text-[14px] text-[var(--text-muted)]">
        Ai activat contul?{" "}
        <Link to="/login" className="font-semibold text-[var(--accent)]">
          Autentifică-te
        </Link>
      </div>
    </AuthLayout>
  );
}
