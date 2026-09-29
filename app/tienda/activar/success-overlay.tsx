"use client";

import { useEffect } from "react";

/**
 * Aviso grande en el centro de la pantalla con un check animado, para que
 * el vendedor sepa sin dudas que la garantía quedó activada. Se cierra solo
 * (o tocando) y deja ver el resumen debajo.
 */
export function SuccessOverlay({
  title,
  subtitle,
  onDone,
  duration = 2200,
}: {
  title: string;
  subtitle: string;
  onDone: () => void;
  duration?: number;
}) {
  useEffect(() => {
    try {
      navigator.vibrate?.(60);
    } catch {
      // sin vibración: no pasa nada
    }
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <div
      role="status"
      aria-live="assertive"
      onClick={onDone}
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/30 p-6 backdrop-blur-sm fade-in duration-200"
    >
      <div className="flex w-full max-w-xs animate-in flex-col items-center gap-4 rounded-3xl bg-card p-8 text-center shadow-2xl shadow-slate-900/20 zoom-in-90 fade-in duration-300">
        <svg viewBox="0 0 52 52" className="success-check size-20" aria-hidden>
          <circle cx="26" cy="26" r="24" className="fill-emerald-500" />
          <path d="M15 27 l7 7 l15 -16" fill="none" stroke="white" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="space-y-1">
          <p className="text-xl font-semibold tracking-tight">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
