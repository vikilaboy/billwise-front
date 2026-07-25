import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {FiscalVaultPage} from "./FiscalVaultPage";
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

  it("afișează starea sigiliului MF și confirmă eliminarea legal hold", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "vault-1", source: "anaf_efactura", direction: "received", document_type: "invoice", document_number: "OMV-1",
        issue_date: "2026-07-25", supplier_name: "OMV Petrom", supplier_tax_id: "1590082", status: "imported",
        signature_status: "preserved_not_verified", archived_at: "2026-07-25T10:00:00Z", retention_policy: "legal_general",
        retain_until: "2032-07-01", legal_hold_at: "2026-07-25T11:00:00Z", last_verified_at: "2026-07-25T10:00:00Z",
        integrity_status: "verified", original: {filename: "original.zip", size_bytes: 100, sha256: "abc"}, purchase_invoice_id: "invoice-1",
      }],
      meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 1}, storage: {used_bytes: 100}},
    }), {status: 200, headers: {"Content-Type": "application/json"}}));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter><FiscalVaultPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Păstrat, neverificat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Elimină blocajul legal"}));
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
