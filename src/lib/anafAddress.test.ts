import {describe, expect, it} from "vitest";
import {suggestAnafAddress} from "./anafAddress";

const states = [
  {id: "cj", country_code: "RO", code: "CJ", name: "Cluj"},
  {id: "b", country_code: "RO", code: "B", name: "București"},
];
const localities = [
  {id: "cluj", state_id: "cj", siruta_code: "1", name: "Cluj-Napoca", type: null, superior_siruta: null},
];

describe("suggestAnafAddress", () => {
  it("propune potriviri din nomenclator fără a fabrica valori", () => {
    const result = suggestAnafAddress("Str. Memorandumului 1, Cluj-Napoca, Cluj, 400114", states, localities);

    expect(result.state?.id).toBe("cj");
    expect(result.locality?.id).toBe("cluj");
    expect(result.postalCode).toBe("400114");
  });

  it("nu propune o potrivire ambiguă sau absentă", () => {
    expect(suggestAnafAddress("Adresă necunoscută", states, localities)).toEqual({});
  });
});
