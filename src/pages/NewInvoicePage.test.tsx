import {describe, expect, it} from "vitest";
import {creditNoteSeriesPayload, manualRonTotalsAreValid, submissionDisabledState} from "./NewInvoicePage";

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

  it("permite salvarea ciornei înainte ca nota de credit să fie gata de emis", () => {
    expect(submissionDisabledState(false, true, false, true)).toEqual({
      issue: true,
      draft: false,
    });
    expect(submissionDisabledState(false, true, true, true)).toEqual({
      issue: false,
      draft: false,
    });
    expect(submissionDisabledState(false, true, false, false)).toEqual({
      issue: true,
      draft: true,
    });
  });
});
