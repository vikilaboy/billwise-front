import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  AUTH_EXPIRED_EVENT,
  bootstrapCsrf,
  resetApiSecurityState,
  session,
  setCsrfToken,
} from "../lib/api";
import type {SessionPayload, User} from "../lib/types";

export type SessionStatus = "loading" | "anonymous" | "authenticated" | "legacy_authenticated" | "mfa_required" | "mfa_reenrollment_required" | "mfa_recovery_codes";

type MfaReenrollment = {factor_id: string; secret: string; provisioning_uri: string};

type SignInCredentials = {email: string; password: string};
type SessionContextValue = {
  status: SessionStatus;
  user: User | null;
  refresh: () => Promise<void>;
  signIn: (credentials: SignInCredentials) => Promise<SessionPayload>;
  mfaReenrollment: MfaReenrollment | null;
  recoveryCodes: string[];
  completeMfa: (challenge: {code?: string; recovery_code?: string}) => Promise<SessionPayload["status"]>;
  confirmMfaReenrollment: (code: string) => Promise<void>;
  acknowledgeRecoveryCodes: () => void;
  signOut: () => Promise<void>;
};

async function establishBrowserApiSession(errorMessage: string): Promise<User> {
  // This authenticated GET also issues Passport's short-lived HttpOnly
  // compatibility cookie used by the existing auth:api business routes.
  const current = await api<SessionPayload>("/session/me");
  if (current.data.status !== "authenticated") throw new Error(errorMessage);

  return current.data.user;
}

const standaloneContext: SessionContextValue = {
  status: "loading",
  user: null,
  mfaReenrollment: null,
  recoveryCodes: [],
  refresh: async () => undefined,
  signIn: async (credentials) => {
    const response = await api<SessionPayload>("/session/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    session.clear();
    if (response.data.csrf_token) setCsrfToken(response.data.csrf_token);
    if (response.data.status === "mfa_required") return response.data;
    if (response.data.status === "authenticated") {
      await establishBrowserApiSession("Loginul nu a inițializat sesiunea API.");
    }
    return response.data;
  },
  completeMfa: async () => {
    throw new Error("SessionProvider lipsește din arborele aplicației.");
  },
  confirmMfaReenrollment: async () => {
    throw new Error("SessionProvider lipsește din arborele aplicației.");
  },
  acknowledgeRecoveryCodes: () => undefined,
  signOut: async () => {
    const legacy = Boolean(session.token());
    try {
      await api(legacy ? "/auth/logout" : "/session/logout", {method: "POST"});
    } finally {
      session.clear();
      resetApiSecurityState();
    }
  },
};

const SessionContext = createContext<SessionContextValue>(standaloneContext);

let legacyExchange: Promise<User> | null = null;

async function exchangeLegacySession(): Promise<User> {
  if (legacyExchange) return legacyExchange;

  legacyExchange = (async () => {
    const csrf = await bootstrapCsrf();
    const exchange = await api<SessionPayload>("/session/exchange", {
      method: "POST",
      headers: {"X-CSRF-TOKEN": csrf},
    });
    if (exchange.data.status === "mfa_required") throw new Error("Răspuns invalid la schimbul sesiunii.");
    const exchangeCsrf = exchange.data.csrf_token;
    if (!exchangeCsrf) throw new Error("Schimbul sesiunii nu a returnat un token CSRF nou.");
    setCsrfToken(exchangeCsrf);

    const current = await api<SessionPayload>("/session/me", {
      headers: {"X-CSRF-TOKEN": exchangeCsrf},
    });
    await api<{status: string}>("/session/exchange/confirm", {
      method: "POST",
      headers: {"X-CSRF-TOKEN": exchangeCsrf},
    });

    session.clear();
    if (current.data.status !== "authenticated") throw new Error("Sesiunea migrată nu este autentificată.");
    return current.data.user;
  })().finally(() => {
    legacyExchange = null;
  });

  return legacyExchange;
}

export function SessionProvider({children}: {children: ReactNode}) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [mfaReenrollment, setMfaReenrollment] = useState<MfaReenrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (session.token()) {
      try {
        const migratedUser = await exchangeLegacySession();
        setStatus("authenticated");
        setUser(migratedUser);
      } catch {
        // Release-B fallback: keep the still-valid PAT until an exchange and
        // its revocation confirmation both complete successfully.
        setStatus(session.token() ? "legacy_authenticated" : "anonymous");
        setUser(null);
      }
      return;
    }

    try {
      const response = await api<SessionPayload>("/session/me", {}, {silentStatuses: [401]});
      if (response.data.status !== "authenticated") throw new Error("Sesiunea nu este complet autentificată.");
      setStatus("authenticated");
      setUser(response.data.user);
    } catch {
      setStatus("anonymous");
      setUser(null);
      setMfaReenrollment(null);
      setRecoveryCodes([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const expire = () => {
      setStatus("anonymous");
      setUser(null);
      setMfaReenrollment(null);
      setRecoveryCodes([]);
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, expire);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expire);
  }, []);

  const signIn = useCallback(async (credentials: SignInCredentials) => {
    const response = await api<SessionPayload>("/session/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    session.clear();
    if (response.data.csrf_token) setCsrfToken(response.data.csrf_token);
    if (response.data.status === "mfa_required" || response.data.status === "mfa_reenrollment_required") {
      if (response.data.status === "mfa_reenrollment_required") {
        setMfaReenrollment({factor_id: response.data.factor_id, secret: response.data.secret, provisioning_uri: response.data.provisioning_uri});
      }
      setStatus(response.data.status);
      setUser(null);
      return response.data;
    }
    if (response.data.status !== "authenticated") throw new Error("Loginul nu a finalizat sesiunea.");
    const currentUser = await establishBrowserApiSession("Loginul nu a inițializat sesiunea API.");
    setStatus("authenticated");
    setUser(currentUser);
    return response.data;
  }, []);

  const completeMfa = useCallback(async (challenge: {code?: string; recovery_code?: string}) => {
    const response = await api<SessionPayload>("/session/mfa", {
      method: "POST",
      body: JSON.stringify(challenge),
    });
    if (response.data.csrf_token) setCsrfToken(response.data.csrf_token);
    if (response.data.status === "mfa_reenrollment_required") {
      setMfaReenrollment({
        factor_id: response.data.factor_id,
        secret: response.data.secret,
        provisioning_uri: response.data.provisioning_uri,
      });
      setStatus("mfa_reenrollment_required");
      setUser(null);
      return response.data.status;
    }
    if (response.data.status !== "authenticated") throw new Error("Challenge-ul MFA nu a finalizat autentificarea.");
    const currentUser = await establishBrowserApiSession("MFA nu a inițializat sesiunea API.");
    setStatus("authenticated");
    setUser(currentUser);
    return response.data.status;
  }, []);

  const confirmMfaReenrollment = useCallback(async (code: string) => {
    if (!mfaReenrollment) throw new Error("Înrolarea MFA de recuperare nu este inițializată.");
    const confirmed = await api<{status: string; csrf_token: string; recovery_codes: string[]}>("/account/mfa/confirm", {
      method: "POST",
      body: JSON.stringify({factor_id: mfaReenrollment.factor_id, code}),
    });
    if (confirmed.data.csrf_token) setCsrfToken(confirmed.data.csrf_token);
    const currentUser = await establishBrowserApiSession("Reînrolarea MFA nu a finalizat sesiunea.");
    setUser(currentUser);
    setRecoveryCodes(confirmed.data.recovery_codes);
    setMfaReenrollment(null);
    setStatus("mfa_recovery_codes");
  }, [mfaReenrollment]);

  const acknowledgeRecoveryCodes = useCallback(() => {
    if (recoveryCodes.length === 0 || !user) return;
    setRecoveryCodes([]);
    setStatus("authenticated");
  }, [recoveryCodes, user]);

  const signOut = useCallback(async () => {
    const legacy = Boolean(session.token());
    try {
      await api(legacy ? "/auth/logout" : "/session/logout", {method: "POST"});
    } finally {
      session.clear();
      resetApiSecurityState();
      setStatus("anonymous");
      setUser(null);
      setMfaReenrollment(null);
      setRecoveryCodes([]);
      setMfaReenrollment(null);
      setRecoveryCodes([]);
    }
  }, []);

  const value = useMemo<SessionContextValue>(() => ({status, user, mfaReenrollment, recoveryCodes, refresh, signIn, completeMfa, confirmMfaReenrollment, acknowledgeRecoveryCodes, signOut}), [
    acknowledgeRecoveryCodes,
    completeMfa,
    confirmMfaReenrollment,
    mfaReenrollment,
    recoveryCodes,
    refresh,
    signIn,
    signOut,
    status,
    user,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
