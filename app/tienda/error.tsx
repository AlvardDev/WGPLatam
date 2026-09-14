"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function TiendaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Alert variant="destructive">
      <AlertTriangle className="size-4" />
      <AlertTitle>Ocurrió un error</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>No se pudo cargar esta sección. Intenta de nuevo.</p>
        <Button variant="outline" size="sm" onClick={reset}>
          Reintentar
        </Button>
      </AlertDescription>
    </Alert>
  );
}
