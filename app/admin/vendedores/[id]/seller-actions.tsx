"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setSellerActive } from "@/lib/actions/sellers";

export function SellerActions({ id, isActive }: { id: string; isActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    startTransition(async () => {
      const result = await setSellerActive(id, !isActive);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.warning) toast.warning(result.warning);
      else toast.success(isActive ? "Vendedor desactivado." : "Vendedor reactivado.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={isActive ? "destructive" : "outline"}>
            {isActive ? <Ban className="size-4" /> : <RotateCcw className="size-4" />}
            {isActive ? "Desactivar" : "Reactivar"}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isActive ? "Desactivar vendedor" : "Reactivar vendedor"}</DialogTitle>
          <DialogDescription>
            {isActive
              ? "Pierde acceso de inmediato a los datos de su tienda y su sesión queda revocada. Puede reactivarse después."
              : "Recupera acceso a los datos de su tienda y puede volver a iniciar sesión."}
          </DialogDescription>
        </DialogHeader>
        <Button variant={isActive ? "destructive" : "default"} onClick={submit} disabled={isPending}>
          {isPending ? "Guardando..." : isActive ? "Desactivar" : "Reactivar"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
