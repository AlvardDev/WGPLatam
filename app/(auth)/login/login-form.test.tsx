import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./login-form";

// lib/actions/auth.ts importa next/headers (solo servidor); en un entorno
// jsdom de Vitest se mockea para probar la UI de forma aislada.
vi.mock("@/lib/actions/auth", () => ({
  signIn: vi.fn(async () => ({ error: "Correo o contraseña incorrectos." })),
}));

describe("LoginForm", () => {
  it("renders the email and password fields", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ingresar/i })).toBeInTheDocument();
  });

  it("shows a validation error for an invalid email without calling signIn", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/correo/i), "not-an-email");
    await user.type(screen.getByLabelText(/contraseña/i), "x");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));
    expect(await screen.findByText(/correo válido/i)).toBeInTheDocument();
  });

  it("shows the server error message when signIn fails", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.type(screen.getByLabelText(/correo/i), "a@b.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong-password");
    await user.click(screen.getByRole("button", { name: /ingresar/i }));
    await waitFor(() =>
      expect(screen.getByText(/correo o contraseña incorrectos/i)).toBeInTheDocument(),
    );
  });
});
