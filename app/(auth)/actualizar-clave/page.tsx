import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Actualizar contraseña" };

export default function ActualizarClavePage() {
  return (
    <AuthShell title="Elige una nueva contraseña" description="Mínimo 8 caracteres.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
