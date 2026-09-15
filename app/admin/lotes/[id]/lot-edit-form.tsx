"use client";

import { updateLot } from "@/lib/actions/lots";
import type { LotUpdateInput } from "@/lib/validation/lots";
import { LotForm } from "../lot-form";

export function LotEditForm({ id, defaultValues }: { id: string; defaultValues: LotUpdateInput }) {
  return (
    <LotForm
      mode="edit"
      defaultValues={defaultValues}
      onSubmit={(values) => updateLot(id, values)}
      onSuccess={() => {}}
    />
  );
}
