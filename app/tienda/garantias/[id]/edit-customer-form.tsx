"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { customerSchema, type CustomerInput } from "@/lib/validation/warranties";
import { updateWarrantyCustomerAction } from "@/lib/actions/warranties";

export function EditCustomerForm({
  warrantyId,
  defaultValues,
}: {
  warrantyId: string;
  defaultValues: CustomerInput;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    defaultValues,
  });

  const onValid = (customer: CustomerInput) => {
    startTransition(async () => {
      const result = await updateWarrantyCustomerAction(warrantyId, customer);
      if (result.error) toast.error(result.error);
      else toast.success("Datos del cliente actualizados.");
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="editName">Nombre</FieldLabel>
          <Input id="editName" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.nationalId}>
          <FieldLabel htmlFor="editNationalId">Identificación</FieldLabel>
          <Input id="editNationalId" {...register("nationalId")} />
          <FieldError errors={[errors.nationalId]} />
        </Field>
        <Field data-invalid={!!errors.whatsapp}>
          <FieldLabel htmlFor="editWhatsapp">WhatsApp</FieldLabel>
          <Input id="editWhatsapp" {...register("whatsapp")} />
          <FieldError errors={[errors.whatsapp]} />
          <FieldDescription>Formato internacional, con el signo +.</FieldDescription>
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar cambios"}
        </Button>
      </FieldGroup>
    </form>
  );
}
