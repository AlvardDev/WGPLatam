"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateSeller } from "@/lib/actions/sellers";
import { EditSellerForm } from "./edit-seller-form";

type Store = { id: string; code: string; name: string };
type Seller = { id: string; full_name: string; store_id: string };

export function EditSellerDialog({ seller, stores }: { seller: Seller; stores: Store[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${seller.full_name}`}>
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar vendedor</DialogTitle>
        </DialogHeader>
        <EditSellerForm
          stores={stores}
          defaultValues={{ fullName: seller.full_name, storeId: seller.store_id }}
          onSubmit={(values) => updateSeller(seller.id, values)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
