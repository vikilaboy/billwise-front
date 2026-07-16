import type {ReactNode} from "react";
import {act, renderHook} from "@testing-library/react";
import {MemoryRouter, useLocation} from "react-router";
import {describe, expect, it} from "vitest";
import {useServerDataGridState} from "./useServerDataGridState";

const defaultSort = {column: "issue_date", direction: "descending"} as const;
const filter = {
  param: "status",
  defaultValue: "toate" as const,
  values: ["toate", "emise", "restante"] as const,
};

function wrapper(initialEntry: string) {
  return function RouterWrapper({children}: {children: ReactNode}) {
    return <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>;
  };
}

describe("useServerDataGridState", () => {
  it("hydrates grid state from the URL and resets it explicitly", () => {
    const {result} = renderHook(
      () => ({
        grid: useServerDataGridState({
          defaultSort,
          sortColumns: ["issue_date", "customer_name"],
          filter,
        }),
        location: useLocation(),
      }),
      {wrapper: wrapper("/facturi?page=3&q=INV&sort=customer_name&status=emise")},
    );

    expect(result.current.grid.page).toBe(3);
    expect(result.current.grid.search).toBe("INV");
    expect(result.current.grid.sort).toEqual({column: "customer_name", direction: "ascending"});
    expect(result.current.grid.filter).toBe("emise");
    expect(result.current.grid.isDirty).toBe(true);

    act(() => result.current.grid.reset());

    expect(result.current.location.search).toBe("");
    expect(result.current.grid.page).toBe(1);
    expect(result.current.grid.search).toBe("");
    expect(result.current.grid.sort).toEqual(defaultSort);
    expect(result.current.grid.filter).toBe("toate");
    expect(result.current.grid.isDirty).toBe(false);
  });

  it("stores search, sorting and pagination in the URL", () => {
    const {result} = renderHook(
      () => ({
        grid: useServerDataGridState({
          defaultSort,
          sortColumns: ["issue_date", "customer_name"],
          filter,
        }),
        location: useLocation(),
      }),
      {wrapper: wrapper("/facturi")},
    );

    act(() => result.current.grid.setSearch("ABC"));
    act(() => result.current.grid.setSort({column: "customer_name", direction: "descending"}));
    act(() => result.current.grid.setFilter("restante"));
    act(() => result.current.grid.setPage(2));

    const params = new URLSearchParams(result.current.location.search);
    expect(params.get("q")).toBe("ABC");
    expect(params.get("sort")).toBe("-customer_name");
    expect(params.get("status")).toBe("restante");
    expect(params.get("page")).toBe("2");
  });
});
