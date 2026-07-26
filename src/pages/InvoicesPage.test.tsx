import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {InvoicesPage} from "./InvoicesPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

const invoice = {
  id: "invoice-1",
  formatted_number: "INV-0001",
  customer: {name: "CLIENT SRL"},
  status: "issued",
  document_type: "invoice",
  payment_status: "unpaid",
  issue_date: "2026-07-24",
  due_date: "2026-08-24",
  currency: "RON",
  total_cents: 11900,
  paid_cents: 0,
  balance_cents: 11900,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("InvoicesPage actions", () => {
  it("expune acțiunea bulk și marchează o factură ca încasată numai după confirmarea HeroUI", async () => {
    let paymentBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/companies/company-1/invoices?")) {
        return Promise.resolve(new Response(JSON.stringify({
          data: [invoice],
          meta: {pagination: {current_page: 1, per_page: 20, total: 1, last_page: 1}},
        }), {status: 200, headers: {"Content-Type": "application/json"}}));
      }
      if (url.endsWith("/invoices/invoice-1/payments") && init?.method === "POST") {
        paymentBody = JSON.parse(String(init.body));
        return Promise.resolve(new Response(JSON.stringify({data: {id: "payment-1"}}), {
          status: 201,
          headers: {"Content-Type": "application/json"},
        }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter><InvoicesPage /></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByLabelText("Selectează INV-0001"));
    fireEvent.click(await screen.findByRole("button", {name: "Marchează factura selectată ca încasată"}));
    expect(await screen.findByText("Marchezi factura selectată ca încasată?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Renunță"}));
    fireEvent.click(screen.getByRole("button", {name: "Golește selecția"}));

    fireEvent.click(await screen.findByRole("button", {name: "Marchează INV-0001 ca încasată"}));
    expect(await screen.findByText("Marchezi factura ca încasată?")).toBeInTheDocument();
    expect(paymentBody).toBeNull();

    fireEvent.click(screen.getByRole("button", {name: "Marchează încasată"}));

    await waitFor(() => expect(paymentBody).toMatchObject({
      amount_cents: 11900,
      currency: "RON",
      method: "bank_transfer",
    }));
  });
});
