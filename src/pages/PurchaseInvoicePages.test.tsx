import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {FiscalVaultPage, isCurrentExportDownload} from "./FiscalVaultPage";
import {FiscalVaultDetailPage} from "./FiscalVaultDetailPage";
import {PurchaseInvoiceDetailPage} from "./PurchaseInvoiceDetailPage";
import {PurchaseInvoicesPage, PURCHASE_INVOICE_SYNC_POLLING_MS, shouldPollPurchaseInvoices} from "./PurchaseInvoicesPage";

const companyMock = vi.hoisted(() => ({
  current: {id: "company-1", legal_name: "ACME SRL"},
}));

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({
    company: companyMock.current,
    can: () => true,
  }),
}));

afterEach(() => {
  companyMock.current = {id: "company-1", legal_name: "ACME SRL"};
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

  it("nu transferă feedbackul sincronizării la altă firmă", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const fetchMock = vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({data: {queued: true}}), {status: 202, headers: {"Content-Type": "application/json"}}));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 0}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Sincronizează e-Factura"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Sincronizarea a fost pusă în coadă");
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/companies/company-1/efactura/inbox/sync"), expect.anything());

    companyMock.current = {id: "company-2", legal_name: "Beta SRL"};
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/Sincronizarea a fost pusă în coadă/)).not.toBeInTheDocument());
    expect(screen.getByRole("button", {name: "Sincronizează e-Factura"})).toBeEnabled();
  });

  it("nu afișează facturile firmei precedente cât se încarcă firma nouă", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/companies/company-2/")) return new Promise(() => {});
      return Promise.resolve(new Response(JSON.stringify({
        data: [{
          id: "invoice-a", document_type: "invoice", number: "FACTURA-A", issue_date: "2026-07-25", due_date: null,
          currency: "RON", subtotal_cents: 10000, vat_cents: 1900, total_cents: 11900, import_status: "imported",
          review_status: "unreviewed", reviewed_at: null,
          supplier: {id: "supplier-a", name: "Furnizor A", tax_id: "1590082", country_code: "RO", email: null, address: null},
          vault_item_id: "vault-a", lines: [], created_at: "2026-07-25T10:00:00Z",
        }],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 1}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("FACTURA-A")).toBeInTheDocument();
    companyMock.current = {id: "company-2", legal_name: "Beta SRL"};
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter><PurchaseInvoicesPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("FACTURA-A")).not.toBeInTheDocument();
    expect(screen.getByText("Se încarcă…")).toBeInTheDocument();
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

  it("păstrează rezultatul verificării asociat firmei de la pornirea acțiunii", async () => {
    let resolveReview!: (response: Response) => void;
    const reviewResponse = new Promise<Response>((resolve) => { resolveReview = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PATCH") return reviewResponse;
      const companyId = String(input).includes("company-2") ? "B" : "A";
      return Promise.resolve(new Response(JSON.stringify({data: {
        id: "invoice-1", document_type: "invoice", number: `FACTURA-${companyId}`, issue_date: "2026-07-25", due_date: null,
        currency: "RON", subtotal_cents: 10000, vat_cents: 1900, total_cents: 11900, import_status: "imported",
        review_status: "unreviewed", reviewed_at: null,
        supplier: {id: `supplier-${companyId}`, name: `Furnizor ${companyId}`, tax_id: "1590082", country_code: "RO", email: null, address: null},
        vault_item_id: `vault-${companyId}`, lines: [], created_at: "2026-07-25T10:00:00Z",
      }}), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/achizitii/invoice-1"]}>
          <Routes><Route path="/achizitii/:id" element={<PurchaseInvoiceDetailPage/>}/></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Marchează verificată"}));
    companyMock.current = {id: "company-2", legal_name: "Beta SRL"};
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/achizitii/invoice-1"]}>
          <Routes><Route path="/achizitii/:id" element={<PurchaseInvoiceDetailPage/>}/></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("FACTURA-B")).toBeInTheDocument();
    resolveReview(new Response(JSON.stringify({detail: "Eroare pentru firma A.", status: 409}), {status: 409, headers: {"Content-Type": "application/problem+json"}}));

    await waitFor(() => expect(client.getMutationCache().getAll()[0]?.state.status).toBe("error"));
    expect(screen.queryByText("Eroare pentru firma A.")).not.toBeInTheDocument();
  });

  it("deschide detaliul documentului direct din Seiful fiscal", async () => {
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

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/seif-fiscal"]}>
          <Routes>
            <Route path="/seif-fiscal" element={<FiscalVaultPage/>}/>
            <Route path="/seif-fiscal/:vaultItemId" element={<div>Detaliu document fiscal</div>}/>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Păstrat, neverificat")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Vezi detalii OMV-1"}));
    expect(await screen.findByText("Detaliu document fiscal")).toBeInTheDocument();
  });

  it("nu transferă feedbackul exportului Seifului la altă firmă", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_input: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          data: {id: "export-1", status: "queued", from_date: null, to_date: null, size_bytes: null, sha256: null, expires_at: null},
        }), {status: 202, headers: {"Content-Type": "application/json"}}));
      }
      return Promise.resolve(new Response(JSON.stringify({
        data: [],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 0}, storage: {used_bytes: 0}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter><FiscalVaultPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Exportă Seiful"}));
    expect(await screen.findByRole("status")).toHaveTextContent("Exportul cu manifest și hash-uri este în pregătire.");

    companyMock.current = {id: "company-2", legal_name: "Beta SRL"};
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter><FiscalVaultPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByText(/Exportul cu manifest și hash-uri este în pregătire/)).not.toBeInTheDocument());
    expect(screen.getByRole("button", {name: "Exportă Seiful"})).toBeEnabled();
  });

  it("nu transferă eroarea descărcării la următorul export al aceleiași firme", () => {
    const previousDownload = {companyId: "company-1", exportId: "export-1"};

    expect(isCurrentExportDownload(previousDownload, "company-1", "export-1")).toBe(true);
    expect(isCurrentExportDownload(previousDownload, "company-1", "export-2")).toBe(false);
    expect(isCurrentExportDownload(previousDownload, "company-2", "export-1")).toBe(false);
    expect(isCurrentExportDownload(undefined, undefined, undefined)).toBe(false);
  });

  it("nu afișează documentele fiscale ale firmei precedente cât se încarcă firma nouă", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string | URL | Request) => {
      if (String(input).includes("/companies/company-2/")) return new Promise(() => {});
      return Promise.resolve(new Response(JSON.stringify({
        data: [{
          id: "vault-a", source: "anaf_efactura", direction: "received", document_type: "invoice", document_number: "SEIF-A",
          issue_date: "2026-07-25", supplier_name: "Furnizor A", supplier_tax_id: "1590082", status: "imported",
          signature_status: "preserved_not_verified", archived_at: "2026-07-25T10:00:00Z", retention_policy: "legal_general",
          retain_until: "2032-07-01", legal_hold_at: null, last_verified_at: "2026-07-25T10:00:00Z",
          integrity_status: "verified", original: {filename: "original.zip", size_bytes: 100, sha256: "abc"}, purchase_invoice_id: "invoice-a",
        }],
        meta: {pagination: {current_page: 1, last_page: 1, per_page: 20, total: 1}, storage: {used_bytes: 100}},
      }), {status: 200, headers: {"Content-Type": "application/json"}}));
    }));
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const view = render(
      <QueryClientProvider client={client}>
        <MemoryRouter><FiscalVaultPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("SEIF-A")).toBeInTheDocument();
    companyMock.current = {id: "company-2", legal_name: "Beta SRL"};
    view.rerender(
      <QueryClientProvider client={client}>
        <MemoryRouter><FiscalVaultPage/></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("SEIF-A")).not.toBeInTheDocument();
    expect(screen.getByText("Se încarcă…")).toBeInTheDocument();
  });

  it("confirmă eliminarea legal hold înainte de actualizare", async () => {
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

    await screen.findByText("Păstrat, neverificat");
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
