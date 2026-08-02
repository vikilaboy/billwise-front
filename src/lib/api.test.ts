import {afterEach, describe, expect, it, vi} from "vitest";
import {
  API_URL,
  ApiError,
  api,
  downloadApiFileOrTemporaryUrl,
  resetApiSecurityState,
  session,
  setCsrfToken,
} from "./api";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "./apiErrorPresentation";
import {STEP_UP_REQUIRED_EVENT, type PendingStepUp} from "./stepUpCoordinator";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("păstrează anvelopa data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {status: "ok"},
    }), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api<{status: string}>("/health")).resolves.toEqual({data: {status: "ok"}});

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Accept-Language")).toBe("ro");
    expect(headers.get("X-CSRF-TOKEN")).toBe("test-csrf-token");
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("transformă problem details în ApiError și emite prezentarea globală", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: "Date invalide",
      status: 422,
      detail: "Email invalid",
      errors: {email: ["Email invalid"]},
    }), {status: 422})));
    const event = new Promise<ApiErrorEventDetail>((resolve) => {
      window.addEventListener(API_ERROR_EVENT, (received) => {
        resolve((received as CustomEvent<ApiErrorEventDetail>).detail);
      }, {once: true});
    });

    await expect(api("/auth/login")).rejects.toBeInstanceOf(ApiError);
    await expect(event).resolves.toMatchObject({
      problem: {
        title: "Date invalide",
        status: 422,
        errors: {email: ["Email invalid"]},
      },
    });
  });

  it("nu prezintă global statusurile declarate silențioase pentru probe de sesiune", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      title: "Neautentificat",
      status: 401,
      detail: "Autentificarea este necesară.",
    }), {status: 401})));
    const listener = vi.fn();
    window.addEventListener(API_ERROR_EVENT, listener);

    await expect(api("/session/me", {}, {silentStatuses: [401]})).rejects.toMatchObject({
      problem: {status: 401},
    });
    expect(listener).not.toHaveBeenCalled();

    window.removeEventListener(API_ERROR_EVENT, listener);
  });

  it("inițializează CSRF înaintea primei cereri cookie", async () => {
    resetApiSecurityState();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {csrf_token: "csrf-1"}}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {status: "ok"}}), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    await api("/health");

    expect(fetchMock.mock.calls[0][0]).toBe(`${API_URL}/session/csrf`);
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
    const businessHeaders = new Headers(fetchMock.mock.calls[1][1]?.headers);
    expect(businessHeaders.get("X-CSRF-TOKEN")).toBe("csrf-1");
  });

  it("reînnoiește CSRF și repetă o singură dată doar cererile sigure", async () => {
    resetApiSecurityState();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {csrf_token: "csrf-old"}}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({title: "CSRF expirat", status: 419}), {status: 419}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {csrf_token: "csrf-new"}}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {status: "ok"}}), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/health")).resolves.toEqual({data: {status: "ok"}});

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const retryHeaders = new Headers(fetchMock.mock.calls[3][1]?.headers);
    expect(retryHeaders.get("X-CSRF-TOKEN")).toBe("csrf-new");
  });

  it("reînnoiește CSRF fără să repete automat o mutație", async () => {
    resetApiSecurityState();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {csrf_token: "csrf-old"}}), {status: 200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({title: "CSRF expirat", status: 419}), {status: 419}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {csrf_token: "csrf-new"}}), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api("/invoices", {method: "POST", body: JSON.stringify({})})).rejects.toMatchObject({
      problem: {status: 419},
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => url === `${API_URL}/invoices`)).toHaveLength(1);
  });

  it("păstrează Bearer pentru clienții existenți fără bootstrap CSRF", async () => {
    setCsrfToken(null);
    session.save("legacy-token");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({data: {status: "ok"}}), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);

    await api("/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer legacy-token");
    expect(headers.has("X-CSRF-TOKEN")).toBe(false);
    expect(fetchMock.mock.calls[0][1]?.credentials).toBe("include");
  });

  it("nu repetă o mutație step-up până la confirmarea explicită din dialog", async () => {
    session.clear();
    setCsrfToken("csrf-step-up");
    const body = JSON.stringify({invoice_id: "invoice-1"});
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        type: "https://api.billwise.ro/problems/step-up-required",
        title: "Reconfirmare necesară",
        status: 403,
      }), {status: 403}))
      .mockResolvedValueOnce(new Response(JSON.stringify({data: {status: "submitted"}}), {status: 200}));
    vi.stubGlobal("fetch", fetchMock);
    const pendingEvent = new Promise<PendingStepUp>((resolve) => {
      window.addEventListener(STEP_UP_REQUIRED_EVENT, (event) => {
        resolve((event as CustomEvent<PendingStepUp>).detail);
      }, {once: true});
    });

    const request = api<{status: string}>("/invoices/invoice-1/submit", {method: "POST", body});
    const pending = await pendingEvent;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const replayed = await pending.retry();
    pending.resolve(replayed);

    await expect(request).resolves.toEqual({data: {status: "submitted"}});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]?.body).toBe(body);
  });
});

describe("downloadApiFileOrTemporaryUrl", () => {
  it("navighează direct la URL-ul temporar fără să încarce arhiva în memorie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        url: "https://storage.example.test/export.zip?signature=test",
        expires_at: "2026-07-26T12:00:00Z",
      },
    }), {status: 200, headers: {"Content-Type": "application/json"}})));
    let clickedUrl: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedUrl = this.href;
    });

    await downloadApiFileOrTemporaryUrl("/companies/company-1/vault-exports/export-1/download", "seif-fiscal.zip");

    expect(clickedUrl).toBe("https://storage.example.test/export.zip?signature=test");
    expect(fetch).toHaveBeenCalledWith(
      `${API_URL}/companies/company-1/vault-exports/export-1/download`,
      expect.objectContaining({credentials: "include"}),
    );
    const headers = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
    expect(headers.get("Accept-Language")).toBe("ro");
    expect(headers.get("X-CSRF-TOKEN")).toBe("test-csrf-token");
  });
});
