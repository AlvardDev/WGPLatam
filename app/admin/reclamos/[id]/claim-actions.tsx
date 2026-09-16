"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { assignClaimAction, closeClaimAction, decideClaimAction } from "@/lib/actions/warranties";

export function AssignClaimButton({ claimId, warrantyId }: { claimId: string; warrantyId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const assign = () => {
    startTransition(async () => {
      const result = await assignClaimAction(claimId, warrantyId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Reclamo asignado, en revisión.");
        router.refresh();
      }
    });
  };

  return (
    <Button onClick={assign} disabled={isPending}>
      {isPending ? "Asignando..." : "Tomar reclamo (empezar revisión)"}
    </Button>
  );
}

export function DecideClaimForm({ claimId, warrantyId }: { claimId: string; warrantyId: string }) {
  const [decision, setDecision] = useState("");
  const [justification, setJustification] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const decisionInvalid = decision.trim().length < 3;
  const justificationInvalid = justification.trim().length < 3;

  const decide = (status: "APPROVED" | "REJECTED") => {
    setTouched(true);
    if (decisionInvalid || justificationInvalid) return;
    startTransition(async () => {
      const result = await decideClaimAction(claimId, warrantyId, {
        status,
        decision: decision.trim(),
        justification: justification.trim(),
      });
      if (result.error) toast.error(result.error);
      else {
        toast.success(status === "APPROVED" ? "Reclamo aprobado." : "Reclamo rechazado.");
        router.refresh();
      }
    });
  };

  return (
    <FieldGroup>
      <Field data-invalid={touched && decisionInvalid}>
        <FieldLabel htmlFor="claimDecision">Resolución</FieldLabel>
        <Textarea
          id="claimDecision"
          placeholder="Ej. se reemplaza el producto"
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          rows={2}
        />
        <FieldError errors={touched && decisionInvalid ? [{ message: "Indica la resolución" }] : []} />
      </Field>
      <Field data-invalid={touched && justificationInvalid}>
        <FieldLabel htmlFor="claimJustification">Justificación</FieldLabel>
        <Textarea
          id="claimJustification"
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          rows={2}
        />
        <FieldError errors={touched && justificationInvalid ? [{ message: "Indica el motivo de la decisión" }] : []} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={() => decide("APPROVED")} disabled={isPending}>
          Aprobar
        </Button>
        <Button variant="destructive" onClick={() => decide("REJECTED")} disabled={isPending}>
          Rechazar
        </Button>
      </div>
    </FieldGroup>
  );
}

export function CloseClaimButton({ claimId, warrantyId }: { claimId: string; warrantyId: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const close = () => {
    startTransition(async () => {
      const result = await closeClaimAction(claimId, warrantyId);
      if (result.error) toast.error(result.error);
      else {
        toast.success("Reclamo cerrado.");
        router.refresh();
      }
    });
  };

  return (
    <Button variant="outline" onClick={close} disabled={isPending}>
      {isPending ? "Cerrando..." : "Cerrar reclamo"}
    </Button>
  );
}
