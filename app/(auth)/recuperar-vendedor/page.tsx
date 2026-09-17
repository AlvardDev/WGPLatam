import type { Metadata } from "next";
import { ResetVendedorForm } from "./reset-vendedor-form";

export const metadata: Metadata = { title: "Recuperar contraseña (vendedor)" };

export default function RecuperarVendedorPage() {
  return <ResetVendedorForm />;
}
