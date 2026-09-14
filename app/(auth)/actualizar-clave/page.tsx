import type { Metadata } from "next";
import { UpdatePasswordForm } from "./update-password-form";

export const metadata: Metadata = { title: "Actualizar contraseña" };

export default function ActualizarClavePage() {
  return <UpdatePasswordForm />;
}
