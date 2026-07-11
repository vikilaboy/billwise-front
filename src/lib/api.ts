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

const API_URL = import.meta.env.VITE_API_URL ?? "https://api.billwise.localhost/v1";
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
