import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {render, screen} from "@testing-library/react";
import {createMemoryRouter, RouterProvider} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {SecurityPage} from "./SecurityPage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SecurityPage authentication history", () => {
  it("afișează IP-ul complet, dispozitivul, user agentul și contextul evenimentului", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/account/auth-history")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [{
            id: "event-1",
            type: "login",
            outcome: "success",
            device: "Chrome on macOS",
            ip_address: "203.0.113.42",
            ip_prefix: "203.0.113.0/24",
            user_agent: "Mozilla/5.0 (Macintosh) Chrome/151.0",
            request_id: "request-1",
            context: {mfa: "totp"},
            created_at: "2026-08-03T16:30:22Z",
          }],
          meta: {pagination: {current_page: 1, per_page: 10, total: 1, last_page: 1}},
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
      }

      return Promise.resolve(new Response(JSON.stringify({
        data: {
          mfa: {enabled: true, type: "totp", confirmed_at: "2026-08-01T10:00:00Z", recovery_codes_remaining: 10},
          password_changed_at: null,
          active_sessions: 1,
        },
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(
      [{path: "/securitate", element: <SecurityPage />}],
      {initialEntries: ["/securitate?section=history"]},
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", {name: "Autentificare"})).toBeInTheDocument();
    expect(screen.getByText("Reușit")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.42")).toBeInTheDocument();
    expect(screen.getByText("Chrome on macOS")).toBeInTheDocument();
    expect(screen.getByText("Mozilla/5.0 (Macintosh) Chrome/151.0")).toBeInTheDocument();
    expect(screen.getByText("Aplicație Authenticator (TOTP)")).toBeInTheDocument();
    expect(screen.getByText("Cerere: request-1")).toBeInTheDocument();
  });
});
