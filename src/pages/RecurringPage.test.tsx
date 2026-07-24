import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
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
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "active"}});

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("_filter%5Bstatus%5D=active"),
    )).toBe(true));
  });

  it("afișează motivul când generarea manuală nu creează ciorna", async () => {
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

    fireEvent.click(await screen.findByRole("button", {name: /Generează acum/}));

    expect(await screen.findByRole("alert")).toHaveTextContent("Seria nu mai este activă.");
  });
});
