import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Esperando autorización" };

// Destino de proxy.ts para cualquier sesión con claims pero sin rol asignado
// (invitación de vendedor a mitad de camino, o bootstrap manual sin
// metadata): RLS ya bloquea todo el acceso a datos, esto solo le explica al
// usuario por qué no ve nada.
export default function PendientePage() {
  return (
    <AuthShell title="Esperando autorización">
      <p className="text-sm text-slate-500">
        Tu cuenta fue creada pero todavía no tiene acceso. Un administrador debe autorizarla
        primero — contáctalo si tarda demasiado.
      </p>
      <form action={signOut} className="mt-6">
        <Button type="submit" variant="outline" className="h-11 w-full rounded-lg">
          Cerrar sesión
        </Button>
      </form>
    </AuthShell>
  );
}
