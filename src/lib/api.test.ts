import {afterEach, describe, expect, it, vi} from "vitest";
import {ApiError, api} from "./api";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "./apiErrorPresentation";

afterEach(() => {
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
