"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
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
import { approveSignup, rejectSignup } from "@/lib/actions/registro";

type Store = { id: string; code: string; name: string };

type ApproveInput = { fullName: string; storeId: string };

export function SignupActions({
  userId,
  fullName,
  requestedStoreId,
  stores,
}: {
  userId: string;
  fullName: string;
  requestedStoreId: string | null;
  stores: Store[];
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApproveInput>({
    defaultValues: { fullName, storeId: requestedStoreId ?? "" },
  });

  const onApprove = (values: ApproveInput) => {
    startTransition(async () => {
      const result = await approveSignup(userId, values.fullName, values.storeId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Registro aprobado.");
      setApproveOpen(false);
      router.refresh();
    });
  };

  const onReject = () => {
    startTransition(async () => {
      const result = await rejectSignup(userId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Registro rechazado.");
      setRejectOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="flex justify-end gap-2">
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogTrigger render={<Button size="sm"><Check className="size-4" />Aprobar</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar registro</DialogTitle>
            <DialogDescription>Confirma el nombre y la tienda antes de dar acceso.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onApprove)} noValidate>
            <FieldGroup>
              <Field data-invalid={!!errors.fullName}>
                <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
                <Input id="fullName" {...register("fullName", { required: "Requerido" })} />
                <FieldError errors={[errors.fullName]} />
              </Field>
              <Field data-invalid={!!errors.storeId}>
                <FieldLabel htmlFor="storeId">Tienda</FieldLabel>
                <select
                  id="storeId"
                  className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  {...register("storeId", { required: "Selecciona una tienda" })}
                >
                  <option value="">Selecciona una tienda</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <FieldError errors={[errors.storeId]} />
              </Field>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Aprobando..." : "Aprobar"}
              </Button>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogTrigger render={<Button size="sm" variant="destructive"><X className="size-4" />Rechazar</Button>} />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar registro</DialogTitle>
            <DialogDescription>Borra la cuenta creada. No se puede deshacer.</DialogDescription>
          </DialogHeader>
          <Button variant="destructive" onClick={onReject} disabled={isPending}>
            {isPending ? "Rechazando..." : "Rechazar"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
