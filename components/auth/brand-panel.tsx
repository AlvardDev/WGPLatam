import Image from "next/image";
import { ShieldCheck } from "lucide-react";

// Panel de marca compartido por toda el área pública de auth (login,
// recuperar, recuperar-vendedor, actualizar-clave, mfa, pendiente) — un solo
// lugar para el diseño de referencia de WGP en vez de repetirlo por página.
// Oculto por debajo de lg (1024px): a ese ancho el formulario ocupa toda la
// pantalla solo, ver AuthShell.
export function BrandPanel() {
  return (
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
  );
}
