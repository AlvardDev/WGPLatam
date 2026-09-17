import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/actions/auth";

export const metadata: Metadata = { title: "Esperando autorización" };

// Destino de proxy.ts para cualquier sesión con claims pero sin rol asignado
// (auto-registro de vendedor todavía no aprobado): RLS ya bloquea todo el
// acceso a datos, esto solo le explica al usuario por qué no ve nada.
export default function PendientePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">Esperando autorización</h1>
        </CardTitle>
        <CardDescription>
          Tu cuenta fue creada pero todavía no tiene acceso. Un administrador debe autorizarla
          primero — contáctalo si tarda demasiado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Cerrar sesión
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
