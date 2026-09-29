"use client";

import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { updateSellerSchema, type UpdateSellerInput } from "@/lib/validation/sellers";
import { Select } from "@/components/ui/select";

type Store = { id: string; code: string; name: string };

export function EditSellerForm({
  stores,
  defaultValues,
  onSubmit,
  onSuccess,
}: {
  stores: Store[];
  defaultValues: UpdateSellerInput;
  onSubmit: (values: UpdateSellerInput) => Promise<{ error?: string }>;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateSellerInput>({
    resolver: zodResolver(updateSellerSchema),
    defaultValues,
  });

  const onValid = (values: UpdateSellerInput) => {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Vendedor actualizado.");
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="edit-fullName">Nombre completo</FieldLabel>
          <Input id="edit-fullName" {...register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field data-invalid={!!errors.storeId}>
          <FieldLabel htmlFor="edit-storeId">Tienda</FieldLabel>
          <Controller
            control={control}
            name="storeId"
            render={({ field }) => (
              <Select
                id="edit-storeId"
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
        <SubmitButton pending={isPending}>
          Guardar cambios
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
