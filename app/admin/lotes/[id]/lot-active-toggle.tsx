"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleLotActive } from "@/lib/actions/lots";

export function LotActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await toggleLotActive(id, !isActive);
      if (result.error) toast.error(result.error);
      else toast.success(isActive ? "Lote desactivado." : "Lote activado.");
    });
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending}>
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
