import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {bucharestRunAt, RecurringPage} from "./RecurringPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("RecurringPage", () => {
  it("calculează ora București corect în iarnă și vară", () => {
    expect(bucharestRunAt("2028-01-31")).toBe("2028-01-31T09:00:00+02:00");
    expect(bucharestRunAt("2028-07-31")).toBe("2028-07-31T09:00:00+03:00");
  });

  it("păstrează filtrul server-side și explică faptul că generează doar ciorne", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [],
      meta: {pagination: {current_page: 1, per_page: 20, total: 0, last_page: 1}},
    }), {status: 200, headers: {"Content-Type": "application/json"}}));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter>
          <RecurringPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/Șabloanele generează numai ciorne/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "active"}});

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("_filter%5Bstatus%5D=active"),
    )).toBe(true));
  });
});
