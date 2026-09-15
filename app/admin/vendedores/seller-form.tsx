"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import { inviteSellerSchema, type InviteSellerInput } from "@/lib/validation/sellers";

type Store = { id: string; code: string; name: string };

export function SellerForm({
  stores,
  onSubmit,
  onSuccess,
}: {
  stores: Store[];
  onSubmit: (values: InviteSellerInput) => Promise<{ error?: string }>;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteSellerInput>({
    resolver: zodResolver(inviteSellerSchema),
    defaultValues: { email: "", fullName: "", storeId: "" },
  });

  const onValid = (values: InviteSellerInput) => {
    startTransition(async () => {
      const result = await onSubmit(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Invitación enviada.");
        onSuccess();
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.fullName}>
          <FieldLabel htmlFor="fullName">Nombre completo</FieldLabel>
          <Input id="fullName" {...register("fullName")} />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input id="email" type="email" {...register("email")} />
          <FieldError errors={[errors.email]} />
          <FieldDescription>Recibirá un correo para elegir su contraseña.</FieldDescription>
        </Field>
        <Field data-invalid={!!errors.storeId}>
          <FieldLabel htmlFor="storeId">Tienda</FieldLabel>
          <select
            id="storeId"
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
          {isPending ? "Enviando..." : "Invitar vendedor"}
        </Button>
      </FieldGroup>
    </form>
  );
}
