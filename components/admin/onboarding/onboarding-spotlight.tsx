"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingStep } from "./onboarding-steps";

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Señala el link real del sidebar (desktop) para el paso actual: un overlay
 * oscuro con un "agujero" recortado por box-shadow sobre el link + una
 * tarjeta flotante con la descripción, en vez de solo contarlo en un modal.
 * Solo tiene sentido con el sidebar fijo visible (ver OnboardingProvider,
 * que la usa únicamente en desktop — en mobile el sidebar vive en un Sheet
 * que ni siquiera está montado mientras está cerrado).
 */
export function OnboardingSpotlight({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
}: {
  step: OnboardingStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  // ResizeObserver dispara su callback una vez apenas se llama observe(),
  // con el tamaño/posición actual — así la medición inicial y la
  // re-medición en resize pasan por el mismo callback (nunca un setState
  // síncrono en el cuerpo del efecto).
  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-onboarding-nav="${step.href}"]`);
    if (!target) return;
    target.scrollIntoView({ block: "nearest" });

    const update = () => setRect(rectOf(target));
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [step.href]);

  if (!rect) return null;

  const pad = 6;
  const highlight = {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };

  const estTooltipHeight = 240;
  const tooltipTop = Math.min(
    Math.max(rect.top - 12, 16),
    Math.max(16, window.innerHeight - estTooltipHeight - 16),
  );
  const tooltipLeft = rect.left + rect.width + 20;

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
            <step.icon className="size-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Paso {stepIndex + 1} de {stepCount}
            </p>
            <p className="font-heading text-sm font-semibold">{step.title}</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
        <div className="mt-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className={stepIndex === 0 ? "invisible" : undefined}
          >
            <ArrowLeft className="size-4" />
            Anterior
          </Button>
          <Button size="sm" onClick={onNext} className="bg-blue-600 text-white hover:bg-blue-700">
            {stepIndex === stepCount - 1 ? "Finalizar" : "Siguiente"}
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
