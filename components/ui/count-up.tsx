"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Número que cuenta desde 0 al montar. El HTML del servidor ya trae el valor
 * final (sin JS o con movimiento reducido se ve directo); la animación solo
 * cambia el texto, sin estilos inline (la CSP no permite style-src inline).
 */
export function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(value * eased).toLocaleString("es");
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = value.toLocaleString("es");
    };
  }, [value, duration]);

  return <span ref={ref}>{value.toLocaleString("es")}</span>;
}
