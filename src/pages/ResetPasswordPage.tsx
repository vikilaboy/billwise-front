import {FormEvent, useState} from "react";
import {Link, useNavigate, useParams, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {ArrowLeft} from "lucide-react";
import {api} from "../lib/api";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const {token} = useParams();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [loading, setLoading] = useState(false);

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
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({email, token, password, password_confirmation: confirm}),
      });
      navigate("/login?reset=1", {replace: true});
    } catch {
      // The API client presents the error globally.
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={submit}>
        <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Setează o parolă nouă</h2>
        <p className="mb-6 text-[14.5px] text-[var(--text-muted)]">
          {email ? (
            <>
              Pentru contul <b className="text-[var(--text)]">{email}</b>.
            </>
          ) : (
            "Introdu noua parolă pentru contul tău."
          )}
        </p>

        <label className={authLabelCls}>Parolă nouă</label>
        <input
          name="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minim 8 caractere"
          className={authInputCls}
        />
        {passwordMismatch ? <div className="mt-1 text-[12px] text-[var(--danger)]">Parolele nu coincid.</div> : null}

        <div className="mb-5 mt-3.5">
          <label className={authLabelCls}>Confirmă parola</label>
          <input
            name="password_confirmation"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Reintrodu parola"
            className={authInputCls}
          />
        </div>


        <Button type="submit" variant="primary" fullWidth isPending={loading}>
          Resetează parola
        </Button>

        <div className="mt-5.5 text-center">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--accent)]">
            <ArrowLeft size={16} /> Înapoi la autentificare
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
