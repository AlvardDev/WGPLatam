"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateAppSettings } from "@/lib/actions/app-settings";
import { appSettingsSchema, type AppSettingsInput } from "@/lib/validation/app-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

const SECTIONS: {
  title: string;
  description: string;
  fields: { name: keyof AppSettingsInput; label: string; type?: string; textarea?: boolean; short?: boolean }[];
}[] = [
  {
    title: "Empresa",
    description: "Datos que aparecen en el comprobante y en las notificaciones.",
    fields: [
      { name: "companyName", label: "Nombre comercial" },
      { name: "companyLegalName", label: "Razón social" },
      { name: "companyLegalId", label: "Identificación fiscal" },
      { name: "address", label: "Dirección" },
      { name: "phone", label: "Teléfono" },
      { name: "email", label: "Correo" },
      { name: "whatsapp", label: "WhatsApp" },
    ],
  },
  {
    title: "Garantías",
    description: "Valores de partida al crear un producto nuevo (no afectan garantías ya activadas).",
    fields: [
      { name: "defaultWarrantyDays", label: "Duración por defecto (días)", type: "number", short: true },
      { name: "storeAttentionDays", label: "Días de atención de tienda", type: "number", short: true },
      { name: "expiringSoonDays", label: "Días para alerta de vencimiento", type: "number", short: true },
      { name: "defaultWarrantyConditions", label: "Condiciones por defecto", textarea: true },
      {
        name: "defaultWarrantyExclusions",
        label: "Exclusiones por defecto (una por línea)",
        textarea: true,
      },
    ],
  },
  {
    title: "Sistema",
    description: "Valores regionales por defecto.",
    fields: [
      { name: "countryCode", label: "País", short: true },
      { name: "defaultTimezone", label: "Zona horaria por defecto" },
      { name: "locale", label: "Configuración regional", short: true },
      { name: "nationalIdLabel", label: "Etiqueta del documento de identidad" },
    ],
  },
  {
    title: "Soporte",
    description: "Contacto de garantías, puede diferir del contacto comercial.",
    fields: [
      { name: "supportEmail", label: "Correo de soporte" },
      { name: "supportPhone", label: "Teléfono de soporte" },
      { name: "supportWhatsapp", label: "WhatsApp de soporte" },
    ],
  },
];

export function SettingsForm({ defaultValues }: { defaultValues: AppSettingsInput }) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppSettingsInput>({ resolver: zodResolver(appSettingsSchema), defaultValues });

  const onSubmit = (values: AppSettingsInput) => {
    startTransition(async () => {
      const result = await updateAppSettings(values);
      if (result.error) toast.error(result.error);
      else toast.success("Configuración guardada.");
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {section.fields.map((f) => (
                <Field key={f.name} data-invalid={!!errors[f.name]}>
                  <FieldLabel htmlFor={f.name}>{f.label}</FieldLabel>
                  {f.textarea ? (
                    <textarea
                      id={f.name}
                      rows={3}
                      className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      {...register(f.name)}
                    />
                  ) : (
                    <Input
                      id={f.name}
                      type={f.type ?? "text"}
                      className={f.short ? "max-w-28" : undefined}
                      {...register(f.name, f.type === "number" ? { valueAsNumber: true } : {})}
                    />
                  )}
                  <FieldError errors={[errors[f.name]]} />
                </Field>
              ))}
            </FieldGroup>
          </CardContent>
        </Card>
      ))}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </form>
  );
}
