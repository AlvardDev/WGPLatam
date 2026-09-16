import type { Metadata } from "next";
import { MfaGate } from "./mfa-gate";

export const metadata: Metadata = { title: "Verificación en dos pasos" };

export default function MfaPage() {
  return <MfaGate />;
}
