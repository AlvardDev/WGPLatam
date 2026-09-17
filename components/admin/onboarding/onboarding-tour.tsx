"use client";

import { createContext, useContext, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { adminNav, superadminNav } from "@/components/layout/nav-items";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { buildOnboardingSteps, type OnboardingStep } from "./onboarding-steps";

const WELCOME_STEP: OnboardingStep = {
  title: "Bienvenido al Sistema de Garantías",
  description: "Un recorrido rápido por las secciones principales antes de empezar. Toma menos de un minuto.",
  icon: ShieldCheck,
};

type OnboardingContextValue = { replay: () => void };
const OnboardingContext = createContext<OnboardingContextValue | null>(null);

/** Para el botón "Repetir tutorial" de Ajustes — ver app/admin/ajustes. */
export function useOnboardingTour(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboardingTour debe usarse dentro de <OnboardingProvider>");
  return ctx;
}

/**
 * Envuelve todo el área admin (ver AdminShell) para que el tour pueda
 * dispararse tanto automático (primer login, `autoShow`) como desde
 * cualquier página hija vía useOnboardingTour().replay() — sin eso, el botón
 * de Ajustes no tendría forma de abrir un modal que vive en el layout.
 */
export function OnboardingProvider({
  role,
  autoShow,
  children,
}: {
  role: "admin" | "superadmin";
  autoShow: boolean;
  children: React.ReactNode;
}) {
  const steps = useMemo(
    () => [WELCOME_STEP, ...buildOnboardingSteps(role === "superadmin" ? superadminNav : adminNav)],
    [role],
  );
  const [open, setOpen] = useState(autoShow);
  const [stepIndex, setStepIndex] = useState(0);
  // Evita reintentar la RPC en cada cierre de una sesión de replay: solo
  // hace falta re-marcar la primera vez que se cierra tras abrirse.
  const markedRef = useRef(false);
  const [, startTransition] = useTransition();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && !markedRef.current) {
      markedRef.current = true;
      startTransition(() => {
        void completeOnboarding();
      });
    }
  };

  const replay = () => {
    markedRef.current = false;
    setStepIndex(0);
    setOpen(true);
  };

  const isThankYou = stepIndex === steps.length;
  const current = steps[stepIndex];
  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <OnboardingContext.Provider value={{ replay }}>
      {children}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={!isThankYou}
          className={cn(
            isThankYou &&
              "border-none bg-gradient-to-br from-[#04070f] via-[#0a1128] to-[#0f2050] p-8 text-white",
          )}
        >
          {isThankYou ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center duration-300 animate-in fade-in zoom-in-95">
              <span className="flex size-14 items-center justify-center rounded-full border border-blue-400/30 bg-blue-500/10">
                <ShieldCheck className="size-7 text-blue-400" />
              </span>
              <div className="space-y-1.5">
                <p className="font-heading text-xl font-semibold">
                  Gracias por confiar en los sistemas de Alvard
                </p>
                <p className="text-sm text-slate-300">
                  Tu cuenta ya está lista. Puedes repetir este tutorial cuando quieras desde Ajustes.
                </p>
              </div>
              <Button
                className="mt-2 w-full bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => handleOpenChange(false)}
              >
                Empezar a usar el sistema
              </Button>
            </div>
          ) : (
            <div key={stepIndex} className="flex flex-col gap-4 py-1 duration-200 animate-in fade-in slide-in-from-bottom-1">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  <current.icon className="size-5" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Paso {stepIndex + 1} de {steps.length}
                  </p>
                  <p className="font-heading text-base font-semibold">{current.title}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{current.description}</p>

              <div className="flex items-center justify-center gap-1.5 pt-1">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === stepIndex ? "w-5 bg-blue-600" : "w-1.5 bg-blue-100",
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={goBack}
                  className={stepIndex === 0 ? "invisible" : undefined}
                >
                  <ArrowLeft className="size-4" />
                  Anterior
                </Button>
                <Button size="sm" onClick={goNext} className="bg-blue-600 text-white hover:bg-blue-700">
                  {stepIndex === steps.length - 1 ? "Finalizar" : "Siguiente"}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </OnboardingContext.Provider>
  );
}
