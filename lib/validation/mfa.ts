import { z } from "zod";

export const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { message: "Ingresa el código de 6 dígitos." }),
});

export type TotpCodeInput = z.infer<typeof totpCodeSchema>;
