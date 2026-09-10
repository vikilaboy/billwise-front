import {describe, expect, it} from "vitest";
import {invoiceDateError} from "./invoiceChronology";

describe("invoice chronology", () => {
  it("blocks September 8 after September 9, accepts the same day and later", () => {
    expect(invoiceDateError("2026-09-08", "2026-09-09", "2026-09-10")).toContain("09.09.2026");
    expect(invoiceDateError("2026-09-09", "2026-09-09", "2026-09-10")).toBeNull();
    expect(invoiceDateError("2026-09-10", "2026-09-09", "2026-09-10")).toBeNull();
  });
  it("recalculates after changing series and rejects missing or future dates", () => {
    expect(invoiceDateError("2026-09-08", null, "2026-09-10")).toBeNull();
    expect(invoiceDateError("2026-09-08", "2026-09-09", "2026-09-10")).not.toBeNull();
    expect(invoiceDateError("2026-09-11", null, "2026-09-10")).toContain("viitor");
    expect(invoiceDateError("", null, "2026-09-10")).not.toBeNull();
  });
});
