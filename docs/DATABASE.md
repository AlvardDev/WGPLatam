# Base de datos

> Documento vivo. Fuente: plan aprobado (`PROJECT-PLAN.md`) y su revisión del 2026-09-14. Cada migración que cambie el esquema se refleja aquí al cerrar la fase.

## Convenciones

- PK `uuid default gen_random_uuid()`; `audit_logs` usa `bigint generated always as identity`.
- `created_at` / `updated_at timestamptz not null default now()`.
- Estados como `text` + `CHECK` (no enums: más fáciles de evolucionar).
- FKs `on delete restrict`. **Nunca borrado físico de datos de negocio**: `is_active` en catálogo y usuarios, `VOID` en seriales, `voided_at` en garantías.
- Esquema `public`: tablas y RPC expuestos por la API. Esquema `private`: helpers no expuestos.
- Migraciones en `supabase/migrations/` generadas con `npx supabase migration new <nombre>`.

## Tablas

| Tabla | Columnas clave | Integridad |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `full_name`, `role` (`admin`\|`seller`\|`superadmin`), `store_id`, `is_active` | CHECK: seller ⇒ `store_id` not null; admin/superadmin ⇒ null. Creado por trigger sobre `auth.users` desde `raw_app_meta_data`; para un vendedor invitado (Fase 4) se crea sin rol y lo completa `admin_finalize_seller_profile`, para un admin invitado (Fase 9) lo completa `admin_finalize_admin_profile` — ver "RPC críticos" |
| `stores` | `code` unique, `name`, `address`, `phone`, `country_code`, `timezone`, `is_active` | — |
| `products` | `code` unique, `name`, `description`, `how_it_works`, `warranty_conditions`, `warranty_exclusions text[]`, `default_warranty_days`, `is_active` | CHECK `default_warranty_days > 0`. **`code` es inmutable tras la creación** (trigger `private.products_code_guard()`; decisión del usuario, Fase 2) |
| `lots` | `product_id`, `code`, `warranty_days`, `received_on`, `expected_count`, `imported_count`, `is_active` | `unique(product_id, code)` — **no globalmente único** (decisión del usuario, Fase 2); `unique(id, product_id)` para la FK compuesta de `serials`. `expected_count` es **puramente informativo**: nunca bloquea creación, importación ni uso del lote (decisión del usuario, Fase 2) |
| `serials` | `serial` unique, `barcode` unique, `lot_id`, `product_id`, `status` (`AVAILABLE`\|`ACTIVATED`\|`BLOCKED`\|`VOID`), `status_reason`, `import_id` | FK compuesta `(lot_id, product_id)` → `lots(id, product_id)`; códigos normalizados por una única función SQL (`private.normalize_code`). **Globalmente únicos, sin asignación a tienda** (decisión del usuario, Fase 2: no se agrega `store_id` hasta que sea estrictamente necesario) |
| `serial_imports` | `lot_id`, `file_name`, `status` (`STAGING`\|`COMMITTING`\|`COMPLETED`\|`FAILED`\|`CANCELLED`), `total/valid/duplicate/error/committed_rows`, `created_by` | Ver "Importación masiva" para las transiciones |
| `serial_import_rows` | `id` (**bigint identity**, no uuid — decisión del usuario, Fase 3), `import_id`, `row_number`, `serial`, `barcode`, `status` (`VALID`\|`DUPLICATE_IN_FILE`\|`DUPLICATE_EXISTING`\|`ERROR`\|`COMMITTED`\|`CONFLICT`), `error_code` | unique `(import_id, row_number)`; staging, se purga con `purge_import_staging` tras `COMPLETED`/`CANCELLED` |
| `warranties` | `serial_id` unique, `store_id`, `seller_id`, `activated_at`, `duration_days`, `expires_at`, `store_attention_days`; snapshot `product_id/code/name`, `serial`, `barcode`, `lot_code`, `conditions`, `exclusions`; cliente `customer_name`, `customer_national_id`, `customer_whatsapp`; `voided_at/by/reason` | Trigger BEFORE UPDATE que rechaza cambios a fechas, duración, serial, tienda y snapshot |
| `warranty_corrections` | `warranty_id`, `store_id`, `requested_by`, `field`, `old_value`, `new_value`, `reason`, `status` (`PENDING`\|`APPROVED`\|`REJECTED`), `decided_by`, `decided_at`, `decision_note` | unique parcial `(warranty_id, field) where status = 'PENDING'` |
| `warranty_claims` | `warranty_id`, `store_id`, `opened_by`, `reason`, `description`, `status` (`OPEN`\|`UNDER_REVIEW`\|`APPROVED`\|`REJECTED`\|`CLOSED`), `responsible_party` (`STORE`\|`MANUFACTURER`), `decision`, `decision_justification`, `assigned_to`, `closed_at` | Transiciones en RPC. `responsible_party` se congela al abrir (ver "Política de atención") |
| `technical_reports` | `claim_id`, `warranty_id`, `diagnosis`, `tests_performed`, `observations`, `result`, `decision`, `justification`, `technician_id`, `reported_at` | 1 reclamo → N reportes. Solo admin lee el contenido completo (ver `ARCHITECTURE.md`, "Mínimo dato necesario") |
| `audit_logs` | `occurred_at`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `old_data`, `new_data`, `metadata` | Append-only (sin políticas de escritura, `REVOKE UPDATE, DELETE`, trigger que bloquea UPDATE/DELETE) |
| `notifications` | `type`, `recipient`, `payload`, `status` (`PENDING`\|`SENT`\|`FAILED`), `attempts`, `last_error`, `sent_at` | Outbox; ver `ARCHITECTURE.md` "Notificaciones" |
| `app_settings` | fila única, campos **públicos** (ver abajo) | CHECK de fila única |
| `notification_settings` | fila única, campos **admin-only** (ver abajo) | CHECK de fila única |
| `seller_password_reset_requests` | `user_id` (→ `profiles.id`, unique), `requested_at` | Fase 9: un vendedor activo (dado de alta por invitación) pidió restablecer su contraseña, sin correo. `unique(user_id)`: pedir de nuevo solo actualiza la fecha. Nunca contiene la contraseña — la aplica el admin directo vía `auth.admin.updateUserById`, ver "RPC críticos" |
| `login_attempts` | `email` (primary key, normalizado), `window_start`, `attempts` | Fase 9: throttle de `/login` (ventana fija de 15 min, 5 intentos fallidos), mismo patrón que `lookup_serial_attempts` pero por correo — el intento de login ocurre sin sesión |

### `app_settings` (SELECT: admin y seller — necesarios para el comprobante y la UI)

Agrupado por lo que configura, todo en una sola tabla de fila única:

- **Empresa**: `company_name` (comercial), `company_legal_name` (razón social), `company_legal_id` (identificación fiscal), `logo_path`, `address`, `phone`, `email`, `whatsapp`.
- **Garantías**: `default_warranty_days` (valor sugerido al crear un producto nuevo, no autoridad de garantías ya creadas), `store_attention_days` (30 por defecto), `expiring_soon_days` (30 por defecto), `default_warranty_conditions`, `default_warranty_exclusions text[]` (texto de partida al crear un producto; cada producto puede sobreescribirlo).
- **Sistema**: `country_code`, `default_timezone`, `locale` (formato regional de fecha/número), `national_id_label` (etiqueta de ayuda para el formato de identificación esperado; la validación en sí es genérica, no por país — ver `PROJECT-PLAN.md` decisión de "varios países").
- **Soporte**: `support_email`, `support_phone`, `support_whatsapp` (contacto de garantías, puede diferir del contacto comercial de la empresa).

### `notification_settings` (SELECT: solo admin)

- `admin_notification_emails text[]`: destinatarios internos de los avisos de activación.
- Futuro: preferencias de canal, webhooks, etc.

Separada de `app_settings` porque un vendedor no tiene por qué ver la lista de correos internos del negocio (principio de mínimo dato necesario), aunque ambas se editan desde la misma pantalla de "Ajustes" en el admin.

## Decisiones del modelo

- **Sin `roles`/`permissions`**: dos roles fijos en RLS/RPC. Se añaden tablas si aparece un tercer rol (ver `ARCHITECTURE.md`, "Roles y permisos").
- **Sin tabla `customers` — decisión de MVP, reversible.** Los datos del cliente son el **snapshot histórico de esa activación** y viven en `warranties` (`customer_name`, `customer_national_id`, `customer_whatsapp`). Motivos: (1) editar una garantía no debe poder alterar otra garantía distinta que comparta cliente; (2) una tabla compartida filtraría clientes entre tiendas. El autocompletado de un cliente recurrente busca en garantías de la propia tienda.
  **Camino de evolución sin romper el histórico**: si en el futuro se necesita una vista 360° del cliente (varias garantías, varios productos), se añade una tabla `customers` nueva y una columna `warranties.customer_id uuid null` (nullable, con FK `on delete set null`) que se rellena hacia adelante y opcionalmente se reconcilia hacia atrás por matching de `customer_national_id`. Las columnas `customer_name/national_id/whatsapp` **se quedan** en `warranties` como snapshot inmutable de lo que el cliente declaró en ese momento — `customers` sería un índice/agregado, nunca la fuente de verdad de una garantía ya activada. Esto evita una migración destructiva el día que se necesite.
- **Duración**: `products.default_warranty_days` (sugerido) → `app_settings.default_warranty_days` como valor de partida al crear un producto → copiada al lote → `lots.warranty_days` (autoridad) → congelada en `warranties.duration_days`. Sin override por serial en el MVP.
- **Unicidad global** de `serial` y `barcode`, más rechazo de colisiones serial↔barcode entre unidades en la importación.
- **Estado de garantía derivado** en `warranties_view` (`security_invoker = true`): `VOIDED` > `EXPIRED` > `EXPIRING_SOON` > `ACTIVE`. `NOT_ACTIVATED` = serial `AVAILABLE`. El estado del serial sí se almacena.
- **Política de atención**: `store_attention_days` se congela al activar. `responsible_party` se calcula al abrir el reclamo (`STORE` si está dentro de esos días desde la activación, si no `MANUFACTURER`) y se guarda como hecho histórico, no se recalcula después.
  **Esto es una política comercial configurable del sistema, no una obligación legal universal** — no se presenta en ningún texto de cara al cliente como un derecho legal fijo; el texto exacto de garantía lo define el cliente final con su propio asesor legal (Fase 10).
- **Vencimiento**: `expires_at = activated_at + duration_days días`, calculado en la base. Pendiente de confirmar en la Fase 5 si se prefiere "hasta el final del día N".
- **Datos del cliente**: `customer_national_id` normalizado (validación genérica, varios países); `customer_whatsapp` en E.164.

## RLS

Helpers en `private` (`SECURITY DEFINER`, `STABLE`, `set search_path = ''`), invocados como `(select private.fn())` para evaluarse una vez por consulta:

- `private.is_admin()`: perfil activo con rol `admin` **y** sesión en `aal2` (segundo factor verificado, Fase 8). Sin `aal2` la función devuelve `false` aunque el rol sea admin — afecta de una sola vez a toda RLS y RPC que ya dependían de ella (F2-F7), sin tocar esos archivos.
- `private.current_store_id()`: tienda del vendedor activo con tienda activa; si no, `NULL`.

Se consultan en tabla (no claims del JWT) para que desactivar surta efecto inmediato.

| Tabla | Admin | Vendedor |
|---|---|---|
| `profiles` | todo (vía acciones de servidor) | SELECT de su fila; sin UPDATE |
| `stores` | CRUD | SELECT de su tienda |
| `products`, `lots` | CRUD directo (catálogo, no máquina de estados) | `products`: SELECT de activos, todas las columnas (texto comercial, no dato interno). `lots`: sin acceso (contienen métricas de inventario) |
| `serials` | **SELECT únicamente** — incluso el admin escribe solo por RPC (`create_serial`, `block_serial`, `unblock_serial`, `void_serial`) | sin acceso (solo `lookup_serial`, columnas mínimas, en la Fase 5) |
| `serial_imports*` | CRUD / RPC (Fase 3) | sin acceso |
| `warranties` (+ vista) | SELECT todo | SELECT de su tienda; escritura solo por RPC |
| `warranty_corrections` | SELECT + decidir por RPC | SELECT de su tienda; crear por RPC |
| `warranty_claims` | todo por RPC | SELECT de su tienda; abrir reclamo por RPC |
| `technical_reports` | todo por RPC | **sin acceso directo** (ve el resumen a través del reclamo, no el diagnóstico completo) |
| `audit_logs`, `notification_settings` | SELECT | sin acceso |
| `app_settings` | UPDATE | SELECT (campos públicos únicamente; ver arriba) |
| Storage `branding` | escribir | leer |

## RPC críticos

| Función | Quién | Qué garantiza |
|---|---|---|
| `create_serial(product_id, lot_id, serial, barcode)` | admin | Normaliza, valida que el lote pertenezca al producto y esté activo, rechaza colisión serial↔barcode (`private.check_serial_collision`), inserta en `AVAILABLE` (Fase 2) |
| `block_serial(id, reason)` | admin | `AVAILABLE → BLOCKED` con `select ... for update`; `reason` obligatorio (Fase 2) |
| `unblock_serial(id)` | admin | `BLOCKED → AVAILABLE`, limpia `status_reason` (Fase 2) |
| `void_serial(id, reason)` | admin | `AVAILABLE\|BLOCKED → VOID`, irreversible (sin reactivación desde `VOID`), `reason` obligatorio (Fase 2) |
| `lookup_serial(code)` | vendedor | Coincidencia exacta. Devuelve solo `serial, barcode, product_code, product_name, warranty_duration_days, status` — nunca `lot_id`, `import_id` ni `status_reason` |
| `activate_warranty(code, customer)` | vendedor | Transacción única: `FOR UPDATE` del serial, validaciones, insert de garantía con snapshot y `now()`, serial → `ACTIVATED`, auditoría, outbox. No acepta fecha ni `store_id`: la tienda sale siempre de `private.current_store_id()` |
| `update_warranty_customer(id, fields)` | vendedor | Solo campos del cliente, su tienda (derivada del perfil, no del parámetro), `now() < activated_at + 24 h`, auditado |
| `request_correction(...)` | vendedor | Pasadas 24 h; una pendiente por campo |
| `decide_correction(id, decision, note)` | admin | Aplica el cambio en la misma transacción si `old_value` sigue vigente; auditado |
| `void_warranty(id, reason)` | admin | Anula sin borrar; auditado |
| `open_claim(warranty_id, reason, description)` | vendedor | Su tienda, garantía no anulada, motivo obligatorio. `responsible_party` se congela (`STORE` si `now() <= activated_at + store_attention_days`, si no `MANUFACTURER`). Como máximo un reclamo `OPEN`/`UNDER_REVIEW` por garantía a la vez (`warranty_claims_open_unique`) |
| `assign_claim(claim_id)` | admin | `OPEN → UNDER_REVIEW`, `assigned_to = auth.uid()` (autoasignación; único rol que tramita reclamos en el MVP) |
| `decide_claim(claim_id, status, decision, justification)` | admin | `UNDER_REVIEW → APPROVED\|REJECTED`; `decision`/`justification` obligatorios |
| `close_claim(claim_id)` | admin | `APPROVED\|REJECTED → CLOSED`, `closed_at = now()` |
| `create_technical_report(claim_id, diagnosis, result, decision, tests_performed?, observations?, justification?)` | admin | Solo mientras el reclamo sigue `OPEN`/`UNDER_REVIEW`; 1 reclamo → N reportes; `technician_id = auth.uid()` |
| `stage_import_rows(import_id, rows)` | admin | Idempotente por `(import_id, row_number)`; validación por conjuntos; solo si `status = 'STAGING'` |
| `start_import_commit(import_id)` | admin | Transición atómica `STAGING → COMMITTING` (`UPDATE ... WHERE status='STAGING' RETURNING id`); si dos admins confirman a la vez, solo uno obtiene la fila — el otro ve "ya fue confirmada". Es la acción **"Confirmar importación"** |
| `commit_import_batch(import_id, batch_size default 2000)` | admin | Requiere `status = 'COMMITTING'` (o `'FAILED'`, retomable). Reclama hasta `batch_size` filas válidas con `FOR UPDATE SKIP LOCKED`; cada una termina en `COMMITTED` o `CONFLICT` (nunca se asume `ON CONFLICT DO NOTHING`, se reconcilia contra lo realmente insertado); idempotente, actualiza `committed_rows`; si no queda nada pendiente, pasa a `COMPLETED` (reintentar sobre `COMPLETED` es un no-op, no un error) |
| `cancel_import(import_id)` | admin | Solo si `status = 'STAGING'` (antes de confirmar). Pasa a `CANCELLED`; no se inserta ningún serial. Ver nota de diseño abajo |
| `purge_import_staging(import_id)` | admin | Solo si `status IN ('COMPLETED','CANCELLED')`. Borra `serial_import_rows` de ese import; conserva `serial_imports` (conteos finales) para historial/auditoría |
| `admin_finalize_seller_profile(user_id, full_name, store_id)` | admin | Completa un perfil sin aprovisionar (`role is null`, creado por el trigger tras `auth.admin.inviteUserByEmail`) como vendedor activo de la tienda dada. Falla si el perfil ya tiene rol (`already provisioned`), si la tienda no existe/está inactiva, o si el nombre viene vacío. Se llama con la sesión normal del admin (no con service role) para que `auth.uid()` sea el admin real y `audit_profiles` audite con el actor correcto |
| `admin_set_seller_active(user_id, is_active)` | admin | Activa/desactiva un perfil `role = 'seller'` (`target is not a seller` si no lo es). RLS ya corta el acceso a datos de inmediato (evalúa `is_active` en tabla, no en el JWT); el ban/unban en Supabase Auth para matar el refresh token se hace aparte, con el cliente de service role, desde `lib/actions/sellers.ts` |
| `admin_finalize_admin_profile(user_id, full_name)` | superadmin | Mismo patrón que `admin_finalize_seller_profile` pero sin `store_id` (un admin/superadmin nunca tiene tienda) y como `role = 'admin'`. Gated por `private.is_superadmin()`, no `is_admin()` — un admin normal no puede invocarla |
| `request_seller_password_reset(email)` | público (`anon`) | Fase 9: un vendedor que olvidó su contraseña deja constancia en `seller_password_reset_requests`. Nunca revela si el correo existe ni si es de un vendedor (silencioso sin match) |
| `admin_resolve_password_reset_request(request_id)` | admin | Borra una solicitud ya resuelta a mano (después de que `lib/actions/registro.ts` ya aplicó la contraseña nueva vía `auth.admin.updateUserById`) |
| `admin_set_admin_active(user_id, is_active)` | superadmin | Activa/desactiva un perfil `role = 'admin'` (`target is not an admin` si no lo es, incluido el caso de apuntar a otro superadmin o a sí mismo — deliberado, evita bloquear el único acceso) |
| `check_login_throttle(email)` | público (`anon`) | Fase 9: rechaza el intento de login si ya hubo 5+ fallos en los últimos 15 min para ese correo (normalizado). Solo lee; `lib/actions/auth.ts` la llama antes de `signInWithPassword` |
| `record_failed_login(email)` | público (`anon`) | Fase 9: suma un intento fallido al contador de ese correo. `lib/actions/auth.ts` la llama solo cuando `signInWithPassword` devuelve error |
| `clear_login_attempts(email)` | público (`anon`) | Fase 9: borra el contador tras un login exitoso, para que un typo aislado no cuente contra un intento legítimo posterior |

Toda función `SECURITY DEFINER`: `search_path = ''`, nombres calificados, `REVOKE EXECUTE FROM public, anon`, verificación del llamante al inicio, y **ningún parámetro de identidad confiado a ciegas** (`store_id`, `role`, fechas) — siempre se derivan de `auth.uid()` contra `profiles`. Ver checklist completo en `SECURITY.md`.

**Nota de diseño — por qué cancelar solo antes de confirmar**: permitir cancelar a mitad de `COMMITTING` dejaría el lote en un estado ambiguo (¿cuáles de los seriales ya insertados se anulan?). Es más simple y más seguro exigir revisión completa en la vista previa antes de confirmar, y una vez confirmado, dejar que `commit_import_batch` corra hasta el final (es idempotente y reanudable, así que "hasta el final" nunca tarda más de lo necesario ni se puede duplicar). Si hace falta deshacer una importación ya confirmada, se hace con las herramientas normales de bloqueo/anulación de seriales, no con un cancel especial.

## Importación masiva

### Flujo

1. Admin elige producto → lote (duración heredada, editable) → archivo. Se crea `serial_imports` (`STAGING`).
2. Parseo en Web Worker (CSV en streaming con Papa Parse; Excel con SheetJS). El archivo nunca se sube entero al servidor.
3. Bloques de ~5.000 filas → `stage_import_rows`, directo del navegador a Supabase. Validación por conjuntos en SQL: normalización, formato, duplicados internos (en el bloque y contra bloques previos), existentes en `serials`, colisión serial↔barcode.
4. **Vista previa obligatoria** antes de poder confirmar nada. Debe mostrar:
   - archivo, producto, lote, duración;
   - total de filas, válidas, duplicadas, con error, en conflicto;
   - muestra paginada de las filas con error;
   - descarga del reporte de errores en CSV.
   Ningún serial se inserta en `serials` hasta este punto.
5. **Confirmar importación** (acción explícita del admin) → `start_import_commit` → bucle de `commit_import_batch` con barra de progreso real, hasta `COMPLETED`.
6. Una sola entrada de auditoría por importación (con los conteos y el nombre del archivo, no una por fila).
7. `purge_import_staging` limpia el staging cuando ya no hace falta revisar filas individuales.

### Qué tan rápido, honestamente

El requisito real no es una cifra de tiempo, es: **procesar grandes volúmenes de forma segura, reanudable, idempotente y sin pérdida de datos.** Una estimación inicial (del orden de minutos para 1M de filas, con bloques de ~5.000 en staging y ~20.000 en commit) sirve para dimensionar la UI de progreso, pero no es una garantía — la velocidad real se mide en la Fase 9 con datos reales, y los tamaños de bloque se ajustan según esa medición. El sistema es correcto aunque tarde 5, 10 o 20 minutos, siempre que se pueda reanudar, reintentar, mostrar progreso, cancelar (antes de confirmar) y nunca duplicar ni perder una fila.

### Resiliencia — qué pasa si...

| Situación | Comportamiento |
|---|---|
| Se cierran 300k filas ya en staging y se cierra el navegador | `serial_imports` queda en `STAGING`; las filas ya están en `serial_import_rows` (persistidas en Postgres, no en memoria del navegador). Al volver, el admin reabre el import (listado de imports en `STAGING`/`COMMITTING`) y **reselecciona el mismo archivo**: `stage_import_rows` es idempotente por `(import_id, row_number)`, así que las filas ya cargadas no se duplican y solo se completan las que faltaban |
| Corte de red durante un bloque de staging | El cliente reintenta ese mismo bloque; el upsert por `row_number` lo hace seguro |
| Se cierra la pestaña durante `COMMITTING` | El import queda en `COMMITTING`. Al reabrirlo, la UI ofrece "Reanudar confirmación", que simplemente vuelve a llamar `commit_import_batch` en bucle — no hace falta el archivo original, porque el staging ya está completo en la base |
| Corte de red durante un bloque de commit | Reintentar el mismo bloque es seguro: `ON CONFLICT DO NOTHING` más los índices únicos de `serials` garantizan que no se duplica nada, se haya aplicado o no la llamada anterior |
| Se reinicia el dispositivo | Igual que cerrar la pestaña: el estado vive en la base, no en el navegador; se reanuda por cualquiera de los caminos anteriores |
| Dos admins presionan "Confirmar importación" a la vez | `start_import_commit` hace la transición `STAGING → COMMITTING` en un único `UPDATE ... WHERE status='STAGING'`; solo uno de los dos obtiene la fila afectada, el otro recibe "ya fue confirmada por otro administrador" |
| Falla algo inesperado durante un commit | El import pasa a `FAILED` (visible en la pantalla de notificaciones/errores, ver `ARCHITECTURE.md` "Observabilidad"); como las operaciones son idempotentes, "reintentar" es simplemente volver a invocar `commit_import_batch` |

### Casos de prueba (Fase 3)

- CSV vacío.
- Archivo sin las columnas requeridas.
- Columnas en el orden incorrecto o con nombres distintos.
- Filas vacías o con solo espacios.
- Serial duplicado dentro del mismo archivo.
- Barcode duplicado dentro del mismo archivo.
- Serial que ya existe en `serials`.
- Barcode que ya existe en `serials`.
- Un serial que coincide con el barcode de otra unidad (o viceversa).
- Diferencias de mayúsculas/minúsculas y espacios (deben normalizarse antes de comparar).
- Caracteres inválidos según el charset permitido.
- Reintento de un bloque de staging ya aplicado (debe ser no-op).
- Corte de red simulado a mitad de un bloque.
- Reanudación de una importación tras cerrar el navegador (staging incompleto y commit incompleto, por separado).
- Cancelación antes de confirmar (no debe quedar ningún serial insertado).
- Commit parcial interrumpido y reanudado.
- Doble confirmación simultánea (dos llamadas a `start_import_commit` en paralelo — solo una debe ganar).
- 100.000 filas (Vitest/integración, mide tiempo y memoria del navegador).
- 300.000 filas (idem).
- Prueba sintética de 1.000.000 de filas cuando exista infraestructura local adecuada (Docker/Supabase local; ver riesgo abierto en `PROGRESS.md`), o contra un proyecto Supabase de desarrollo si el local no está disponible a tiempo.

Restricciones técnicas de fondo: `statement_timeout` de 8 s para `authenticated`, límites de tamaño de body en funciones serverless, 2 s de CPU en Edge Functions. Por eso todo el procesamiento masivo pasa por RPC en bloques, nunca por una sola llamada. CSV se recomienda por encima de ~200k filas por el consumo de memoria de Excel en el navegador (tope exacto a medir).

## Índices previstos

- Únicos: `serials(serial)`, `serials(barcode)`, `warranties(serial_id)`, `stores(code)`, `products(code)`, `lots(product_id, code)`.
- `warranties(store_id, activated_at desc)`, `warranties(expires_at)`, `warranties(store_id, customer_national_id)`, `warranties(customer_whatsapp)`, GIN `pg_trgm` sobre `warranties(customer_name)`.
- `serials(lot_id, status)` y parcial `serials(status) where status = 'AVAILABLE'` para el dashboard.
- `serial_import_rows(import_id, status)`, `(import_id, serial)`, `(import_id, barcode)`.

Se validan con `EXPLAIN ANALYZE` sobre 1M filas en la Fase 9.

## Fase 2 — implementado (2026-09-15)

Migraciones: `products_and_lots`, `serials`, `serials_rpc`, `phase2_rls`, `serials_fk_index`.

- `products`/`lots`: catálogo de escritura directa (RLS admin), reutilizan `set_updated_at`/auditoría de Fase 1.
- `serials`: máquina de estados 100% por RPC (ver arriba); `lots.imported_count` se recalcula por trigger `AFTER INSERT OR DELETE` (subconsulta — a revisar en la Fase 3 para inserción masiva eficiente).
- Al embeber `lots` desde `serials` en PostgREST hay que nombrar la relación explícitamente (`lots!serials_lot_id_fkey(...)`): la FK compuesta `(lot_id, product_id)` crea una segunda relación `serials↔lots` y PostgREST no puede elegir sola (`PGRST201`). Bug real encontrado y corregido durante la verificación E2E de esta fase.
- Paginación por keyset en `/admin/seriales` (única tabla de catálogo con volumen real); `products`/`lots` usan `.limit()` simple.
- No implementado a propósito en esta fase: asignación de seriales a tiendas, importación masiva, activación de garantías (ver `docs/PHASE-2-REVIEW.md` y `PROGRESS.md`).

## Fase 3 — importación masiva, implementado (2026-09-15)

Migraciones: `phase3_serial_imports`, `phase3_import_rpc`, `phase3_rls`, `phase3_fix_lots_imported_count`.

### Esquema

- `serial_imports`: cabecera (`lot_id`, `file_name`, `status`, `total_rows/valid_rows/duplicate_rows/error_rows/committed_rows`, `created_by default auth.uid()`). Escritura directa (RLS admin, como `products`/`lots`) para SELECT/INSERT; **`status` y los contadores solo cambian por RPC** — sin grant de UPDATE/DELETE. Trigger `serial_imports_guard` (BEFORE INSERT) rechaza crear un import sobre un lote inactivo, mismo requisito que `create_serial`.
- `serial_import_rows`: staging por fila. `id bigint generated always as identity` (no uuid — decisión del usuario, más barato para paginar por keyset a 300k+ filas). `unique(import_id, row_number)` es la clave de idempotencia. Sin ningún grant de escritura directa (ni para admin): solo lo escriben `stage_import_rows`/`commit_import_batch`. Sin auditoría fila por fila (sería una entrada de audit_logs por fila del archivo); la auditoría de una importación es la de su cabecera.
- `serials.import_id` (columna que Fase 2 dejó preparada sin restricción) recibe su FK real: `foreign key (import_id) references serial_imports(id)`.
- Índices: `serial_import_rows(import_id, row_number) where status='VALID'` (para reclamar el siguiente lote pendiente), `(import_id, status)`, `(import_id, serial)`, `(import_id, barcode)` (estos dos últimos, agregados tras el benchmark — ver "Bug de rendimiento" abajo).

### RPC (únicas 5, todas `SECURITY DEFINER`, checklist de `SECURITY.md` aplicado)

| RPC | Qué garantiza |
|---|---|
| `stage_import_rows(import_id, rows jsonb)` | Solo si `status='STAGING'`. Clasifica el bloque **por conjuntos** (joins de igualdad, no fila por fila): `VALID`, `DUPLICATE_IN_FILE` (contra el propio bloque o bloques previos del mismo import), `DUPLICATE_EXISTING` (contra `serials`), `ERROR` (datos faltantes o serial=barcode). Idempotente por `(import_id, row_number)`: reintentar el mismo bloque recalcula el mismo resultado. |
| `start_import_commit(import_id)` | `STAGING → COMMITTING` atómico (`UPDATE ... WHERE status='STAGING'`). Congela `total_rows/valid_rows/duplicate_rows/error_rows` una sola vez (no en cada `commit_import_batch`). |
| `commit_import_batch(import_id, batch_size default 2000)` | Reclama hasta `batch_size` filas `VALID` con `FOR UPDATE SKIP LOCKED` (dos llamadas concurrentes nunca procesan la misma fila). Cada fila reclamada termina inequívocamente en `COMMITTED` o `CONFLICT` (con `error_code` explicando qué columna colisionó) — nunca desaparece ni se asume el resultado de `ON CONFLICT DO NOTHING` sin reconciliarlo contra lo realmente insertado. Idempotente: una fila ya `COMMITTED`/`CONFLICT` no se reclama de nuevo. `COMPLETED` es un no-op tranquilo ante un reintento (no una excepción). `FAILED` es retomable. |
| `cancel_import(import_id)` | Solo si `status='STAGING'` → `CANCELLED`. |
| `purge_import_staging(import_id)` | Solo si `status IN ('COMPLETED','CANCELLED')` → borra `serial_import_rows`, conserva `serial_imports`. |

### Arquitectura de subida

`docs/DATABASE.md` (este mismo documento) ya exigía que el envío de bloques vaya **directo del navegador a Supabase**, no a través de Next: `stage_import_rows`/`commit_import_batch` se llaman desde `lib/import/upload.ts` con el cliente de navegador (`lib/supabase/client.ts`), no con Server Actions — única divergencia deliberada del patrón de Fase 2. Los bloques se envían **secuencialmente** (el parser espera cada `stage_import_rows` antes de continuar), lo que además es lo que hace correcta la detección de "duplicado contra un bloque anterior".

### Bug de rendimiento real, encontrado y corregido en esta misma fase

La primera versión de `stage_import_rows` y `commit_import_batch` clasificaba/chequeaba colisiones con `EXISTS` correlacionados y un `OR` entre columnas (`s.serial = x OR s.barcode = x OR ...`), evaluados **por fila**. Es un patrón que fuerza un nested loop: con un bloque de 5.000 filas y una tabla `serials` de 50.000+, la llamada **no terminaba** (timeout real en el benchmark). Corregido reescribiendo ambas funciones con **joins de igualdad simple** (varios `LEFT JOIN` en vez de un `EXISTS` con `OR`), que sí usan los índices únicos de `serial`/`barcode` como un lookup normal. Después del fix: un bloque de 5.000 filas nuevas pasó de "nunca termina" a ~270-750 ms, incluso contra una base de 150.000+ seriales existentes. Se agregaron los índices `serial_import_rows(import_id, serial)`/`(import_id, barcode)` para que la comparación contra lo ya staged de un import grande también use índice.

### Benchmarks reales (contra el proyecto Supabase real, no simulados)

| Volumen | Staging | Commit | Verificado |
|---|---|---|---|
| 100.000 filas | ~8,9 s (20 bloques de 5.000) | completado (confirmado por conteo final; el tiempo exacto no se pudo capturar por un timeout del *cliente* de administración, no de la base — ver abajo) | `committed_rows=100000`, `serials` reales =100000, `lots.imported_count` = 100000 |
| 40.000 filas (medición de control) | ~5,0 s | ~15,3 s (20 llamadas de 2.000, ~650-820 ms cada una) | conteos exactos verificados |
| 300.000 filas | ~69,5 s (60 bloques de 5.000, contra una base de ~190.000-440.000 seriales ya existentes) | ~246 s (150 llamadas de 2.000, ~740-1050 ms cada una, estable) | `committed_rows=300000`, `serials` reales =300000, `lots.imported_count`=440000 (acumulado con las pruebas anteriores), `total_serials_in_db`=490000 — todos los conteos cuadran exactamente |
| 1.000.000 filas | **Parcial**: 200.000 filas escaladas correctamente (~37,6 s, mismo ritmo lineal) antes de que el proyecto Supabase real se quedara sin espacio en disco (`No space left on device`) | no alcanzado | Detenido a pedido del usuario tras confirmar el escalado lineal — ver "Límite real de infraestructura" |

### Bug real de UI encontrado y corregido en la verificación E2E de esta fase

`parseCsvStreaming` (Papa Parse, `worker: true`) llamaba `parser.pause()`/`parser.resume()` dentro del callback `chunk` para controlar la contrapresión (no adelantar el siguiente bloque hasta que `stage_import_rows` terminara). Papa Parse **no implementa pause/resume cuando corre en su propio Web Worker** — solo cuando el parseo corre en el hilo principal (`worker: false`); el error real en el navegador fue `Error: Not implemented`, y la importación se quedaba en 0% para siempre. Corregido reemplazando pause/resume por una cola en memoria + un bucle de drenaje asíncrono (mismo patrón ya usado en `parse-xlsx.ts` para el worker de Excel): Papa Parse sigue entregando bloques tan rápido como pueda, y el código propio controla que nunca haya más de un bloque en vuelo hacia `stage_import_rows`. Verificado con una importación real completa desde el navegador después del fix (ver "Verificación E2E real").

### Verificación E2E real (navegador, admin real, no simulada)

Producto y lote reales creados desde la UI → archivo `.csv` real (5 filas, con un duplicado interno a propósito) subido por `/admin/importaciones/nueva` → vista previa mostró correctamente 5 total / 3 válidas / 2 duplicadas / 0 con error → "Confirmar e importar" → progreso real → "Importación completada: 3 seriales creados". Verificado contra la base real: los 3 seriales existen con `import_id` apuntando al import (la FK que Fase 2 dejó pendiente, ya completada), estado `AVAILABLE`. `/admin/auditoria` muestra la secuencia completa (insert `serial_imports`, updates de estado/conteos, insert de los 3 `serials`, update de `lots.imported_count`) con el actor `admin` real. "Limpiar detalle de staging" funcionó y conservó los conteos finales. `/admin/seriales` renderiza la lista sin errores. Datos de prueba borrados al terminar.

### Límite real de infraestructura (no un defecto de código)

Al escalar hacia 1M, el proyecto (plan **gratuito**, límite duro de 500 MB) se quedó sin disco: `audit_logs` (Fase 1, append-only) acumuló ~296 MB por los triggers de auditoría disparándose en cada uno de los ~440.000 seriales sintéticos creados durante los benchmarks de 100k/300k, sumado a ~277 MB de `serial_import_rows` y ~159 MB de `serials`. La base quedó forzada en modo solo-lectura por la plataforma (protección automática ante disco lleno, `default_transaction_read_only = on` a nivel de plataforma — ni el rol `postgres` del proyecto es superusuario real, así que ni `SET ... = 'off'` ni `VACUUM FULL` bastan para revertirlo por SQL). El código de Fase 3 en sí mismo no tiene un techo de escala conocido: los 200k que sí se procesaron mantuvieron el mismo ritmo lineal que 100k/300k. El límite es del plan de Supabase contratado, no del diseño.

## Fase 5 — activación de garantías, implementado (2026-09-15)

Migración: `20260915162417_phase5_warranties.sql`.

### Esquema

- `warranties`: snapshot histórico e inmutable de una activación. `serial_id uuid unique` (FK a `serials`) — el "doble cinturón": aunque `activate_warranty` tuviera un bug, la base impide dos garantías para el mismo serial. Columnas de snapshot copiadas en el momento de activar (`product_id`, `product_code`, `product_name`, `serial`, `barcode`, `lot_code`, `conditions`, `exclusions`, `duration_days`, `expires_at`, `store_attention_days`) para que un cambio posterior en `products`/`lots`/`app_settings` nunca altere retroactivamente una garantía ya activada. `customer_name/national_id/whatsapp` (NOT NULL, no vacíos) son la única parte editable después de creada, y solo dentro de las 24h (`update_warranty_customer`). `voided_at/by/reason` (nullable) reservados para `void_warranty` (Fase 6), sin usar todavía.
- Trigger `private.warranties_guard_immutable()` (BEFORE UPDATE): rechaza cualquier cambio a las columnas de snapshot/fechas/identidad, para cualquier rol — no hay política UPDATE para nadie salvo las RPC, que corren como el owner de la tabla.
- Trigger `audit_warranties` reutiliza `private.audit_row_change()` (Fase 1): sin mecanismo de auditoría nuevo.
- Índice `warranties_store_activated_idx (store_id, activated_at desc)` para el listado de la tienda.

### RPC (3, todas `SECURITY DEFINER`, checklist de `SECURITY.md` aplicado)

| RPC | Qué garantiza |
|---|---|
| `lookup_serial(code)` | Solo vendedor activo. Normaliza el código y busca por `serial` o `barcode`. Devuelve solo las columnas mínimas que necesita la pantalla de activación (no expone `serials`/`lots` completos — regla de mínimo dato de `CLAUDE.md`). 0 filas si no existe, nunca una excepción. Desde la Fase 8, hasta 30 llamadas/minuto por vendedor (`public.lookup_serial_attempts`, ventana fija); pasado el límite lanza excepción en vez de consultar `serials` — mitigación de enumeración de seriales. |
| `activate_warranty(code, customer jsonb)` | Solo vendedor activo. Bloquea la fila del serial (`FOR UPDATE`) antes de decidir: `AVAILABLE→ACTIVATED` es la única transición permitida; rechaza `ACTIVATED`/`BLOCKED`/`VOID` con un mensaje específico por estado, y también producto/lote inactivo. Snapshotea `store_attention_days` desde `app_settings`. La concurrencia real (dos vendedores activando el mismo serial a la vez) la resuelve el lock de fila, no un chequeo de aplicación; el `UNIQUE` de `warranties.serial_id` es el respaldo. Reintento de red/doble clic: el segundo intento encuentra el serial ya `ACTIVATED` y se rechaza sin crear una segunda garantía — la idempotencia es la propia máquina de estados del serial, sin tabla ni clave de idempotencia aparte. |
| `update_warranty_customer(warranty_id, customer jsonb)` | Solo el vendedor de la tienda dueña de la garantía, y solo si `now() < activated_at + 24h`. Único campo editable después de activar; auditado por el trigger genérico. Pasadas las 24h, la vía es `request_correction`/`decide_correction` (Fase 6, no implementado aquí). |

### RLS

`warranties`: `revoke all from authenticated; grant select`; políticas `warranties_admin_select` (`is_admin()`) y `warranties_seller_select` (`store_id = current_store_id()`) — mismo molde que el resto de tablas de catálogo. Sin política de escritura para nadie: todo pasa por las 3 RPC.

### Bugs reales encontrados por pgTAP y corregidos en esta misma fase

1. **`activate_warranty`**: `RETURNS TABLE (..., serial text, barcode text, ...)` convierte esos nombres en variables OUT visibles en todo el cuerpo de la función. El `SELECT ... FOR UPDATE` que buscaba el serial usaba `serial = v_code or barcode = v_code` sin calificar, lo que Postgres reportó como `column reference "serial" is ambiguous` (42702) — 6 pruebas de pgTAP fallaron con este error real. Corregido calificando con un alias de tabla (`s.serial`, `s.barcode`, `select s.*`). `lookup_serial` no tenía el bug (ya calificaba con alias `s`); `update_warranty_customer` no puede tenerlo (no usa `RETURNS TABLE`).
2. Dos pruebas de pgTAP (no del producto) resolvían un id/estado con un `SELECT` directo sobre `serials`/`warranties` ejecutado como el vendedor cuya sesión estaba bajo prueba — pero por diseño (`docs/DATABASE.md`, RLS) un vendedor no tiene SELECT directo sobre `serials`, y no puede ver la garantía de otra tienda por RLS. Ambas pruebas fallaban por eso, no por un bug de la RPC. Corregidas: la primera usa `lookup_serial` (que sí es accesible al vendedor) en vez de leer `serials` directo; la segunda resuelve el id de la garantía como owner (antes de cambiar de rol al vendedor bajo prueba) y lo pasa ya resuelto, igual que le llegaría por URL/API en un caso real.

### Verificación pgTAP real (contra el proyecto Supabase real, no simulada)

`supabase/tests/database/09_warranties.sql`, corrido vía SQL Editor del dashboard (mismo método que Fases 2-4; el CLI sigue sin poder conectarse desde esta red — ver Fase 4, PROBLEMAS): **36/36 PASS** tras los 2 fixes de arriba (los primeros 6 fallos eran el bug real #1; tras corregirlo, 2 fallos más eran el problema #2 de las pruebas).

**Recuperación real, sin pagar**: el dashboard de Supabase (Database Settings) ofrece un botón **"Disable read-only mode"** — habilita escritura por 15 minutos para reducir el tamaño de la base; si no se reduce lo suficiente, se puede volver a pedir. Con esa ventana se liberaron ~122 MB borrando dos índices de `serial_import_rows` que habían quedado sobredimensionados con la tabla ya vacía, y luego se borraron ~375.000 de los ~440.000 seriales sintéticos del lote más grande usando un `PROCEDURE` con `COMMIT` por lote de 3.000 filas (una única llamada, no cientos) — cada `DELETE` seguía dependiendo de que `audit_logs` tuviera sitio para su propia fila de auditoría, así que hubo que alternar borrado y `VACUUM`. Quedan **65.000 filas sintéticas sin poder borrar** (documentadas como deuda técnica, no bloquean el código de Fase 3) tras llegar a un punto de retornos decrecientes; el usuario decidió detener la limpieza ahí y seguir con el resto de la fase. Antes de una importación real de cientos de miles/millones de filas en producción, usar un plan de pago con disco suficiente (ver `docs/PROJECT-PLAN.md`, sección N).

## Fase 6 — correcciones, PDF, notificaciones y cancelación, implementado (2026-09-15)

Migraciones: `phase6_notifications`, `phase6_corrections`, `phase6_void_and_outbox`, `phase6_notifications_cron`. Detalle completo de decisiones/arquitectura en `docs/PHASE-6-REVIEW.md`; aquí solo el esquema real.

### Esquema

- `warranty_corrections`: exactamente como estaba especificado desde la Fase 0 — `warranty_id, store_id, requested_by, field, old_value, new_value, reason, status (PENDING|APPROVED|REJECTED), decided_by, decided_at, decision_note`. `field` restringido por `CHECK` a `customer_name|customer_national_id|customer_whatsapp` (los mismos 3 que `warranties_guard_immutable`, Fase 5, ya permite cambiar). Unique parcial `(warranty_id, field) where status='PENDING'`. Auditada con el trigger genérico (`audit_warranty_corrections`).
- `notifications` (outbox): `type, recipient, payload, status (PENDING|PROCESSING|SENT|FAILED), attempts, last_error, available_at, sent_at, created_at`. `PROCESSING` y `available_at` son las 2 únicas adiciones sobre el diseño original de `ARCHITECTURE.md`/esta misma tabla — necesarias para que "reclamar" un lote (transacción A, `claim_notifications`) y "enviarlo" (transacción B, la Edge Function llamando a Resend) no puedan pisarse entre dos invocaciones solapadas del worker; `SKIP LOCKED` por sí solo no alcanza porque no cubre el hueco entre ambas transacciones.
- `notification_settings` (Fase 1) gana 3 columnas: `email_enabled boolean`, `from_email text`, `from_name text` — configuración funcional, nunca secreta (la clave de Resend vive solo como secreto de la Edge Function).
- `warranties.voided_at/voided_by/voided_reason` (reservados sin usar desde la Fase 5) ahora los llena `void_warranty`. El trigger de inmutabilidad ya los permitía cambiar; no se tocó.

### RPC (5 nuevas, todas `SECURITY DEFINER`, checklist de `SECURITY.md` aplicado)

| RPC | Quién | Qué garantiza |
|---|---|---|
| `request_correction(warranty_id, field, new_value, reason)` | vendedor de la tienda dueña | Solo si `now() >= activated_at + 24h` y la garantía no está anulada; `old_value` se congela con el valor real vigente en ese instante; campo restringido a los 3 de cliente; motivo obligatorio; una `PENDING` por campo (el `unique` parcial lo garantiza, capturado como excepción amigable). |
| `decide_correction(correction_id, decision, note)` | admin | Solo sobre `PENDING`. Si `APPROVED`, relee el campo actual con `FOR UPDATE` y lo compara contra `old_value`: si cambió desde que se pidió, rechaza (`%changed since%`) en vez de sobrescribir a ciegas. Aplica el cambio con `CASE` por columna (sin SQL dinámico). Rechaza si la garantía está anulada. |
| `void_warranty(warranty_id, reason)` | admin | Anula sin borrar (`voided_at/by/reason`); rechaza si ya estaba anulada; motivo obligatorio. **No toca `serials`** — decisión explícita de esta fase (ver `PHASE-6-REVIEW.md`, sección 0). |
| `claim_notifications(batch_size default 20)` | **solo `service_role`** | `FOR UPDATE SKIP LOCKED` sobre `PENDING` con `available_at <= now()`; marca `PROCESSING` e incrementa `attempts` en la misma transacción que reclama. |
| `complete_notification(id, ok, error)` | **solo `service_role`** | Éxito -> `SENT` + `sent_at`. Fallo con intentos restantes -> `PENDING` con backoff exponencial (2^(attempts-1) minutos). Fallo al agotar 5 intentos -> `FAILED` definitivo. |

`activate_warranty` (Fase 5) y `update_warranty_customer` (Fase 5) se reemplazaron (`create or replace` en migraciones nuevas de F6, sin editar los archivos de F5): la primera para encolar la notificación `warranty_activated` (una fila por correo de `notification_settings.admin_notification_emails`, solo si `email_enabled`) al final de la misma transacción; la segunda para rechazar también sobre una garantía ya anulada.

### RLS

`warranty_corrections`: mismo molde que `warranties` — `revoke all` + `warranty_corrections_admin_select` (todo) + `warranty_corrections_seller_select` (`store_id = current_store_id()`). Sin política de escritura para nadie (solo las 2 RPC). `notifications`: mismo molde que `audit_logs` — solo `SELECT` para admin, ninguna escritura vía API (ni siquiera admin: solo las 2 RPC de `service_role`).

### Outbox — NotificationService/EmailProvider/Resend

Ver `docs/ARCHITECTURE.md` "Notificaciones" para la capa conceptual; implementación real en `supabase/functions/dispatch-notifications/` (`email-provider.ts`, `notification-service.ts`, `index.ts`) — detalle completo en `docs/PHASE-6-REVIEW.md`, sección 5. `pg_cron`/`pg_net` habilitados por migración; el `cron.schedule(...)` real (URL del proyecto + `service_role` key) **no se versiona** — queda como comentario/paso manual en la propia migración, porque commitearlo violaría la regla de no guardar secretos en el repo.

### Verificación pgTAP real (contra el proyecto Supabase real)

`supabase/tests/database/10_corrections_void_notifications.sql`, 55 casos, corrido vía SQL Editor (mismo método que Fases 2-5): **54/55**. 1 bug real encontrado y corregido en el camino (tabla temporal de fixtures sin `GRANT SELECT` a `authenticated` — mismo tipo de descuido que F5 ya había evitado con su propia tabla temporal). El caso restante fallido no se pudo identificar por inestabilidad del navegador controlado a mitad de la segunda verificación — ver `docs/PHASE-6-REVIEW.md`, sección 7, para el detalle honesto (no se afirma 55/55 sin haberlo visto).
