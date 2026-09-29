"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateNotificationSettings } from "@/lib/actions/notification-settings";
import {
  notificationSettingsSchema,
  type NotificationSettingsInput,
} from "@/lib/validation/notification-settings";
import { SubmitButton, useFlash } from "@/components/ui/submit-button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";

export function NotificationSettingsForm({ defaultValues }: { defaultValues: NotificationSettingsInput }) {
  const [isPending, startTransition] = useTransition();
  const [saved, flashSaved] = useFlash();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NotificationSettingsInput>({
    resolver: zodResolver(notificationSettingsSchema),
    defaultValues,
  });

  const onSubmit = (values: NotificationSettingsInput) => {
    startTransition(async () => {
      const result = await updateNotificationSettings(values);
      if (result.error) {
        toast.error("No se pudo guardar", { description: result.error });
        return;
      }
      toast.success("Configuración guardada");
      flashSaved();
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Notificaciones</CardTitle>
          <CardDescription>
            Configuración interna, solo visible para admin. La clave de Resend no se guarda aquí — es un secreto
            de la Edge Function de envío.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" {...register("emailEnabled")} />
                Enviar email al activar una garantía
              </label>
            </Field>
            <Field data-invalid={!!errors.fromEmail}>
              <FieldLabel htmlFor="fromEmail">Correo remitente</FieldLabel>
              <Input id="fromEmail" {...register("fromEmail")} />
              <FieldError errors={[errors.fromEmail]} />
            </Field>
            <Field data-invalid={!!errors.fromName}>
              <FieldLabel htmlFor="fromName">Nombre del remitente</FieldLabel>
              <Input id="fromName" {...register("fromName")} />
              <FieldError errors={[errors.fromName]} />
            </Field>
            <Field data-invalid={!!errors.adminNotificationEmails}>
              <FieldLabel htmlFor="adminNotificationEmails">Correos internos de aviso (uno por línea)</FieldLabel>
              <textarea
                id="adminNotificationEmails"
                rows={3}
                className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register("adminNotificationEmails")}
              />
              <FieldError errors={[errors.adminNotificationEmails]} />
              <FieldDescription>Reciben un correo cada vez que se activa una garantía.</FieldDescription>
            </Field>
            <SubmitButton pending={isPending} saved={saved}>
              Guardar cambios
            </SubmitButton>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  );
}
