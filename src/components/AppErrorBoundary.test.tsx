import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {AppErrorBoundary} from "./AppErrorBoundary";

function BrokenPage(): never {
  throw new Error("boom");
}

describe("AppErrorBoundary", () => {
  it("afișează o recuperare controlată și acțiunea de reîncărcare", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<AppErrorBoundary><BrokenPage /></AppErrorBoundary>);

    expect(screen.getByRole("alert")).toHaveTextContent("Pagina nu a putut fi afișată");
    expect(screen.getByRole("button", {name: "Reîncarcă aplicația"})).toBeEnabled();
  });
});
