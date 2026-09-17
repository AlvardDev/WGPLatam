"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import Link from "next/link";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { signIn } from "@/lib/actions/auth";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";

export function LoginForm() {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = (values: LoginInput) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signIn(values);
      // Si signIn tiene éxito, redirect() ya cortó la ejecución del servidor.
      if (result?.error) {
        setFormError(result.error);
        toast.error(result.error);
      }
    });
  };

  return (
    <div>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Correo electrónico</FieldLabel>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="Ingresa tu correo"
                className="h-11 pl-9"
                {...register("email")}
              />
            </div>
            <FieldError errors={[errors.email]} />
          </Field>

          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Ingresa tu contraseña"
                className="h-11 px-9"
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
            <FieldError errors={[errors.password]} />
          </Field>

          {formError ? <FieldError>{formError}</FieldError> : null}

          <Button
            type="submit"
            disabled={isPending}
            className="h-11 w-full gap-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            {isPending ? "Ingresando..." : "Iniciar sesión"}
            {!isPending && <ArrowRight className="size-4" />}
          </Button>
        </FieldGroup>
      </form>
      <div className="mt-4 flex flex-col items-center gap-1 text-center text-sm">
        <Link href="/recuperar" className="text-blue-600 underline-offset-4 hover:underline">
          ¿Olvidaste tu contraseña?
        </Link>
        <Link
          href="/recuperar-vendedor"
          className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          ¿Eres vendedor y olvidaste tu contraseña?
        </Link>
      </div>
    </div>
  );
}
