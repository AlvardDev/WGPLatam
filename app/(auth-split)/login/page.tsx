import type { Metadata } from "next";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

// Layout propio (fuera de app/(auth)/layout.tsx, que centra las demás
// páginas de auth en una card angosta): esta pantalla es a pantalla
// completa, dos columnas, panel de marca + formulario. Ver docs de diseño
// pedidas por el usuario (imagen de referencia WGP).
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col overflow-hidden bg-gradient-to-br from-[#04070f] via-[#0a1128] to-[#0f2050] px-10 py-16 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, transparent 50%, rgba(255,255,255,0.04) 50%, rgba(255,255,255,0.04) 58%, transparent 58%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 size-[26rem] rotate-45 bg-blue-500/[0.06]"
        />

        <div className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <Image src="/wgp-logo.svg" alt="WGP" width={2095} height={669} className="w-64 max-w-full" priority />
          <p className="text-xs font-semibold tracking-[0.35em] text-slate-300">
            GARANTÍAS · PRODUCTOS · CONFIANZA
          </p>
        </div>

        <div className="relative flex flex-col items-center gap-3 pb-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
            <ShieldCheck className="size-5 text-blue-400" />
          </span>
          <p className="text-sm leading-relaxed text-slate-200">
            Tu tranquilidad,
            <br />
            nuestra prioridad
          </p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-slate-50 px-6 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bienvenido a WGP</h1>
          <p className="mt-2 text-sm text-slate-500">
            Inicia sesión para acceder al sistema de garantías.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6 text-center text-xs text-slate-400">
            <span className="font-semibold text-slate-600">WGP</span>
            <span className="mx-2">|</span>
            Sistema de Gestión de Garantías
          </div>
        </div>
      </div>
    </div>
  );
}
