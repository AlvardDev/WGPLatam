import type { ReactNode } from "react";
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
      <div className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 sm:py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-500">{description}</p> : null}

          <div className="mt-8">{children}</div>

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
