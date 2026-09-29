"use client";

import { useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { DaysInput } from "@/components/ui/days-input";
import { SubmitButton, useFlash } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { lotSchema, lotUpdateSchema, type LotInput, type LotUpdateInput } from "@/lib/validation/lots";
import { Select } from "@/components/ui/select";

type Product = { id: string; code: string; name: string };

type Props =
  | {
      mode: "create";
      products: Product[];
      onSubmit: (values: LotInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    }
  | {
      mode: "edit";
      defaultValues: LotUpdateInput;
      onSubmit: (values: LotUpdateInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    };

export function LotForm(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, flashSaved] = useFlash();
  const isCreate = props.mode === "create";

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<LotInput | LotUpdateInput>({
    resolver: zodResolver(isCreate ? lotSchema : lotUpdateSchema),
    mode: "onTouched",
    defaultValues: isCreate
      ? { productId: "", code: "", warrantyDays: undefined, receivedOn: "", expectedCount: "" }
      : props.defaultValues,
  });

  const onValid = (values: LotInput | LotUpdateInput) => {
    startTransition(async () => {
      const result = isCreate
        ? await props.onSubmit(values as LotInput)
        : await props.onSubmit(values as LotUpdateInput);
      if (result.error) {
        toast.error("No se pudo guardar", { description: result.error });
        return;
      }
      toast.success(isCreate ? "Lote creado" : "Cambios guardados", { description: values.code });
      if (!isCreate) {
        reset(values);
        flashSaved();
      }
      props.onSuccess();
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid, () => toast.error("Revisa los campos marcados en rojo"))} noValidate>
      <FieldGroup>
        {isCreate && (
          <Field data-invalid={!!("productId" in errors && errors.productId)}>
            <FieldLabel htmlFor="productId">Producto</FieldLabel>
            <Controller
              control={control}
              name="productId"
              render={({ field }) => (
                <Select
                  id="productId"
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!("productId" in errors && errors.productId)}
                  placeholder="Selecciona un producto"
                  options={props.products.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                />
              )}
            />
            <FieldError errors={["productId" in errors ? errors.productId : undefined]} />
          </Field>
        )}
        <Field data-invalid={!!errors.code}>
          <FieldLabel htmlFor="code">Código de lote</FieldLabel>
          <Input id="code" className="max-w-xs" aria-invalid={!!errors.code} {...register("code")} />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field data-invalid={!!errors.warrantyDays}>
          <FieldLabel htmlFor="warrantyDays">Duración de garantía</FieldLabel>
          <DaysInput
            id="warrantyDays"
            aria-invalid={!!errors.warrantyDays}
            {...register("warrantyDays", { valueAsNumber: true })}
          />
          {errors.warrantyDays ? (
            <FieldError errors={[errors.warrantyDays]} />
          ) : (
            <FieldDescription>Entre 1 y 9999. Ej.: 365 = 1 año.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="receivedOn">Fecha de recepción</FieldLabel>
          <Input id="receivedOn" type="date" className="max-w-48" {...register("receivedOn")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="expectedCount">Cantidad esperada</FieldLabel>
          <Input id="expectedCount" type="number" min={0} className="max-w-36" {...register("expectedCount")} />
          <FieldDescription>Informativo: no bloquea nada si la cantidad real difiere.</FieldDescription>
        </Field>
        <SubmitButton pending={isPending} saved={saved} disabled={!isCreate && !isDirty && !saved}>
          {isCreate ? "Crear lote" : "Guardar cambios"}
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
