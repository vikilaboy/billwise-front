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
