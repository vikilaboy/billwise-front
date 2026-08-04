import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {ContractsPage} from "./ContractsPage";

const companyContext = vi.hoisted(() => ({isVatPayer: false}));

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL", is_vat_payer: companyContext.isVatPayer}, can: () => true}),
}));

const line = {
  id: "line-1", product_id: null, name: "Dezvoltare", description_template: "{{period.working_days}} zile",
  billing_model: "working_days_hours", quantity: null, hours_per_day: null, unit: "ore", unit_code: "HUR",
  unit_price_cents: 10000, vat_profile_id: null, vat_rate: "19.00", vat_category: "S",
  vat_exemption_code: null, vat_exemption_reason: null, position: 1,
};
const activeVersion = {
  id: "version-1", version: 1, status: "active", effective_from: "2026-01-01", currency: "RON",
  payment_terms_days: 15, locale: "ro", timezone: "Europe/Bucharest", working_weekdays: [1, 2, 3, 4, 5],
  holiday_calendar_code: "RO", default_hours_per_day: "8.00", notes: null, lines: [line],
};
const contract = {
  id: "contract-1", customer_id: "customer-1", number: "CTR-001", name: "Servicii", signed_on: "2026-01-01",
  starts_on: "2026-01-01", ends_on: null, status: "active", customer: {id: "customer-1", name: "Client SRL"},
  current_version: activeVersion, versions: [activeVersion], recurring_templates_count: 0,
};
const response = (data: unknown) => new Response(JSON.stringify({data}), {status: 200, headers: {"Content-Type": "application/json"}});

afterEach(() => {
  companyContext.isVatPayer = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const currencies = [{id: "currency-ron", code: "RON", name: "Leu românesc", symbol: "lei", auto_update: false, is_local: true, is_active: true, latest_rate: null}];
const customer = {id: "customer-1", name: "Client SRL"};

function newContractFetch(vatProfiles: unknown[] = []) {
  return vi.fn().mockImplementation((input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/contracts?")) return Promise.resolve(response([]));
    if (url.includes("/customers?")) return Promise.resolve(response([customer]));
    if (url.includes("/settings/currencies?")) return Promise.resolve(response(currencies));
    if (url.includes("/vat-profiles?")) return Promise.resolve(response(vatProfiles));
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("ContractsPage", () => {
  it("creează o versiune succesivă editabilă pentru un contract activ", async () => {
    let draftCreated = false;
    let versionActivated = false;
    const draftVersion = {...activeVersion, id: "version-2", version: 2, status: "draft"};
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/contracts?") || url.endsWith("/contracts")) return Promise.resolve(response([contract]));
      if (url.endsWith("/contracts/contract-1/versions") && init?.method === "POST") {
        draftCreated = true;
        return Promise.resolve(response(draftVersion));
      }
      if (url.endsWith("/contracts/contract-1/versions/version-2") && init?.method === "PUT") return Promise.resolve(response(draftVersion));
      if (url.endsWith("/contracts/contract-1/versions/version-2/activate") && init?.method === "POST") {
        versionActivated = true;
        return Promise.resolve(response(contract));
      }
      if (url.includes("/settings/currencies?")) return Promise.resolve(response(currencies));
      if (url.includes("/vat-profiles?")) return Promise.resolve(response([]));
      if (url.endsWith("/contracts/contract-1")) {
        return Promise.resolve(response({...contract, versions: draftCreated ? [activeVersion, draftVersion] : [activeVersion]}));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><MemoryRouter><ContractsPage/></MemoryRouter></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", {name: /Versiune nouă/}));
    fireEvent.click(await screen.findByRole("button", {name: /Creează ciorna/}));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("/versions") && init?.method === "POST")).toBe(true));
    expect(await screen.findByText("Ciornă v2")).toBeInTheDocument();
    const activateButton = screen.getByRole("button", {name: /Activează v2/});
    await waitFor(() => expect(activateButton).toBeEnabled());
    fireEvent.click(activateButton);

    expect(await screen.findByText("Activezi versiunea v2?")).toBeInTheDocument();
    expect(versionActivated).toBe(false);
    fireEvent.click(screen.getByRole("button", {name: "Activează versiunea"}));

    await waitFor(() => expect(versionActivated).toBe(true));
  });

  it("cere confirmare înainte de arhivarea contractului", async () => {
    const draftContract = {...contract, status: "draft", current_version: {...activeVersion, status: "draft"}};
    let archiveCalls = 0;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/contracts?")) return Promise.resolve(response([draftContract]));
      if (url.endsWith("/contracts/contract-1/archive") && init?.method === "POST") {
        archiveCalls += 1;
        return Promise.resolve(response({...draftContract, status: "archived"}));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><MemoryRouter><ContractsPage/></MemoryRouter></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", {name: "Arhivează contractul CTR-001"}));
    expect(await screen.findByText("Arhivezi contractul CTR-001?")).toBeInTheDocument();
    expect(archiveCalls).toBe(0);
    fireEvent.click(screen.getByRole("button", {name: "Renunță"}));
    expect(archiveCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", {name: "Arhivează contractul CTR-001"}));
    fireEvent.click(await screen.findByRole("button", {name: "Arhivează contractul"}));

    await waitFor(() => expect(archiveCalls).toBe(1));
  });

  it("restaurează un contract arhivat în fluxul anterior", async () => {
    const archivedContract = {...contract, status: "archived", archived_from_status: "draft"};
    let restoreCalls = 0;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/contracts?")) return Promise.resolve(response([archivedContract]));
      if (url.endsWith("/contracts/contract-1/restore") && init?.method === "POST") {
        restoreCalls += 1;
        return Promise.resolve(response({...archivedContract, status: "draft", archived_from_status: null}));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><MemoryRouter><ContractsPage/></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText(/din 01\.01\.2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Restaurează contractul CTR-001"}));

    await waitFor(() => expect(restoreCalls).toBe(1));
  });

  it("folosește controalele HeroUI și regulile comerciale pentru un contract nou fără TVA", async () => {
    const fetchMock = newContractFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><MemoryRouter><ContractsPage/></MemoryRouter></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", {name: /Contract nou/}));
    await screen.findByRole("dialog");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/settings/currencies?"), expect.anything()));
    expect(screen.getByLabelText("Data semnării")).toBeInTheDocument();
    expect(screen.getByLabelText("Începe la")).toBeInTheDocument();
    expect(screen.getByLabelText("Se încheie la")).toBeInTheDocument();
    expect(screen.getByLabelText("Monedă")).toBeInTheDocument();
    expect(screen.getByLabelText("TVA")).toBeInTheDocument();
    expect(await screen.findByText("Fără TVA · 0%", {selector: "button *"})).toBeInTheDocument();
  });

  it("blochează salvarea când firma este plătitoare de TVA fără profil activ", async () => {
    companyContext.isVatPayer = true;
    vi.stubGlobal("fetch", newContractFetch());

    render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}><MemoryRouter><ContractsPage/></MemoryRouter></QueryClientProvider>);

    fireEvent.click(await screen.findByRole("button", {name: /Contract nou/}));

    expect(await screen.findByText(/nu are niciun profil TVA activ/)).toBeInTheDocument();
    expect(screen.getByRole("button", {name: /Salvează ciorna/})).toBeDisabled();
  });
});
