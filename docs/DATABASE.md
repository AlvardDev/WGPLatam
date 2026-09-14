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
| `profiles` | `id` (= `auth.users.id`), `full_name`, `role` (`admin`\|`seller`), `store_id`, `is_active` | CHECK: seller ⇒ `store_id` not null; admin ⇒ null. Creado por trigger sobre `auth.users` desde `raw_app_meta_data` |
| `stores` | `code` unique, `name`, `address`, `phone`, `country_code`, `timezone`, `is_active` | — |
| `products` | `code` unique, `name`, `description`, `how_it_works`, `warranty_conditions`, `warranty_exclusions text[]`, `default_warranty_days`, `is_active` | CHECK `default_warranty_days > 0` |
| `lots` | `product_id`, `code` unique, `warranty_days`, `received_on`, `expected_count`, `imported_count`, `is_active` | unique `(id, product_id)` |
| `serials` | `serial` unique, `barcode` unique, `lot_id`, `product_id`, `status` (`AVAILABLE`\|`ACTIVATED`\|`BLOCKED`\|`VOID`), `status_reason`, `import_id` | FK compuesta `(lot_id, product_id)` → `lots(id, product_id)`; códigos normalizados por una única función SQL |
| `serial_imports` | `lot_id`, `file_name`, `status` (`STAGING`\|`COMMITTING`\|`COMPLETED`\|`FAILED`\|`CANCELLED`), `total/valid/duplicate/error/committed_rows`, `created_by` | Ver "Importación masiva" para las transiciones |
| `serial_import_rows` | `import_id`, `row_number`, `serial`, `barcode`, `status`, `error_code` | unique `(import_id, row_number)`; staging, se purga con `purge_import_staging` tras `COMPLETED`/`CANCELLED` |
| `warranties` | `serial_id` unique, `store_id`, `seller_id`, `activated_at`, `duration_days`, `expires_at`, `store_attention_days`; snapshot `product_id/code/name`, `serial`, `barcode`, `lot_code`, `conditions`, `exclusions`; cliente `customer_name`, `customer_national_id`, `customer_whatsapp`; `voided_at/by/reason` | Trigger BEFORE UPDATE que rechaza cambios a fechas, duración, serial, tienda y snapshot |
| `warranty_corrections` | `warranty_id`, `store_id`, `requested_by`, `field`, `old_value`, `new_value`, `reason`, `status` (`PENDING`\|`APPROVED`\|`REJECTED`), `decided_by`, `decided_at`, `decision_note` | unique parcial `(warranty_id, field) where status = 'PENDING'` |
| `warranty_claims` | `warranty_id`, `store_id`, `opened_by`, `reason`, `description`, `status` (`OPEN`\|`UNDER_REVIEW`\|`APPROVED`\|`REJECTED`\|`CLOSED`), `responsible_party` (`STORE`\|`MANUFACTURER`), `decision`, `decision_justification`, `assigned_to`, `closed_at` | Transiciones en RPC. `responsible_party` se congela al abrir (ver "Política de atención") |
| `technical_reports` | `claim_id`, `warranty_id`, `diagnosis`, `tests_performed`, `observations`, `result`, `decision`, `justification`, `technician_id`, `reported_at` | 1 reclamo → N reportes. Solo admin lee el contenido completo (ver `ARCHITECTURE.md`, "Mínimo dato necesario") |
| `audit_logs` | `occurred_at`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `old_data`, `new_data`, `metadata` | Append-only (sin políticas de escritura, `REVOKE UPDATE, DELETE`, trigger que bloquea UPDATE/DELETE) |
| `notifications` | `type`, `recipient`, `payload`, `status` (`PENDING`\|`SENT`\|`FAILED`), `attempts`, `last_error`, `sent_at` | Outbox; ver `ARCHITECTURE.md` "Notificaciones" |
| `app_settings` | fila única, campos **públicos** (ver abajo) | CHECK de fila única |
| `notification_settings` | fila única, campos **admin-only** (ver abajo) | CHECK de fila única |

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

- `private.is_admin()`: perfil activo con rol `admin` (desde la Fase 8, además `aal2`).
- `private.current_store_id()`: tienda del vendedor activo con tienda activa; si no, `NULL`.

Se consultan en tabla (no claims del JWT) para que desactivar surta efecto inmediato.

| Tabla | Admin | Vendedor |
|---|---|---|
| `profiles` | todo (vía acciones de servidor) | SELECT de su fila; sin UPDATE |
| `stores` | CRUD | SELECT de su tienda |
| `products` | CRUD | SELECT de activos, todas las columnas (texto comercial, no dato interno) |
| `lots`, `serials`, `serial_imports*` | CRUD / RPC | sin acceso (solo `lookup_serial`, columnas mínimas) |
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
| `lookup_serial(code)` | vendedor | Coincidencia exacta. Devuelve solo `serial, barcode, product_code, product_name, warranty_duration_days, status` — nunca `lot_id`, `import_id` ni `status_reason` |
| `activate_warranty(code, customer)` | vendedor | Transacción única: `FOR UPDATE` del serial, validaciones, insert de garantía con snapshot y `now()`, serial → `ACTIVATED`, auditoría, outbox. No acepta fecha ni `store_id`: la tienda sale siempre de `private.current_store_id()` |
| `update_warranty_customer(id, fields)` | vendedor | Solo campos del cliente, su tienda (derivada del perfil, no del parámetro), `now() < activated_at + 24 h`, auditado |
| `request_correction(...)` | vendedor | Pasadas 24 h; una pendiente por campo |
| `decide_correction(id, decision, note)` | admin | Aplica el cambio en la misma transacción si `old_value` sigue vigente; auditado |
| `void_warranty(id, reason)` | admin | Anula sin borrar; auditado |
| `stage_import_rows(import_id, rows)` | admin | Idempotente por `(import_id, row_number)`; validación por conjuntos; solo si `status = 'STAGING'` |
| `start_import_commit(import_id)` | admin | Transición atómica `STAGING → COMMITTING` (`UPDATE ... WHERE status='STAGING' RETURNING id`); si dos admins confirman a la vez, solo uno obtiene la fila — el otro ve "ya fue confirmada". Es la acción **"Confirmar importación"** |
| `commit_import_batch(import_id)` | admin | Requiere `status = 'COMMITTING'`. Inserta hasta ~20k filas válidas (`ON CONFLICT DO NOTHING`), idempotente, actualiza `committed_rows`; si no queda nada pendiente, pasa a `COMPLETED` |
| `cancel_import(import_id)` | admin | Solo si `status = 'STAGING'` (antes de confirmar). Pasa a `CANCELLED`; no se inserta ningún serial. Ver nota de diseño abajo |
| `purge_import_staging(import_id)` | admin | Solo si `status IN ('COMPLETED','CANCELLED')`. Borra `serial_import_rows` de ese import; conserva `serial_imports` (conteos finales) para historial/auditoría |

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

- Únicos: `serials(serial)`, `serials(barcode)`, `warranties(serial_id)`, `stores(code)`, `products(code)`, `lots(code)`.
- `warranties(store_id, activated_at desc)`, `warranties(expires_at)`, `warranties(store_id, customer_national_id)`, `warranties(customer_whatsapp)`, GIN `pg_trgm` sobre `warranties(customer_name)`.
- `serials(lot_id, status)` y parcial `serials(status) where status = 'AVAILABLE'` para el dashboard.
- `serial_import_rows(import_id, status)`, `(import_id, serial)`, `(import_id, barcode)`.

Se validan con `EXPLAIN ANALYZE` sobre 1M filas en la Fase 9.
