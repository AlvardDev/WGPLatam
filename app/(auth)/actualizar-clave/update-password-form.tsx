"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { updatePassword } from "@/lib/actions/auth";
import { updatePasswordSchema, type UpdatePasswordInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export function UpdatePasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({ resolver: zodResolver(updatePasswordSchema) });

  const onSubmit = (values: UpdatePasswordInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await updatePassword(values);
      if (result?.error) setFormError(result.error);
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Nueva contraseña</FieldLabel>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className="h-11 pl-9"
              {...register("password")}
            />
          </div>
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">Confirmar contraseña</FieldLabel>
          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className="h-11 pl-9"
              {...register("confirmPassword")}
            />
          </div>
          <FieldError errors={[errors.confirmPassword]} />
        </Field>
        {formError ? <FieldError>{formError}</FieldError> : null}
        <Button
          type="submit"
          disabled={isPending}
          className="h-11 w-full rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          {isPending ? "Guardando..." : "Guardar contraseña"}
        </Button>
      </FieldGroup>
    </form>
  );
}
