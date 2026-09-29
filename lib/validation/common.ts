import { z } from "zod";

// Sin z.coerce: react-hook-form convierte con valueAsNumber (campo vacío = NaN,
// que z.number() rechaza como invalid_type → mensaje de abajo).
export const warrantyDaysSchema = z
  .number({ error: "Ingresa la duración en días" })
  .int("Solo días enteros, sin decimales")
  .min(1, "Debe ser al menos 1 día")
  .max(9999, "Máximo 9999 días");
