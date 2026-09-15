import { z } from "zod";

export const selectLotSchema = z.object({
  lotId: z.uuid("Selecciona un lote"),
});

export type SelectLotInput = z.infer<typeof selectLotSchema>;
