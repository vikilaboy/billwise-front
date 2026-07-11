import {FormEvent, useState} from "react";
import {Navigate, useNavigate} from "react-router";
import {Button} from "@heroui/react";
import {Check} from "lucide-react";
import {ApiError, api, session} from "../lib/api";
import type {AuthPayload} from "../lib/types";

const FEATURES = [
  "Conectare directă la SPV / e-Factura",
  "Curs valutar BNR actualizat automat",
  "Facturi conforme, fără griji",
];

const inputCls =
  "h-11 w-full rounded-[11px] border border-[var(--strong)] bg-[var(--bg)] px-3.5 text-[14.5px] text-[var(--text)] outline-none focus:border-[var(--accent)] placeholder:text-[var(--faint)]";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[var(--text)] p-12 text-[var(--bg)] md:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-[var(--accent)] text-lg font-extrabold text-white">
            B
          </span>
          <span className="text-[19px] font-bold tracking-tight">BillWise</span>
        </div>
        <div className="max-w-[380px]">
          <h1 className="mb-[18px] text-[34px] font-bold leading-[1.15] tracking-tight text-balance">
            Facturarea, făcută simplu pentru firma ta.
          </h1>
          <p className="mb-7 text-[15px] leading-[1.6] text-[color-mix(in_srgb,var(--bg)_62%,transparent)]">
            e-Factura ANAF, TVA pe cote, serii automate și curs BNR — tot ce-ți trebuie ca să emiți o factură în sub 30
            de secunde.
          </p>
          <div className="flex flex-col gap-[13px]">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-[14px] text-[color-mix(in_srgb,var(--bg)_82%,transparent)]">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
                  <Check size={13} strokeWidth={2.6} />
                </span>
                {f}
              </div>
            ))}
          </div>
        </div>
        <small className="text-[12.5px] text-[color-mix(in_srgb,var(--bg)_45%,transparent)]">
          Conform cerințelor ANAF · SPV / e-Factura · GDPR
        </small>
      </section>

      <section className="flex items-center justify-center bg-[var(--bg)] px-6 py-10">
        <form className="w-full max-w-[380px]" onSubmit={submit}>
          <h2 className="mb-1.5 text-[26px] font-bold tracking-tight text-[var(--text)]">Bine ai revenit</h2>
          <p className="mb-7 text-[14.5px] text-[var(--text-muted)]">Autentifică-te în contul BillWise.</p>

          <label className="mb-1.5 block text-[12.5px] font-semibold text-[var(--text-muted)]">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nume@firma.ro"
            className={`${inputCls} mb-4`}
          />

          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[12.5px] font-semibold text-[var(--text-muted)]">Parolă</label>
            <a href="#" className="text-[12.5px] font-semibold text-[var(--accent)]">
              Ai uitat parola?
            </a>
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className={`${inputCls} mb-5`}
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
            <a href="#" className="font-semibold text-[var(--accent)]">
              Creează unul
            </a>
          </div>
        </form>
      </section>
    </div>
  );
}
