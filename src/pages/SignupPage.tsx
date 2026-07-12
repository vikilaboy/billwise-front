import {FormEvent, useState} from "react";
import {Link, Navigate, useNavigate} from "react-router";
import {Button} from "@heroui/react";
import {ApiError, api, session} from "../lib/api";
import type {AuthPayload} from "../lib/types";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

type Errors = Record<string, string[]>;

export function SignupPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [general, setGeneral] = useState("");
  const [loading, setLoading] = useState(false);

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const fieldError = (key: string) => errors[key]?.[0];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setGeneral("");
    if (password !== confirm) {
      setErrors({password: ["Parolele nu coincid."]});
      setLoading(false);
      return;
    }
    try {
      const r = await api<AuthPayload>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email,
          password,
          password_confirmation: confirm,
          tenant_name: company.trim() || null,
        }),
      });
      session.save(r.data.access_token);
      navigate("/dashboard", {replace: true});
    } catch (c) {
      if (c instanceof ApiError) {
        setErrors(c.problem.errors ?? {});
        if (!c.problem.errors) setGeneral(c.message);
      } else {
        setGeneral("Nu ne-am putut conecta la server.");
      }
    } finally {
      setLoading(false);
    }
  };

  const err = (key: string) =>
    fieldError(key) ? <div className="mt-1 text-[12px] text-[var(--danger)]">{fieldError(key)}</div> : null;

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Creează cont</h2>
        <p className="mb-6 text-[14.5px] text-[var(--text-muted)]">14 zile gratuit, fără card.</p>

        <div className="mb-3.5 grid grid-cols-2 gap-3">
          <div>
            <label className={authLabelCls}>Nume</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Andrei" className={authInputCls} />
          </div>
          <div>
            <label className={authLabelCls}>Prenume</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Popescu" className={authInputCls} />
          </div>
        </div>
        {err("name")}

        <div className="mt-3.5">
          <label className={authLabelCls}>Nume firmă (opțional)</label>
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Firma ta SRL" className={authInputCls} />
          {err("tenant_name")}
        </div>

        <div className="mt-3.5">
          <label className={authLabelCls}>Email de serviciu</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@firma.ro"
            className={authInputCls}
          />
          {err("email")}
        </div>

        <div className="mt-3.5">
          <label className={authLabelCls}>Parolă</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minim 8 caractere"
            className={authInputCls}
          />
          {err("password")}
        </div>

        <div className="mb-5 mt-3.5">
          <label className={authLabelCls}>Confirmă parola</label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Reintrodu parola"
            className={authInputCls}
          />
        </div>

        {general && (
          <div className="mb-4 text-[13px] font-medium text-[var(--danger)]" role="alert">
            {general}
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth isPending={loading}>
          Creează contul
        </Button>

        <div className="mt-5.5 text-center text-[14px] text-[var(--text-muted)]">
          Ai deja cont?{" "}
          <Link to="/login" className="font-semibold text-[var(--accent)]">
            Autentifică-te
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
