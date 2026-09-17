"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { requestSellerPasswordReset } from "@/lib/actions/registro";
import {
  sellerPasswordResetRequestSchema,
  type SellerPasswordResetRequestInput,
} from "@/lib/validation/registro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="contents">Solicitud registrada</h1>
          </CardTitle>
          <CardDescription>
            Si existe una cuenta de vendedor con ese correo, tu administrador fue notificado y se
            pondrá en contacto contigo para darte una contraseña nueva.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">Olvidé mi contraseña (vendedor)</h1>
        </CardTitle>
        <CardDescription>
          Tu administrador te dará una contraseña nueva directamente — no se envía ningún correo.
        </CardDescription>
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
              {isPending ? "Enviando..." : "Solicitar"}
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
