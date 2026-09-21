"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Cuánto esperar a que aparezca el elemento señalado antes de rendirse y
// avanzar solo (por ejemplo, un dato vacío que oculta el botón que se
// quería mostrar) — mejor eso que dejar el tour trabado.
const TARGET_TIMEOUT_MS = 3000;

/**
 * Señala un elemento real de la página (link del sidebar o botón/zona
 * dentro del módulo actual): overlay oscuro con un "agujero" recortado por
 * box-shadow + tarjeta flotante con la descripción. Ver OnboardingProvider,
 * que la usa únicamente en desktop — en mobile el sidebar vive en un Sheet
 * que ni siquiera está montado mientras está cerrado.
 */
export function OnboardingSpotlight({
  selector,
  title,
  description,
  icon: Icon,
  progressLabel,
  canGoBack,
  nextLabel,
  onNext,
  onBack,
  onSkip,
  onTargetMissing,
}: {
  selector: string;
  title: string;
  description: string;
  icon: LucideIcon;
  progressLabel: string;
  canGoBack: boolean;
  nextLabel: string;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onTargetMissing: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const onTargetMissingRef = useRef(onTargetMissing);
  onTargetMissingRef.current = onTargetMissing;

  // El contenido de la página recién navegada puede tardar un tick en
  // montarse (server component), así que se reintenta con MutationObserver
  // en vez de asumir que el selector ya existe — con un timeout que avanza
  // el tour solo si el elemento nunca aparece.
  useLayoutEffect(() => {
    setRect(null);
    let resizeObserver: ResizeObserver | null = null;
    let cleanupTarget: (() => void) | null = null;

    const attach = (target: HTMLElement) => {
      target.scrollIntoView({ block: "nearest" });
      const update = () => setRect(rectOf(target));
      resizeObserver = new ResizeObserver(update);
      resizeObserver.observe(target);
      window.addEventListener("resize", update);
      cleanupTarget = () => {
        resizeObserver?.disconnect();
        window.removeEventListener("resize", update);
      };
    };

    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      attach(existing);
      return () => cleanupTarget?.();
    }

    const mutationObserver = new MutationObserver(() => {
      const found = document.querySelector<HTMLElement>(selector);
      if (found) {
        mutationObserver.disconnect();
        attach(found);
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => {
      mutationObserver.disconnect();
      onTargetMissingRef.current();
    }, TARGET_TIMEOUT_MS);

    return () => {
      mutationObserver.disconnect();
      window.clearTimeout(timeout);
      cleanupTarget?.();
    };
  }, [selector]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!rect) return null;

  const pad = 6;
  const highlight = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  const estTooltipHeight = 240;
  const estTooltipWidth = 288;
  const spaceRight = window.innerWidth - (rect.left + rect.width);
  const placeLeft = spaceRight < estTooltipWidth + 32;
  const tooltipTop = Math.min(
    Math.max(rect.top - 12, 16),
    Math.max(16, window.innerHeight - estTooltipHeight - 16),
  );
  const tooltipLeft = placeLeft
    ? Math.max(16, rect.left - estTooltipWidth - 20)
    : rect.left + rect.width + 20;

  return createPortal(
    <>
      {/* Bloquea clics en el resto de la página mientras dura el recorrido —
          el "agujero" de abajo es solo visual (box-shadow), no interactivo. */}
      <div className="fixed inset-0 z-[60]" />
      <div
        className="pointer-events-none fixed z-[61] rounded-lg ring-2 ring-blue-400 transition-all duration-200"
        style={{
          top: highlight.top,
          left: highlight.left,
          width: highlight.width,
          height: highlight.height,
          boxShadow: "0 0 0 9999px rgba(4,7,15,0.65)",
        }}
      />
      <div
        className="fixed z-[62] w-72 rounded-xl bg-white p-4 text-sm shadow-2xl ring-1 ring-black/10 duration-200 animate-in fade-in slide-in-from-left-2"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{progressLabel}</p>
            <p className="font-heading text-sm font-semibold">{title}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className={canGoBack ? undefined : "invisible"}>
            <ArrowLeft className="size-4" />
            Anterior
          </Button>
          <Button size="sm" onClick={onNext} className="bg-blue-600 text-white hover:bg-blue-700">
            {nextLabel}
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="mt-2 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Saltar tutorial
        </button>
      </div>
    </>,
    document.body,
  );
}
