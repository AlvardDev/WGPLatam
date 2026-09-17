"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/actions/auth";
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { AuthShell } from "@/components/auth/auth-shell";

export function ResetForm() {
  const [isPending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetInput>({ resolver: zodResolver(requestPasswordResetSchema) });

  const onSubmit = (values: RequestPasswordResetInput) => {
    startTransition(async () => {
      await requestPasswordReset(values);
      // Siempre se muestra el mismo mensaje exista o no la cuenta, para no
      // filtrar qué correos están registrados.
      setSent(true);
    });
  };

  if (sent) {
    return (
      <AuthShell title="Revisa tu correo">
        <p className="text-sm text-slate-500">
          Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña.
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
    <AuthShell title="Recuperar contraseña" description="Te enviaremos un enlace a tu correo.">
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
            {isPending ? "Enviando..." : "Enviar enlace"}
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
