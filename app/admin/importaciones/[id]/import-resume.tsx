"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { uploadFile, fetchPreviewCounts, confirmImport, commitLoop, cancelImportAction } from "@/lib/import/upload";

// Reanudación (docs/DATABASE.md, "Resiliencia"): STAGING -> hace falta
// reseleccionar el mismo archivo (stage_import_rows es idempotente por
// row_number, no duplica nada ya subido). COMMITTING/FAILED -> no hace falta
// el archivo, el staging ya está completo en la base; solo se vuelve a
// invocar commit_import_batch en bucle.
export function ImportResume({ importId, status }: { importId: string; status: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowsSent, setRowsSent] = useState(0);
  const [commitProgress, setCommitProgress] = useState({ committed: 0, conflicted: 0, remaining: 0 });
  const [done, setDone] = useState(false);

  async function onResumeStaging() {
    if (!file) return;
    setBusy(true);
    const result = await uploadFile(importId, file, (sent) => setRowsSent(sent));
    if ("error" in result) {
      toast.error(result.error);
      setBusy(false);
      return;
    }
    await fetchPreviewCounts(importId);
    toast.success("Archivo reanudado. Revisa la vista previa antes de confirmar.");
    setBusy(false);
    router.refresh();
  }

  async function onResumeCommit() {
    setBusy(true);
    const confirmed = status === "FAILED" ? { error: undefined } : await confirmImport(importId);
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
    setDone(true);
    router.refresh();
  }

  async function onCancel() {
    setBusy(true);
    const result = await cancelImportAction(importId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Importación cancelada.");
    router.refresh();
  }

  if (status === "STAGING") {
    return (
      <div className="max-w-md space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Esta importación quedó en preparación (STAGING).</p>
        <p className="text-sm text-muted-foreground">
          Selecciona de nuevo el mismo archivo para continuar donde se quedó — no se duplica lo ya subido.
        </p>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
        {busy && <p className="text-sm text-muted-foreground">{rowsSent} filas procesadas...</p>}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar importación
          </Button>
          <Button type="button" onClick={onResumeStaging} disabled={!file || busy}>
            Reanudar carga
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md space-y-3 rounded-lg border p-4">
      <p className="text-sm font-medium">
        {status === "FAILED"
          ? "Esta importación tuvo un error inesperado a mitad de proceso."
          : "Esta importación quedó confirmada pero sin terminar (COMMITTING)."}
      </p>
      <p className="text-sm text-muted-foreground">
        El staging ya está completo en la base — no hace falta el archivo original, solo continuar.
      </p>
      {busy && (
        <p className="text-sm text-muted-foreground">
          {commitProgress.committed} creados, {commitProgress.conflicted} en conflicto...
        </p>
      )}
      {done && <p className="text-sm text-emerald-600">Importación completada.</p>}
      <Button type="button" onClick={onResumeCommit} disabled={busy || done}>
        Reanudar confirmación
      </Button>
    </div>
  );
}
