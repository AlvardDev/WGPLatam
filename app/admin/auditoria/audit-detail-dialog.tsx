"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function AuditDetailDialog({
  oldData,
  newData,
  metadata,
}: {
  oldData: unknown;
  newData: unknown;
  metadata: unknown;
}) {
  const [open, setOpen] = useState(false);
  const hasMetadata = metadata && typeof metadata === "object" && Object.keys(metadata).length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Ver detalle">
            <Eye className="size-4" />
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalle del evento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {oldData ? (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Antes</p>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {JSON.stringify(oldData, null, 2)}
              </pre>
            </div>
          ) : null}
          {newData ? (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Después</p>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {JSON.stringify(newData, null, 2)}
              </pre>
            </div>
          ) : null}
          {hasMetadata ? (
            <div>
              <p className="mb-1 font-medium text-muted-foreground">Metadata</p>
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          ) : null}
          {!oldData && !newData && !hasMetadata ? (
            <p className="text-muted-foreground">Sin datos adicionales para este evento.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
