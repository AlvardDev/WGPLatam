"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requestSellerPasswordReset } from "@/lib/actions/registro";
import {
  sellerPasswordResetRequestSchema,
  type SellerPasswordResetRequestInput,
} from "@/lib/validation/registro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthShell } from "@/components/auth/auth-shell";

export function ResetVendedorForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SellerPasswordResetRequestInput>({ resolver: zodResolver(sellerPasswordResetRequestSchema) });

  const onSubmit = (values: SellerPasswordResetRequestInput) => {
    startTransition(async () => {
      await requestSellerPasswordReset(values);
      // Siempre el mismo mensaje exista o no la cuenta, para no filtrar qué
      // correos están registrados (mismo criterio que /recuperar).
      setSent(true);
    });
  };

  if (sent) {
    return (
      <AuthShell title="Solicitud registrada">
        <p className="text-sm text-slate-500">
          Si existe una cuenta de vendedor con ese correo, tu administrador fue notificado y se
          pondrá en contacto contigo para darte una contraseña nueva.
        </p>
        <Link
          href="/login"
          className="mt-6 block text-center text-sm text-blue-600 underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Olvidé mi contraseña"
      description="Tu administrador te dará una contraseña nueva directamente — no se envía ningún correo."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Ingresa tu correo"
                className="h-11 pl-9"
                {...register("email")}
              />
            </div>
            <FieldError errors={[errors.email]} />
          </Field>
          <Button
            type="submit"
            disabled={isPending}
            className="h-11 w-full rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            {isPending ? "Enviando..." : "Solicitar"}
          </Button>
        </FieldGroup>
      </form>
      <Link
        href="/login"
        className="mt-4 block text-center text-sm text-blue-600 underline-offset-4 hover:underline"
      >
        Volver a iniciar sesión
      </Link>
    </AuthShell>
  );
}
