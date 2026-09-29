"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DaysInput } from "@/components/ui/days-input";
import { SubmitButton, useFlash } from "@/components/ui/submit-button";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  productSchema,
  productUpdateSchema,
  type ProductInput,
  type ProductUpdateInput,
} from "@/lib/validation/products";
import { ProductPhotoField } from "./product-photo-field";

type Props =
  | {
      mode: "create";
      onSubmit: (values: ProductInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    }
  | {
      mode: "edit";
      productCode: string;
      defaultValues: ProductUpdateInput;
      onSubmit: (values: ProductUpdateInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    };

const Required = () => <span className="text-destructive">*</span>;

export function ProductForm(props: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, flashSaved] = useFlash();
  const isCreate = props.mode === "create";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductInput | ProductUpdateInput>({
    resolver: zodResolver(isCreate ? productSchema : productUpdateSchema),
    mode: "onTouched",
    defaultValues: isCreate
      ? {
          code: "",
          name: "",
          description: "",
          howItWorks: "",
          warrantyConditions: "",
          warrantyExclusions: "",
          photoPath: null,
        }
      : props.defaultValues,
  });

  const onValid = (values: ProductInput | ProductUpdateInput) => {
    startTransition(async () => {
      const result = isCreate
        ? await props.onSubmit(values as ProductInput)
        : await props.onSubmit(values as ProductUpdateInput);
      if (result.error) {
        toast.error("No se pudo guardar", { description: result.error });
        return;
      }
      toast.success(isCreate ? "Producto creado" : "Cambios guardados", { description: values.name });
      if (!isCreate) {
        reset(values); // lo guardado pasa a ser el nuevo "sin cambios"
        flashSaved();
      }
      props.onSuccess();
    });
  };

  const onInvalid = () => toast.error("Revisa los campos marcados en rojo");
  const codeError = "code" in errors ? errors.code : undefined;

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} noValidate>
      <FieldGroup>
        {isCreate ? (
          <Field data-invalid={!!codeError}>
            <FieldLabel htmlFor="code">
              Código <Required />
            </FieldLabel>
            <Input id="code" className="max-w-xs" aria-invalid={!!codeError} {...register("code")} />
            <FieldError errors={[codeError]} />
          </Field>
        ) : (
          <Field>
            <FieldLabel>Código</FieldLabel>
            <Input
              className="max-w-xs"
              value={props.productCode}
              disabled
              readOnly
              title="El código no se puede editar"
            />
          </Field>
        )}
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">
            Nombre <Required />
          </FieldLabel>
          <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field>
          <FieldLabel>Foto</FieldLabel>
          <ProductPhotoField
            value={watch("photoPath")}
            onChange={(path) => setValue("photoPath", path, { shouldDirty: true })}
          />
        </Field>
        <Field data-invalid={!!errors.defaultWarrantyDays}>
          <FieldLabel htmlFor="defaultWarrantyDays">
            Duración de garantía <Required />
          </FieldLabel>
          <DaysInput
            id="defaultWarrantyDays"
            aria-invalid={!!errors.defaultWarrantyDays}
            {...register("defaultWarrantyDays", { valueAsNumber: true })}
          />
          {errors.defaultWarrantyDays ? (
            <FieldError errors={[errors.defaultWarrantyDays]} />
          ) : (
            <FieldDescription>Entre 1 y 9999. Ej.: 365 = 1 año.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Descripción</FieldLabel>
          <Textarea id="description" rows={2} {...register("description")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="howItWorks">Cómo funciona</FieldLabel>
          <Textarea id="howItWorks" rows={2} {...register("howItWorks")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="warrantyConditions">Condiciones de garantía</FieldLabel>
          <Textarea id="warrantyConditions" rows={2} {...register("warrantyConditions")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="warrantyExclusions">Exclusiones</FieldLabel>
          <Textarea id="warrantyExclusions" rows={3} {...register("warrantyExclusions")} />
          <FieldDescription>Una por línea.</FieldDescription>
        </Field>
        <div className="flex items-center gap-3">
          <SubmitButton
            pending={isPending}
            saved={saved}
            disabled={!isCreate && !isDirty && !saved}
          >
            {isCreate ? "Crear producto" : "Guardar cambios"}
          </SubmitButton>
          {!isCreate && isDirty && !isPending ? (
            <span className="text-sm text-amber-600 dark:text-amber-400 animate-in fade-in duration-200">
              Tienes cambios sin guardar
            </span>
          ) : null}
        </div>
      </FieldGroup>
    </form>
  );
}
