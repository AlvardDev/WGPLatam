"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { registerSeller } from "@/lib/actions/registro";
import { sellerRegisterSchema, type SellerRegisterInput } from "@/lib/validation/registro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Store = { id: string; code: string; name: string };

export function RegistroForm({ stores }: { stores: Store[] }) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SellerRegisterInput>({
    resolver: zodResolver(sellerRegisterSchema),
    defaultValues: { email: "", fullName: "", storeId: "", password: "", confirmPassword: "" },
  });

  const onSubmit = (values: SellerRegisterInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await registerSeller(values);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="contents">Registro recibido</h1>
          </CardTitle>
          <CardDescription>
            Tu cuenta fue creada y está esperando la autorización de un administrador. Podrás
            entrar en cuanto la aprueben.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="text-sm underline underline-offset-4 hover:text-foreground">
            Ir a iniciar sesión
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">Registro de vendedor</h1>
        </CardTitle>
        <CardDescription>
          Crea tu cuenta. Un administrador debe autorizarla antes de que puedas entrar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.fullName}>
              <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
              <Input id="fullName" {...register("fullName")} />
              <FieldError errors={[errors.fullName]} />
            </Field>
            <Field data-invalid={!!errors.email}>
              <FieldLabel htmlFor="email">Correo</FieldLabel>
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={!!errors.storeId}>
              <FieldLabel htmlFor="storeId">Tienda</FieldLabel>
              <select
                id="storeId"
                className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register("storeId")}
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
            <Field data-invalid={!!errors.password}>
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
              <FieldError errors={[errors.password]} />
            </Field>
            <Field data-invalid={!!errors.confirmPassword}>
              <FieldLabel htmlFor="confirmPassword">Confirmar contraseña</FieldLabel>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...register("confirmPassword")}
              />
              <FieldError errors={[errors.confirmPassword]} />
            </Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Registrando..." : "Registrarme"}
            </Button>
          </FieldGroup>
        </form>
        <FieldDescription className="mt-4 text-center">
          <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
            Ya tengo cuenta
          </Link>
        </FieldDescription>
      </CardContent>
    </Card>
  );
}
