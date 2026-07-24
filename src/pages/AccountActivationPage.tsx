import {Link, Navigate, useNavigate, useSearchParams} from "react-router";
import {Button} from "@heroui/react";
import {BadgeCheck, CircleAlert} from "lucide-react";
import {session} from "../lib/api";
import {AuthLayout} from "../components/AuthLayout";

export function AccountActivationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verified = params.get("verified") === "1";

  if (session.token()) return <Navigate to="/dashboard" replace />;

  return (
    <AuthLayout>
      <div
        className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${
          verified
            ? "bg-[var(--success-soft)] text-[var(--success)]"
            : "bg-[var(--danger-soft)] text-[var(--danger)]"
        }`}
      >
        {verified ? <BadgeCheck size={25} /> : <CircleAlert size={25} />}
      </div>

      <h2 className="mb-2 text-[26px] font-bold tracking-tight">
        {verified ? "Cont activat" : "Linkul nu mai este valid"}
      </h2>
      <p className="mb-6 text-[14.5px] leading-6 text-[var(--text-muted)]">
        {verified
          ? "Adresa de email a fost confirmată. Autentifică-te pentru a configura prima firmă."
          : "Linkul este invalid sau a expirat. Solicită unul nou pentru a continua activarea."}
      </p>

      {verified ? (
        <Button variant="primary" fullWidth onPress={() => navigate("/login")}>
          Continuă la autentificare
        </Button>
      ) : (
        <Button variant="primary" fullWidth onPress={() => navigate("/verifica-email")}>
          Retrimite linkul
        </Button>
      )}

      <div className="mt-5 text-center text-[14px] text-[var(--text-muted)]">
        <Link to="/login" className="font-semibold text-[var(--accent)]">
          Înapoi la autentificare
        </Link>
      </div>
    </AuthLayout>
  );
}
