import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {BankAccountsPage} from "./BankAccountsPage";

vi.mock("../components/AppShell", () => ({
  useCompany: () => ({company: {id: "company-1", legal_name: "ACME SRL"}}),
}));

const json = (data: unknown) =>
  new Response(JSON.stringify({data}), {
    status: 200,
    headers: {"Content-Type": "application/json"},
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BankAccountsPage", () => {
  it("păstrează formularul completat când utilizatorul apasă pe fundalul modalului", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/bank-accounts")) return Promise.resolve(json([]));
        if (url.includes("/settings/currencies")) {
          return Promise.resolve(json([{id: "currency-ron", code: "RON", name: "Leu românesc"}]));
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}>
        <MemoryRouter>
          <BankAccountsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click((await screen.findAllByRole("button", {name: "Adaugă cont"}))[0]);
    fireEvent.change(screen.getByLabelText("Bancă"), {target: {value: "Banca aproape completată"}});

    const dialog = screen.getByRole("dialog", {name: "Adaugă cont bancar"});
    const backdrop = dialog.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    expect(screen.getByRole("dialog", {name: "Adaugă cont bancar"})).toBeInTheDocument();
    expect(screen.getByLabelText("Bancă")).toHaveValue("Banca aproape completată");

    fireEvent.click(screen.getByRole("button", {name: "Anulează"}));
    expect(screen.queryByRole("dialog", {name: "Adaugă cont bancar"})).not.toBeInTheDocument();
  });
});
