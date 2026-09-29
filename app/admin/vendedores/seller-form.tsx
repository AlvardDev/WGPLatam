"use client";

import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { createSellerSchema, type CreateSellerInput } from "@/lib/validation/sellers";
import { Select } from "@/components/ui/select";

type Store = { id: string; code: string; name: string };

export function SellerForm({
  stores,
  onSubmit,
  onSuccess,
}: {
  stores: Store[];
  onSubmit: (values: CreateSellerInput) => Promise<{ error?: string }>;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateSellerInput>({
    resolver: zodResolver(createSellerSchema),
    defaultValues: { email: "", fullName: "", storeId: "", password: "" },
  });

  const onValid = (values: CreateSellerInput) => {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Vendedor creado.");
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
          <Input id="fullName" {...register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
          <FieldDescription>El vendedor inicia sesión con este correo.</FieldDescription>
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input id="password" type="text" autoComplete="off" {...register("password")} />
          <FieldError errors={[errors.password]} />
          <FieldDescription>
            Mínimo 8 caracteres. Anótala: se la vas a entregar al vendedor por fuera del sistema (no se
            envía ningún correo).
          </FieldDescription>
        </Field>
        <Field data-invalid={!!errors.storeId}>
          <FieldLabel htmlFor="storeId">Tienda</FieldLabel>
          <Controller
            control={control}
            name="storeId"
            render={({ field }) => (
              <Select
                id="storeId"
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.storeId}
                placeholder="Selecciona una tienda"
                options={stores.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
              />
            )}
          />
          <FieldError errors={[errors.storeId]} />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear vendedor"}
        </Button>
      </FieldGroup>
    </form>
  );
}
