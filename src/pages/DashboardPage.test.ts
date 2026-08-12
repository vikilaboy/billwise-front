import {describe, expect, it} from "vitest";
import type {Invoice} from "../lib/types";
import {
  clearDashboardPeriods,
  dashboardPeriodQuery,
  readDashboardPeriod,
  writeDashboardPeriod,
} from "../lib/dashboardPeriods";
import {balanceRonCents, isOverdue, performanceDocumentDetail} from "./DashboardPage";

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

describe("Dashboard period controls", () => {
  it("shows invoices and credit documents separately with correct Romanian plurals", () => {
    expect(performanceDocumentDetail(2, 1, "2026-07-01", "2026-07-26"))
      .toBe("2 facturi · 1 document de credit · 01.07.2026 – 26.07.2026");
    expect(performanceDocumentDetail(1, 2, "2026-07-01", "2026-07-01"))
      .toBe("1 factură · 2 documente de credit · 01.07.2026");
  });

  it("keeps each dashboard section independent in the URL", () => {
    let params = writeDashboardPeriod(new URLSearchParams(), "performance", {
      preset: "current_quarter",
      comparison: "previous_year",
    });
    params = writeDashboardPeriod(params, "purchases", {
      preset: "last_30_days",
      comparison: "previous_period",
    });

    expect(readDashboardPeriod(params, "performance").preset).toBe("current_quarter");
    expect(readDashboardPeriod(params, "purchases").preset).toBe("last_30_days");
    expect(readDashboardPeriod(params, "efactura").preset).toBe("current_month");
  });

  it("only serializes a valid applied custom interval", () => {
    const selection = {preset: "custom", comparison: "none", from: "2026-07-01", to: "2026-07-20"} as const;
    expect(dashboardPeriodQuery(selection)).toContain("_from=2026-07-01");
    expect(dashboardPeriodQuery(selection)).toContain("_to=2026-07-20");
  });

  it("clears dashboard keys without deleting unrelated URL state", () => {
    const params = new URLSearchParams("performance_preset=current_month&onboarding=complete");
    const cleared = clearDashboardPeriods(params);
    expect(cleared.has("performance_preset")).toBe(false);
    expect(cleared.get("onboarding")).toBe("complete");
  });
});
