import {FormEvent, useState} from "react";
import {Link} from "react-router";
import {Button} from "@heroui/react";
import {ArrowLeft, MailCheck} from "lucide-react";
import {ApiError, api} from "../lib/api";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      // The API does not expose this endpoint yet. Attempt it anyway so the flow
      // works automatically once it's added; degrade honestly until then.
      await api("/auth/forgot-password", {method: "POST", body: JSON.stringify({email})});
      setSent(true);
    } catch (c) {
      if (c instanceof ApiError && (c.problem.status === 404 || c.problem.status === 405 || c.problem.status === 501)) {
        setError("Resetarea parolei nu este încă disponibilă. Contactează-ne pentru a-ți reseta parola.");
      } else {
        setError(c instanceof ApiError ? c.message : "Nu ne-am putut conecta la server.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {sent ? (
        <div>
          <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]">
            <MailCheck size={24} />
          </div>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Verifică-ți emailul</h2>
          <p className="mb-7 text-[14.5px] text-[var(--text-muted)]">
            Dacă există un cont pentru <b className="text-[var(--text)]">{email}</b>, ți-am trimis un link de resetare a
            parolei.
          </p>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--accent)]">
            <ArrowLeft size={16} /> Înapoi la autentificare
          </Link>
        </div>
      ) : (
        <form onSubmit={submit}>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Resetare parolă</h2>
          <p className="mb-6 text-[14.5px] text-[var(--text-muted)]">Îți trimitem un link de resetare pe email.</p>

          <label className={authLabelCls}>Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@firma.ro"
            className={`${authInputCls} mb-5`}
          />

          {error && (
            <div className="mb-4 text-[13px] font-medium text-[var(--danger)]" role="alert">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" fullWidth isPending={loading}>
            Trimite linkul
          </Button>

          <div className="mt-5.5 text-center">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--accent)]">
              <ArrowLeft size={16} /> Înapoi la autentificare
            </Link>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
