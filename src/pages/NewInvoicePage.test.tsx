import {describe, expect, it} from "vitest";
import {creditNoteSeriesPayload, manualRonTotalsAreValid} from "./NewInvoicePage";

describe("NewInvoicePage credit-note payload", () => {
  it("trimite seria selectată numai la crearea documentului", () => {
    expect(creditNoteSeriesPayload(undefined, "series-selected")).toEqual({
      invoice_series_id: "series-selected",
    });
    expect(creditNoteSeriesPayload("existing-credit-note", "series-selected")).toEqual({});
    expect(creditNoteSeriesPayload(undefined, undefined)).toEqual({});
  });

  it("validează totalurile RON documentate la fel ca API-ul", () => {
    expect(manualRonTotalsAreValid("100", "19", "119", 1900, "Curs contractual", true)).toBe(true);
    expect(manualRonTotalsAreValid("100", "0", "100", 0, "Curs contractual", true)).toBe(true);
    expect(manualRonTotalsAreValid("0", "19", "19", 1900, "Curs contractual", true)).toBe(false);
    expect(manualRonTotalsAreValid("100", "19", "119", 0, "Curs contractual", true)).toBe(false);
    expect(manualRonTotalsAreValid("100", "0", "100", 1900, "Curs contractual", true)).toBe(false);
    expect(manualRonTotalsAreValid("100", "19", "118.99", 1900, "Curs contractual", true)).toBe(false);
  });
});
