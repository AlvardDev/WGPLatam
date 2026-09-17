"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { signIn } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signIn(values);
      // Si signIn tiene éxito, redirect() ya cortó la ejecución del servidor.
      if (result?.error) {
        setFormError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">Iniciar sesión</h1>
        </CardTitle>
        <CardDescription>Sistema de Gestión de Garantías</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
              <FieldError errors={[errors.password]} />
            </Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Ingresando..." : "Ingresar"}
            </Button>
          </FieldGroup>
        </form>
        <div className="mt-4 flex flex-col items-center gap-1 text-center text-sm">
          <Link href="/recuperar" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
            ¿Olvidaste tu contraseña?
          </Link>
          <Link
            href="/recuperar-vendedor"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            ¿Eres vendedor y olvidaste tu contraseña?
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
