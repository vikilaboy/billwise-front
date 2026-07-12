import {FormEvent, useState} from "react";
import {Link, useNavigate, useParams, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {ArrowLeft} from "lucide-react";
import {ApiError, api} from "../lib/api";
import {AuthLayout, authInputCls, authLabelCls} from "../components/AuthLayout";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const {token} = useParams();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [general, setGeneral] = useState("");
  const [loading, setLoading] = useState(false);

  const err = (key: string) =>
    errors[key]?.[0] ? <div className="mt-1 text-[12px] text-[var(--danger)]">{errors[key][0]}</div> : null;

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
      await api("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({email, token, password, password_confirmation: confirm}),
      });
      navigate("/login?reset=1", {replace: true});
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

        {(errors.email || errors.token) && (
          <div className="mb-4 rounded-[11px] bg-[var(--danger-soft)] px-3.5 py-3 text-[13px] font-medium text-[var(--danger)]">
            {errors.email?.[0] ?? errors.token?.[0]} Cere un{" "}
            <Link to="/recuperare-parola" className="underline">
              link nou de resetare
            </Link>
            .
          </div>
        )}

        <label className={authLabelCls}>Parolă nouă</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Minim 8 caractere"
          className={authInputCls}
        />
        {err("password")}

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
