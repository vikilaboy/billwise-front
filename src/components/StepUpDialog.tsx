import {type FormEvent, type MouseEvent, useEffect, useId, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {Button, Spinner} from "@heroui/react";
import {ActionTooltip} from "./ActionTooltip";
import {api, apiErrorMessage, setCsrfToken} from "../lib/api";
import {
  STEP_UP_REQUIRED_EVENT,
  type PendingStepUp,
} from "../lib/stepUpCoordinator";

const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

export function StepUpDialog() {
  const [queue, setQueue] = useState<PendingStepUp[]>([]);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const passwordRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const current = queue[0];

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<PendingStepUp>).detail;
      setQueue((items) => [...items, detail]);
    };
    window.addEventListener(STEP_UP_REQUIRED_EVENT, receive);
    return () => window.removeEventListener(STEP_UP_REQUIRED_EVENT, receive);
  }, []);

  const reset = () => {
    setPassword("");
    setCode("");
    setUseRecovery(false);
    setConfirmed(false);
    setPending(false);
    setError("");
  };

  const advance = () => {
    setQueue((items) => items.slice(1));
    reset();
  };

  const cancel = () => {
    current?.reject(new Error("Acțiunea a fost anulată înainte de reconfirmare."));
    advance();
  };

  useEffect(() => {
    if (!current) return;
    const backgroundElements = Array.from(document.body.children)
      .filter((element) => element !== overlayRef.current)
      .map((element) => ({
        element,
        ariaHidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
      }));
    document.body.classList.add("billwise-dialog-open");
    backgroundElements.forEach(({element}) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });
    passwordRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) cancel();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("billwise-dialog-open");
      backgroundElements.forEach(({element, ariaHidden, inert}) => {
        if (inert) element.setAttribute("inert", "");
        else element.removeAttribute("inert");
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [current, pending]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await api<{csrf_token: string}>("/account/step-up", {
        method: "POST",
        body: JSON.stringify({
          password,
          code: !useRecovery && code ? code : undefined,
          recovery_code: useRecovery && code ? code : undefined,
        }),
      });
      setCsrfToken(response.data.csrf_token);
      setConfirmed(true);
    } catch (cause) {
      setError(apiErrorMessage(cause, "Identitatea nu a putut fi reconfirmată."));
    } finally {
      setPending(false);
    }
  };

  const replay = async () => {
    if (!current) return;
    setPending(true);
    setError("");
    try {
      const result = await current.retry();
      current.resolve(result);
      advance();
    } catch (cause) {
      current.reject(cause);
      advance();
    }
  };

  if (!current) return null;
  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && !pending) cancel();
  };

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={closeFromBackdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-bold">Reconfirmă identitatea</h2>
        <div id={descriptionId} className="mt-4">
          {!confirmed ? (
            <form id="step-up-form" onSubmit={verify} className="space-y-3">
              <p className="text-sm text-[var(--text-muted)]">Acțiunea este sensibilă. Introdu parola și, dacă este activ, codul MFA.</p>
              <input ref={passwordRef} name="step_up_password" type="password" autoComplete="current-password" required className={inputClass} placeholder="Parola curentă" value={password} onChange={(event) => setPassword(event.target.value)} />
              <input name={useRecovery ? "step_up_recovery_code" : "step_up_code"} autoComplete="one-time-code" inputMode={useRecovery ? "text" : "numeric"} className={inputClass} placeholder={useRecovery ? "Cod de recuperare" : "Cod TOTP, dacă există"} value={code} onChange={(event) => setCode(event.target.value)} />
              <button type="button" className="text-sm font-semibold text-[var(--accent)]" onClick={() => { setUseRecovery((value) => !value); setCode(""); }}>
                {useRecovery ? "Folosește codul TOTP" : "Folosește un cod de recuperare"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Identitatea a fost reconfirmată. Acțiunea inițială nu a fost încă repetată.</p>
          )}
          {error ? <p role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">{error}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="tertiary" isDisabled={pending} onPress={cancel}>Renunță</Button>
          {confirmed ? (
            <Button variant="primary" isDisabled={pending} onPress={replay}>
              {pending ? <Spinner size="sm" /> : null} Repetă acțiunea
            </Button>
          ) : (
            <ActionTooltip content={pending ? "Verificarea este în curs." : !password ? "Completează câmpul obligatoriu: parola curentă." : "Reconfirmă identitatea"} isDisabled={pending || !password}>
              <Button type="submit" form="step-up-form" variant="primary" isDisabled={pending || !password}>
                {pending ? <Spinner size="sm" /> : null} Reconfirmă
              </Button>
            </ActionTooltip>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
