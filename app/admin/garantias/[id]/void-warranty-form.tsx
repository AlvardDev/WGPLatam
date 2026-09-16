"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { voidWarrantyAction } from "@/lib/actions/warranties";

export function VoidWarrantyForm({ warrantyId }: { warrantyId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = reason.trim();

  const submit = () => {
    setTouched(true);
    if (trimmed.length < 5) return;
    startTransition(async () => {
      const result = await voidWarrantyAction(warrantyId, trimmed);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Garantía anulada.");
        setOpen(false);
        setReason("");
        setTouched(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="destructive">
            <Ban className="size-4" />
            Anular garantía
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anular garantía</DialogTitle>
          <DialogDescription>
            La garantía queda marcada como anulada (no se borra) y deja de considerarse vigente. El serial no
            cambia de estado automáticamente. Esta acción queda registrada en la auditoría.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={touched && trimmed.length < 5}>
            <FieldLabel htmlFor="voidReason">Motivo</FieldLabel>
            <Input id="voidReason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <FieldError errors={touched && trimmed.length < 5 ? [{ message: "Indica el motivo de la anulación" }] : []} />
          </Field>
          <Button variant="destructive" onClick={submit} disabled={isPending}>
            {isPending ? "Anulando..." : "Anular definitivamente"}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
