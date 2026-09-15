"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createLot } from "@/lib/actions/lots";
import { LotForm } from "./lot-form";

export function CreateLotDialog({ products }: { products: { id: string; code: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={products.length === 0}>
            <Plus className="size-4" />
            Crear lote
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear lote</DialogTitle>
        </DialogHeader>
        <LotForm
          mode="create"
          products={products}
          onSubmit={createLot}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
