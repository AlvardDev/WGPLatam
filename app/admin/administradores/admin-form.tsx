"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validation/admins";

// Reglas visibles en tiempo real en el checklist de abajo — deben calzar
// exactamente con los .regex()/.min() de createAdminSchema (la autoridad
// real la tiene el schema/servidor, esto es solo la vista en vivo).
const PASSWORD_REQUIREMENTS = [
  { key: "length", label: "Mínimo 8 caracteres", test: (v: string) => v.length >= 8 },
  { key: "upper", label: "Al menos una mayúscula", test: (v: string) => /[A-Z]/.test(v) },
  { key: "special", label: "Al menos un carácter especial ($, *, #)", test: (v: string) => /[$*#]/.test(v) },
] as const;

// password/confirmPassword sin restricción propia acá: sus reglas las
// aplica el checklist en tiempo real + la comparación manual en onValid,
// no el resolver (así se puede mostrar shake/toast en vez del FieldError
// genérico). email/fullName sí siguen validados por el schema real.
const formSchema = createAdminSchema.omit({ password: true }).extend({
  password: z.string(),
  confirmPassword: z.string(),
});
type FormValues = z.infer<typeof formSchema>;

export function AdminForm({
  onSubmit,
  onSuccess,
}: {
  onSubmit: (values: CreateAdminInput) => Promise<{ error?: string }>;
  onSuccess: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showPassword, setShowPassword] = useState(false);
  const [shakeAt, setShakeAt] = useState(0);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", fullName: "", password: "", confirmPassword: "" },
  });

  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const touched = password.length > 0;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const unmetRequirements = PASSWORD_REQUIREMENTS.filter((r) => !r.test(password));

  const onValid = (values: FormValues) => {
    if (values.password !== values.confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    if (unmetRequirements.length > 0) {
      setShakeAt(Date.now());
      return;
    }

    startTransition(async () => {
      const result = await onSubmit({
        email: values.email,
        fullName: values.fullName,
        password: values.password,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Administrador creado.");
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
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-9"
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <Field>
          <FieldLabel htmlFor="confirmPassword">Confirmar contraseña</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={mismatch}
            {...register("confirmPassword")}
          />
        </Field>

        <div className="space-y-1.5">
          {PASSWORD_REQUIREMENTS.map((req) => {
            const met = touched && req.test(password);
            const failed = touched && !met;
            return (
              <div key={req.key} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  key={failed ? `${req.key}-${shakeAt}` : req.key}
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    met && "border-emerald-500 bg-emerald-500 text-white",
                    failed && "border-red-500 bg-red-500 text-white",
                    !touched && "border-muted-foreground/40",
                    failed && shakeAt > 0 && "animate-[shake_0.4s_ease-in-out] shadow-[0_0_6px_2px_rgba(239,68,68,0.6)]",
                  )}
                >
                  {met ? <Check className="size-3" /> : failed ? <X className="size-3" /> : null}
                </span>
                {req.label}
              </div>
            );
          })}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? "Creando..." : "Crear administrador"}
        </Button>
      </FieldGroup>
    </form>
  );
}
