"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { requestCorrectionSchema, type CustomerInput, type RequestCorrectionInput } from "@/lib/validation/warranties";
import { requestCorrectionAction } from "@/lib/actions/warranties";

export function RequestCorrectionForm({
  warrantyId,
  current,
}: {
  warrantyId: string;
  current: CustomerInput;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RequestCorrectionInput>({
    resolver: zodResolver(requestCorrectionSchema),
    defaultValues: { customer: current, reason: "" },
  });

  const onValid = (input: RequestCorrectionInput) => {
    startTransition(async () => {
      const result = await requestCorrectionAction(warrantyId, current, input);
      if (result.error) toast.error(result.error);
      else {
        toast.success(
          result.requested === 1
            ? "Corrección solicitada. Un administrador debe aprobarla."
            : `${result.requested} correcciones solicitadas. Un administrador debe aprobarlas.`,
        );
        reset({ customer: current, reason: "" });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.customer?.name}>
          <FieldLabel htmlFor="corrName">Nombre</FieldLabel>
          <Input id="corrName" {...register("customer.name")} />
          <FieldError errors={[errors.customer?.name]} />
        </Field>
        <Field data-invalid={!!errors.customer?.nationalId}>
          <FieldLabel htmlFor="corrNationalId">Identificación</FieldLabel>
          <Input id="corrNationalId" {...register("customer.nationalId")} />
          <FieldError errors={[errors.customer?.nationalId]} />
        </Field>
        <Field data-invalid={!!errors.customer?.whatsapp}>
          <FieldLabel htmlFor="corrWhatsapp">WhatsApp</FieldLabel>
          <Input id="corrWhatsapp" {...register("customer.whatsapp")} />
          <FieldError errors={[errors.customer?.whatsapp]} />
        </Field>
        <Field data-invalid={!!errors.reason}>
          <FieldLabel htmlFor="corrReason">Motivo de la corrección</FieldLabel>
          <Input id="corrReason" {...register("reason")} />
          <FieldError errors={[errors.reason]} />
          <FieldDescription>Obligatorio: un administrador debe aprobar el cambio antes de aplicarse.</FieldDescription>
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enviando..." : "Solicitar corrección"}
        </Button>
      </FieldGroup>
    </form>
  );
}
