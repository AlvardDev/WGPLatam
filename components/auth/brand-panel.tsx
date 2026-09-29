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
      {/* Franja diagonal decorativa: clase de Tailwind (arbitrary value), no
          `style` inline — la CSP de proxy.ts no tiene 'unsafe-inline' en
          style-src, solo el nonce por request que React no aplica a los
          atributos style="" que arma. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_50%,rgba(255,255,255,0.04)_50%,rgba(255,255,255,0.04)_58%,transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -left-32 size-[26rem] rotate-45 bg-blue-500/[0.06]"
      />
      {/* Luces suaves que flotan lento (CSS, sin JS). */}
      <div aria-hidden className="auth-glow pointer-events-none absolute -top-24 right-[-6rem] size-[28rem] rounded-full bg-blue-500/20 blur-3xl" />
      <div aria-hidden className="auth-glow-slow pointer-events-none absolute bottom-10 left-1/4 size-72 rounded-full bg-indigo-500/15 blur-3xl" />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <Image
          src="/wgp-logo.png"
          alt="WGP"
          width={1572}
          height={1001}
          className="w-64 max-w-full animate-in fade-in zoom-in-95 duration-700"
          priority
        />
        <p className="animate-in text-xs font-semibold tracking-[0.35em] text-slate-300 fade-in slide-in-from-bottom-2 duration-700 fill-mode-backwards delay-200">
          GARANTÍAS · PRODUCTOS · CONFIANZA
        </p>
      </div>

      <div className="relative flex animate-in flex-col items-center gap-3 pb-2 text-center fade-in duration-700 fill-mode-backwards delay-500">
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
