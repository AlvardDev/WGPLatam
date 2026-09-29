import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { BrandPanel } from "./brand-panel";

// Shell de dos columnas para toda la zona pública de auth — reemplaza el
// <Card> genérico que cada página tenía antes. Móvil-first: bajo lg
// (1024px) BrandPanel desaparece y esta columna ocupa el 100% del ancho,
// sin scroll horizontal a ningún tamaño (probado hasta 360px).
export function AuthShell({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <BrandPanel />
      <div className="flex flex-1 items-center justify-center bg-slate-50 dark:bg-background px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-sm animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div className="rounded-3xl bg-card p-7 shadow-soft sm:p-8">
            <span className="mb-5 flex size-11 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30 lg:hidden">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-slate-100">{title}</h1>
            {description ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}

            <div className="mt-7">{children}</div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            <span className="font-semibold text-slate-600 dark:text-slate-400">WGP</span>
            <span className="mx-2">|</span>
            Sistema de Gestión de Garantías
          </div>
        </div>
      </div>
    </div>
  );
}
