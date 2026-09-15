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
| 3 | Vendedor no puede llamar a los RPC de importación; ver casos de prueba de importación en `DATABASE.md` (incluye intentos de doble confirmación y cancelación fuera de tiempo) |
| 4 | Vendedor desactivado pierde acceso de inmediato |
| 5 | Activación con tienda derivada del perfil (nunca de un parámetro), fecha del servidor, doble activación imposible, checklist de `SECURITY DEFINER` aplicado a `activate_warranty` |
| 6 | Edición bloqueada pasadas 24 h; PDF de otra tienda → 404; solo admin decide correcciones; vendedor sin acceso a `technical_reports` |
| 7 | Reclamos aislados por tienda; solo admin decide; `responsible_party` congelado al abrir, no recalculado después |
| 8 | Admin en `aal1` no puede operar; headers presentes; simulacro de restauración de backup documentado |
