import {fireEvent, render, screen} from "@testing-library/react";
import {expect, it, vi} from "vitest";
import {AppDatePicker} from "./FormControls";

it("disables dates before the last issued invoice in the real calendar", async () => {
  render(<AppDatePicker name="issue_date" ariaLabel="Data emiterii" value="2026-09-09" minValue="2026-09-09" maxValue="2026-09-10" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole("button"));
  const eighth = await screen.findByRole("button", {name: /Tuesday, September 8, 2026/});
  expect(eighth.closest('[aria-disabled="true"]')).not.toBeNull();
  const ninth = screen.getByRole("button", {name: /Wednesday, September 9, 2026/});
  expect(ninth.closest('[aria-disabled="true"]')).toBeNull();
});
