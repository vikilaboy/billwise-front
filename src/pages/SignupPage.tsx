import {FormEvent, useState} from "react";
import {Link, Navigate, useNavigate} from "react-router";
import {Button} from "@heroui/react";
import {Eye, EyeOff} from "lucide-react";
import {api, session} from "../lib/api";
import type {RegisterPayload} from "../lib/types";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [loading, setLoading] = useState(false);

  if (session.token()) return <Navigate to="/dashboard" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordMismatch(false);
    if (password !== confirm) {
      setPasswordMismatch(true);
      setLoading(false);
      return;
    }
    try {
      const r = await api<RegisterPayload>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          password_confirmation: confirm,
        }),
      });
      navigate(`/verifica-email?email=${encodeURIComponent(r.data.email)}`, {replace: true});
    } catch {
      // The API client presents the error globally.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Creează cont</h2>
        <p className="mb-6 text-[14.5px] text-[var(--text-muted)]">Activezi contul prin email, fără date de firmă în acest pas.</p>

        <div className="mb-3.5">
          <label htmlFor="signup-name" className={authLabelCls}>Nume</label>
          <input
            id="signup-name"
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Andrei Popescu"
            className={authInputCls}
          />
        </div>

        <div>
          <label htmlFor="signup-email" className={authLabelCls}>Email</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@firma.ro"
            className={authInputCls}
          />
        </div>

        <div className="mt-3.5">
          <label htmlFor="signup-phone" className={authLabelCls}>Telefon</label>
          <input
            id="signup-phone"
            name="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+40 712 345 678"
            className={authInputCls}
          />
        </div>

        <div className="mt-3.5">
          <label htmlFor="signup-password" className={authLabelCls}>Parolă</label>
          <div className="relative">
            <input
              id="signup-password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minim 8 caractere"
              className={`${authInputCls} pr-11`}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ascunde parola" : "Arată parola"}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Minimum 8 caractere.</p>
          {passwordMismatch ? <div className="mt-1 text-[12px] text-[var(--danger)]">Parolele nu coincid.</div> : null}
        </div>

        <div className="mb-5 mt-3.5">
          <label htmlFor="signup-password-confirmation" className={authLabelCls}>Confirmă parola</label>
          <div className="relative">
            <input
              id="signup-password-confirmation"
              name="password_confirmation"
              type={showConfirmation ? "text" : "password"}
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Reintrodu parola"
              className={`${authInputCls} pr-11`}
            />
            <button
              type="button"
              aria-label={showConfirmation ? "Ascunde confirmarea parolei" : "Arată confirmarea parolei"}
              onClick={() => setShowConfirmation((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
            >
              {showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>


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
