import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen} from "@testing-library/react";
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
    localStorage.setItem("billwise_active_company_id", "company-old");
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
    expect(localStorage.getItem("billwise_active_company_id")).toBeNull();
  });

  it("curăță toate datele de sesiune și cache-ul la logout", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    localStorage.setItem("billwise_access_token", "valid-token");
    localStorage.setItem("billwise_active_company_id", "company-1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/auth/logout") && init?.method === "POST") {
          return Promise.resolve(new Response(null, {status: 204}));
        }

        const data = url.includes("/companies")
          ? [{id: "company-1", legal_name: "ACME SRL", tax_id: "12345674"}]
          : url.includes("/notifications")
            ? {items: [], unread_count: 0}
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
    client.setQueryData(["sensitive"], {tenant: "tenant-1"});
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard protejat</div>} />
            </Route>
            <Route path="/login" element={<div>Sesiune închisă</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Dashboard protejat");
    expect(screen.getByText("Facturi furnizori")).toBeInTheDocument();
    expect(screen.getByText("Seif fiscal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Deconectare"}));

    expect(await screen.findByText("Sesiune închisă")).toBeInTheDocument();
    expect(localStorage.getItem("billwise_access_token")).toBeNull();
    expect(localStorage.getItem("billwise_active_company_id")).toBeNull();
    expect(client.getQueryData(["sensitive"])).toBeUndefined();
  });
});
