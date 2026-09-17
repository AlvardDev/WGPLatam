"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// "Anterior" usa el historial real del navegador en vez de una pila de
// cursores propia: cada "Siguiente" ya empuja una URL nueva (?cursor=...),
// así que router.back() vuelve exactamente a la página anterior con sus
// mismos filtros. Solo se muestra si ya hay un cursor en la URL actual
// (si no, "atrás" saldría de /admin/seriales, no tiene sentido mostrarlo).
export function PrevPageButton({ hasCursor }: { hasCursor: boolean }) {
  const router = useRouter();
  if (!hasCursor) return null;
  return (
    <Button variant="outline" size="icon" aria-label="Anterior" onClick={() => router.back()}>
      ←
    </Button>
  );
}
