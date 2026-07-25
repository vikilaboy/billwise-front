import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PurchaseInvoiceDetailPage} from "./PurchaseInvoiceDetailPage";
import {PURCHASE_INVOICE_SYNC_POLLING_MS, shouldPollPurchaseInvoices} from "./PurchaseInvoicesPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({
    company: {id: "company-1", legal_name: "ACME SRL"},
    can: () => true,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("purchase invoice pages", () => {
  it("afișează distinct statusul care necesită atenție", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        id: "invoice-1",
        document_type: "invoice",
        number: "OMV-1",
        issue_date: "2026-07-25",
        due_date: null,
        currency: "RON",
        subtotal_cents: 10000,
        vat_cents: 1900,
        total_cents: 11900,
        import_status: "imported",
        review_status: "needs_attention",
        reviewed_at: null,
        supplier: {id: "supplier-1", name: "OMV Petrom", tax_id: "1590082", country_code: "RO", email: null, address: null},
        vault_item_id: "vault-1",
        lines: [],
        created_at: "2026-07-25T10:00:00Z",
      },
    }), {status: 200, headers: {"Content-Type": "application/json"}})));

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/achizitii/invoice-1"]}>
          <Routes>
            <Route path="/achizitii/:id" element={<PurchaseInvoiceDetailPage/>}/>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Necesită atenție")).toBeInTheDocument();
  });

  it("limitează polling-ul după sincronizare la fereastra configurată", () => {
    const startedAt = 1_000;
    const pollingUntil = startedAt + PURCHASE_INVOICE_SYNC_POLLING_MS;

    expect(shouldPollPurchaseInvoices(pollingUntil, startedAt)).toBe(true);
    expect(shouldPollPurchaseInvoices(pollingUntil, pollingUntil - 1)).toBe(true);
    expect(shouldPollPurchaseInvoices(pollingUntil, pollingUntil)).toBe(false);
  });
});
