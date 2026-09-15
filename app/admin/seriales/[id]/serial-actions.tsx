"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Lock, Unlock } from "lucide-react";
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
import { blockSerialAction, unblockSerialAction, voidSerialAction } from "@/lib/actions/serials";

function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = reason.trim();

  const submit = () => {
    setTouched(true);
    if (!trimmed) return;
    startTransition(async () => {
      const result = await onConfirm(trimmed);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Listo.");
        setOpen(false);
        setReason("");
        setTouched(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-invalid={touched && !trimmed}>
            <FieldLabel htmlFor="reason">Motivo</FieldLabel>
            <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <FieldError errors={touched && !trimmed ? [{ message: "El motivo es obligatorio" }] : []} />
          </Field>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? "Guardando..." : confirmLabel}
          </Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

export function SerialActions({ id, status }: { id: string; status: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (status === "AVAILABLE") {
    return (
      <div className="flex gap-2">
        <ReasonDialog
          trigger={
            <Button variant="outline">
              <Lock className="size-4" />
              Bloquear
            </Button>
          }
          title="Bloquear serial"
          description="El serial deja de poder activarse hasta que se desbloquee."
          confirmLabel="Bloquear"
          onConfirm={(reason) => blockSerialAction(id, reason)}
        />
        <ReasonDialog
          trigger={
            <Button variant="destructive">
              <Ban className="size-4" />
              Anular
            </Button>
          }
          title="Anular serial"
          description="Esta acción es permanente: un serial anulado no puede reactivarse ni bloquearse. Úsalo solo si el serial nunca se va a usar (ej. nunca se vendió, error de carga)."
          confirmLabel="Anular definitivamente"
          destructive
          onConfirm={(reason) => voidSerialAction(id, reason)}
        />
      </div>
    );
  }

  if (status === "BLOCKED") {
    return (
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await unblockSerialAction(id);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Serial desbloqueado.");
                router.refresh();
              }
            })
          }
        >
          <Unlock className="size-4" />
          Desbloquear
        </Button>
        <ReasonDialog
          trigger={
            <Button variant="destructive">
              <Ban className="size-4" />
              Anular
            </Button>
          }
          title="Anular serial"
          description="Esta acción es permanente: un serial anulado no puede reactivarse."
          confirmLabel="Anular definitivamente"
          destructive
          onConfirm={(reason) => voidSerialAction(id, reason)}
        />
      </div>
    );
  }

  return null;
}
