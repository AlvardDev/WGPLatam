"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldError, FieldDescription } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import {
  createImport,
  uploadFile,
  fetchPreviewCounts,
  confirmImport,
  commitLoop,
  cancelImportAction,
  type ImportCounts,
} from "@/lib/import/upload";
import { selectLotSchema } from "@/lib/validation/imports";

type Lot = { id: string; code: string; products: { name: string; code: string } | null };

type Step = "lote" | "archivo" | "subiendo" | "previa" | "confirmando" | "listo";

type ErrorRow = { row_number: number; serial: string; barcode: string; status: string; error_code: string | null };

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ImportWizard({ lots }: { lots: Lot[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("lote");
  const [lotId, setLotId] = useState("");
  const [lotError, setLotError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [rowsSent, setRowsSent] = useState(0);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [errorCursor, setErrorCursor] = useState<number | null>(null);
  const [hasMoreErrors, setHasMoreErrors] = useState(false);
  const [commitProgress, setCommitProgress] = useState({ committed: 0, conflicted: 0, remaining: 0 });
  const [busy, setBusy] = useState(false);

  const selectedLot = lots.find((l) => l.id === lotId);

  function onSelectLot() {
    const parsed = selectLotSchema.safeParse({ lotId });
    if (!parsed.success) {
      setLotError(parsed.error.issues[0]?.message ?? "Selecciona un lote.");
      return;
    }
    setLotError(null);
    setStep("archivo");
  }

  async function onStartUpload() {
    if (!file || !lotId) return;
    setBusy(true);
    const created = await createImport(lotId, file.name);
    if ("error" in created) {
      toast.error(created.error);
      setBusy(false);
      return;
    }
    setImportId(created.id);
    setStep("subiendo");
    const result = await uploadFile(created.id, file, (sent) => setRowsSent(sent));
    setBusy(false);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    const previewCounts = await fetchPreviewCounts(created.id);
    setCounts(previewCounts);
    await loadErrorPageFor(created.id, null);
    setStep("previa");
  }

  async function loadErrorPageFor(id: string, after: number | null) {
    const supabase = createClient();
    let query = supabase
      .from("serial_import_rows")
      .select("row_number, serial, barcode, status, error_code")
      .eq("import_id", id)
      .neq("status", "VALID")
      .order("row_number", { ascending: true })
      .limit(50);
    if (after !== null) query = query.gt("row_number", after);
    const { data } = await query.returns<ErrorRow[]>();
    const rows = data ?? [];
    setErrorRows(rows);
    setHasMoreErrors(rows.length === 50);
    setErrorCursor(rows.length > 0 ? rows[rows.length - 1].row_number : after);
  }

  async function onConfirm() {
    if (!importId) return;
    setBusy(true);
    setStep("confirmando");
    const confirmed = await confirmImport(importId);
    if (confirmed.error) {
      toast.error(confirmed.error);
      setBusy(false);
      return;
    }
    const result = await commitLoop(importId, (committed, conflicted, remaining) =>
      setCommitProgress({ committed, conflicted, remaining }),
    );
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setStep("listo");
  }

  async function onCancel() {
    if (!importId) return;
    setBusy(true);
    const result = await cancelImportAction(importId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Importación cancelada. Ningún serial fue creado.");
    router.push("/admin/importaciones");
  }

  if (step === "lote") {
    return (
      <div className="max-w-md">
        <FieldGroup>
          <Field data-invalid={!!lotError}>
            <FieldLabel htmlFor="lotId">Lote destino</FieldLabel>
            <select
              id="lotId"
              value={lotId}
              onChange={(e) => setLotId(e.target.value)}
              className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Selecciona un lote</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.products?.name} — {l.code}
                </option>
              ))}
            </select>
            <FieldError errors={[lotError ? { message: lotError } : undefined]} />
            <FieldDescription>Todos los seriales del archivo se crearán bajo este lote.</FieldDescription>
          </Field>
          <Button type="button" onClick={onSelectLot}>
            Continuar
          </Button>
        </FieldGroup>
      </div>
    );
  }

  if (step === "archivo") {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">
          Lote: <span className="font-medium text-foreground">{selectedLot?.products?.name} — {selectedLot?.code}</span>
        </p>
        <Field>
          <FieldLabel htmlFor="file">Archivo (.csv, .xlsx o .txt)</FieldLabel>
          <input
            id="file"
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <FieldDescription>
            .csv/.xlsx: columna &quot;serial&quot; obligatoria, &quot;codigo_barras&quot; opcional. .txt: un serial por
            línea, sin código de barras — se completa después.
          </FieldDescription>
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setStep("lote")} disabled={busy}>
            Atrás
          </Button>
          <Button type="button" onClick={onStartUpload} disabled={!file || busy}>
            {busy ? "Analizando..." : "Analizar archivo"}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "subiendo") {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">Analizando y subiendo el archivo por bloques...</p>
        <ProgressBar value={rowsSent} max={Math.max(rowsSent, 1)} label={`${rowsSent} filas procesadas`} />
      </div>
    );
  }

  if (step === "previa" && counts) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-semibold">{counts.total}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-semibold text-emerald-600">{counts.valid}</div>
            <div className="text-sm text-muted-foreground">Válidas</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-semibold text-amber-600">{counts.duplicate}</div>
            <div className="text-sm text-muted-foreground">Duplicadas</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-semibold text-destructive">{counts.error}</div>
            <div className="text-sm text-muted-foreground">Con error</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-2xl font-semibold text-amber-600">{counts.missingBarcode}</div>
            <div className="text-sm text-muted-foreground">Sin código de barras</div>
          </div>
        </div>

        {errorRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Filas que no se importarán</p>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fila</TableHead>
                    <TableHead>Serial</TableHead>
                    <TableHead>Código de barras</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errorRows.map((r) => (
                    <TableRow key={r.row_number}>
                      <TableCell className="text-sm text-muted-foreground">{r.row_number}</TableCell>
                      <TableCell className="font-mono text-sm">{r.serial}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{r.barcode}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.status} · {r.error_code}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasMoreErrors && importId && (
              <Button variant="outline" size="sm" onClick={() => loadErrorPageFor(importId, errorCursor)}>
                Ver más
              </Button>
            )}
            {importId && (
              <a
                href={`/admin/importaciones/${importId}/errores`}
                className="block text-sm text-primary hover:underline"
              >
                Descargar reporte completo de errores (CSV)
              </a>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar importación
          </Button>
          <Button type="button" onClick={onConfirm} disabled={busy || counts.valid === 0}>
            Confirmar e importar {counts.valid} seriales
          </Button>
        </div>
      </div>
    );
  }

  if (step === "confirmando") {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">Creando los seriales...</p>
        <ProgressBar
          value={commitProgress.committed + commitProgress.conflicted}
          max={commitProgress.committed + commitProgress.conflicted + commitProgress.remaining}
          label={`${commitProgress.committed} creados, ${commitProgress.conflicted} en conflicto`}
        />
      </div>
    );
  }

  if (step === "listo") {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm">
          Importación completada: <span className="font-medium">{commitProgress.committed}</span> seriales creados
          {commitProgress.conflicted > 0 && (
            <>, <span className="font-medium">{commitProgress.conflicted}</span> en conflicto (ya existían)</>
          )}
          .
        </p>
        {counts && counts.missingBarcode > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            {counts.missingBarcode} de esos seriales quedaron sin código de barras. Podés completarlo después desde
            Seriales.
          </p>
        )}
        <Button type="button" onClick={() => router.push(`/admin/importaciones/${importId}`)}>
          Ver detalle
        </Button>
      </div>
    );
  }

  return null;
}
