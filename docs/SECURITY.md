# Seguridad

> Documento vivo. Fuente: plan aprobado (`PROJECT-PLAN.md`) y su revisión del 2026-09-14. Cada fase añade aquí los controles que implementa y sus tests.

## Reglas no negociables

- La autorización vive en Postgres (RLS + RPC). Ocultar un botón no es seguridad.
- La clave secreta de Supabase y las del proveedor de email nunca llegan al navegador.
- Las fechas de negocio salen de `now()` en la base. Ningún RPC acepta fechas del cliente.
- Ningún RPC acepta `store_id` ni `role` como parámetro confiado a ciegas: siempre se derivan de `auth.uid()` contra `profiles`.
- Las garantías activadas no se modifican salvo los campos del cliente, por las vías auditadas.
- La auditoría es append-only.
- RLS nunca se desactiva "para simplificar". Los tests nunca se borran para que pasen.
- No hay kill switch oculto, backdoor ni mecanismos de destrucción de datos (ver Fase 10).
- `proxy.ts` cierra en falso: si `getClaims()` falla (Supabase caído, mal configurado), se trata como no autenticado. Nunca se deja pasar una ruta protegida porque la verificación no pudo completarse.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Vendedor llama la API a mano para acciones admin u otra tienda | RLS + RPC con verificación del llamante; sin políticas de escritura directa; tests pgTAP que lo intentan explícitamente |
| Escalada de rol editando el perfil | Rol y tienda solo desde `app_metadata`/admin; sin UPDATE en `profiles` para el usuario |
| Filtración de la clave secreta | Solo en `lib/supabase/admin.ts` con `import 'server-only'` y en secretos de la Edge Function; nunca `NEXT_PUBLIC_` |
| XSS → robo de sesión (cookies de `@supabase/ssr` legibles por JS por diseño) | CSP estricta con nonce, sin `dangerouslySetInnerHTML`, escape de React, validación zod |
| CSRF | Server Actions verifican `Origin` contra `Host`; no hay Route Handlers que muten; `SameSite=Lax` |
| Inyección SQL | PostgREST parametriza; sin SQL dinámico en funciones (si hiciera falta, `format('%I/%L')`) |
| Manipulación de fechas | RPC sin parámetros de fecha; `now()` de la base |
| Modificar garantías históricas | Trigger de inmutabilidad sobre fechas y snapshot |
| Borrado de auditoría | Trigger que bloquea UPDATE/DELETE incluso a `service_role` |
| Fuerza bruta de login | Rate limits de Supabase Auth + MFA en admin |
| Enumeración de seriales | `lookup_serial` exacto con datos mínimos; throttle por usuario si hace falta (Fase 8) |
| Archivos maliciosos o enormes | Parseo en el cliente; revalidación de cada fila en el servidor; límites de tamaño y filas; solo admin |
| Headers | HSTS, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`, `X-Content-Type-Options` (`next.config.ts`); CSP con nonce por request (`proxy.ts`, `script-src 'strict-dynamic'`) — implica renderizado dinámico en toda la app (`export const dynamic = "force-dynamic"` en `app/layout.tsx`), ver `node_modules/next/dist/docs/.../content-security-policy.md` |
| Datos personales (ID, WhatsApp) | Aviso de privacidad en el comprobante, acceso mínimo por tienda, retención definida con asesoría legal (Fase 10) |
| Vendedor lee configuración interna (correos de aviso, etc.) | `app_settings` (público) separada de `notification_settings` (solo admin) — ver `DATABASE.md` |
| Vendedor lee diagnóstico técnico interno de un reclamo | `technical_reports` sin SELECT directo para `seller`; solo ve el resumen del reclamo |

## Endurecimiento de la base

- `REVOKE ALL` a `anon` sobre el esquema `public`: no hay acceso público.
- Registro público deshabilitado en Supabase Auth.
- Helpers de autorización en el esquema `private`, no expuesto por la API.
- Supabase Advisors (security + performance) sin alertas en cada checkpoint.

## Checklist de funciones `SECURITY DEFINER`

Toda función crítica (activación, correcciones, reclamos, importación) se revisa contra esta lista antes de cerrar su fase:

1. `set search_path = ''` y referencias a tablas siempre calificadas por esquema.
2. `REVOKE EXECUTE FROM public, anon` — solo `authenticated` (o más restringido) puede invocarla. **`FROM public` no basta en Supabase**: cada proyecto concede `EXECUTE` sobre funciones nuevas de `public` directamente a `anon`/`authenticated`/`service_role` por nombre (vía `ALTER DEFAULT PRIVILEGES`), no a través del pseudo-rol `PUBLIC` — hay que revocar de `anon` explícitamente o el `REVOKE ... FROM public` no le quita nada. (Encontrado por Supabase Advisors al desplegar `log_audit_event` en la Fase 1: quedó ejecutable por `anon` pese al `revoke ... from public`; corregido en la migración `harden_function_grants`, que además cierra el default hacia adelante con `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon`.)
3. La función **re-verifica** el rol y, si aplica, la tienda del llamante contra `profiles` usando `auth.uid()` — nunca confía en un parámetro que diga "soy admin" o "mi tienda es X".
4. Ningún parámetro de la función permite que el llamante fije `store_id`, `role`, fechas (`activated_at`, `expires_at`) o cualquier campo del snapshot; esos valores siempre se derivan server-side.
5. Existe al menos un test pgTAP que **intenta explotarla**: llamarla como vendedor con el `id`/`store_id` de otra tienda, o como vendedor pidiendo una acción de admin, y confirmar que falla.

Esto aplica en particular a `activate_warranty`, `update_warranty_customer`, `request_correction`, `decide_correction`, `void_warranty` y las funciones de importación (`stage_import_rows`, `start_import_commit`, `commit_import_batch`, `cancel_import`).

**Fase 2**: `create_serial`, `block_serial`, `unblock_serial`, `void_serial` — checklist aplicado y verificado (todas re-verifican `private.is_admin()`, `search_path=''`, revoke explícito a `anon`); tests pgTAP intentan cada transición como vendedor y confirman denegación.

**Fase 3**: `stage_import_rows`, `start_import_commit`, `commit_import_batch`, `cancel_import`, `purge_import_staging` — checklist aplicado y verificado igual que en Fase 2. Sin parámetros de fecha/tienda; `commit_import_batch` usa `FOR UPDATE SKIP LOCKED` para que dos llamadas concurrentes (dos admins, o un reintento en vuelo) nunca procesen la misma fila — mismo patrón ya documentado para el outbox de notificaciones (`docs/ARCHITECTURE.md`). Tests pgTAP intentan las 5 como vendedor (rechazadas) y ejercitan idempotencia/reintento/conflicto real.

**Fase 6**: `request_correction`, `decide_correction`, `void_warranty` — checklist aplicado (`search_path=''`, revoke explícito de `anon`/`public`, re-verificación de rol/tienda contra `profiles`, sin fechas ni `store_id` confiados a ciegas, `decide_correction` sin SQL dinámico — `UPDATE` con `CASE` por columna). `claim_notifications`/`complete_notification` van un paso más allá del resto: `EXECUTE` revocado también a `authenticated` (no solo a `anon`/`public`), concedido únicamente a `service_role` — ni el propio admin de la app puede invocarlas desde la API, porque el envío de email es responsabilidad exclusiva del worker (Edge Function `dispatch-notifications`), nunca de un usuario de la aplicación. `activate_warranty`/`update_warranty_customer` (Fase 5) se reemplazaron sin tocar el archivo de F5 (mismo patrón que `phase3_fix_lots_imported_count` en F3): la primera para encolar la notificación de activación, la segunda para rechazar sobre una garantía anulada. Tests pgTAP: 54/55 contra el proyecto real (`10_corrections_void_notifications.sql`) — intentan las 5 RPC como vendedor/admin según corresponda (rechazadas), y `claim_notifications`/`complete_notification` específicamente como admin autenticado vía API (rechazadas con `permission denied`, no con un mensaje de aplicación — la barrera es el `GRANT`, no una verificación de rol dentro de la función). Detalle completo de por qué no es 55/55 en `docs/PHASE-6-REVIEW.md`, sección 7.

**Fase 4**: `admin_finalize_seller_profile`, `admin_set_seller_active` — checklist aplicado (`search_path=''`, revoke explícito de `anon`/`public`, re-verificación de `is_admin()`, `store_id` recibido como parámetro porque lo asigna el admin a otra identidad, nunca a la propia, y se re-valida contra `stores` dentro de la función, no se confía en que exista o esté activa). Existen porque `profiles` no tiene ninguna política `UPDATE` para `authenticated` (ni para admin): sin estas RPC, la única forma de escribir el perfil sería el cliente de service role, que rompería la auditoría con actor correcto (`auth.uid()` es `NULL` fuera de una sesión normal — ver comentario en `audit_row_change()`, Fase 1). El cliente de service role (`lib/supabase/admin.ts`) se usa exclusivamente para lo que Postgres no puede hacer: `auth.admin.inviteUserByEmail` (crear el usuario + enviar el correo) y `auth.admin.updateUserById` (fijar `app_metadata` tras invitar; `ban_duration` al desactivar/reactivar, para matar el refresh token). Tests pgTAP intentan ambas RPC como vendedor (rechazadas), validan cada mensaje de error (perfil/tienda inexistente, tienda inactiva, ya aprovisionado, objetivo no es vendedor), y verifican que el camino real (RPC, no un `UPDATE` simulado) le quita/devuelve el acceso a un vendedor de inmediato y audita con el admin real como actor, nunca `NULL`.

**Fase 7**: `open_claim`, `assign_claim`, `decide_claim`, `close_claim`, `create_technical_report` — checklist aplicado (`search_path=''`, revoke explícito de `anon`/`public`, re-verificación de rol/tienda contra `profiles`, sin fechas ni `store_id` confiados a ciegas — `store_id`/`responsible_party` se derivan del perfil y de `warranties`, nunca de un parámetro). Máquina de estados `OPEN → UNDER_REVIEW → APPROVED|REJECTED → CLOSED` con cada transición en su propia RPC, cada una re-verificando el estado anterior con `SELECT ... FOR UPDATE` antes de escribir (mismo patrón que `decide_correction`, Fase 6). `technical_reports` sin política `SELECT` para vendedor (mínimo dato necesario, `docs/ARCHITECTURE.md`) — ni siquiera de su propia tienda. Tests pgTAP: **55/55 contra el proyecto real** (`11_claims_and_reports.sql`, corrido vía SQL Editor del dashboard con autorización explícita del usuario — mismo método que F2-F6) — intentan las 5 RPC como vendedor (rechazadas), validan cada mensaje de error, y verifican el límite día 30 vs 31 de `responsible_party`, la unicidad de reclamo abierto por garantía, y que `technical_reports` es invisible para el vendedor incluso de su propia tienda. Supabase Advisors revisados después: sin hallazgos nuevos atribuibles a estas 2 tablas/5 funciones.

## MFA

- TOTP (Google Authenticator, Authy y similares), gratis en Supabase Auth.
- **Admin: obligatorio** (Fase 8). Sin factor → enrolamiento forzado; `aal1` → desafío. `private.is_admin()` exige `aal2`, así que un token sin segundo factor no puede operar ni llamando la API directamente.
- **Vendedores: opcional** en el MVP (dispositivos compartidos, rotación, fricción). Su alcance ya está limitado a una tienda.
- **Recuperación**: mantener un segundo admin; procedimiento documentado para que el dueño del proyecto Supabase elimine el factor desde el dashboard.

## Backup y recuperación (Disaster Recovery)

Requisito arquitectónico desde ahora; los detalles concretos del plan de Supabase se verifican al configurar producción (marcados abajo como **VERIFICAR AL CONFIGURAR PRODUCCIÓN**).

- **Qué es crítico**: `warranties`, `serials`, `serial_imports`/`serial_import_rows` (mientras dure el staging), `audit_logs`, `profiles`/`stores`, `app_settings`/`notification_settings`. Esto es dato del negocio del cliente (ver `PROJECT-PLAN.md` §38), no código — vive únicamente en su proyecto Supabase.
- **Estrategia**: backups automáticos de Supabase (point-in-time recovery en planes de pago) como mecanismo principal. **VERIFICAR AL CONFIGURAR PRODUCCIÓN**: frecuencia y retención exactas del plan contratado — el plan Free no incluye backups, lo cual es otra razón para no operar en producción sobre Free (ver `PROJECT-PLAN.md`, sección N).
- **Redundancia adicional**: exportar (`pg_dump`) periódicamente a un almacenamiento externo al propio proyecto Supabase, como segunda copia independiente del proveedor. Frecuencia y automatización a definir en la Fase 9.
- **Esquema vs. datos**: el esquema se recupera por separado, re-ejecutando las migraciones versionadas en git (`supabase db push` / replay de `supabase/migrations`); esto es independiente del backup de datos y ya está cubierto por tener las migraciones en el repo.
- **Restauración**: procedimiento documentado en un runbook (Fase 9); quién puede restaurar es quien tiene acceso al panel de Supabase (el **propietario de infraestructura**, no necesariamente el MASTER/ADMIN de la aplicación — ver `ARCHITECTURE.md`).
- **Prueba periódica**: simulacro de restauración (p. ej. restaurar a un proyecto/branch de prueba) con una cadencia a definir en la Fase 9, para no descubrir en un incidente real que el backup no servía.

## Riesgo de negocio abierto

Los seriales no están asignados a tiendas: cualquier tienda puede activar cualquier serial disponible (gana la primera). Mitigado con auditoría, lookup exacto y throttle. Asignar lotes a tiendas queda como decisión futura del negocio.

## Tests de seguridad por fase

| Fase | Tests |
|---|---|
| 1 | Aislamiento de tiendas en `profiles`/`stores`, rol no autoeditable, `anon` denegado, auditoría no borrable |
| 2 | Vendedor sin acceso a lotes y seriales (43 tests pgTAP reales contra el proyecto: normalización, inmutabilidad de `products.code`, unicidad de `lots.code` por producto, FK compuesta, matriz completa de transiciones de `serials`, colisión serial↔barcode, RLS admin/vendedor/anon) |
| 3 | Vendedor sin acceso a `serial_imports`/`serial_import_rows` ni a las 5 RPC (46 tests pgTAP reales contra el proyecto: clasificación por conjuntos, idempotencia de reintento, conflicto real por carrera, cancelación, purga, RLS admin/vendedor). Benchmarks reales de 100k y 300k filas contra la base — ver `DATABASE.md`, "Benchmarks reales" |
| 4 | Vendedor sin acceso a `admin_finalize_seller_profile`/`admin_set_seller_active`; vendedor desactivado por el camino real (RPC) pierde acceso de inmediato y su sesión queda revocada en Auth; `admin_set_seller_active` rechaza objetivos que no son vendedores (no generaliza a "cualquier usuario"); auditoría con el admin real como actor en las 3 transiciones (finalizar, desactivar, reactivar) |
| 5 | Vendedor sin acceso directo a `warranties` fuera de RLS ni a `serials` (solo `lookup_serial`); tienda y vendedor derivados del perfil (`current_store_id()`/`auth.uid()`), nunca de un parámetro; fecha del servidor (`now()`), nunca del cliente; doble activación imposible (lock de fila + `UNIQUE` de `serial_id`); edición de cliente bloqueada pasadas 24h y aislada por tienda; snapshot inmutable ante cualquier rol, incluso UPDATE directo bypaseando la RPC; checklist de `SECURITY DEFINER` aplicado a las 3 RPC (36 tests pgTAP reales contra el proyecto — ver `DATABASE.md`, Fase 5) |
| 6 | Implementado: edición directa bloqueada pasadas 24h (RPC re-verificado, F5); corrección solo pasadas 24h y solo sobre garantía no anulada; solo admin decide correcciones, con detección de valor cambiado entretanto; solo admin anula, motivo obligatorio, sin doble anulación, sin DELETE físico; PDF con sesión del usuario (RLS decide, otra tienda → sin fila → 404); outbox (`claim_notifications`/`complete_notification`) inalcanzable para cualquier rol de la API, incluido admin — 54/55 pgTAP reales contra el proyecto, ver `PHASE-6-REVIEW.md`. Pendiente de esta fase (no del alcance pedido): `technical_reports` es F7 |
| 7 | Reclamos aislados por tienda; solo admin decide; `responsible_party` congelado al abrir, no recalculado después |
| 8 | Admin en `aal1` no puede operar; headers presentes; simulacro de restauración de backup documentado |
