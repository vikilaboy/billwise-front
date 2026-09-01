import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "../lib/apiErrorPresentation";
import {bucharestRunAt, RecurringPage} from "./RecurringPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RecurringPage", () => {
  it("calculează ora București corect în iarnă și vară", () => {
    expect(bucharestRunAt("2028-01-31")).toBe("2028-01-31T09:00:00+02:00");
    expect(bucharestRunAt("2028-07-31")).toBe("2028-07-31T09:00:00+03:00");
  });

  it("păstrează filtrul server-side și explică faptul că generează doar ciorne", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [],
      meta: {pagination: {current_page: 1, per_page: 20, total: 0, last_page: 1}},
    }), {status: 200, headers: {"Content-Type": "application/json"}}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Șabloanele generează numai ciorne/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: /Starea șabloanelor recurente/}));
    fireEvent.click(await screen.findByRole("option", {name: "Active"}));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("_filter%5Bstatus%5D=active"),
    )).toBe(true));
  });

  it("diferențiază semantic statusurile șabloanelor", async () => {
    const template = {
      id: "template-active",
      name: "Abonament lunar",
      customer_id: "customer-1",
      invoice_series_id: "series-1",
      frequency: "monthly",
      timezone: "Europe/Bucharest",
      start_date: "2028-01-01",
      end_date: null,
      next_run_at: "2028-02-01T07:00:00Z",
      payment_terms_days: 15,
      currency: "RON",
      locale: "ro",
      lines: [],
      notes: null,
      status: "active",
      mode: "create_draft",
      customer: {id: "customer-1", name: "Client Test"},
      series: {id: "series-1", name: "Factura"},
      runs: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        template,
        {...template, id: "template-paused", name: "Abonament pauzat", status: "paused"},
        {...template, id: "template-archived", name: "Abonament arhivat", status: "archived"},
      ],
      meta: {pagination: {current_page: 1, per_page: 20, total: 3, last_page: 1}},
    }), {status: 200, headers: {"Content-Type": "application/json"}}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findByText("Activ")).closest(".chip")).toHaveClass("chip--success", "chip--soft");
    expect(screen.getByText("Pauzat").closest(".chip")).toHaveClass("chip--warning", "chip--soft");
    expect(screen.getByText("Arhivat").closest(".chip")).toHaveClass("chip--default", "chip--soft");
  });

  it("publică global motivul când generarea manuală nu creează ciorna", async () => {
    const template = {
      id: "template-1",
      name: "Abonament lunar",
      customer_id: "customer-1",
      invoice_series_id: "series-1",
      frequency: "monthly",
      timezone: "Europe/Bucharest",
      start_date: "2028-01-01",
      end_date: null,
      next_run_at: "2028-02-01T07:00:00Z",
      payment_terms_days: 15,
      currency: "RON",
      locale: "ro",
      lines: [],
      notes: null,
      status: "active",
      mode: "create_draft",
      customer: {id: "customer-1", name: "Client Test"},
      series: {id: "series-1", name: "Factura"},
      runs: [],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: [template],
        meta: {pagination: {current_page: 1, per_page: 20, total: 1, last_page: 1}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {status: "failed", error: "Seria nu mai este activă.", invoice_id: null},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const apiErrorEvent = new Promise<ApiErrorEventDetail>((resolve) => {
      window.addEventListener(API_ERROR_EVENT, (event) => {
        resolve((event as CustomEvent<ApiErrorEventDetail>).detail);
      }, {once: true});
    });
    fireEvent.click(await screen.findByRole("button", {name: /Generează acum/}));

    await expect(apiErrorEvent).resolves.toMatchObject({
      problem: {
        title: "Ciorna recurentă nu a putut fi generată",
        detail: "Seria nu mai este activă.",
      },
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("trimite snapshot-ul fiscal complet pentru opțiunea fără TVA", async () => {
    const emptyList = {data: [], meta: {pagination: {current_page: 1, per_page: 100, total: 0, last_page: 1}}};
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith("/preview")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: {
            scheduled_for: "2028-01-01T07:00:00Z",
            issue_date: "2028-01-01",
            due_date: "2028-01-16",
            period: {start: "2027-12-01", end: "2027-12-31"},
            lines: [{description: "Servicii"}],
          },
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
      }

      return Promise.resolve(new Response(JSON.stringify(emptyList), {
        status: 200,
        headers: {"Content-Type": "application/json"},
      }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}, mutations: {retry: false}}})}>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Șablon nou"}));
    expect(await screen.findByText(/Nu există profiluri TVA configurate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Previzualizează"}));

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/preview"))).toBe(true));
    const previewCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/preview"));
    const body = JSON.parse(String(previewCall?.[1]?.body));

    expect(body.lines[0]).toMatchObject({
      vat_profile_id: null,
      vat_rate: "0.00",
      vat_category: "O",
      vat_exemption_reason: "Neînregistrat în scopuri de TVA / Not registered for VAT",
    });
  });
});
