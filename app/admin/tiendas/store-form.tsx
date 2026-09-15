"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { storeSchema, storeUpdateSchema, type StoreInput, type StoreUpdateInput } from "@/lib/validation/stores";

type Props =
  | {
      mode: "create";
      onSubmit: (values: StoreInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    }
  | {
      mode: "edit";
      defaultValues: StoreUpdateInput;
      onSubmit: (values: StoreUpdateInput) => Promise<{ error?: string }>;
      onSuccess: () => void;
    };

export function StoreForm(props: Props) {
  const [isPending, startTransition] = useTransition();
  const isCreate = props.mode === "create";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StoreInput | StoreUpdateInput>({
    resolver: zodResolver(isCreate ? storeSchema : storeUpdateSchema),
    defaultValues: isCreate
      ? { code: "", name: "", address: "", phone: "", countryCode: "", timezone: "UTC" }
      : props.defaultValues,
  });

  const onValid = (values: StoreInput | StoreUpdateInput) => {
    startTransition(async () => {
      const result = await props.onSubmit(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(isCreate ? "Tienda creada." : "Tienda actualizada.");
        props.onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.code}>
          <FieldLabel htmlFor="code">Código</FieldLabel>
          <Input id="code" {...register("code")} />
          <FieldError errors={[errors.code]} />
        </Field>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Nombre</FieldLabel>
          <Input id="name" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.countryCode}>
          <FieldLabel htmlFor="countryCode">País (ISO-2)</FieldLabel>
          <Input id="countryCode" maxLength={2} placeholder="VE" {...register("countryCode")} />
          <FieldError errors={[errors.countryCode]} />
        </Field>
        <Field data-invalid={!!errors.timezone}>
          <FieldLabel htmlFor="timezone">Zona horaria</FieldLabel>
          <Input id="timezone" placeholder="America/Caracas" {...register("timezone")} />
          <FieldError errors={[errors.timezone]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="address">Dirección</FieldLabel>
          <Input id="address" {...register("address")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">Teléfono</FieldLabel>
          <Input id="phone" {...register("phone")} />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : isCreate ? "Crear tienda" : "Guardar cambios"}
        </Button>
      </FieldGroup>
    </form>
  );
}
