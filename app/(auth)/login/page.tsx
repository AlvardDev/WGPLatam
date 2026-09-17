import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <AuthShell title="Bienvenido a WGP" description="Inicia sesión para acceder al sistema de garantías.">
      <LoginForm />
    </AuthShell>
  );
}
