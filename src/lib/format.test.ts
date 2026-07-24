import {describe, expect, it} from "vitest";
import type {Invoice} from "./types";
import {displayStatus} from "./format";

describe("displayStatus", () => {
  const today = new Date("2026-07-24T12:00:00Z");

  it("does not mark a fully paid past-due invoice as overdue", () => {
    expect(displayStatus({
      status: "issued",
      due_date: "2026-07-01",
      payment_status: "paid",
    } as Invoice, today)).toBe("issued");
  });

  it("marks an unpaid past-due invoice as overdue", () => {
    expect(displayStatus({
      status: "issued",
      due_date: "2026-07-01",
      payment_status: "unpaid",
    } as Invoice, today)).toBe("overdue");
  });
});
