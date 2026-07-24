import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {render, screen} from "@testing-library/react";
import {MemoryRouter, Route, Routes} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {AppShell} from "./AppShell";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("AppShell onboarding guard", () => {
  it("redirecționează obligatoriu spre onboarding când utilizatorul nu are firme", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        const data = url.includes("/companies")
          ? []
          : {
              id: "user-1",
              name: "Andrei",
              email: "andrei@example.test",
              phone: "+40712345678",
              email_verified_at: "2026-07-24T10:00:00Z",
              tenant: {id: "tenant-1", name: "Andrei", slug: "andrei"},
              roles: [],
              permissions: [],
            };
        return Promise.resolve(
          new Response(JSON.stringify({data}), {
            status: 200,
            headers: {"Content-Type": "application/json"},
          }),
        );
      }),
    );

    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<div>Dashboard protejat</div>} />
              <Route path="/onboarding/firma" element={<div>Onboarding obligatoriu</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Onboarding obligatoriu")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard protejat")).not.toBeInTheDocument();
  });
});
