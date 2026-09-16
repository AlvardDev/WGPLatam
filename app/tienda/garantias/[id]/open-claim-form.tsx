"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { openClaimAction } from "@/lib/actions/warranties";

export function OpenClaimForm({ warrantyId }: { warrantyId: string }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmedReason = reason.trim();
  const reasonInvalid = trimmedReason.length < 5;

  const submit = () => {
    setTouched(true);
    if (reasonInvalid) return;
    startTransition(async () => {
      const result = await openClaimAction(warrantyId, {
        reason: trimmedReason,
        description: description.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Reclamo abierto.");
        setReason("");
        setDescription("");
        setTouched(false);
        router.refresh();
      }
    });
  };

  return (
    <FieldGroup>
      <Field data-invalid={touched && reasonInvalid}>
        <FieldLabel htmlFor="claimReason">Motivo</FieldLabel>
        <Textarea id="claimReason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        <FieldError errors={touched && reasonInvalid ? [{ message: "Indica el motivo del reclamo" }] : []} />
      </Field>
      <Field>
        <FieldLabel htmlFor="claimDescription">Descripción (opcional)</FieldLabel>
        <Textarea
          id="claimDescription"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </Field>
      <Button onClick={submit} disabled={isPending}>
        {isPending ? "Abriendo..." : "Abrir reclamo"}
      </Button>
    </FieldGroup>
  );
}
