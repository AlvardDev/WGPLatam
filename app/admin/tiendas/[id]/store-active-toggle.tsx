"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleStoreActive } from "@/lib/actions/stores";

export function StoreActiveToggle({ id, isActive }: { id: string; isActive: boolean }) {
  const [isPending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await toggleStoreActive(id, !isActive);
      if (result.error) toast.error(result.error);
      else toast.success(isActive ? "Tienda desactivada." : "Tienda activada.");
    });
  };

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending}>
      {isActive ? "Desactivar" : "Activar"}
    </Button>
  );
}
