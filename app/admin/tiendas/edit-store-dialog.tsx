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
import { updateStore } from "@/lib/actions/stores";
import { StoreForm } from "./store-form";

type Store = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  country_code: string;
  timezone: string;
};

export function EditStoreDialog({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Editar ${store.name}`}>
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar tienda</DialogTitle>
        </DialogHeader>
        <StoreForm
          mode="edit"
          defaultValues={{
            code: store.code,
            name: store.name,
            address: store.address ?? "",
            phone: store.phone ?? "",
            countryCode: store.country_code,
            timezone: store.timezone,
          }}
          onSubmit={(values) => updateStore(store.id, values)}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
