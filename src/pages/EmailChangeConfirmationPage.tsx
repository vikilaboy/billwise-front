import {useEffect, useState} from "react";
import {Link} from "react-router";
import {api} from "../lib/api";
import {AuthLayout} from "../components/AuthLayout";

export function EmailChangeConfirmationPage() {
  const [state, setState] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const token = params.get("token");
    window.history.replaceState(window.history.state, "", "/confirmare-email");
    if (!token) { setState("error"); return; }
    void api("/account/email-change/confirm", {method: "POST", body: JSON.stringify({token})})
      .then(() => setState("success"))
      .catch(() => setState("error"));
  }, []);

  return <AuthLayout><div>
    <h2 className="text-[26px] font-bold">Confirmare email</h2>
    <p className="mt-3 text-sm text-[var(--text-muted)]">
      {state === "loading" ? "Verificăm linkul…" : state === "success" ? "Noua adresă a fost confirmată. Autentifică-te din nou." : "Linkul este invalid, expirat sau a fost deja folosit."}
    </p>
    <Link className="mt-6 inline-block font-semibold text-[var(--accent)]" to="/login">Mergi la autentificare</Link>
  </div></AuthLayout>;
}
