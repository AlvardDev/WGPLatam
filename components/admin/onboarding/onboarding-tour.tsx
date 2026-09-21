"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "cn";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { adminNav, superadminNav } from "@/components/layout/nav-items";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { buildOnboardingSteps } from "./onboarding-steps";
import { OnboardingSpotlight } from "./onboarding-spotlight";

// "welcome"/"thankyou": diálogo centrado. "spotlight": recorrido que navega
// a cada módulo real y señala el sidebar y luego (si aplica) el botón o
// zona clave de esa pantalla (solo desktop, ver startTour). "textSteps":
// mismo contenido que spotlight pero como pasos de diálogo — fallback para
// mobile, donde el sidebar vive en un Sheet cerrado (no hay nada que
// señalar ni sentido en navegar detrás de un modal a pantalla completa).
type Phase = "closed" | "welcome" | "spotlight" | "textSteps" | "thankyou";
// Dentro de "spotlight": primero el link del sidebar ("nav"), luego —si el
// paso tiene pageTarget— el elemento real de la página ("page").
type SubPhase = "nav" | "page";

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
 * cualquier página hija vía useOnboardingTour().replay().
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
    () => buildOnboardingSteps(role === "superadmin" ? superadminNav : adminNav),
    [role],
  );
  const [phase, setPhase] = useState<Phase>(autoShow ? "welcome" : "closed");
  const [stepIndex, setStepIndex] = useState(0);
  const [subPhase, setSubPhase] = useState<SubPhase>("nav");
  // Evita reintentar la RPC en cada cierre de una sesión de replay: solo
  // hace falta re-marcar la primera vez que se cierra tras abrirse.
  const markedRef = useRef(false);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const markComplete = () => {
    if (markedRef.current) return;
    markedRef.current = true;
    startTransition(() => {
      void completeOnboarding();
    });
  };

  const finish = () => {
    setPhase("closed");
    markComplete();
  };

  const replay = () => {
    markedRef.current = false;
    setStepIndex(0);
    setSubPhase("nav");
    setPhase("welcome");
  };

  const startTour = () => {
    const isDesktop = window.matchMedia("(min-width: 768px)").matches;
    setStepIndex(0);
    setSubPhase("nav");
    setPhase(isDesktop ? "spotlight" : "textSteps");
  };

  const current = steps[stepIndex];

  // Cada vez que el recorrido apunta al sidebar de un paso nuevo, navega de
  // verdad a esa página — antes solo se señalaba el link sin moverse de la
  // pantalla actual.
  useEffect(() => {
    if (phase !== "spotlight" || subPhase !== "nav" || !current) return;
    if (pathname !== current.href) router.push(current.href);
  }, [phase, subPhase, stepIndex]);

  const isLastSubstep = stepIndex >= steps.length - 1 && (subPhase === "page" || !current?.pageTarget);

  const goNext = () => {
    if (phase === "spotlight" && subPhase === "nav" && current?.pageTarget) {
      setSubPhase("page");
      return;
    }
    if (isLastSubstep) {
      setPhase("thankyou");
      return;
    }
    setStepIndex((i) => i + 1);
    setSubPhase("nav");
  };

  const goBack = () => {
    if (phase === "spotlight" && subPhase === "page") {
      setSubPhase("nav");
      return;
    }
    setStepIndex((i) => Math.max(i - 1, 0));
    setSubPhase("nav");
  };

  const canGoBack = !(stepIndex === 0 && subPhase === "nav");

  return (
    <OnboardingContext.Provider value={{ replay }}>
      {children}

      <Dialog open={phase === "welcome" || phase === "thankyou"} onOpenChange={(next) => !next && finish()}>
        <DialogContent
          showCloseButton={phase !== "thankyou"}
          className={cn(
            phase === "thankyou" &&
              "border-none bg-gradient-to-br from-[#04070f] via-[#0a1128] to-[#0f2050] p-8 text-white",
          )}
        >
          {phase === "welcome" ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <ShieldCheck className="size-7" />
              </span>
              <div className="space-y-1.5">
                <p className="font-heading text-lg font-semibold">Bienvenido al Sistema de Garantías</p>
                <p className="text-sm text-muted-foreground">
                  Te mostramos rápido dónde está cada cosa antes de empezar. Toma menos de un minuto.
                </p>
              </div>
              <Button className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={startTour}>
                Comenzar recorrido
              </Button>
              <button
                type="button"
                onClick={finish}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Saltar tutorial
              </button>
            </div>
          ) : null}

          {phase === "thankyou" ? (
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
              <Button className="mt-2 w-full bg-blue-600 text-white hover:bg-blue-700" onClick={finish}>
                Empezar a usar el sistema
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={phase === "textSteps"} onOpenChange={(next) => !next && finish()}>
        <DialogContent>
          {current ? (
            <div
              key={stepIndex}
              className="flex flex-col gap-4 py-1 duration-200 animate-in fade-in slide-in-from-bottom-1"
            >
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
          ) : null}
        </DialogContent>
      </Dialog>

      {phase === "spotlight" && current
        ? (() => {
            const onPage = subPhase === "page" && current.pageTarget;
            const progressLabel = `Paso ${stepIndex + 1} de ${steps.length}${onPage ? " · Cómo usarlo" : ""}`;
            return (
              <OnboardingSpotlight
                key={`${current.href}-${subPhase}`}
                selector={onPage ? current.pageTarget!.selector : `[data-onboarding-nav="${current.href}"]`}
                title={current.title}
                description={onPage ? current.pageTarget!.description : current.description}
                icon={current.icon}
                progressLabel={progressLabel}
                canGoBack={canGoBack}
                nextLabel={isLastSubstep ? "Finalizar" : "Siguiente"}
                onNext={goNext}
                onBack={goBack}
                onSkip={finish}
                onTargetMissing={goNext}
              />
            );
          })()
        : null}
    </OnboardingContext.Provider>
  );
}
