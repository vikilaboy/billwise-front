import {describe, expect, it} from "vitest";
import type {Invoice} from "../lib/types";
import {balanceRonCents, isOverdue} from "./DashboardPage";

function invoice(attributes: Partial<Invoice>): Invoice {
  return {
    total_cents: 10000,
    total_cents_ron: 50000,
    balance_cents: 10000,
    payment_status: "unpaid",
    ...attributes,
  } as Invoice;
}

describe("Dashboard payment-aware calculations", () => {
  it("converts only the remaining foreign-currency balance to RON", () => {
    expect(balanceRonCents(invoice({balance_cents: 2500}))).toBe(12500);
    expect(balanceRonCents(invoice({balance_cents: 0, payment_status: "paid"}))).toBe(0);
  });

  it("uses the API payment status instead of due date alone", () => {
    expect(isOverdue(invoice({balance_cents: 0, payment_status: "paid"}))).toBe(false);
    expect(isOverdue(invoice({balance_cents: 2500, payment_status: "overdue"}))).toBe(true);
  });
});
