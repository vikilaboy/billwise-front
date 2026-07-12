import {FormEvent, useState} from "react";
import {Link, Navigate, useNavigate, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {ApiError, api, session} from "../lib/api";
import type {AuthPayload} from "../lib/types";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [params] = useSearchParams();
  const justReset = params.get("reset") === "1";

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const r = await api<AuthPayload>("/auth/login", {
        method: "POST",
        body: JSON.stringify({email, password}),
      });
      session.save(r.data.access_token);
      navigate("/dashboard", {replace: true});
    } catch (c) {
      setError(c instanceof ApiError ? c.message : "Nu ne-am putut conecta la server.");
    } finally {
      setLoading(false);
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
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className={`${authInputCls} mb-5`}
        />

        {error && (
          <div className="mb-4 text-[13px] font-medium text-[var(--danger)]" role="alert">
            {error}
          </div>
        )}

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
