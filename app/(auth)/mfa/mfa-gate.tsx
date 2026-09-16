"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { totpCodeSchema, type TotpCodeInput } from "@/lib/validation/mfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "loading" | "enroll" | "challenge" | "error";

/**
 * MFA es obligatoria para admin desde la Fase 8 (docs/SECURITY.md, "MFA").
 * proxy.ts ya garantiza que solo un admin autenticado en aal1 llega aquí;
 * este componente decide en el cliente si toca enrolar (sin factor
 * verificado) o desafiar (ya tiene uno). Llama directo a supabase.auth.mfa
 * porque enroll()/challengeAndVerify() actualizan la sesión en el propio
 * cliente (igual que el import-wizard de la Fase 3, el otro lugar del
 * proyecto que usa lib/supabase/client en vez de una server action).
 */
export function MfaGate() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TotpCodeInput>({ resolver: zodResolver(totpCodeSchema) });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error || !data) {
        setFormError(error?.message ?? "No se pudo consultar el estado de MFA.");
        setMode("error");
        return;
      }

      const verified = data.totp[0];
      if (verified) {
        setFactorId(verified.id);
        setMode("challenge");
        return;
      }

      // Enrolamiento previo abandonado (factor sin verificar): se limpia
      // antes de generar uno nuevo, para no dejar QR/secretos huérfanos.
      const stale = data.all.find((f) => f.factor_type === "totp" && f.status !== "verified");
      if (stale) {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }

      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (cancelled) return;
      if (enrollError || !enrolled) {
        setFormError(enrollError?.message ?? "No se pudo iniciar el enrolamiento.");
        setMode("error");
        return;
      }
      setFactorId(enrolled.id);
      setQrCode(enrolled.totp.qr_code);
      setSecret(enrolled.totp.secret);
      setMode("enroll");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = (values: TotpCodeInput) => {
    if (!factorId) return;
    setFormError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: values.code,
      });
      if (error) {
        setFormError("Código incorrecto o vencido. Intenta de nuevo.");
        reset({ code: "" });
        return;
      }
      router.replace("/admin");
      router.refresh();
    });
  };

  if (mode === "loading") {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Verificando...
        </CardContent>
      </Card>
    );
  }

  if (mode === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="contents">No se pudo continuar</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{formError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="contents">
            {mode === "enroll" ? "Activa la verificación en dos pasos" : "Verificación en dos pasos"}
          </h1>
        </CardTitle>
        <CardDescription>
          {mode === "enroll"
            ? "Obligatoria para administradores. Escanea el código con Google Authenticator, Authy o similar."
            : "Ingresa el código de tu aplicación de autenticación."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "enroll" && qrCode ? (
          <div className="mb-4 flex flex-col items-center gap-2">
            {/* Datos generados por Supabase Auth (data URI), no contenido de
                usuario; next/image no aporta nada aquí (no hay optimización
                posible ni CDN remoto que configurar para un data: URI). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCode} alt="Código QR para el segundo factor" className="h-40 w-40" />
            {secret ? (
              <p className="break-all text-center text-xs text-muted-foreground">
                O ingresa manualmente: <span className="font-mono">{secret}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.code}>
              <FieldLabel htmlFor="code">Código de 6 dígitos</FieldLabel>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...register("code")}
              />
              <FieldError errors={[errors.code]} />
            </Field>
            {formError ? <FieldError>{formError}</FieldError> : null}
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Verificando..." : mode === "enroll" ? "Activar" : "Verificar"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
