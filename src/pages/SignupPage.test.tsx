import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {MemoryRouter, Route, Routes, useLocation} from "react-router";
import {afterEach, describe, expect, it, vi} from "vitest";
import {SignupPage} from "./SignupPage";

function Destination() {
  const location = useLocation();
  return <div>destinație {location.pathname}{location.search}</div>;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("SignupPage", () => {
  it("trimite contractul minimal și continuă la verificarea emailului fără a salva token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            message: "Verifică emailul.",
            email: "andrei@example.test",
          },
        }),
        {status: 202, headers: {"Content-Type": "application/json"}},
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/inregistrare"]}>
        <Routes>
          <Route path="/inregistrare" element={<SignupPage />} />
          <Route path="/verifica-email" element={<Destination />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nume"), {target: {value: "Andrei Popescu"}});
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "andrei@example.test"}});
    fireEvent.change(screen.getByLabelText("Telefon"), {target: {value: "+40 712 345 678"}});
    fireEvent.change(screen.getByLabelText("Parolă"), {target: {value: "correct-horse-password"}});
    fireEvent.change(screen.getByLabelText("Confirmă parola"), {target: {value: "correct-horse-password"}});
    fireEvent.click(screen.getByRole("button", {name: "Creează contul"}));

    await screen.findByText("destinație /verifica-email?email=andrei%40example.test");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      name: "Andrei Popescu",
      email: "andrei@example.test",
      phone: "+40 712 345 678",
      password: "correct-horse-password",
      password_confirmation: "correct-horse-password",
    });
    expect(localStorage.getItem("billwise_access_token")).toBeNull();
  });

  it("oprește local parolele care nu coincid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nume"), {target: {value: "Andrei Popescu"}});
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "andrei@example.test"}});
    fireEvent.change(screen.getByLabelText("Telefon"), {target: {value: "+40712345678"}});
    fireEvent.change(screen.getByLabelText("Parolă"), {target: {value: "correct-horse-password"}});
    fireEvent.change(screen.getByLabelText("Confirmă parola"), {target: {value: "different-horse-password"}});
    fireEvent.click(screen.getByRole("button", {name: "Creează contul"}));

    await waitFor(() => expect(screen.getByText("Parolele nu coincid.")).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aliniază contractul local al parolei la minimum 12 caractere", () => {
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Parolă")).toHaveAttribute("minlength", "12");
    expect(screen.getByLabelText("Confirmă parola")).toHaveAttribute("minlength", "12");
    expect(screen.getByText("Minimum 12 caractere.")).toBeInTheDocument();
  });

  it("păstrează eroarea backend a parolei lângă câmp", async () => {
    const passwordMessage = "Câmpul parolă trebuie să conțină cel puțin 12 caractere.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        title: "Validarea a eșuat",
        status: 422,
        detail: "Datele trimise nu sunt valide.",
        errors: {password: [passwordMessage]},
      }), {status: 422, headers: {"Content-Type": "application/problem+json"}}),
    ));

    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Nume"), {target: {value: "Andrei Popescu"}});
    fireEvent.change(screen.getByLabelText("Email"), {target: {value: "andrei@example.test"}});
    fireEvent.change(screen.getByLabelText("Telefon"), {target: {value: "+40712345678"}});
    fireEvent.change(screen.getByLabelText("Parolă"), {target: {value: "correct-horse-password"}});
    fireEvent.change(screen.getByLabelText("Confirmă parola"), {target: {value: "correct-horse-password"}});
    fireEvent.click(screen.getByRole("button", {name: "Creează contul"}));

    expect(await screen.findByRole("alert")).toHaveTextContent(passwordMessage);
    expect(screen.getByLabelText("Parolă")).toHaveAttribute("aria-invalid", "true");
  });
});
