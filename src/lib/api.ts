import {dispatchApiError} from "./apiErrorPresentation";
import {requestStepUp} from "./stepUpCoordinator";

export type Pagination = {
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
};
export type ApiEnvelope<T> = {data: T; meta?: {pagination?: Pagination} & Record<string, unknown>};
export type ProblemDetails = {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  errors?: Record<string, string[]>;
};
export type ApiRequestOptions = {
  silentStatuses?: readonly number[];
};
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
  }
}

export function reportApiError(problem: ProblemDetails): ApiError {
  dispatchApiError(problem);
  return new ApiError(problem);
}

function networkApiError(cause: unknown): ApiError {
  return reportApiError({
    type: "https://api.billwise.ro/problems/network-error",
    title: "Conexiunea cu serverul a eșuat",
    status: 0,
    detail: cause instanceof Error && cause.message
      ? cause.message
      : "Verifică conexiunea și încearcă din nou.",
  });
}

export function apiErrorMessage(error: unknown, fallback = "Cererea nu a putut fi procesată."): string {
  if (error instanceof ApiError) return error.problem.detail ?? error.problem.title;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// Injected at build time by vite.config (from VITE_API_URL / API_BASE_URL /
// NEXT_PUBLIC_API_BASE_URL). Falls back to the dev proxy path, then same-origin
// "/v1" — never localhost, so a misconfigured prod build fails same-origin
// instead of trying to reach the developer's machine.
declare const __API_URL__: string;

// Request paths omit the API version (e.g. "/auth/login"), so the base must end
// with the `/v1` prefix. Append it if the configured base doesn't already carry
// a version segment — a base of "https://api.billwise.ro" (no /v1) would 404.
function apiBase(raw: string): string {
  const base = raw.replace(/\/+$/, "");
  if (!base) return "/v1";
  return /\/v\d+$/.test(base) ? base : `${base}/v1`;
}
export const API_URL = apiBase(__API_URL__ || import.meta.env.VITE_API_URL || "/v1");
const TOKEN_KEY = "billwise_access_token";
export const AUTH_EXPIRED_EVENT = "billwise:auth-expired";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

let csrfToken: string | null = null;
let csrfBootstrap: Promise<string> | null = null;

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  save: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function resetApiSecurityState(): void {
  csrfToken = null;
  csrfBootstrap = null;
}

export async function bootstrapCsrf(force = false): Promise<string> {
  if (!force && csrfToken) return csrfToken;
  if (!force && csrfBootstrap) return csrfBootstrap;

  csrfBootstrap = (async () => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}/session/csrf`, {
        credentials: "include",
        headers: {
          Accept: "application/json, application/problem+json",
          "Accept-Language": "ro",
        },
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
      throw networkApiError(cause);
    }

    const payload = await response.json().catch(() => null) as ApiEnvelope<{csrf_token: string}> | null;
    const token = payload?.data?.csrf_token;
    if (!response.ok || typeof token !== "string" || token.length === 0) {
      throw new ApiError({
        title: "Sesiunea nu a putut fi inițializată",
        status: response.status,
        detail: "Tokenul de securitate al sesiunii lipsește sau este invalid.",
      });
    }

    csrfToken = token;
    return token;
  })().finally(() => {
    csrfBootstrap = null;
  });

  return csrfBootstrap;
}

function expireSessionOnUnauthorized(status: number, path: string, token: string | null): void {
  if (status !== 401) return;
  if (token && ["/session/me", "/session/exchange/confirm"].includes(path)) return;
  session.clear();
  resetApiSecurityState();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function authenticatedHeaders(init: RequestInit): Promise<{headers: Headers; token: string | null}> {
  const headers = new Headers(init.headers);
  headers.set("Accept", headers.get("Accept") ?? "application/json, application/problem+json");
  headers.set("Accept-Language", headers.get("Accept-Language") ?? "ro");
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  const token = session.token();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.set("X-CSRF-TOKEN", await bootstrapCsrf());
  }

  return {headers, token};
}

async function authenticatedFetch(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const {headers, token} = await authenticatedHeaders(init);
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {...init, credentials: "include", headers});
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw networkApiError(cause);
  }

  expireSessionOnUnauthorized(response.status, path, token);
  if (response.status !== 419 || (token && !headers.has("X-CSRF-TOKEN"))) return response;

  resetApiSecurityState();
  let refreshedCsrf: string;
  try {
    refreshedCsrf = await bootstrapCsrf(true);
  } catch {
    return response;
  }

  const method = (init.method ?? "GET").toUpperCase();
  if (retried || !SAFE_METHODS.has(method)) return response;
  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("X-CSRF-TOKEN", refreshedCsrf);
  return authenticatedFetch(path, {...init, headers: retryHeaders}, true);
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<ApiEnvelope<T>> {
  return apiRequest<T>(path, init, true, options);
}

async function apiRequest<T>(
  path: string,
  init: RequestInit,
  allowStepUp: boolean,
  options: ApiRequestOptions,
): Promise<ApiEnvelope<T>> {
  const response = await authenticatedFetch(path, init);
  if (response.status === 204) return {data: undefined as T};
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw apiProblem({
      title: response.ok ? "Răspuns invalid de la server" : "Cererea nu a putut fi procesată",
      status: response.status,
      detail: "Serverul nu a returnat un răspuns JSON valid.",
    }, options);
  }
  if (!response.ok) {
    const problem = {
      title: typeof payload.title === "string" ? payload.title : "Cererea nu a putut fi procesată",
      status: response.status,
      detail: typeof payload.detail === "string"
        ? payload.detail
        : typeof payload.message === "string" ? payload.message : undefined,
      errors: payload.errors as Record<string, string[]> | undefined,
      type: typeof payload.type === "string" ? payload.type : undefined,
    } satisfies ProblemDetails;

    if (allowStepUp && path !== "/account/step-up" && problem.type?.endsWith("/step-up-required")) {
      return requestStepUp(problem, () => apiRequest<T>(path, init, false, options));
    }

    throw apiProblem(problem, options);
  }
  return payload as ApiEnvelope<T>;
}

function apiProblem(problem: ProblemDetails, options: ApiRequestOptions): ApiError {
  return options.silentStatuses?.includes(problem.status)
    ? new ApiError(problem)
    : reportApiError(problem);
}

export async function downloadApiFile(path: string, fallbackName: string): Promise<void> {
  const response = await authenticatedFetch(path, {
    headers: {Accept: "*/*", "Accept-Language": "ro"},
  });
  if (!response.ok) {
    throw await downloadResponseError(response);
  }

  await saveResponseBlob(response, fallbackName);
}

export async function openApiFile(path: string): Promise<void> {
  const preview = window.open("", "_blank");

  try {
    const response = await authenticatedFetch(path, {
      headers: {Accept: "application/pdf", "Accept-Language": "ro"},
    });
    if (!response.ok) throw await downloadResponseError(response);

    const url = URL.createObjectURL(await response.blob());
    if (preview) {
      preview.location.href = url;
    } else {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    preview?.close();
    throw error;
  }
}

async function downloadResponseError(response: Response): Promise<ApiError> {
  let problem: ProblemDetails = {title: "Fișierul nu a putut fi descărcat", status: response.status};
  try {
    problem = {...problem, ...(await response.json())};
  } catch {
    // A non-JSON upstream error still becomes a consistent client error.
  }
  return reportApiError(problem);
}

async function saveResponseBlob(response: Response, fallbackName: string): Promise<void> {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = (match?.[1] ?? fallbackName).replace(/[\\/\r\n"]/g, "_");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadApiFileOrTemporaryUrl(path: string, fallbackName: string): Promise<void> {
  const response = await authenticatedFetch(path, {
    headers: {
      Accept: "application/json, application/octet-stream",
      "Accept-Language": "ro",
    },
  });
  if (!response.ok) {
    throw await downloadResponseError(response);
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    const payload = await response.json() as ApiEnvelope<{url: string}>;
    const anchor = document.createElement("a");
    anchor.href = payload.data.url;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  await saveResponseBlob(response, fallbackName);
}

// Build a `?_page=…&_filter[status][eq]=…` query string from the API's `_`-prefixed controls.
export type ListParams = {
  page?: number;
  perPage?: number;
  sort?: string | string[];
  with?: string | string[];
  filter?: Record<string, string | number | Record<string, string | number>>;
};

export function listQuery(params: ListParams = {}): string {
  const sp = new URLSearchParams();
  if (params.page) sp.set("_page", String(params.page));
  if (params.perPage) sp.set("_per_page", String(params.perPage));
  if (params.sort) sp.set("_sort", Array.isArray(params.sort) ? params.sort.join(",") : params.sort);
  if (params.with) sp.set("_with", Array.isArray(params.with) ? params.with.join(",") : params.with);
  for (const [field, val] of Object.entries(params.filter ?? {})) {
    if (val && typeof val === "object") {
      for (const [op, v] of Object.entries(val)) sp.set(`_filter[${field}][${op}]`, String(v));
    } else {
      sp.set(`_filter[${field}]`, String(val));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
