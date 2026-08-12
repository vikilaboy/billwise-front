import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {
  InvoiceDetailPage,
  isCreditCancellationUnavailable,
  isSpvCancellationUnavailable,
} from "./InvoiceDetailPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({data}), {status, headers: {"Content-Type": "application/json"}});

const invoice = {
  id: "invoice-1",
  company_profile: {id: "company-1", legal_name: "ACME SRL", tax_id: "12345674", address: null},
  customer: {id: "customer-1", name: "CLIENT SRL", tax_id: "34567894", registration_number: null, address: null},
  status: "issued",
  document_type: "invoice",
  financial_direction: "debit",
  adjustment_reason: null,
  adjustment_description: null,
  corrects_invoice_id: null,
  corrected_invoice: null,
  corrections: [],
  number: 1,
  formatted_number: "INV-0001",
  issue_date: "2026-07-24",
  due_date: "2026-08-24",
  billing_period_start: null,
  billing_period_end: null,
  issued_at: "2026-07-24T10:00:00Z",
  cancelled_at: null,
  cancellation_reason: null,
  currency: "RON",
  exchange_rate: null,
  exchange_rate_day: null,
  notes: null,
  subtotal_cents: 10000,
  vat_cents: 1900,
  total_cents: 11900,
  signed_subtotal_cents: 10000,
  signed_vat_cents: 1900,
  signed_total_cents: 11900,
  subtotal_cents_ron: 10000,
  vat_cents_ron: 1900,
  total_cents_ron: 11900,
  signed_subtotal_cents_ron: 10000,
  signed_vat_cents_ron: 1900,
  signed_total_cents_ron: 11900,
  paid_cents: 0,
  issued_corrections_cents: 0,
  adjusted_total_cents: 11900,
  credit_allocations_cents: 0,
  balance_cents: 11900,
  overpaid_cents: 0,
  available_overpaid_cents: 0,
  allocated_credit_cents: 0,
  refunded_credit_cents: 0,
  available_credit_cents: 0,
  references: [],
  lines: [],
  vat_breakdown: [],
  latest_efactura_submission: null,
  efactura_eligibility: {eligible: true, reason: null},
  created_at: null,
  updated_at: null,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("InvoiceDetailPage credit cancellation", () => {
  it("nu promite anularea unui document de credit deja comunicat", () => {
    expect(isCreditCancellationUnavailable("credit_note", [{status: "sent"}], false)).toBe(true);
    expect(isCreditCancellationUnavailable("correction", [{status: "outcome_unknown"}], false)).toBe(true);
    expect(isCreditCancellationUnavailable("credit_note", [], true)).toBe(true);
    expect(isCreditCancellationUnavailable("credit_note", [{status: "failed"}], false)).toBe(false);
    expect(isCreditCancellationUnavailable("invoice", [{status: "sent"}], false)).toBe(false);
  });

  it("nu promite anularea cât timp starea SPV o interzice sau nu poate fi verificată", () => {
    for (const status of ["queued", "sending", "sent", "processing", "accepted", "delivery_unknown"] as const) {
      expect(isSpvCancellationUnavailable([{status}], false)).toBe(true);
    }

    expect(isSpvCancellationUnavailable([], true)).toBe(true);
    expect(isSpvCancellationUnavailable([{status: "rejected"}], false)).toBe(false);
    expect(isSpvCancellationUnavailable([{status: "failed"}], false)).toBe(false);
    expect(isSpvCancellationUnavailable([], false)).toBe(false);
  });
});

describe("InvoiceDetailPage SPV", () => {
  it("păstrează layoutul facturii fără stiluri inline incompatibile cu CSP", async () => {
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/invoices/invoice-1")) return Promise.resolve(json(invoice));
      if (url.endsWith("/payments") || url.endsWith("/deliveries") || url.endsWith("/efactura/submissions")) {
        return Promise.resolve(json([]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const {container} = render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/invoice-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("INV-0001")).length).toBeGreaterThan(0);
    expect(container.querySelector(".invoice-detail-grid")).toBeInTheDocument();
    expect(container.querySelector("style")).not.toBeInTheDocument();
  });

  it("cere confirmare și nu pornește două depuneri la click repetat", async () => {
    let submissions: unknown[] = [];
    let submitCount = 0;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/invoices/invoice-1")) return Promise.resolve(json(invoice));
      if (url.endsWith("/efactura/submissions") && init?.method === "POST") {
        submitCount += 1;
        submissions = [{
          id: "submission-1",
          status: "queued",
          upload_index: null,
          download_id: null,
          error: null,
          last_error_code: null,
          has_confirmation: false,
          next_poll_at: "2099-01-01T00:00:00Z",
          last_polled_at: null,
          poll_attempts: 0,
          submitted_at: null,
          created_at: "2026-07-24T10:00:00Z",
        }];
        return Promise.resolve(json(submissions[0], 202));
      }
      if (url.endsWith("/efactura/submissions")) return Promise.resolve(json(submissions));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/invoice-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const button = await screen.findByRole("button", {name: "Trimite în SPV"});
    fireEvent.click(button);
    expect(await screen.findByText("Trimiți factura în ANAF SPV?")).toBeInTheDocument();
    const confirm = screen.getByRole("button", {name: "Trimite în SPV"});
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(submitCount).toBe(1));
    expect(await screen.findByText("În coadă")).toBeInTheDocument();
  });

  it("nu permite duplicarea unei corecții", async () => {
    const correction = {
      ...invoice,
      id: "correction-1",
      document_type: "correction",
      formatted_number: "INV-0002",
      total_cents: -11900,
      total_cents_ron: -11900,
      efactura_eligibility: {eligible: false, reason: "Correction"},
    };
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/invoices/correction-1")) return Promise.resolve(json(correction));
      if (url.endsWith("/payments") || url.endsWith("/deliveries") || url.endsWith("/efactura/submissions")) {
        return Promise.resolve(json([]));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/correction-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText("INV-0002")).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", {name: "Mai multe acțiuni"}));
    expect(screen.queryByText("Duplică factura")).not.toBeInTheDocument();
  });

  it("permite verificarea manuală a unei trimiteri aflate în procesare", async () => {
    const submission = {
      id: "submission-1",
      status: "processing",
      upload_index: "4001",
      download_id: null,
      error: null,
      last_error_code: null,
      has_confirmation: false,
      next_poll_at: "2099-01-01T00:00:00Z",
      last_polled_at: null,
      poll_attempts: 2,
      submitted_at: "2026-07-24T10:00:00Z",
      created_at: "2026-07-24T10:00:00Z",
    };
    let syncCount = 0;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/invoices/invoice-1")) return Promise.resolve(json(invoice));
      if (url.endsWith("/submissions/submission-1/sync") && init?.method === "POST") {
        syncCount += 1;
        return Promise.resolve(json(submission, 202));
      }
      if (url.endsWith("/payments") || url.endsWith("/deliveries")) return Promise.resolve(json([]));
      if (url.endsWith("/efactura/submissions")) return Promise.resolve(json([submission]));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/invoice-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Verifică acum în ANAF"}));
    await waitFor(() => expect(syncCount).toBe(1));
  });

  it("înregistrează explicit rambursarea unei note de credit și păstrează registrul separat de încasări", async () => {
    const creditNote = {
      ...invoice,
      id: "credit-1",
      formatted_number: "NC-0001",
      document_type: "credit_note",
      financial_direction: "credit",
      signed_subtotal_cents: -10000,
      signed_vat_cents: -1900,
      signed_total_cents: -11900,
      payment_status: "not_applicable",
      balance_cents: 0,
      available_credit_cents: 11900,
      efactura_eligibility: {eligible: false, reason: "outside_jurisdiction"},
    };
    let refundBody: Record<string, unknown> | null = null;
    const fetchMock = vi.fn().mockImplementation((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/invoices/credit-1")) return Promise.resolve(json(creditNote));
      if (url.includes("/customer-credit-usages?") && !init?.method) return Promise.resolve(json([]));
      if (url.endsWith("/customer-credit-usages") && init?.method === "POST") {
        refundBody = JSON.parse(String(init.body));
        return Promise.resolve(json({id: "usage-1", ...refundBody}, 201));
      }
      if (url.endsWith("/deliveries") || url.endsWith("/efactura/submissions")) return Promise.resolve(json([]));
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/credit-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole("button", {name: "Înregistrează rambursare"}));
    fireEvent.change(screen.getByRole("spinbutton", {name: "Sumă"}), {target: {value: "25"}});
    fireEvent.click(screen.getByRole("button", {name: "Înregistrează rambursarea"}));

    await waitFor(() => expect(refundBody).not.toBeNull());
    expect(refundBody).toMatchObject({
      source_credit_note_id: "credit-1",
      type: "refund",
      amount_cents: 2500,
      currency: "RON",
      method: "bank_transfer",
    });
    expect(refundBody).not.toHaveProperty("target_invoice_id");
  });
});
