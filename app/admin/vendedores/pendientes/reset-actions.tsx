"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resolvePasswordReset } from "@/lib/actions/registro";
import { resolvePasswordResetSchema, type ResolvePasswordResetInput } from "@/lib/validation/registro";

export function ResetActions({ requestId, userId }: { requestId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResolvePasswordResetInput>({ resolver: zodResolver(resolvePasswordResetSchema) });

  const onSubmit = (values: ResolvePasswordResetInput) => {
    startTransition(async () => {
      const result = await resolvePasswordReset(requestId, userId, values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Contraseña aplicada.");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm"><KeyRound className="size-4" />Restablecer</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            Confirma primero la identidad del vendedor por fuera del sistema (llamada, WhatsApp) y
            acuerden la contraseña nueva. Se aplica de inmediato — nunca se guarda aquí.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Contraseña nueva</FieldLabel>
              <Input id="password" type="text" autoComplete="off" {...register("password")} />
              <FieldError errors={[errors.password]} />
              <FieldDescription>Visible mientras escribes: se la vas a dictar o enviar tú mismo.</FieldDescription>
            </Field>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Aplicando..." : "Aplicar"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
