import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {SettingsPage} from "./SettingsPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({data}), {status, headers: {"Content-Type": "application/json"}});

const profile = {
  id: "company-1",
  legal_name: "ACME SRL",
  trade_name: null,
  tax_id: "12345674",
  registration_number: "J12/1/2020",
  is_vat_payer: true,
  email: "office@acme.test",
  phone: null,
  website: null,
  address: null,
  created_at: null,
  updated_at: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SettingsPage SPV", () => {
  it("afișează monedele aerisit, cu steaguri accesibile și controlul Activă separat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/companies/company-1/vat-profiles")) return Promise.resolve(json([]));
        if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
        if (url.includes("/companies?include_archived=1")) return Promise.resolve(json([]));
        if (url.includes("/settings/currencies")) {
          return Promise.resolve(json([
            {
              id: "currency-eur",
              code: "EUR",
              name: "Euro",
              symbol: "€",
              auto_update: true,
              is_local: false,
              is_active: true,
              latest_rate: {day: "2026-07-24", rate: "5.2348", source: "bnr"},
            },
            {
              id: "currency-ron",
              code: "RON",
              name: "Leu românesc",
              symbol: "lei",
              auto_update: false,
              is_local: true,
              is_active: true,
              latest_rate: null,
            },
          ]));
        }
        if (url.includes("/efactura/spv/connection")) {
          return Promise.resolve(json({
            status: "disconnected",
            connected: false,
            access_token_expires_at: null,
            reauthorization_required: false,
            last_error_code: null,
          }));
        }
        return new Promise(() => undefined);
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/setari?section=fiscal"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("img", {name: "Steagul Uniunii Europene"})).toHaveTextContent("🇪🇺");
    expect(screen.getByRole("img", {name: "Steagul României"})).toHaveTextContent("🇷🇴");
    expect(screen.getAllByRole("checkbox", {name: "Activă"})).toHaveLength(2);
    expect(screen.getByRole("checkbox", {name: "Actualizare automată BNR"})).toBeInTheDocument();
  });

  it("tratează arhivarea ca acțiune periculoasă cu o confirmare explicită", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/companies/company-1") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, {status: 204}));
      }
      if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
      if (url.includes("/companies?include_archived=1")) return Promise.resolve(json([]));
      if (url.includes("/efactura/spv/connection")) {
        return Promise.resolve(json({
          status: "disconnected",
          connected: false,
          access_token_expires_at: null,
          reauthorization_required: false,
          last_error_code: null,
        }));
      }
      return new Promise(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/setari?section=company"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Arhivează firma"}));
    expect(screen.getByText(/Confirmi arhivarea firmei/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/companies/company-1"),
      expect.objectContaining({method: "DELETE"}),
    );

    fireEvent.click(screen.getByRole("button", {name: "Renunță"}));
    expect(screen.queryByRole("button", {name: "Confirmă arhivarea"})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: "Arhivează firma"}));
    fireEvent.click(screen.getByRole("button", {name: "Confirmă arhivarea"}));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/companies/company-1"),
        expect.objectContaining({method: "DELETE"}),
      ),
    );
  });

  it("separă setările în secțiuni compacte și păstrează selecția în navigare", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
        if (url.includes("/efactura/spv/connection")) {
          return Promise.resolve(json({
            status: "disconnected",
            connected: false,
            access_token_expires_at: null,
            reauthorization_required: false,
            last_error_code: null,
          }));
        }
        return new Promise(() => undefined);
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/setari"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const companyTab = await screen.findByRole("button", {name: "Firmă"});
    const fiscalTab = screen.getByRole("button", {name: "Fiscalitate"});
    expect(companyTab).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(fiscalTab);

    await waitFor(() => expect(fiscalTab).toHaveAttribute("aria-pressed", "true"));
    expect(companyTab).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", {name: "Monede"})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Profiluri TVA"})).toBeInTheDocument();
  });

  it.each([
    ["access_denied", "ANAF a respins autorizarea sau aceasta a fost anulată. Verifică certificatul digital și drepturile SPV."],
    ["unauthorized_client", "Aplicația Billwise nu este autorizată de ANAF pentru acest serviciu. Contactează suportul Billwise."],
    ["invalid_request", "ANAF nu a acceptat cererea de autorizare. Contactează suportul Billwise."],
    ["anaf_temporarily_unavailable", "Serviciul de autorizare ANAF este temporar indisponibil. Încearcă din nou."],
  ])("afișează motivul callback-ului ANAF %s", async (reason, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
        if (url.includes("/efactura/spv/connection")) {
          return Promise.resolve(json({
            status: "disconnected",
            connected: false,
            access_token_expires_at: null,
            reauthorization_required: false,
            last_error_code: null,
          }));
        }
        return new Promise(() => undefined);
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={[`/setari?spv=error&reason=${reason}`]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("Firma selectată nu este conectată la ANAF SPV.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Monede"})).toBeInTheDocument();
  });

  it("afișează callback-ul, starea reală și deconectează numai după confirmare", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
      if (url.includes("/efactura/spv/connection") && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, {status: 204}));
      }
      if (url.includes("/efactura/spv/connection")) {
        return Promise.resolve(json({
          status: "active",
          connected: true,
          access_token_expires_at: "2099-07-24T10:00:00Z",
          reauthorization_required: false,
          last_error_code: null,
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/setari?spv=connected"]}>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Conexiunea SPV a fost realizată.")).toBeInTheDocument();
    expect(await screen.findByText("Conectat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Deconectează"}));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/efactura/spv/connection?company_profile_id=company-1"),
        expect.objectContaining({method: "DELETE"}),
      ),
    );
  });

  it("arată tokenul expirat ca refreshable fără a cere reconectarea", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/companies/company-1")) return Promise.resolve(json(profile));
        if (url.includes("/efactura/spv/connection")) {
          return Promise.resolve(json({
            status: "refreshable",
            connected: true,
            access_token_expires_at: "2020-01-01T00:00:00Z",
            reauthorization_required: false,
            last_error_code: null,
          }));
        }
        return new Promise(() => undefined);
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter><SettingsPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/va fi reînnoit automat/)).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Reconectează"})).not.toBeInTheDocument();
  });
});
