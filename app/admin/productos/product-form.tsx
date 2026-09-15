"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  productSchema,
  productUpdateSchema,
  type ProductInput,
  type ProductUpdateInput,
} from "@/lib/validation/products";

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

export function ProductForm(props: Props) {
  const [isPending, startTransition] = useTransition();
  const isCreate = props.mode === "create";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductInput | ProductUpdateInput>({
    resolver: zodResolver(isCreate ? productSchema : productUpdateSchema),
    defaultValues: isCreate
      ? { code: "", name: "", description: "", howItWorks: "", warrantyConditions: "", warrantyExclusions: "" }
      : props.defaultValues,
  });

  const onValid = (values: ProductInput | ProductUpdateInput) => {
    startTransition(async () => {
      const result = isCreate
        ? await props.onSubmit(values as ProductInput)
        : await props.onSubmit(values as ProductUpdateInput);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isCreate ? "Producto creado." : "Producto actualizado.");
        props.onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        {isCreate ? (
          <Field data-invalid={!!("code" in errors && errors.code)}>
            <FieldLabel htmlFor="code">Código</FieldLabel>
            <Input id="code" {...register("code")} />
            <FieldError errors={["code" in errors ? errors.code : undefined]} />
          </Field>
        ) : (
          <Field>
            <FieldLabel>Código</FieldLabel>
            <Input value={props.productCode} disabled readOnly title="El código no se puede editar" />
          </Field>
        )}
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.defaultWarrantyDays}>
          <FieldLabel htmlFor="defaultWarrantyDays">Duración de garantía (días)</FieldLabel>
          <Input
            id="defaultWarrantyDays"
            type="number"
            min={1}
            {...register("defaultWarrantyDays", { valueAsNumber: true })}
          />
          <FieldError errors={[errors.defaultWarrantyDays]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Descripción</FieldLabel>
          <textarea
            id="description"
            rows={2}
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("description")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="howItWorks">Cómo funciona</FieldLabel>
          <textarea
            id="howItWorks"
            rows={2}
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("howItWorks")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="warrantyConditions">Condiciones de garantía</FieldLabel>
          <textarea
            id="warrantyConditions"
            rows={2}
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("warrantyConditions")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="warrantyExclusions">Exclusiones (una por línea)</FieldLabel>
          <textarea
            id="warrantyExclusions"
            rows={3}
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("warrantyExclusions")}
          />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : isCreate ? "Crear producto" : "Guardar cambios"}
        </Button>
      </FieldGroup>
    </form>
  );
}
