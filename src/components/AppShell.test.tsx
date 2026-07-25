import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {AppShell, archivedCompanyLandingPath, canAccessArchivedCompanyPath, selectableCompanies} from "./AppShell";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AppShell onboarding guard", () => {
  it("alege o destinație accesibilă pentru firmele arhivate", () => {
    expect(archivedCompanyLandingPath((permission) => permission === "purchase_invoice.view")).toBe("/achizitii");
    expect(archivedCompanyLandingPath((permission) => permission === "fiscal_vault.view")).toBe("/seif-fiscal");
    expect(archivedCompanyLandingPath(() => false)).toBeNull();
  });

  it("permite pe firma arhivată doar ruta pentru care utilizatorul are acces", () => {
    const canViewPurchases = (permission: string) => permission === "purchase_invoice.view";
    const canViewVault = (permission: string) => permission === "fiscal_vault.view";

    expect(canAccessArchivedCompanyPath("/achizitii/invoice-1", canViewPurchases)).toBe(true);
    expect(canAccessArchivedCompanyPath("/seif-fiscal/document-1", canViewPurchases)).toBe(false);
    expect(canAccessArchivedCompanyPath("/seif-fiscal/document-1", canViewVault)).toBe(true);
    expect(canAccessArchivedCompanyPath("/achizitii/invoice-1", canViewVault)).toBe(false);
    expect(canAccessArchivedCompanyPath("/seif-fiscalizare", canViewVault)).toBe(false);
  });

  it("exclude din selector firmele arhivate când utilizatorul nu are acces la modulele lor", () => {
    const companies = [
      {id: "active", legal_name: "Activă SRL", tax_id: "12345674", archived_at: null},
      {id: "archived", legal_name: "Arhivată SRL", tax_id: "1590082", archived_at: "2026-07-25T10:00:00Z"},
    ] as Parameters<typeof selectableCompanies>[0];

    expect(selectableCompanies(companies, () => false).map((company) => company.id)).toEqual(["active"]);
    expect(selectableCompanies(companies, (permission) => permission === "fiscal_vault.view").map((company) => company.id))
      .toEqual(["active", "archived"]);
  });

  it.each([
    {
      permission: "purchase_invoice.view",
      initialPath: "/seif-fiscal",
      forbiddenContent: "Seif fiscal protejat",
      expectedContent: "Achiziții accesibile",
    },
    {
      permission: "fiscal_vault.view",
      initialPath: "/achizitii",
      forbiddenContent: "Achiziții protejate",
      expectedContent: "Seif fiscal accesibil",
    },
  ])(
    "redirecționează deep-link-ul fără permisiune pentru o firmă arhivată ($permission)",
    async ({permission, initialPath, forbiddenContent, expectedContent}) => {
      vi.stubGlobal(
        "ResizeObserver",
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      );
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((input: string | URL | Request) => {
          const url = String(input);
          const data = url.includes("/companies")
            ? [{
                id: "company-archived",
                legal_name: "ACME Arhivat SRL",
                tax_id: "12345674",
                archived_at: "2026-07-25T10:00:00Z",
              }]
            : url.includes("/notifications")
              ? {items: [], unread_count: 0}
              : {
                  id: "user-1",
                  name: "Andrei",
                  email: "andrei@example.test",
                  phone: null,
                  email_verified_at: "2026-07-24T10:00:00Z",
                  tenant: {id: "tenant-1", name: "ACME", slug: "acme"},
                  roles: ["accountant"],
                  permissions: [permission],
                };

          return Promise.resolve(new Response(JSON.stringify({data}), {
            status: 200,
            headers: {"Content-Type": "application/json"},
          }));
        }),
      );

      const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
      render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/achizitii" element={<div>{permission === "purchase_invoice.view" ? expectedContent : forbiddenContent}</div>} />
                <Route path="/seif-fiscal" element={<div>{permission === "fiscal_vault.view" ? expectedContent : forbiddenContent}</div>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(await screen.findByText(expectedContent)).toBeInTheDocument();
      expect(screen.queryByText(forbiddenContent)).not.toBeInTheDocument();
    },
  );

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

  it("ascunde modulele pentru care utilizatorul configurat nu are permisiuni", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        const data = url.includes("/companies")
          ? [{id: "company-1", legal_name: "ACME SRL", tax_id: "12345674"}]
          : url.includes("/notifications")
            ? {items: [], unread_count: 0}
            : {
                id: "user-1",
                name: "Andrei",
                email: "andrei@example.test",
                phone: null,
                email_verified_at: "2026-07-24T10:00:00Z",
                tenant: {id: "tenant-1", name: "ACME", slug: "acme"},
                roles: ["accountant"],
                permissions: ["purchase_invoice.view"],
              };

        return Promise.resolve(new Response(JSON.stringify({data}), {
          status: 200,
          headers: {"Content-Type": "application/json"},
        }));
      }),
    );

    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard protejat</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText("Dashboard protejat");
    expect(screen.getByText("Facturi furnizori")).toBeInTheDocument();
    expect(screen.queryByText("Seif fiscal")).not.toBeInTheDocument();
  });
});
