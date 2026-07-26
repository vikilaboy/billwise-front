import {afterEach, describe, expect, it, vi} from "vitest";
import {API_URL, ApiError, api, downloadApiFileOrTemporaryUrl} from "./api";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "./apiErrorPresentation";

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
      expect.objectContaining({
        headers: expect.objectContaining({"Accept-Language": "ro"}),
      }),
    );
  });
});
