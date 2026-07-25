import {afterEach, describe, expect, it} from "vitest";
import {
  apiErrorDescription,
  clearApiFieldErrors,
  markApiFieldErrors,
} from "./apiErrorPresentation";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("API error presentation", () => {
  it("potrivește cheile cu puncte și numele HTML cu paranteze", () => {
    document.body.innerHTML = '<input name="lines[0][vat_rate]">';
    const input = document.querySelector("input")!;

    expect(markApiFieldErrors({"lines.0.vat_rate": ["Cota TVA este obligatorie."]})).toBe(1);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("data-api-invalid", "true");

    clearApiFieldErrors();
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marchează controlul și prin aliasurile declarate", () => {
    document.body.innerHTML = `
      <div data-api-fields="lines.0.vat_rate lines.0.vat_category">
        <div class="select"><button>TVA</button></div>
      </div>
    `;
    const select = document.querySelector(".select")!;

    expect(markApiFieldErrors({"lines.0.vat_category": ["Categoria este obligatorie."]})).toBe(1);
    expect(select).toHaveAttribute("data-api-invalid", "true");
  });

  it("folosește mesajele câmpurilor în descrierea toastului", () => {
    expect(apiErrorDescription({
      title: "Validation failed",
      status: 422,
      detail: "The given data was invalid.",
      errors: {
        email: ["Emailul este invalid."],
        password: ["Parola este obligatorie."],
      },
    })).toBe("Emailul este invalid. Parola este obligatorie.");
  });
});
