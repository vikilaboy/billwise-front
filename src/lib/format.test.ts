import {describe, expect, it} from "vitest";
import type {Invoice} from "./types";
import {dateTimeSeconds, displayStatus} from "./format";

describe("dateTimeSeconds", () => {
  it("includes date, hour, minute, and second", () => {
    expect(dateTimeSeconds("2026-09-07T12:34:56Z")).toMatch(/^07\.09\.2026, \d{2}:34:56$/);
  });
});

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
