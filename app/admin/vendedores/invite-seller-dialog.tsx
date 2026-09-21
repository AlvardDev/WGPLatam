"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { inviteSeller } from "@/lib/actions/sellers";
import { SellerForm } from "./seller-form";

type Store = { id: string; code: string; name: string };

export function InviteSellerDialog({ stores }: { stores: Store[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            disabled={stores.length === 0}
            title={stores.length === 0 ? "Crea una tienda primero" : undefined}
            data-onboarding-target="invite-seller"
          >
            <UserPlus className="size-4" />
            Invitar vendedor
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invitar vendedor</DialogTitle>
        </DialogHeader>
        <SellerForm
          stores={stores}
          onSubmit={inviteSeller}
          onSuccess={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
