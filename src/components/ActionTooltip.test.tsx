import {render, screen} from "@testing-library/react";
import {Button} from "@heroui/react";
import {describe, expect, it} from "vitest";
import {ActionTooltip, combineDisabledReasons, requiredFieldsReason} from "./ActionTooltip";

describe("ActionTooltip", () => {
  it("păstrează motivul accesibil pentru un buton dezactivat", () => {
    render(
      <ActionTooltip content="Completează denumirea." isDisabled>
        <Button isDisabled>Salvează</Button>
      </ActionTooltip>,
    );

    const trigger = screen.getByRole("button", {name: "Completează denumirea."});
    expect(trigger).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("button", {name: "Salvează"})).toBeDisabled();
  });
});

describe("disabled reason helpers", () => {
  it("enumeră numai câmpurile obligatorii care lipsesc", () => {
    expect(requiredFieldsReason([
      {label: "client", missing: true},
      {label: "monedă", missing: false},
      {label: "denumire", missing: true},
    ])).toBe("Completează câmpurile obligatorii: client, denumire.");
  });

  it("combină regulile de business fără mesaje goale", () => {
    expect(combineDisabledReasons(null, "Previzualizează modificările.", false, "Alege o zi.")).toBe(
      "Previzualizează modificările. Alege o zi.",
    );
  });
});
