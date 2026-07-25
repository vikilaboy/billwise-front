import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {FiscalVaultPage} from "./FiscalVaultPage";
import {FiscalVaultDetailPage} from "./FiscalVaultDetailPage";
import {PurchaseInvoiceDetailPage} from "./PurchaseInvoiceDetailPage";
import {PurchaseInvoicesPage, PURCHASE_INVOICE_SYNC_POLLING_MS, shouldPollPurchaseInvoices} from "./PurchaseInvoicesPage";

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

  it("afișează ultima eroare de sincronizare ANAF", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/efactura/spv/connection")) {
        return Promise.resolve(new Response(JSON.stringify({data: {
          status: "active", connected: true, access_token_expires_at: null, reauthorization_required: false, last_error_code: null,
          inbox_enabled_at: "2026-07-25T09:00:00Z", inbox_cursor_at: "2026-07-25T10:00:00Z",
          inbox_last_synced_at: "2026-07-25T10:00:00Z", inbox_last_error_code: "anaf_inbox_sync_failed",
        }}), {status: 200, headers: {"Content-Type": "application/json"}}));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 0}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("anaf_inbox_sync_failed");
  });

  it("afișează eroarea primită la pornirea sincronizării", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          title: "Serviciu indisponibil",
          detail: "Conexiunea ANAF trebuie reautorizată.",
          status: 503,
        }), {status: 503, headers: {"Content-Type": "application/problem+json"}}));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 0}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Sincronizează e-Factura"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conexiunea ANAF trebuie reautorizată.");
  });

  it("afișează eroarea primită la verificarea facturii", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return Promise.resolve(new Response(JSON.stringify({
          title: "Conflict",
          detail: "Factura nu mai poate fi modificată.",
          status: 409,
        }), {status: 409, headers: {"Content-Type": "application/problem+json"}}));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: {
          id: "invoice-1", document_type: "invoice", number: "OMV-1", issue_date: "2026-07-25", due_date: null,
          currency: "RON", subtotal_cents: 10000, vat_cents: 1900, total_cents: 11900, import_status: "imported",
          review_status: "unreviewed", reviewed_at: null,
          supplier: {id: "supplier-1", name: "OMV Petrom", tax_id: "1590082", country_code: "RO", email: null, address: null},
          vault_item_id: "vault-1", lines: [], created_at: "2026-07-25T10:00:00Z",
        },
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/achizitii/invoice-1"]}>
          <Routes><Route path="/achizitii/:id" element={<PurchaseInvoiceDetailPage/>}/></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Marchează verificată"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("Factura nu mai poate fi modificată.");
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

  it("afișează metadatele ANAF în pagina originalului", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({data: {
      id: "vault-1", source: "anaf_efactura", direction: "received", document_type: "invoice", document_number: "OMV-1",
      issue_date: "2026-07-25", supplier_name: "OMV Petrom", supplier_tax_id: "1590082", status: "imported",
      signature_status: "preserved_not_verified", archived_at: "2026-07-25T10:00:00Z", retention_policy: "legal_general",
      retain_until: "2032-07-01", legal_hold_at: null, last_verified_at: "2026-07-25T10:00:00Z",
      integrity_status: "verified", original: {filename: "original.zip", size_bytes: 100, sha256: "abc"},
      purchase_invoice_id: "invoice-1", anaf_message_id: "msg-1", anaf_download_id: "download-1",
      anaf_available_at: "2026-07-25T09:30:00Z",
    }}), {status: 200, headers: {"Content-Type": "application/json"}})));

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/seif-fiscal/vault-1"]}>
          <Routes><Route path="/seif-fiscal/:vaultItemId" element={<FiscalVaultDetailPage/>}/></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("msg-1")).toBeInTheDocument();
    expect(screen.getByText("download-1")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Descarcă originalul ANAF"})).toBeEnabled();
  });
});
