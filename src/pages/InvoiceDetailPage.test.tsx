import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {InvoiceDetailPage} from "./InvoiceDetailPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({data}), {status, headers: {"Content-Type": "application/json"}});

const invoice = {
  id: "invoice-1",
  company_profile: {id: "company-1", legal_name: "ACME SRL", tax_id: "12345674", address: null},
  customer: {name: "CLIENT SRL", tax_id: "34567894", registration_number: null, address: null},
  status: "issued",
  document_type: "invoice",
  corrects_invoice_id: null,
  corrected_invoice: null,
  corrections: [],
  number: 1,
  formatted_number: "INV-0001",
  issue_date: "2026-07-24",
  due_date: "2026-08-24",
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
  subtotal_cents_ron: 10000,
  vat_cents_ron: 1900,
  total_cents_ron: 11900,
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

describe("InvoiceDetailPage SPV", () => {
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
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter initialEntries={["/facturi/invoice-1"]}>
          <Routes><Route path="/facturi/:id" element={<InvoiceDetailPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const button = await screen.findByRole("button", {name: "Trimite în SPV"});
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => expect(submitCount).toBe(1));
    expect(window.confirm).toHaveBeenCalledWith("Trimiți explicit această factură în ANAF SPV?");
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

    expect(await screen.findByText("INV-0002")).toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Duplică"})).not.toBeInTheDocument();
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
});
