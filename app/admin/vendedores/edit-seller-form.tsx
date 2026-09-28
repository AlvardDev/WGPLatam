"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { updateSellerSchema, type UpdateSellerInput } from "@/lib/validation/sellers";

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
          <select
            id="edit-storeId"
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
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </FieldGroup>
    </form>
  );
}
