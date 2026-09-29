"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { deleteEntity, getDeleteBlockers, type Blocker, type DeletableEntity } from "@/lib/actions/deletion";

const NOUN: Record<DeletableEntity, { el: string; name: string }> = {
  store: { el: "la tienda", name: "Tienda" },
  product: { el: "el producto", name: "Producto" },
  lot: { el: "el lote", name: "Lote" },
  serial: { el: "el serial", name: "Serial" },
};

/**
 * Botón "Eliminar" con aviso de historial: al abrir, cuenta lo que depende
 * del registro. Con historial, explica qué hay y no deja borrar (borrarlo
 * dejaría garantías, reclamos o seriales huérfanos); sin historial, pide
 * confirmar. La base rechaza igual cualquier borrado con dependencias.
 */
export function DeleteEntityDialog({
  entity,
  id,
  label,
  redirectTo,
}: {
  entity: DeletableEntity;
  id: string;
  label: string;
  redirectTo: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [blockers, setBlockers] = useState<Blocker[] | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [isChecking, startChecking] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const noun = NOUN[entity];

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    setBlockers(null);
    setCheckError(null);
    startChecking(async () => {
      const res = await getDeleteBlockers(entity, id);
      if (res.error) setCheckError(res.error);
      else setBlockers(res.blockers ?? []);
    });
  };

  const onDelete = () =>
    startDeleting(async () => {
      const res = await deleteEntity(entity, id);
      if (res.error) {
        toast.error("No se pudo eliminar", { description: res.error });
        return;
      }
      toast.success(`${noun.name} eliminado`, { description: label });
      setOpen(false);
      router.replace(redirectTo);
    });

  const blocked = !!blockers && blockers.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button variant="destructive">
            <Trash2 className="size-4" />
            Eliminar
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Eliminar {noun.el} {label}
          </DialogTitle>
          <DialogDescription>Revisando si tiene historial asociado antes de eliminar.</DialogDescription>
        </DialogHeader>

        {isChecking || (!blockers && !checkError) ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Revisando historial...
          </div>
        ) : checkError ? (
          <p className="text-sm text-destructive">{checkError}</p>
        ) : blocked ? (
          <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="size-4 shrink-0" />
              No se puede eliminar: tiene historial
            </p>
            <ul className="list-disc space-y-0.5 pl-5">
              {blockers.map((b) => (
                <li key={b.label}>{b.count > 0 ? `${b.count.toLocaleString("es")} ${b.label}` : `El serial ${b.label}`}</li>
              ))}
            </ul>
            <p>
              Borrarlo dejaría esos registros sin su {noun.name.toLowerCase()} y dañaría el historial de garantías del
              sistema. Si ya no se usa, <strong>desactívalo</strong>: deja de aparecer para operar pero conserva la historia.
            </p>
          </div>
        ) : (
          <div className="flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              No tiene historial asociado, así que se puede eliminar. <strong>Esta acción no se puede deshacer</strong>{" "}
              (queda registrada en Auditoría).
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {blocked ? "Entendido" : "Cancelar"}
          </Button>
          {!blocked && blockers ? (
            <Button
              onClick={onDelete}
              disabled={isDeleting}
              className="bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700"
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {isDeleting ? "Eliminando..." : "Eliminar definitivamente"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
