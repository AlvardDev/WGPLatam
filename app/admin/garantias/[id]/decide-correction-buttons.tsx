"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideCorrectionAction } from "@/lib/actions/warranties";

export function DecideCorrectionButtons({ correctionId, warrantyId }: { correctionId: string; warrantyId: string }) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const decide = (decision: "APPROVED" | "REJECTED") => {
    startTransition(async () => {
      const result = await decideCorrectionAction(correctionId, warrantyId, { decision, note: note.trim() || undefined });
      if (result.error) toast.error(result.error);
      else {
        toast.success(decision === "APPROVED" ? "Corrección aprobada." : "Corrección rechazada.");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Nota (opcional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="h-8 max-w-56"
      />
      <Button size="sm" onClick={() => decide("APPROVED")} disabled={isPending}>
        Aprobar
      </Button>
      <Button size="sm" variant="destructive" onClick={() => decide("REJECTED")} disabled={isPending}>
        Rechazar
      </Button>
    </div>
  );
}
