"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Barcode, Check, Lock, Unlock } from "lucide-react";
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
import { blockSerialAction, setSerialBarcodeAction, unblockSerialAction, voidSerialAction } from "@/lib/actions/serials";
import { decideBarcodeWaiverAction } from "@/lib/actions/warranties";

// Genérico: un diálogo con un único campo de texto + confirmar. Lo usan
// Bloquear/Anular (fieldLabel="Motivo", el default) y también "Agregar
// código de barras" (fieldLabel="Código de barras") — mismo shape, distinto
// campo y acción.
function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  fieldLabel = "Motivo",
  destructive,
  onConfirm,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  fieldLabel?: string;
  destructive?: boolean;
  onConfirm: (value: string) => Promise<{ error?: string; success?: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = value.trim();

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
        setValue("");
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
            <FieldLabel htmlFor="reason">{fieldLabel}</FieldLabel>
            <Input id="reason" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <FieldError errors={touched && !trimmed ? [{ message: "Requerido" }] : []} />
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

export function SerialActions({
  id,
  status,
  barcode,
  pendingWaiverId,
}: {
  id: string;
  status: string;
  barcode: string | null;
  pendingWaiverId: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const approveWaiver = () => {
    if (!pendingWaiverId) return;
    startTransition(async () => {
      const result = await decideBarcodeWaiverAction(pendingWaiverId, { decision: "APPROVED" });
      if (result.error) toast.error(result.error);
      else {
        toast.success("Autorización concedida.");
        router.refresh();
      }
    });
  };

  if (status === "AVAILABLE") {
    return (
      <div className="flex flex-wrap gap-2">
        {!barcode && (
          <ReasonDialog
            trigger={
              <Button variant="outline">
                <Barcode className="size-4" />
                Agregar código de barras
              </Button>
            }
            title="Agregar código de barras"
            description="Este serial se creó o importó sin código de barras. Complétalo antes de poder activar una garantía con él."
            confirmLabel="Guardar"
            fieldLabel="Código de barras"
            onConfirm={(value) => setSerialBarcodeAction(id, value)}
          />
        )}
        {pendingWaiverId && (
          <>
            <Button variant="outline" disabled={isPending} onClick={approveWaiver}>
              <Check className="size-4" />
              Autorizar activación sin código
            </Button>
            <ReasonDialog
              trigger={
                <Button variant="destructive">
                  <Ban className="size-4" />
                  Rechazar solicitud
                </Button>
              }
              title="Rechazar autorización"
              description="El vendedor verá este motivo y puede volver a solicitarlo."
              confirmLabel="Rechazar"
              fieldLabel="Motivo del rechazo"
              destructive
              onConfirm={(note) => decideBarcodeWaiverAction(pendingWaiverId, { decision: "REJECTED", note })}
            />
          </>
        )}
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
