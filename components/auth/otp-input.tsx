"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

/**
 * Seis casillas de un dígito. Solo acepta números, permite pegar el código
 * completo (o autocompletar desde el SMS/app) y avanza/retrocede solo.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  shakeKey = 0,
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /** Cambia en cada código rechazado: las casillas tiemblan una vez. */
  shakeKey?: number;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (next: string) => {
    onChange(next);
    if (next.length === LENGTH) onComplete?.(next);
  };

  const fill = (index: number, digits: string) => {
    if (!digits) return;
    const next = (value.slice(0, index) + digits).slice(0, LENGTH);
    update(next);
    refs.current[Math.min(next.length, LENGTH - 1)]?.focus();
  };

  return (
    <div
      key={shakeKey}
      className={cn("flex justify-between gap-2", shakeKey > 0 && "animate-shake")}
      role="group"
      aria-label="Código de 6 dígitos"
    >
      {Array.from({ length: LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? "code" : undefined}
          autoFocus={i === 0}
          value={value[i] ?? ""}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          maxLength={LENGTH}
          onChange={(e) => fill(i, e.target.value.replace(/\D/g, ""))}
          onPaste={(e) => {
            e.preventDefault();
            fill(0, e.clipboardData.getData("text").replace(/\D/g, ""));
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              update(value.slice(0, i - 1));
              refs.current[i - 1]?.focus();
            } else if (e.key === "Backspace" && value[i]) {
              update(value.slice(0, i));
            } else if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === "ArrowRight" && i < LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          className={cn(
            "h-12 w-full min-w-0 rounded-xl border border-input bg-muted/40 focus-visible:bg-background text-center text-xl font-semibold tabular-nums outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
            invalid && "border-destructive",
          )}
        />
      ))}
    </div>
  );
}
