"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "./button";

/** true durante `ms` después de llamar a flash() — para "Cambios guardados" en el botón. */
export function useFlash(ms = 2200) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = () => {
    clearTimeout(timer.current);
    setOn(true);
    timer.current = setTimeout(() => setOn(false), ms);
  };
  return [on, flash] as const;
}

/**
 * Botón de envío con tres estados visibles: normal, cargando (spinner) y
 * guardado (check verde por un momento, ver useFlash).
 */
export function SubmitButton({
  pending,
  saved = false,
  pendingLabel = "Guardando...",
  savedLabel = "Cambios guardados",
  children,
  className,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & {
  pending: boolean;
  saved?: boolean;
  pendingLabel?: string;
  savedLabel?: string;
}) {
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={cn(
        "min-w-36 transition-[background-color,transform,opacity] duration-200 active:scale-[0.97]",
        saved && "bg-emerald-600 text-white hover:bg-emerald-600",
        className,
      )}
      {...props}
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" />
          {pendingLabel}
        </>
      ) : saved ? (
        <span key="saved" className="inline-flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
          <Check />
          {savedLabel}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
