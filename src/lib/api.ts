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
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
  }
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

export const session = {
  token: () => localStorage.getItem(TOKEN_KEY),
  save: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json, application/problem+json");
  if (init.body) headers.set("Content-Type", "application/json");
  const token = session.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, {...init, headers});
  if (response.status === 204) return {data: undefined as T};
  const payload = await response.json();
  if (!response.ok)
    throw new ApiError({
      title: payload.title ?? "Cererea nu a putut fi procesată",
      status: response.status,
      detail: payload.detail ?? payload.message,
      errors: payload.errors,
      type: payload.type,
    });
  return payload;
}

export async function downloadApiFile(path: string, fallbackName: string): Promise<void> {
  const headers = new Headers({Accept: "*/*"});
  const token = session.token();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {headers});
  if (!response.ok) {
    let problem: ProblemDetails = {title: "Fișierul nu a putut fi descărcat", status: response.status};
    try {
      problem = {...problem, ...(await response.json())};
    } catch {
      // A non-JSON upstream error still becomes a consistent client error.
    }
    throw new ApiError(problem);
  }

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
