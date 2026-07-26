import {render, screen} from "@testing-library/react";
import {describe, expect, it} from "vitest";
import type {Invoice} from "../lib/types";
import {InvoiceDocumentPreview} from "./InvoiceDocumentPreview";

const invoice = {
  id: "invoice-1",
  company_profile: {
    legal_name: "ACME SRL",
    trade_name: "ACME",
    tax_id: "12345674",
    registration_number: "J40/1/2020",
    email: "office@example.test",
    address: null,
  },
  customer: {
    name: "CLIENT LTD",
    tax_id: "GB123",
    registration_number: "10001",
    email: "client@example.test",
    address: null,
  },
  status: "issued",
  document_type: "invoice",
  corrected_invoice: null,
  formatted_number: "INV-0001",
  issue_date: "2026-07-24",
  due_date: "2026-08-24",
  currency: "EUR",
  exchange_rate: "5.0000",
  exchange_rate_day: "2026-07-23",
  exchange_rate_source: "bnr",
  locale: "en",
  notes: "Payment reference INV-0001",
  subtotal_cents: 10000,
  vat_cents: 1900,
  total_cents: 11900,
  subtotal_cents_ron: 50000,
  vat_cents_ron: 9500,
  total_cents_ron: 59500,
  bank_accounts_snapshot: [{
    bank_name: "Example Bank",
    scheme: "iban",
    currency_code: "EUR",
    iban: "RO00EXAMPLE",
    swift_bic: "EXAMPLER0",
    sort_code: null,
    account_number: null,
    routing_number: null,
  }],
  lines: [{
    id: "line-1",
    description: "Consulting / Consulting services",
    quantity: "1.00",
    unit: "oră",
    unit_code: "HUR",
    unit_price_cents: 10000,
    vat_rate: "19.00",
    vat_category: "S",
    subtotal_cents: 10000,
    vat_cents: 1900,
    total_cents: 11900,
  }],
  vat_breakdown: [{
    vat_category: "S",
    vat_rate: "19.00",
    taxable_cents: 10000,
    vat_cents: 1900,
    vat_exemption_code: null,
    vat_exemption_reason: null,
  }],
} as Invoice;

describe("InvoiceDocumentPreview", () => {
  it("reproduce structura și traducerile documentului PDF bilingv", () => {
    render(<InvoiceDocumentPreview invoice={invoice} />);

    expect(screen.getByText("Supplier")).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("VAT breakdown")).toBeInTheDocument();
    expect(screen.getByText("Bank accounts")).toBeInTheDocument();
    expect(screen.getByText("RO00EXAMPLE · SWIFT EXAMPLER0")).toBeInTheDocument();
    expect(screen.getAllByText("119,00 EUR").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/This invoice is valid without a signature or stamp/)).toBeInTheDocument();
  });
});
