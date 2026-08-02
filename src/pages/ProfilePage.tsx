import {type FormEvent, useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Button} from "@heroui/react";
import {api} from "../lib/api";
import type {SessionPayload, User} from "../lib/types";
import {useSession} from "../components/SessionProvider";

const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

export function ProfilePage() {
  const queryClient = useQueryClient();
  const auth = useSession();
  const current = useQuery({queryKey: ["account", "profile"], queryFn: () => api<SessionPayload>("/session/me")});
  const profile = current.data?.data.status === "authenticated" ? current.data.data.user : auth.user;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone ?? "");
  }, [profile]);

  const updateProfile = useMutation({
    mutationFn: () => api<User>("/account/profile", {
      method: "PATCH",
      body: JSON.stringify({name, phone: phone || null}),
    }),
    onSuccess: async () => {
      setSaved("Profilul a fost actualizat.");
      await Promise.all([
        auth.refresh(),
        queryClient.invalidateQueries({queryKey: ["me"]}),
        queryClient.invalidateQueries({queryKey: ["account", "profile"]}),
      ]);
    },
  });
  const emailChange = useMutation({
    mutationFn: () => api("/account/email-change", {
      method: "POST",
      body: JSON.stringify({email: newEmail, current_password: currentPassword}),
    }),
    onSuccess: () => {
      setSaved("Am trimis linkul de confirmare la noua adresă.");
      setNewEmail("");
      setCurrentPassword("");
    },
  });

  const save = (event: FormEvent) => {
    event.preventDefault();
    setSaved("");
    updateProfile.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <h2 className="text-lg font-bold">Profil personal</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Aceste date aparțin contului tău, nu firmei selectate.</p>
        <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Nume complet
            <input className={`${inputClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="text-sm font-semibold">Telefon
            <input className={`${inputClass} mt-1.5`} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl bg-[var(--bg-subtle)] px-4 py-3">
            <div><div className="text-xs text-[var(--text-muted)]">Email</div><div className="text-sm font-semibold">{profile?.email}</div></div>
            <span className="rounded-full bg-[var(--success-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--success)]">
              {profile?.email_verified_at ? "Verificat" : "Neconfirmat"}
            </span>
          </div>
          <div className="sm:col-span-2"><Button type="submit" variant="primary" isPending={updateProfile.isPending}>Salvează profilul</Button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <h2 className="text-lg font-bold">Schimbă adresa de email</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">Adresa actuală rămâne activă până confirmi linkul primit la noua adresă.</p>
        <form onSubmit={(event) => { event.preventDefault(); setSaved(""); emailChange.mutate(); }} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Email nou
            <input type="email" className={`${inputClass} mt-1.5`} value={newEmail} onChange={(event) => setNewEmail(event.target.value)} required />
          </label>
          <label className="text-sm font-semibold">Parola curentă
            <input type="password" className={`${inputClass} mt-1.5`} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required />
          </label>
          <div className="sm:col-span-2"><Button type="submit" variant="outline" isPending={emailChange.isPending}>Trimite verificarea</Button></div>
        </form>
      </section>
      {saved ? <div className="rounded-xl bg-[var(--success-soft)] px-4 py-3 text-sm font-semibold text-[var(--success)]">{saved}</div> : null}
    </div>
  );
}
