"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { lotSchema, lotUpdateSchema, type LotInput, type LotUpdateInput } from "@/lib/validation/lots";

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
  const isCreate = props.mode === "create";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LotInput | LotUpdateInput>({
    resolver: zodResolver(isCreate ? lotSchema : lotUpdateSchema),
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
        toast.error(result.error);
      } else {
        toast.success(isCreate ? "Lote creado." : "Lote actualizado.");
        props.onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        {isCreate && (
          <Field data-invalid={!!("productId" in errors && errors.productId)}>
            <FieldLabel htmlFor="productId">Producto</FieldLabel>
            <select
              id="productId"
              className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              {...register("productId")}
            >
              <option value="">Selecciona un producto</option>
              {props.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
            <FieldError errors={["productId" in errors ? errors.productId : undefined]} />
          </Field>
        )}
        <Field data-invalid={!!errors.code}>
          <FieldLabel htmlFor="code">Código de lote</FieldLabel>
          <Input id="code" {...register("code")} />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field data-invalid={!!errors.warrantyDays}>
          <FieldLabel htmlFor="warrantyDays">Duración de garantía (días)</FieldLabel>
          <Input id="warrantyDays" type="number" min={1} {...register("warrantyDays", { valueAsNumber: true })} />
          <FieldError errors={[errors.warrantyDays]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="receivedOn">Fecha de recepción</FieldLabel>
          <Input id="receivedOn" type="date" {...register("receivedOn")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="expectedCount">Cantidad esperada</FieldLabel>
          <Input id="expectedCount" type="number" min={0} {...register("expectedCount")} />
          <FieldDescription>Informativo: no bloquea nada si la cantidad real difiere.</FieldDescription>
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : isCreate ? "Crear lote" : "Guardar cambios"}
        </Button>
      </FieldGroup>
    </form>
  );
}
