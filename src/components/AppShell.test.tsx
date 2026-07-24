import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {AppShell} from "./AppShell";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AppShell onboarding guard", () => {
  it("redirecționează obligatoriu spre onboarding când utilizatorul nu are firme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        const data = url.includes("/companies")
          ? []
          : {
              id: "user-1",
              name: "Andrei",
              email: "andrei@example.test",
              phone: "+40712345678",
              email_verified_at: "2026-07-24T10:00:00Z",
              tenant: {id: "tenant-1", name: "Andrei", slug: "andrei"},
              roles: [],
              permissions: [],
            };
        return Promise.resolve(
          new Response(JSON.stringify({data}), {
            status: 200,
            headers: {"Content-Type": "application/json"},
          }),
        );
      }),
    );

    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard protejat</div>} />
              <Route path="/onboarding/firma" element={<div>Onboarding obligatoriu</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Onboarding obligatoriu")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard protejat")).not.toBeInTheDocument();
  });

  it("șterge sesiunea și redirecționează la login când tokenul a expirat", async () => {
    localStorage.setItem("billwise_access_token", "expired-token");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/companies")) {
          return Promise.resolve(
            new Response(JSON.stringify({title: "Unauthenticated", status: 401}), {
              status: 401,
              headers: {"Content-Type": "application/problem+json"},
            }),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify({data: []}), {
            status: 200,
            headers: {"Content-Type": "application/json"},
          }),
        );
      }),
    );

    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route path="/dashboard" element={<AppShell />} />
            <Route path="/login" element={<div>Autentificare necesară</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Autentificare necesară")).toBeInTheDocument();
    expect(localStorage.getItem("billwise_access_token")).toBeNull();
  });
});
