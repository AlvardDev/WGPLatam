# Fase 6 — Correcciones, PDF, notificaciones y cancelación (revisión)

> No es un rediseño. Auditoría de F1–F5 antes de codificar + implementación de todo lo pedido en el alcance real de F6 (`docs/PROJECT-PLAN.md`, sección H/I, `docs/DATABASE.md`).

## 0. Auditoría previa (antes de escribir código)

`warranty_corrections` y `notifications` (outbox) **ya estaban completamente especificadas** desde la Fase 0 en `docs/DATABASE.md` ("Tablas", "RLS", "RPC críticos") y `docs/PROJECT-PLAN.md` (secciones D, H, I) — no había que inventar el esquema, solo implementarlo tal cual estaba documentado. `warranties.voided_at/voided_by/voided_reason` ya existían desde la Fase 5, reservados sin usar; el trigger de inmutabilidad (`private.warranties_guard_immutable`) ya permitía cambiarlos (junto con `customer_*`), así que no hubo que tocarlo.

**Discrepancia real encontrada**: `docs/PROJECT-PLAN.md` sección H deja explícitamente sin decidir "qué pasa con el serial liberado (vuelve a AVAILABLE o pasa a VOID) — se decide en la Fase 6". No estaba definida. Se presentó la decisión al usuario en vez de inventarla (ver sección 4).

## 1. Correcciones de garantías

- `warranty_corrections` (migración `phase6_corrections.sql`): esquema exacto de `docs/DATABASE.md` — `warranty_id, store_id, requested_by, field, old_value, new_value, reason, status (PENDING|APPROVED|REJECTED), decided_by, decided_at, decision_note`. Unique parcial `(warranty_id, field) where status='PENDING'`.
- **Campos corregibles**: solo `customer_name`, `customer_national_id`, `customer_whatsapp` — los mismos 3 que `warranties_guard_immutable` (Fase 5) ya permite cambiar. El `CHECK` de la tabla es defensa en profundidad explícita; aunque no existiera, el trigger de inmutabilidad rechazaría cualquier otro campo igual.
- `request_correction(warranty_id, field, new_value, reason)`: solo vendedor de la tienda dueña, solo si `now() >= activated_at + 24h` (antes de eso, la vía sigue siendo `update_warranty_customer`), solo si la garantía no está anulada, `old_value` se congela con el valor **real vigente** en `warranties` en ese instante (no lo que el vendedor cree que es).
- `decide_correction(correction_id, decision, note)`: solo admin, solo sobre `PENDING`. Si `APPROVED`, relee el valor actual con `FOR UPDATE` y lo compara contra `old_value`; si cambió desde que se pidió (otra corrección aprobada, o edición directa), rechaza en vez de sobrescribir un valor que el vendedor nunca vio. Aplica el cambio con un `UPDATE` de `CASE` por columna (sin SQL dinámico, checklist de `SECURITY.md`). Auditado por el trigger genérico (`audit_warranty_corrections` para la fila de corrección, `audit_warranties` para el cambio aplicado) — ningún mecanismo de auditoría nuevo.
- Frontend: `/tienda/garantias/[id]` muestra el formulario de corrección (3 campos + motivo) cuando pasaron las 24h; se pide una corrección por cada campo que realmente cambió. `/admin/garantias/[id]` muestra el historial con botones Aprobar/Rechazar + nota opcional en cada `PENDING`.

## 2. Cancelación (anulación) de garantías

- `void_warranty(warranty_id, reason)`: solo admin, motivo obligatorio, rechaza si ya estaba anulada. Marca `voided_at/voided_by/voided_reason`; nunca `DELETE`. Auditado por el trigger genérico ya existente (Fase 5), sin mecanismo nuevo.
- **Decisión de negocio confirmada explícitamente por el usuario** (revisión de cierre de F6, 2026-09-16): el serial **NO cambia de estado** al anular. El caso de uso real documentado ("serial equivocado": se anula esa garantía y se activa un serial *distinto*) no requiere liberar el mismo serial. Liberarlo para reutilización queda **DEFERRED** — decisión de negocio aparte, fuera de esta fase, para no arriesgar una garantía duplicada sobre el mismo serial.
- `request_correction`/`update_warranty_customer`/`decide_correction` (aprobar) rechazan actuar sobre una garantía ya anulada — "bloqueo de acciones incompatibles" (alcance pedido, sección 27).
- Frontend: botón "Anular garantía" en `/admin/garantias/[id]` (diálogo de confirmación con motivo, mismo patrón que `block_serial`/`void_serial` de F2), banner "GARANTÍA ANULADA" en ambas vistas de detalle y en el listado admin.

## 3. PDF

- `GET /api/garantias/[id]/comprobante` (Route Handler, `runtime = "nodejs"`, `@react-pdf/renderer`), mismo patrón ya usado por `/admin/importaciones/[id]/errores` (comentario en ese archivo ya anticipaba esto). Sesión del usuario vía `lib/supabase/server.ts` (RLS decide: otra tienda → 404, nunca cliente de service role).
- Contenido tomado **exclusivamente del snapshot** de `warranties` (nunca products/lots vigentes): empresa (`app_settings`), producto, serial, código de barras, lote, cliente, tienda, activación, duración, vencimiento, política de atención, condiciones, exclusiones, soporte, "emitido el …".
- Garantía anulada: **decisión de negocio confirmada explícitamente por el usuario** (revisión de cierre de F6, 2026-09-16) — el PDF se genera igual, con un aviso "GARANTÍA ANULADA" + motivo + fecha en rojo en la parte superior (no se bloquea la descarga: es un documento histórico legítimo).
- `?download=1` fuerza `Content-Disposition: attachment`; sin el parámetro, `inline`.
- **DEFERRED**: logo embebido (`app_settings.logo_path`, bucket `branding`). Ningún proyecto real tiene un logo cargado todavía para probar el embed contra datos reales — se prefirió no afirmar que funciona sin haberlo verificado. El nombre de la empresa sí aparece en texto.

## 4. Notificaciones (outbox)

- `notifications` (migración `phase6_notifications.sql`): esquema exacto de `docs/DATABASE.md`/`ARCHITECTURE.md` — `type, recipient, payload, status, attempts, last_error, sent_at`, más dos adiciones necesarias no cubiertas por el diseño original y documentadas como tales en el propio archivo:
  - `available_at` (backoff de reintentos).
  - Estado `PROCESSING` (4to valor del CHECK, junto a `PENDING|SENT|FAILED`): necesario porque "reclamar" un lote (`claim_notifications`) y "enviarlo" (Edge Function → Resend) son transacciones separadas — `SKIP LOCKED` protege solo la primera. Sin un estado intermedio persistente, dos invocaciones solapadas de la Edge Function podrían reclamar y enviar el mismo correo dos veces.
- `activate_warranty` (migración `phase6_void_and_outbox.sql`, `create or replace` sobre la versión de F5, sin editar el archivo de F5): al final de la misma transacción, inserta una notificación `warranty_activated` por cada correo en `notification_settings.admin_notification_emails`, solo si `email_enabled`. Si la lista está vacía, no se inserta nada — no hay tabla `customers` ni correo del cliente (decisión de MVP ya documentada; no se inventó una).
- `claim_notifications(batch_size)` / `complete_notification(id, ok, error)`: únicas 2 RPC, **grant execute solo a `service_role`** (ni `authenticated` ni `anon`, ni siquiera admin) — el envío de email es responsabilidad exclusiva del worker, no de un usuario de la app. `claim_notifications` reclama con `FOR UPDATE SKIP LOCKED`, marca `PROCESSING` e incrementa `attempts` atómicamente. `complete_notification` decide el resultado: éxito → `SENT` + `sent_at`; fallo con reintentos disponibles → vuelve a `PENDING` con backoff exponencial (1, 2, 4, 8, 16 min); fallo al agotar 5 intentos → `FAILED` definitivo. Nunca marca `SENT` sin pasar por esta función con `ok=true` (confirmación real del proveedor).

## 5. NotificationService → EmailProvider → Resend

- `supabase/functions/dispatch-notifications/`:
  - `email-provider.ts` (~20 líneas): `sendEmail(to, from, subject, html)` → `fetch` directo a la API de Resend (sin SDK). Único lugar que conoce Resend.
  - `notification-service.ts`: `buildEmail(type, warranty)` (pura, arma asunto/cuerpo) + `processPending(deps, batchSize)` (orquesta: reclama → arma email → envía → cierra cada fila con el resultado real). Recibe sus dependencias (claim/complete/getWarranty/getFrom/send) inyectadas — permite probarlo sin red ni base real.
  - `index.ts`: `Deno.serve`, arma las dependencias reales con `@supabase/supabase-js` + la clave de servicio, delega todo a `processPending`.
  - `notification-service.test.ts`: self-check con Deno test (`buildEmail` puro + `processPending` con un `EmailProvider` falso, incluyendo el camino de fallo).
- `RESEND_API_KEY` **nunca** en `.env`/Next: es secreto exclusivo de la Edge Function (`npx supabase secrets set RESEND_API_KEY=...`). `notification_settings.from_email/from_name/email_enabled` (ALTER TABLE en la migración de outbox) son configuración **funcional**, no secreta, editable desde `/admin/ajustes` (nueva sección "Notificaciones").
- `pg_cron`/`pg_net` habilitados (migración `phase6_notifications_cron.sql`). **El `cron.schedule(...)` real NO se versionó** (requeriría hardcodear la URL del proyecto + el `service_role key` en un archivo de git — exactamente lo que `CLAUDE.md` prohíbe). El SQL exacto a correr una vez, manualmente, con los valores reales del proyecto, queda documentado como comentario en esa misma migración. Mientras tanto, la función se puede invocar a mano (`npx supabase functions invoke dispatch-notifications`).

## 6. Seguridad

- Checklist de `SECURITY.md` aplicado a las 5 RPC nuevas (`request_correction`, `decide_correction`, `void_warranty`, `claim_notifications`, `complete_notification`): `search_path=''`, referencias calificadas, revoke explícito de `anon`/`public` (y de `authenticated` para las 2 del outbox), re-verificación de rol/tienda contra `profiles` vía `auth.uid()`, ningún parámetro de identidad confiado a ciegas.
- `update_warranty_customer` (F5) se reemplazó (`create or replace`, mismo archivo de F6, sin tocar la migración de F5) para rechazar también sobre una garantía ya anulada.
- Sin SQL dinámico en ningún lado nuevo (el `UPDATE` condicional de `decide_correction` usa `CASE`, no `format()`).
- `notifications`/`warranty_corrections`: RLS con el mismo molde ya probado (`revoke all` + políticas explícitas); sin política de escritura directa para nadie salvo las RPC.

## 7. Tests

### pgTAP — `supabase/tests/database/10_corrections_void_notifications.sql` (55 casos)

Cubre: `request_correction` (autorizado/no autorizado, ventana de 24h en ambos sentidos, otra tienda, campo prohibido, motivo vacío, formato E.164, duplicado pendiente, garantía anulada), `decide_correction` (permisos, decisión inválida, corrección inexistente, aprobar/rechazar, re-decisión, concurrencia real del valor cambiado, aprobar sobre garantía anulada), `void_warranty` (permisos, validaciones, éxito, no-doble-anulación, no-DELETE-físico, serial sin tocar, auditoría), RLS de `warranty_corrections`/`notifications`, seguridad del outbox (`claim_notifications`/`complete_notification` deniegan a cualquier rol de API, incluido admin), y el comportamiento funcional real de `claim_notifications`/`complete_notification` (reclamo atómico, no-doble-reclamo, backoff, FAILED al agotar reintentos, SENT solo con confirmación).

**Aplicado y corrido contra el proyecto Supabase real** (mismo proyecto y método que F1–F5: SQL Editor del dashboard, el CLI sigue sin poder conectarse desde esta red). Las 4 migraciones de esta fase se aplicaron una por una, cada una con "Success. No rows returned".

**pgTAP: 55/55 — verificado, con el detalle identificado y corregido (no era el código de producción, era el propio test):**

1. `CREATE TEMP TABLE t6_ids` sin `GRANT SELECT ... TO authenticated` — corregido agregando el grant (igual que F5 ya lo hacía para su propia tabla temporal).
2. **1 caso fallaba real y consistentemente**: el fixture insertaba las garantías "viejas" (`w2`/`w3`, >24h) directo en `warranties` (bypaseando `activate_warranty`, único camino real que activa un serial) pero **nunca actualizaba `serials.status` a `'ACTIVATED'`** para `F6-SER-OLD1`/`F6-SER-OLD2` — quedaban en `'AVAILABLE'` (el default de `create_serial`). La aserción "anular la garantía NO cambia el estado del serial" comparaba entonces contra un estado que nunca representó una garantía activada de verdad. **Confirmado por lectura del código que `void_warranty` no toca `serials` en ningún camino** (solo hace `UPDATE warranties SET voided_at/voided_by/voided_reason`) — el bug era 100% del fixture del test, no de la RPC. Corregido agregando `UPDATE public.serials SET status = 'ACTIVATED' WHERE serial IN ('F6-SER-OLD1', 'F6-SER-OLD2')` inmediatamente después del INSERT directo de los fixtures, con el motivo documentado en un comentario en el propio archivo de test.
3. Al re-copiar el archivo corregido al SQL Editor, apareció además un aviso real del linter de Supabase ("UPDATE sin WHERE puede afectar todas las filas") sobre `UPDATE notification_settings SET ... ;` del fixture — sin `WHERE id = true` (tabla singleton de una fila, mismo patrón que `app_settings`). Funcionalmente inofensivo (una sola fila existe), pero corregido para no dejar un `UPDATE` sin acotar en el repo.
4. Identificar el caso exacto que fallaba requirió envolver las 55 aserciones en un `INSERT INTO tap_results SELECT is(...)/ok(...)/throws_like(...)/lives_ok(...)` (tabla temporal) para poder leer las 55 líneas TAP de una sola corrida — el Editor SQL de Supabase solo muestra el resultado de la última sentencia. Con esa envoltura: `total=55, failed=0` confirmado en una sola fila de resultado, sin ambigüedad.

Corridas totales: 4 (grant de `t6_ids` → localizó el fallo real vía fixture-wrapping → fix del fixture de `serials` → fix del `WHERE id = true` + confirmación final 55/55). La hipótesis anterior de "problema de acentos por el portapapeles" **no era la causa real** — sí hubo un problema de codificación real (PowerShell `Get-Content` sin `-Encoding UTF8` mojibakeaba tildes al copiar al portapapeles), pero no afectaba el resultado de los tests porque el mismo valor mojibakeado se insertaba y se comparaba consistentemente; se corrigió aparte por higiene, no porque causara el fallo.

### Vitest

`lib/validation/warranties.test.ts` ampliado con `requestCorrectionSchema`/`decideCorrectionSchema`/`voidWarrantySchema` (11 casos nuevos). Corrido de verdad: **62/62 PASS** (54 previos de F1–F5 + 8 nuevos; el archivo de F6 quedó con 15 tests en total, 4 más que los 11 nuevos porque también se reejecutan los de `customerSchema`/`serialLookupSchema` ya existentes).

### Deno (Edge Function)

`supabase/functions/dispatch-notifications/notification-service.test.ts`: 4 casos (`buildEmail` con/sin datos de garantía, `processPending` con éxito+fallo mezclados marcando el resultado real de cada uno, lote vacío nunca llama `send`). **Escrito pero NO ejecutado**: ni Deno ni Docker están instalados en esta máquina de desarrollo (verificado: `deno --version` y `docker --version` no encontrados). Mismo criterio que `supabase/tests/database/README.md` ya documentaba para pgTAP en F1: no se marca como PASS sin haberlo corrido.

### Playwright / E2E

**BLOCKED**, mismo motivo exacto que F4/F5: probar el flujo autenticado (corregir, anular, descargar PDF, ver el outbox) requiere una sesión real de vendedor/admin, y este proyecto no usa/pide contraseñas reales de usuarios del cliente. No se marca como PASS.

## 8. Typecheck / Lint / Build

Los 3 corridos de verdad tras cada cambio relevante:

- **Typecheck (`tsc --noEmit`)**: PASS. Se excluyó `supabase/functions/**` de `tsconfig.json` (Deno, no Next/Node — mismo criterio que excluir `node_modules`).
- **Lint (`eslint`)**: PASS. Mismo motivo, se excluyó `supabase/functions/**` en `eslint.config.mjs`.
- **Build (`next build`)**: PASS — las 29 rutas compilan, incluida la nueva `/api/garantias/[id]/comprobante`.
- `vitest.config.ts` también excluye `supabase/functions` (Vitest intentaba correr el test de Deno con el loader ESM de Node y fallaba con un error de protocolo `https:` al importar `deno.land`).

## 9. Riesgos

- Edge Function sin desplegar ni probada contra Resend real (`npx supabase functions deploy` + una API key real de Resend quedan pendientes de que el usuario decida contratar/configurar Resend — ver `docs/PROJECT-PLAN.md`, límites de planes gratuitos).
- `pg_cron`/`pg_net` habilitados pero sin el `cron.schedule(...)` real (requiere valores del proyecto que no se versionan — ver sección 5). Sin esto, el outbox se acumula sin procesarse hasta que alguien invoque la función manualmente o se programe el cron.
- Mismo riesgo de cuota de Supabase ya documentado en fases anteriores (proyecto sobre el límite del plan gratuito) — estas migraciones son solo esquema (tablas nuevas vacías, sin filas de datos masivas), impacto de espacio mínimo.
- Sin verificación E2E de navegador (ver sección 7) — igual que F4/F5.

## 10. DEFERRED (explícitamente fuera de esta fase)

- Liberar/reutilizar el serial de una garantía anulada (decisión de negocio aparte, no automática).
- Logo embebido en el PDF (sin dato real para probarlo).
- `cron.schedule(...)` real (paso manual de configuración de producción, documentado).
- Reclamos, informes técnicos, MFA, dashboard analítico, licenciamiento — Fase 7+, como pedía el alcance.
- Reenvío manual de una notificación `FAILED` desde la UI de admin (hoy solo se puede ver `notifications` por SELECT; no hay botón "reintentar ahora" — no estaba en el alcance pedido, y el backoff automático ya cubre el caso normal).
