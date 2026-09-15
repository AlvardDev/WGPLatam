"use client";

import { updateStore } from "@/lib/actions/stores";
import { StoreForm } from "../store-form";
import type { StoreUpdateInput } from "@/lib/validation/stores";

export function StoreEditForm({ id, defaultValues }: { id: string; defaultValues: StoreUpdateInput }) {
  return (
    <StoreForm
      mode="edit"
      defaultValues={defaultValues}
      onSubmit={(values) => updateStore(id, values)}
      onSuccess={() => {}}
    />
  );
}
