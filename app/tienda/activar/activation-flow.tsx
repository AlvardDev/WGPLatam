"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Calendar,
  Check,
  Download,
  Loader2,
  Package,
  ScanBarcode,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  lookupSerialAction,
  activateWarrantyAction,
  requestBarcodeWaiverAction,
  type SerialLookupResult,
  type ActivateWarrantyResult,
} from "@/lib/actions/warranties";
import { customerSchema, type CustomerInput } from "@/lib/validation/warranties";
import { BarcodeScanner } from "./barcode-scanner";
import { SuccessOverlay } from "./success-overlay";
import { formatDate, formatDuration } from "@/lib/format";

type Phase = "idle" | "not_found" | "found" | "confirming" | "success";

const STATUS_LABEL: Record<SerialLookupResult["status"], string> = {
  AVAILABLE: "Disponible",
  ACTIVATED: "Ya activado",
  BLOCKED: "Bloqueado",
  VOID: "Anulado",
};

const STEPS = ["Buscar", "Cliente", "Listo"] as const;

/** 1 Buscar → 2 Cliente → 3 Listo, para que el vendedor sepa en qué paso está. */
function Stepper({ step }: { step: 0 | 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Pasos">
      {STEPS.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-300",
                done && "bg-emerald-500 text-white",
                current && "bg-blue-600 text-white shadow-md shadow-blue-600/30",
                !done && !current && "bg-muted text-muted-foreground",
              )}
              aria-current={current ? "step" : undefined}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-sm", current ? "font-semibold" : "text-muted-foreground")}>{label}</span>
            {i < STEPS.length - 1 ? (
              <span className={cn("h-0.5 flex-1 rounded-full transition-colors duration-300", done ? "bg-emerald-500" : "bg-muted")} />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Alert({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl p-3.5 text-sm",
        tone === "warn"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"
          : "bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100",
      )}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function CustomerForm({
  code,
  onSuccess,
  onCancel,
}: {
  code: string;
  onSuccess: (result: ActivateWarrantyResult) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema),
    mode: "onTouched",
    defaultValues: { name: "", nationalId: "", whatsapp: "" },
  });

  const onValid = (customer: CustomerInput) => {
    startTransition(async () => {
      const { error, result } = await activateWarrantyAction(code, customer);
      if (error || !result) {
        toast.error("No se pudo activar", { description: error ?? "Intenta de nuevo." });
        return;
      }
      onSuccess(result);
    });
  };

  return (
    <form onSubmit={handleSubmit(onValid)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="customerName">Nombre del cliente</FieldLabel>
          <Input id="customerName" autoFocus autoComplete="off" className="h-11" {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.nationalId}>
          <FieldLabel htmlFor="customerNationalId">Identificación</FieldLabel>
          <Input id="customerNationalId" autoComplete="off" className="h-11" {...register("nationalId")} />
          <FieldError errors={[errors.nationalId]} />
        </Field>
        <Field data-invalid={!!errors.whatsapp}>
          <FieldLabel htmlFor="customerWhatsapp">WhatsApp</FieldLabel>
          <Input
            id="customerWhatsapp"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="+584121234567"
            className="h-11"
            {...register("whatsapp")}
          />
          {errors.whatsapp ? (
            <FieldError errors={[errors.whatsapp]} />
          ) : (
            <FieldDescription>Con el código de país y el signo +.</FieldDescription>
          )}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="h-12">
            <ArrowLeft className="size-4" />
            Volver
          </Button>
          <Button type="submit" disabled={isPending} className="h-12 flex-1 text-base">
            {isPending ? <Loader2 className="size-5 animate-spin" /> : <ShieldCheck className="size-5" />}
            {isPending ? "Activando..." : "Confirmar activación"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

export function ActivationFlow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<SerialLookupResult | null>(null);
  const [activated, setActivated] = useState<ActivateWarrantyResult | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [isRequestingWaiver, startWaiverRequest] = useTransition();
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endCelebration = useCallback(() => setCelebrating(false), []);

  const search = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    startSearch(async () => {
      const { error, result } = await lookupSerialAction(value);
      if (error) {
        toast.error(error);
        return;
      }
      setCode(value);
      setLookup(result ?? null);
      setPhase(result ? "found" : "not_found");
    });
  };

  const requestWaiver = () => {
    if (!lookup) return;
    startWaiverRequest(async () => {
      const { error } = await requestBarcodeWaiverAction(lookup.serial_id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Solicitud enviada al administrador.");
      search(code);
    });
  };

  const reset = () => {
    setPhase("idle");
    setCode("");
    setLookup(null);
    setActivated(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const step = phase === "success" ? 2 : phase === "confirming" ? 1 : 0;

  if (phase === "success" && activated) {
    return (
      <div className="space-y-5">
        {celebrating ? (
          <SuccessOverlay
            title="¡Garantía activada!"
            subtitle={`${activated.product_name} · ${activated.serial}`}
            onDone={endCelebration}
          />
        ) : null}
        <Stepper step={2} />
        <div className="animate-in space-y-5 rounded-2xl bg-card p-5 shadow-soft fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <p className="font-semibold">Garantía activada</p>
              <p className="text-sm text-muted-foreground">El cliente ya está cubierto.</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">Producto</dt>
              <dd className="font-medium">{activated.product_name}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">Serial</dt>
              <dd className="font-mono font-medium break-all">{activated.serial}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">Inicio</dt>
              <dd className="font-medium">{formatDate(activated.activated_at)}</dd>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <dt className="text-xs text-muted-foreground">Vence</dt>
              <dd className="font-medium">{formatDate(activated.expires_at)}</dd>
            </div>
          </dl>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="h-11"
              render={<a href={`/api/garantias/${activated.warranty_id}/comprobante?download=1`} />}
            >
              <Download className="size-4" />
              Descargar comprobante
            </Button>
            <Button onClick={reset} className="h-12 text-base">
              <ScanBarcode className="size-5" />
              Activar otra garantía
            </Button>
            <Button variant="ghost" render={<Link href="/tienda">Ver mis garantías</Link>} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {phase !== "confirming" && (
        <div className="space-y-4 rounded-2xl bg-card p-5 shadow-soft">
          <Button
            type="button"
            onClick={() => setShowScanner(true)}
            className="h-14 w-full rounded-2xl text-base shadow-md shadow-blue-600/25"
          >
            <ScanBarcode className="size-6" />
            Escanear con la cámara
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />o escribe el código
            <span className="h-px flex-1 bg-border" />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              search(code);
            }}
            className="flex gap-2"
          >
            <Input
              ref={inputRef}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Serial o código de barras"
              autoComplete="off"
              className="h-11 flex-1 font-mono"
              disabled={isSearching}
            />
            <Button type="submit" variant="outline" disabled={isSearching || !code.trim()} className="h-11">
              {isSearching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span className="sr-only sm:not-sr-only">{isSearching ? "Buscando..." : "Buscar"}</span>
            </Button>
          </form>
        </div>
      )}

      {showScanner && (
        <BarcodeScanner
          onDetected={(value) => {
            setShowScanner(false);
            setCode(value);
            search(value);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {phase === "not_found" && (
        <div className="flex animate-in items-start gap-3 rounded-2xl bg-card p-5 text-sm shadow-soft fade-in slide-in-from-bottom-2 duration-300">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300">
            <ShieldX className="size-5" />
          </span>
          <div>
            <p className="font-semibold">No encontramos ese código</p>
            <p className="text-muted-foreground">Revisa que esté completo y sin espacios de más, o escanéalo con la cámara.</p>
          </div>
        </div>
      )}

      {phase === "found" && lookup && (
        <div className="animate-in space-y-4 rounded-2xl bg-card p-5 shadow-soft fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <Package className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold tracking-tight">{lookup.product_name}</p>
                <Badge variant={lookup.status === "AVAILABLE" ? "success" : "danger"}>{STATUS_LABEL[lookup.status]}</Badge>
              </div>
              <p className="font-mono text-sm break-all text-muted-foreground">{lookup.serial}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-sm">
            <Calendar className="size-4 text-muted-foreground" />
            Garantía de <span className="font-semibold">{formatDuration(lookup.warranty_duration_days)}</span> desde hoy
          </div>

          {lookup.status === "AVAILABLE" && (lookup.barcode || lookup.barcode_waiver_status === "APPROVED") && (
            <Button onClick={() => setPhase("confirming")} className="h-12 w-full text-base">
              <ShieldCheck className="size-5" />
              Activar garantía
            </Button>
          )}
          {lookup.status === "AVAILABLE" && !lookup.barcode && lookup.barcode_waiver_status === "PENDING" && (
            <Alert tone="warn">
              Este serial no tiene código de barras. Ya le avisamos al administrador: falta su autorización para
              activarlo.
            </Alert>
          )}
          {lookup.status === "AVAILABLE" &&
            !lookup.barcode &&
            (lookup.barcode_waiver_status === null || lookup.barcode_waiver_status === "REJECTED") && (
              <div className="space-y-2">
                <Alert tone="bad">
                  {lookup.barcode_waiver_status === "REJECTED"
                    ? `El administrador rechazó la autorización${lookup.barcode_waiver_note ? `: ${lookup.barcode_waiver_note}` : "."}`
                    : "Este serial todavía no tiene código de barras asignado."}
                </Alert>
                <Button variant="outline" className="h-11 w-full" onClick={requestWaiver} disabled={isRequestingWaiver}>
                  {isRequestingWaiver ? <Loader2 className="size-4 animate-spin" /> : null}
                  {isRequestingWaiver ? "Enviando..." : "Solicitar autorización al administrador"}
                </Button>
              </div>
            )}
          {lookup.status === "ACTIVATED" && <Alert tone="bad">Este serial ya tiene una garantía activada.</Alert>}
          {lookup.status === "BLOCKED" && <Alert tone="bad">Este serial está bloqueado y no puede activarse.</Alert>}
          {lookup.status === "VOID" && <Alert tone="bad">Este serial está anulado y no puede activarse.</Alert>}
        </div>
      )}

      {phase === "confirming" && lookup && (
        <div className="animate-in space-y-4 rounded-2xl bg-card p-5 shadow-soft fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
            <Package className="size-5 shrink-0 text-blue-600 dark:text-blue-300" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{lookup.product_name}</p>
              <p className="truncate font-mono text-xs text-muted-foreground">
                {lookup.serial} · {formatDuration(lookup.warranty_duration_days)} de garantía
              </p>
            </div>
          </div>
          <div>
            <p className="font-semibold">Datos del cliente</p>
            <p className="text-sm text-muted-foreground">Quedan en el comprobante de la garantía.</p>
          </div>
          <CustomerForm
            code={code}
            onCancel={() => setPhase("found")}
            onSuccess={(result) => {
              setActivated(result);
              setPhase("success");
              setCelebrating(true);
            }}
          />
        </div>
      )}
    </div>
  );
}
