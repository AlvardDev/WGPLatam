"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { purgeImportStaging } from "@/lib/import/upload";

export function PurgeStagingButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onPurge() {
    setBusy(true);
    const result = await purgeImportStaging(importId);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Detalle de staging eliminado. Los conteos finales se conservan.");
    router.refresh();
  }

  return (
    <Button type="button" variant="outline" onClick={onPurge} disabled={busy}>
      Limpiar detalle de staging
    </Button>
  );
}
