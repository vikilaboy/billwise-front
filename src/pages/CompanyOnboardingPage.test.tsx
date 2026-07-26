import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "../lib/apiErrorPresentation";
import {CompanyOnboardingPage} from "./CompanyOnboardingPage";

const envelope = (data: unknown, status = 200) =>
  new Response(JSON.stringify({data, meta: {}}), {
    status,
    headers: {"Content-Type": "application/json"},
  });

afterEach(() => vi.restoreAllMocks());

describe("CompanyOnboardingPage", () => {
  it("preia datele ANAF, cere confirmarea adresei structurate și creează prima firmă", async () => {
    let companyBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/me")) {
        return envelope({
          id: "user-1",
          name: "Andrei",
          email: "andrei@example.test",
          phone: "+40712345678",
          email_verified_at: "2026-07-24T10:00:00Z",
          tenant: {id: "tenant-1", name: "Andrei", slug: "andrei"},
          roles: [],
          permissions: [],
        });
      }
      if (url.includes("/states")) {
        return envelope([{id: "state-cj", country_code: "RO", code: "CJ", name: "Cluj"}]);
      }
      if (url.includes("/localities")) {
        return envelope([
          {
            id: "locality-cluj",
            state_id: "state-cj",
            siruta_code: "54984",
            name: "Cluj-Napoca",
            type: "municipiu",
            superior_siruta: null,
          },
        ]);
      }
      if (url.includes("/fiscal/lookup")) {
        return envelope({
          cui: "12345674",
          name: "ACME SRL",
          is_vat_payer: true,
          registration_number: "J12/345/2020",
          address: "Str. Memorandumului 1, Cluj-Napoca",
          is_active: true,
        });
      }
      if (url.endsWith("/companies") && init?.method === "POST") {
        companyBody = JSON.parse(String(init.body));
        return envelope({id: "company-1", legal_name: "ACME SRL"}, 201);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: {queries: {retry: false}, mutations: {retry: false}},
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/onboarding/firma"]}>
          <Routes>
            <Route path="/onboarding/firma" element={<CompanyOnboardingPage />} />
            <Route path="/dashboard" element={<div>Dashboard gata</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("CUI / CIF"), {target: {value: "RO12345674"}});
    fireEvent.click(screen.getByRole("button", {name: /Verifică la ANAF/}));

    expect(await screen.findByDisplayValue("ACME SRL")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Str. Memorandumului 1, Cluj-Napoca")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: /Județ/}));
    fireEvent.click(await screen.findByRole("option", {name: "Cluj"}));
    await waitFor(() => expect(screen.getByRole("button", {name: /Localitate/})).toBeEnabled());
    fireEvent.click(screen.getByRole("button", {name: /Localitate/}));
    fireEvent.click(await screen.findByRole("option", {name: "Cluj-Napoca"}));
    fireEvent.submit(screen.getByRole("button", {name: "Salvează firma și continuă"}).closest("form")!);
    expect(companyBody).toBeUndefined();
    fireEvent.click(screen.getByLabelText(/Confirm datele firmei/));
    fireEvent.click(screen.getByRole("button", {name: "Salvează firma și continuă"}));

    await screen.findByText("Dashboard gata");
    expect(companyBody).toEqual({
      legal_name: "ACME SRL",
      tax_id: "12345674",
      registration_number: "J12/345/2020",
      is_vat_payer: true,
      email: "andrei@example.test",
      phone: "+40712345678",
      address: {
        country_code: "RO",
        state_id: "state-cj",
        locality_id: "locality-cluj",
        street: "Str. Memorandumului 1, Cluj-Napoca",
        postal_code: null,
      },
    });
  });

  it("permite salvarea unei firme inactive după confirmarea explicită", async () => {
    let companyBody: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/me")) return Promise.resolve(envelope({email: "a@test", phone: null}));
        if (url.includes("/states")) return Promise.resolve(envelope([]));
        if (url.includes("/fiscal/lookup")) {
          return Promise.resolve(
            envelope({
              cui: "12345674",
              name: "INACTIV SRL",
              is_vat_payer: false,
              registration_number: null,
              address: "Adresă",
              is_active: false,
            }),
          );
        }
        if (url.endsWith("/companies") && init?.method === "POST") {
          companyBody = JSON.parse(String(init.body));
          return Promise.resolve(envelope({id: "company-inactive", legal_name: "INACTIV SRL"}, 201));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("CUI / CIF"), {target: {value: "12345674"}});
    fireEvent.click(screen.getByRole("button", {name: /Verifică la ANAF/}));

    expect(await screen.findByText("Firma figurează ca inactivă la ANAF")).toBeInTheDocument();
    expect(screen.getByText(/importul și consultarea facturilor istorice/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Salvează firma și continuă"})).toBeDisabled();

    fireEvent.click(screen.getByLabelText(/Confirm datele firmei/));
    const submit = screen.getByRole("button", {name: "Salvează firma și continuă"});
    expect(submit).toBeEnabled();
    fireEvent.submit(submit.closest("form")!);

    await waitFor(() =>
      expect(companyBody).toMatchObject({
        legal_name: "INACTIV SRL",
        tax_id: "12345674",
        is_vat_payer: false,
      }),
    );
  });

  it.each([
    [422, {title: "Validation failed", status: 422, errors: {cui: ["CUI invalid."]}}],
    [404, {title: "Not found", status: 404}],
    [503, {title: "Unavailable", status: 503}],
  ])("publică global eroarea de lookup %s", async (status, problem) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/me")) return Promise.resolve(envelope({email: "a@test", phone: null}));
        if (url.includes("/states")) return Promise.resolve(envelope([]));
        if (url.includes("/fiscal/lookup")) {
          return Promise.resolve(
            new Response(JSON.stringify(problem), {
              status,
              headers: {"Content-Type": "application/problem+json"},
            }),
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CompanyOnboardingPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const apiErrorEvent = new Promise<ApiErrorEventDetail>((resolve) => {
      window.addEventListener(API_ERROR_EVENT, (event) => {
        resolve((event as CustomEvent<ApiErrorEventDetail>).detail);
      }, {once: true});
    });
    fireEvent.change(screen.getByLabelText("CUI / CIF"), {target: {value: "invalid"}});
    fireEvent.click(screen.getByRole("button", {name: /Verifică la ANAF/}));

    await expect(apiErrorEvent).resolves.toMatchObject({problem});
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
