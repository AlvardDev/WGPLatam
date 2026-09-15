"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleProductActive } from "@/lib/actions/products";

export function ProductActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await toggleProductActive(id, !isActive);
      if (result.error) toast.error(result.error);
      else toast.success(isActive ? "Producto desactivado." : "Producto activado.");
    });
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending}>
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
