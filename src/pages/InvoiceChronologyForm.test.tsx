import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, expect, it, vi} from "vitest";
import {NewInvoicePage} from "./NewInvoicePage";

vi.mock("../components/AppShell", () => ({useCompany: () => ({company: {id: "company-1"}})}));
vi.mock("../components/FormControls", async (importOriginal) => ({
  ...await importOriginal<typeof import("../components/FormControls")>(),
  AppDatePicker: ({ariaLabel, value, minValue, maxValue, onChange}: {ariaLabel: string; value: string; minValue?: string; maxValue?: string; onChange: (value: string) => void}) =>
    <input aria-label={ariaLabel} type="text" value={value} min={minValue} max={maxValue} onChange={(event) => onChange(event.target.value)} />,
}));
afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});
it("uses the series date floor in the calendar and blocks a stale draft until corrected", async () => {
  const draft = {id: "draft-1", customer: {id: "customer-1"}, invoice_series_id: "series-1", status: "draft", document_type: "invoice", locale: "ro", issue_date: "2026-09-08", due_date: "2026-09-30", currency: "RON", minimum_issue_date: "2026-09-09", lines: [{id: "line-1", description: "Servicii", quantity: "1", unit: "buc", unit_code: "C62", unit_price_cents: 10000, vat_rate: "0", vat_category: "E", vat_profile_id: "vat-1"}]};
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const data = url.endsWith("/invoices/draft-1") ? draft
      : url.includes("invoice-series") ? [{id: "series-1", name: "VNE", prefix: "VNE", is_default: true, is_active: true, minimum_issue_date: "2026-09-09", formatted_next_number: "VNE00179"}]
      : url.includes("/customers") ? [{id: "customer-1", name: "Client"}]
      : url.includes("/currencies") ? [{id: "currency-1", code: "RON", is_active: true}]
      : url.includes("vat-profiles") ? [{id: "vat-1", name: "Scutit", rate: "0", vat_category: "E", is_active: true}]
      : [];
    return new Response(JSON.stringify({data}), {headers: {"Content-Type": "application/json"}});
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/facturi/draft-1/editeaza"]}><Routes><Route path="/facturi/:id/editeaza" element={<NewInvoicePage />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole("alert")).toHaveTextContent("09.09.2026");
  const date = screen.getByLabelText("Data emiterii");
  expect(date).toHaveAttribute("min", "2026-09-09");
  expect(screen.getByRole("button", {name: /Emite/})).toBeDisabled();
  fireEvent.change(date, {target: {value: "2026-09-09"}});
  await waitFor(() => expect(screen.getByRole("button", {name: /Emite/})).toBeEnabled());
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
