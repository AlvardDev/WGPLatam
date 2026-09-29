"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { setSellerPassword } from "@/lib/actions/sellers";
import { resolvePasswordResetSchema, type ResolvePasswordResetInput } from "@/lib/validation/registro";

export function ChangePasswordDialog({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ResolvePasswordResetInput>({
    resolver: zodResolver(resolvePasswordResetSchema),
    mode: "onTouched",
    defaultValues: { password: "" },
  });

  const onValid = (values: ResolvePasswordResetInput) =>
    startTransition(async () => {
      const res = await setSellerPassword(id, values);
      if (res.error) {
        toast.error("No se pudo cambiar", { description: res.error });
        return;
      }
      toast.success("Contraseña cambiada", { description: `Compártela con ${name} por un canal seguro.` });
      reset();
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <KeyRound className="size-4" />
            Cambiar contraseña
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            La contraseña actual no se puede ver (se guarda cifrada). Escribe una nueva para {name}: se aplica de
            inmediato y no queda guardada en ningún lado del sistema.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="new-password">Contraseña nueva</FieldLabel>
              <div className="relative">
                <Input
                  id="new-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  className="pr-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password ? (
                <FieldError errors={[errors.password]} />
              ) : (
                <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
              )}
            </Field>
            <SubmitButton pending={isPending} pendingLabel="Cambiando...">
              Cambiar contraseña
            </SubmitButton>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
