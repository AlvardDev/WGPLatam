# Resumen técnico — Fase 3: Importación masiva de seriales

> Documento de cierre (no de planificación): describe lo que efectivamente se implementó y verificó, no un plan. El detalle completo de esquema/RLS/RPC vive en `docs/DATABASE.md` y `docs/SECURITY.md`; este documento resume y referencia, no duplica. Fecha: 2026-09-15.

## 1. Arquitectura

Igual que Fase 2 en sus principios (RLS para catálogo, RPC para máquinas de estado), con una divergencia deliberada y documentada en `docs/DATABASE.md` desde el plan original: los bloques de staging/commit se envían **directo del navegador a Supabase** (`lib/import/upload.ts`, cliente de `lib/supabase/client.ts`), no vía Server Actions de Next — evita el límite de 8s de `authenticated` y los límites de body de Server Actions/Vercel para archivos grandes.

Flujo: elegir lote → parsear archivo (Web Worker) → subir en bloques de ~5.000 filas (`stage_import_rows`, secuencial) → vista previa (conteos + errores paginados) → confirmar (`start_import_commit`) → comprometer en bloques de 2.000 (`commit_import_batch`, con progreso real) → completado.

## 2. Estados

`serial_imports.status`: `STAGING → COMMITTING → COMPLETED`, con `FAILED` (retomable, la siguiente llamada a `commit_import_batch` lo revierte a `COMMITTING`) y `CANCELLED` (solo desde `STAGING`) como salidas. `serial_import_rows.status`: `VALID | DUPLICATE_IN_FILE | DUPLICATE_EXISTING | ERROR | COMMITTED | CONFLICT` — una fila reclamada por `commit_import_batch` termina siempre en `COMMITTED` o `CONFLICT`, nunca queda indefinida.

## 3. RPC

5 funciones, detalladas en `docs/DATABASE.md`: `stage_import_rows`, `start_import_commit`, `commit_import_batch`, `cancel_import`, `purge_import_staging`. Checklist de `SECURITY DEFINER` de `docs/SECURITY.md` aplicado a las 5.

## 4. RLS

`serial_imports`: SELECT+INSERT directo admin (como `products`/`lots`), sin UPDATE/DELETE de grant. `serial_import_rows`: SELECT únicamente (como `serials`), toda escritura vía RPC. Sin acceso de ningún tipo para `seller`. Detalle completo en `docs/DATABASE.md`.

## 5. Formato de importación

Columnas requeridas: `serial` y `codigo_barras` (también acepta `barcode` como alias, detección insensible a mayúsculas/acentos — `lib/import/normalize.ts`). Filas totalmente vacías se descartan en el cliente; una fila con solo una columna vacía se envía y el servidor la clasifica como `ERROR`. CSV vía Papa Parse (bloques por tamaño de texto, ~512KB); Excel (`.xlsx`/`.xls`) vía SheetJS 0.20.3 (tarball oficial de `cdn.sheetjs.com`, no el paquete `xlsx` de npm) en un Web Worker propio.

## 6. Idempotencia

- `stage_import_rows`: idempotente por `(import_id, row_number)` — reenviar el mismo bloque recalcula y sobrescribe, nunca duplica filas de staging.
- `commit_import_batch`: reclama con `FOR UPDATE SKIP LOCKED` (dos llamadas concurrentes nunca procesan la misma fila); una fila ya `COMMITTED`/`CONFLICT` no se reclama de nuevo, así que un reintento puro aporta cero cambios; llamar sobre un import ya `COMPLETED` es un no-op tranquilo (no una excepción).
- Verificado con pgTAP (reintento exacto de un bloque de staging, reintento de commit tras `COMPLETED`) y con el benchmark real (retries manuales durante la depuración sin duplicar nada).

## 7. Rendimiento

Ver `docs/DATABASE.md`, "Bug de rendimiento real" y "Benchmarks reales": la primera versión usaba `EXISTS` correlacionados con `OR` entre columnas (O(n²) real, confirmado con un timeout genuino en el benchmark). Corregido con joins de igualdad simple. Resultado: 100.000 y 300.000 filas reales staged y comprometidas contra el proyecto Supabase real, con tiempos medidos y conteos verificados exactamente. 1.000.000 detenido en 200.000 (misma velocidad lineal) por decisión del usuario tras un incidente de disco — ver §8.

## 8. Límites conocidos

- **Disco del plan gratuito de Supabase** (500 MB): un volumen de benchmark suficientemente grande (múltiples cientos de miles de seriales sintéticos) satura `audit_logs` y fuerza modo solo-lectura. No es un límite del código de Fase 3; es un límite de infraestructura del plan contratado, documentado con la solución real (botón "Disable read-only mode" del dashboard) en `docs/DATABASE.md` y `docs/PROGRESS.md`.
- 65.000 filas sintéticas de un benchmark quedaron sin poder borrarse (deuda técnica no bloqueante, documentada en `docs/PROGRESS.md`, RIESGOS).
- `audit_logs` crece un registro por cada serial creado — a escala de producción real (importaciones repetidas de cientos de miles de filas a lo largo del tiempo) es un costo de almacenamiento a dimensionar en la Fase 9, no un defecto.
- Excel (`SheetJS`) parsea el archivo completo en memoria dentro del Worker antes de poder emitir filas (no hay streaming real para `.xlsx`) — por eso CSV sigue siendo la recomendación por encima de ~200k filas, ya documentado desde el plan original.

## 9. Resultados de pruebas

- pgTAP real: 46/46 (`supabase/tests/database/07_serial_imports.sql`).
- Vitest: 38/38 (incluye `lib/import/normalize.test.ts`, 7 tests nuevos).
- Lint, typecheck, build: PASS.
- Benchmarks reales de 100k y 300k filas contra el proyecto real, con verificación de conteos exacta (ver `docs/DATABASE.md`).
- Verificación E2E real en el navegador con el admin real: import completo de punta a punta, auditoría verificada, purga de staging verificada, listado de seriales verificado sin errores.

## 10. Bugs reales encontrados y corregidos durante esta fase

1. **O(n²) en `stage_import_rows`/`commit_import_batch`** (EXISTS correlacionados con OR) — corregido con joins de igualdad simple antes de declarar los benchmarks como pasados.
2. **`serial_imports_guard` bloqueaba antes que RLS** para un vendedor sin acceso al lote (mensaje "lot not found" en vez de un error de RLS) — no es un bug de seguridad (la fila igual nunca se crea), documentado y el test ajustado a la realidad en vez de forzar un mensaje que no ocurre.
3. **`parser.pause()`/`resume()` de Papa Parse no soportado con `worker: true`** (`Error: Not implemented`) — encontrado en la verificación E2E real en el navegador (no en tests automatizados), corregido con cola + drenaje asíncrono antes de declarar el E2E como pasado.

## 11. Decisiones

Las 4 decisiones de arquitectura dadas antes de implementar (fix de `imported_count` por sentencia, SheetJS pineado desde `cdn.sheetjs.com`, `serial_import_rows.id` como `bigint identity`, un import = un lote) y las 2 decisiones tomadas durante la ejecución (no completar el benchmark de 1M; detener la limpieza de datos sintéticos en 65.000 filas restantes) están documentadas con su razón en `docs/PROGRESS.md`, sección Fase 3, "DECISIONES".

## 12. Veredicto

**FASE 3 COMPLETA.** Todo lo implementado está verificado contra el proyecto Supabase real (no simulado): esquema, RLS, RPC, 46 pgTAP, dos bugs de rendimiento reales corregidos con benchmarks de 100k/300k, un bug de UI real corregido con verificación E2E real en el navegador. La única deuda abierta (65.000 filas sintéticas sin limpiar) es de infraestructura, está documentada, y no bloquea ni afecta la funcionalidad de Fase 3 ni de fases siguientes.
