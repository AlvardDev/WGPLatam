"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestPasswordReset } from "@/lib/actions/auth";
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

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
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="contents">Revisa tu correo</h1>
          </CardTitle>
          <CardDescription>
            Si la cuenta existe, te enviamos un enlace para restablecer tu contraseña.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">Recuperar contraseña</h1>
        </CardTitle>
        <CardDescription>Te enviaremos un enlace a tu correo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Enviando..." : "Enviar enlace"}
            </Button>
          </FieldGroup>
        </form>
        <FieldDescription className="mt-4 text-center">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Volver a iniciar sesión
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
}
