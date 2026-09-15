"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, ScanBarcode, Search, ShieldAlert, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  lookupSerialAction,
  activateWarrantyAction,
  type SerialLookupResult,
  type ActivateWarrantyResult,
} from "@/lib/actions/warranties";
import { customerSchema, type CustomerInput } from "@/lib/validation/warranties";
import { BarcodeScanner } from "./barcode-scanner";

type Phase = "idle" | "not_found" | "found" | "confirming" | "success";

const STATUS_LABEL: Record<SerialLookupResult["status"], string> = {
  AVAILABLE: "Disponible",
  ACTIVATED: "Ya activado",
  BLOCKED: "Bloqueado",
  VOID: "Anulado",
};

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
    defaultValues: { name: "", nationalId: "", whatsapp: "" },
  });

  const onValid = (customer: CustomerInput) => {
    startTransition(async () => {
      const { error, result } = await activateWarrantyAction(code, customer);
      if (error || !result) {
        toast.error(error ?? "No se pudo completar la operación.");
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
          <Input id="customerName" autoFocus {...register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.nationalId}>
          <FieldLabel htmlFor="customerNationalId">Identificación</FieldLabel>
          <Input id="customerNationalId" {...register("nationalId")} />
          <FieldError errors={[errors.nationalId]} />
        </Field>
        <Field data-invalid={!!errors.whatsapp}>
          <FieldLabel htmlFor="customerWhatsapp">WhatsApp</FieldLabel>
          <Input id="customerWhatsapp" placeholder="+584121234567" {...register("whatsapp")} />
          <FieldError errors={[errors.whatsapp]} />
          <FieldDescription>Formato internacional, con el signo +.</FieldDescription>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending} className="flex-1">
            {isPending ? "Activando..." : "Confirmar activación"}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Cancelar
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
  const [isSearching, startSearch] = useTransition();
  const [showScanner, setShowScanner] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const reset = () => {
    setPhase("idle");
    setCode("");
    setLookup(null);
    setActivated(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (phase === "success" && activated) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-primary" />
            <CardTitle>Garantía activada</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Producto</dt>
              <dd className="font-medium">{activated.product_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Serial</dt>
              <dd className="font-mono font-medium">{activated.serial}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Inicio</dt>
              <dd className="font-medium">{new Date(activated.activated_at).toLocaleDateString("es")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vence</dt>
              <dd className="font-medium">{new Date(activated.expires_at).toLocaleDateString("es")}</dd>
            </div>
          </dl>
          <div className="flex gap-2">
            <Button onClick={reset} className="flex-1">
              Activar otra garantía
            </Button>
            <Button render={<Link href="/tienda">Ver garantías</Link>} variant="outline" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Buscar serial</CardTitle>
          <CardDescription>Escribe el serial o código de barras, o escanéalo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
              className="flex-1"
              disabled={isSearching}
            />
            <Button type="submit" disabled={isSearching}>
              <Search className="size-4" />
              {isSearching ? "Buscando..." : "Buscar"}
            </Button>
          </form>
          <Button type="button" variant="outline" onClick={() => setShowScanner(true)} className="w-full">
            <ScanBarcode className="size-4" />
            Escanear con la cámara
          </Button>
        </CardContent>
      </Card>

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
        <Card>
          <CardContent className="flex items-center gap-3 pt-6 text-sm">
            <ShieldX className="size-5 text-destructive" />
            <div>
              <p className="font-medium">No existe ningún serial con ese código.</p>
              <p className="text-muted-foreground">Revisa que esté completo y sin espacios de más.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === "found" && lookup && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{lookup.product_name}</CardTitle>
              <Badge variant={lookup.status === "AVAILABLE" ? "secondary" : "destructive"}>
                {STATUS_LABEL[lookup.status]}
              </Badge>
            </div>
            <CardDescription className="font-mono">{lookup.serial}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Garantía de {lookup.warranty_duration_days} días desde la activación.
            </p>

            {lookup.status === "AVAILABLE" && (
              <Button onClick={() => setPhase("confirming")} className="w-full">
                Activar garantía
              </Button>
            )}
            {lookup.status === "ACTIVATED" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <ShieldAlert className="size-4 text-destructive" />
                Este serial ya tiene una garantía activada.
              </div>
            )}
            {lookup.status === "BLOCKED" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <ShieldAlert className="size-4 text-destructive" />
                Este serial está bloqueado y no puede activarse.
              </div>
            )}
            {lookup.status === "VOID" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <ShieldAlert className="size-4 text-destructive" />
                Este serial está anulado y no puede activarse.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {phase === "confirming" && lookup && (
        <Card>
          <CardHeader>
            <CardTitle>Datos del cliente</CardTitle>
            <CardDescription>
              {lookup.product_name} · {lookup.serial} · {lookup.warranty_duration_days} días de garantía
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerForm
              code={code}
              onCancel={() => setPhase("found")}
              onSuccess={(result) => {
                setActivated(result);
                setPhase("success");
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
