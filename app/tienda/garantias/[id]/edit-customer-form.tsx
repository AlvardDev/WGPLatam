"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { SubmitButton, useFlash } from "@/components/ui/submit-button";
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
  const [saved, flashSaved] = useFlash();
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
      if (result.error) {
        toast.error("No se pudo guardar", { description: result.error });
        return;
      }
      toast.success("Datos del cliente actualizados");
      flashSaved();
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
        <SubmitButton pending={isPending} saved={saved}>
          Guardar cambios
        </SubmitButton>
      </FieldGroup>
    </form>
  );
}
