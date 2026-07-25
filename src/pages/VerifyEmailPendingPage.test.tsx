import {fireEvent, render, screen} from "@testing-library/react";
import {MemoryRouter} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {API_ERROR_EVENT, type ApiErrorEventDetail} from "../lib/apiErrorPresentation";
import {VerifyEmailPendingPage} from "./VerifyEmailPendingPage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("VerifyEmailPendingPage", () => {
  it("afișează emailul și aplică un cooldown vizibil după resend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {message: "Dacă adresa există și nu este activată, am trimis un nou link."},
          }),
          {status: 202, headers: {"Content-Type": "application/json"}},
        ),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/verifica-email?email=andrei%40example.test"]}>
        <VerifyEmailPendingPage />
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("andrei@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "Retrimite linkul"}));

    expect(await screen.findByText("Poți retrimite în 60s")).toBeDisabled();
    expect(screen.getByText(/Dacă adresa există/)).toBeInTheDocument();
  });

  it("publică global eroarea serverului fără a porni cooldown-ul", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({title: "Prea multe cereri", status: 429, detail: "Încearcă mai târziu."}), {
          status: 429,
          headers: {"Content-Type": "application/problem+json"},
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/verifica-email?email=andrei%40example.test"]}>
        <VerifyEmailPendingPage />
      </MemoryRouter>,
    );

    const apiErrorEvent = new Promise<ApiErrorEventDetail>((resolve) => {
      window.addEventListener(API_ERROR_EVENT, (event) => {
        resolve((event as CustomEvent<ApiErrorEventDetail>).detail);
      }, {once: true});
    });
    fireEvent.click(screen.getByRole("button", {name: "Retrimite linkul"}));
    await expect(apiErrorEvent).resolves.toMatchObject({
      problem: {title: "Prea multe cereri", status: 429, detail: "Încearcă mai târziu."},
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", {name: "Retrimite linkul"})).toBeEnabled();
  });
});
