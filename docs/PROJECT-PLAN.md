# Plan técnico — Sistema Web de Gestión de Garantías

> **Plan aprobado el 2026-09-14 (Fase 0).** Este documento es el registro histórico de lo acordado.
> Los documentos vivos, que se actualizan fase a fase, son `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md` y `PROGRESS.md`.
> Si una decisión cambia, se registra en `PROGRESS.md` (sección DECISIONES) y en el documento vivo que corresponda, no aquí.
>
> **Revisión v2 — 2026-09-14, mismo día.** El usuario pidió una revisión formal del plan antes de empezar la Fase 1.
> El cuerpo de este archivo se conserva tal cual fue aprobado (v1); el resultado de la revisión (qué cambió, qué se
> mantuvo, qué sigue abierto) está en el "Registro de revisión" al final del archivo y ya aplicado en los documentos
> vivos. Para la arquitectura y el modelo de datos vigentes, usar `ARCHITECTURE.md`, `DATABASE.md` y `SECURITY.md`,
> no este archivo.

## Contexto

Se quiere construir un sistema de producción para gestionar garantías de productos por número de serie/código de barras, con tiendas y vendedores aislados entre sí, activación atómica con fecha del servidor, snapshot inmutable, correcciones, reclamos, reportes técnicos, PDF, email, auditoría y MFA. Este documento es el resultado de la **Fase 0 (auditoría + arquitectura)** y será la guía para todas las fases siguientes.

**Decisiones confirmadas con el usuario (2026-09-14):**
- **Una empresa por instalación** (un proyecto Supabase + un despliegue por cliente). Sin `tenant_id`.
- **Varios países**: ID de cliente con validación genérica, WhatsApp en E.164, zona horaria por tienda.
- **Vendedores con email real** (invitación y recuperación nativas de Supabase Auth).
- **Volumen de activaciones desconocido**: el envío de email vive detrás de una sola función; se empieza con Resend gratis.
- Se creará un **repo nuevo en GitHub** y se usará **otra cuenta de Supabase**. La cuenta Supabase conectada por MCP en este entorno (org "AlvardDev's Org") **no** se usará para este proyecto.

---

## A. Resumen del proyecto (lo encontrado)

- `C:\Users\TOSHIBA\Documents\Dev\chino` está **completamente vacío** (0 archivos) y **no es un repositorio git**. Greenfield real: no hay código, migraciones, tests, `.env` ni documentación que reutilizar, refactorizar o romper.
- Herramientas en la máquina: Node 24.15, npm 11.12, git 2.54. **No hay Supabase CLI ni Docker** → sin Docker no se puede levantar Supabase local (`supabase start`) ni correr tests pgTAP localmente.
- Proyectos hermanos del mismo autor (`miranda-system`, `la-planta-system`, `gestor-barberias`) usan un stack consistente: Next 16.2.6, React 19.2.4, `@supabase/ssr` 0.10, `@supabase/supabase-js` 2.106, shadcn 4 + Tailwind 4, zod 4, react-hook-form, date-fns 4, sonner, lucide, vitest, Playwright, migraciones SQL en `supabase/migrations`. **Se adopta el mismo stack** para mantener una sola forma de trabajar (no se copia código de esos proyectos).

## B. Estado actual

| Área | Existe | Falta |
|---|---|---|
| Código, rutas, componentes | Nada | Todo |
| Supabase (proyecto, migraciones, RLS) | Nada para este sistema | Proyecto en la cuenta nueva, todas las migraciones |
| Auth, roles, MFA | Nada | Todo |
| Tests | Nada | Infra de pgTAP + Vitest + Playwright |
| Docs | Nada | `docs/*` (se crean al aprobar este plan) |
| Git/GitHub | No inicializado | `git init` + remoto cuando el usuario cree el repo |

---

## C. Arquitectura recomendada

```
Navegador (Next.js / React)
  │  lecturas: Server Components con sesión del usuario (RLS aplica)
  │  escrituras: Server Actions → RPC Postgres (SECURITY DEFINER con checks)
  │  importación masiva: navegador → RPC Supabase directo, por lotes
  ▼
Next.js 16 (App Router, TS strict) — proxy.ts refresca sesión y redirige (UX, no autoridad)
  │  clave secreta SOLO en lib/supabase/admin.ts (import 'server-only'): gestión de usuarios
  ▼
Supabase
  ├─ Postgres: tablas + RLS + funciones RPC (autoridad de negocio y de seguridad)
  ├─ Auth: email/password, invitaciones, recuperación, MFA TOTP
  ├─ Edge Function dispatch-notifications (clave de Resend solo aquí) ← pg_cron cada minuto
  └─ Storage: bucket `branding` (logo de la empresa). Nada más en el MVP.
```

**Principios**
1. **La base de datos es la autoridad.** Toda regla crítica (rol, tienda, estado del serial, ventana de 24 h, fechas) se aplica en Postgres. El frontend solo mejora la UX.
2. **Lecturas vía RLS, escrituras críticas vía RPC.** Las tablas con máquinas de estado (seriales, garantías, correcciones, reclamos) no tienen políticas INSERT/UPDATE/DELETE para `authenticated`; solo se modifican a través de funciones que validan al llamante. El catálogo (productos, tiendas, lotes) se escribe directo con políticas admin + trigger de auditoría.
3. **Sin backend separado.** Next + Postgres RPC + una Edge Function cubren todo. No hay razón técnica para Express/Nest.
4. **Software ≠ datos del negocio.** El repo contiene código, migraciones de esquema y docs. Nombre de empresa, logo, contactos, textos de garantía, tiendas y seriales viven en la base/Storage del cliente (`app_settings`, bucket `branding`), nunca en el repo ni en seeds de producción.

**Stack**
- Next.js 16 (App Router, `proxy.ts` — en Next 16 reemplaza a `middleware.ts`), React 19, TypeScript strict.
- `@supabase/ssr` + `@supabase/supabase-js`; tipos generados con `supabase gen types`.
- shadcn/ui + Tailwind 4, lucide, sonner, react-hook-form + zod 4, date-fns 4 + `@date-fns/tz`.
- Importación: Papa Parse (CSV en streaming, Web Worker) y SheetJS (Excel; instalar desde `cdn.sheetjs.com`, la versión de npm está abandonada y tiene CVEs).
- Escaneo: `BarcodeDetector` nativo con ponyfill `barcode-detector` (zxing-wasm, wasm auto-hospedado) para iOS/Firefox.
- PDF: `@react-pdf/renderer` en un Route Handler (runtime Node). Se valida con un spike al inicio de la Fase 6.
- Supabase CLI como devDependency (`npx supabase`), sin instalación global.
- Tests: pgTAP (`supabase test db`), Vitest, Playwright.

**Estructura del repo (propuesta)**
```
app/(auth)/{login,recuperar,actualizar-clave,mfa}
app/admin/...            dashboard, productos, lotes, seriales, importaciones, tiendas,
                          usuarios, garantias, correcciones, reclamos, auditoria, ajustes
app/tienda/...           inicio, activar, garantias, correcciones, reclamos
app/api/garantias/[id]/comprobante/route.ts   (PDF bajo demanda)
lib/supabase/{client,server,admin}.ts
lib/validation/*.ts       (esquemas zod compartidos cliente/servidor)
components/ui             (shadcn)
proxy.ts
supabase/migrations/*.sql  supabase/tests/*.sql (pgTAP)  supabase/functions/dispatch-notifications
tests/e2e (Playwright)
docs/  CLAUDE.md
```
Código e identificadores en inglés; UI y URLs en español.

---

## D. Modelo de datos

Convenciones: PK `uuid default gen_random_uuid()` (salvo `audit_logs`: `bigint identity`), `created_at/updated_at timestamptz`, estados como `text` + `CHECK` (más fácil de evolucionar que enums), FKs `on delete restrict`. **Nunca borrado físico de datos de negocio**: `is_active` en catálogo/usuarios, `VOID` en seriales, `voided_at` en garantías.

| Tabla | Columnas clave | Integridad |
|---|---|---|
| `profiles` | `id` (= `auth.users.id`), `full_name`, `role` (`admin`\|`seller`), `store_id`, `is_active` | CHECK: seller ⇒ `store_id` not null; admin ⇒ null. Se crea por trigger en `auth.users` leyendo `raw_app_meta_data` (no editable por el usuario; **nunca** `user_metadata`) |
| `stores` | `code` unique, `name`, `address`, `phone`, `country_code`, `timezone`, `is_active` | — |
| `products` | `code` unique, `name`, `description`, `how_it_works`, `warranty_conditions`, `warranty_exclusions text[]`, `default_warranty_days`, `is_active` | CHECK `default_warranty_days > 0` (sin tope de meses: 180, 365, 1000…) |
| `lots` | `product_id`, `code` unique, `warranty_days`, `received_on`, `expected_count`, `imported_count`, `is_active` | unique `(id, product_id)` para FK compuesta desde seriales |
| `serials` | `serial` unique, `barcode` unique, `lot_id`, `product_id`, `status` (`AVAILABLE`\|`ACTIVATED`\|`BLOCKED`\|`VOID`), `status_reason`, `import_id` | FK compuesta `(lot_id, product_id)` → `lots(id, product_id)` (el producto del serial no puede divergir del lote). Códigos normalizados por una sola función SQL (`trim`, mayúsculas, charset permitido) usada en importación **y** en búsqueda |
| `serial_imports` | `lot_id`, `file_name`, `status`, `total/valid/duplicate/error/committed_rows`, `created_by` | — |
| `serial_import_rows` | `import_id`, `row_number`, `serial`, `barcode`, `status`, `error_code` | unique `(import_id, row_number)` → reintentar un lote no duplica. Staging; se purga tras confirmar |
| `warranties` | `serial_id` **unique**, `store_id`, `seller_id`, `activated_at` (default `now()`), `duration_days`, `expires_at`, `store_attention_days`; **snapshot**: `product_id/code/name`, `serial`, `barcode`, `lot_code`, `conditions`, `exclusions`; **cliente**: `customer_name`, `customer_national_id` (normalizado), `customer_whatsapp` (E.164); `voided_at/by/reason` | Trigger BEFORE UPDATE que **rechaza** cualquier cambio a fechas, duración, serial, tienda y snapshot, para cualquier rol. Solo los campos de cliente cambian, y solo vía RPC |
| `warranty_corrections` | `warranty_id`, `store_id`, `requested_by`, `field`, `old_value`, `new_value`, `reason`, `status` (`PENDING`\|`APPROVED`\|`REJECTED`), `decided_by`, `decided_at`, `decision_note` | unique parcial `(warranty_id, field) where status='PENDING'` |
| `warranty_claims` | `warranty_id`, `store_id`, `opened_by`, `reason`, `description`, `status` (`OPEN`\|`UNDER_REVIEW`\|`APPROVED`\|`REJECTED`\|`CLOSED`), `responsible_party` (`STORE`\|`MANUFACTURER`), `decision`, `decision_justification`, `assigned_to`, `closed_at` | Transiciones validadas en RPC |
| `technical_reports` | `claim_id`, `warranty_id`, `diagnosis`, `tests_performed`, `observations`, `result`, `decision`, `justification`, `technician_id`, `reported_at` | 1 reclamo → N reportes |
| `audit_logs` | `occurred_at`, `actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `old_data jsonb`, `new_data jsonb`, `metadata jsonb` (IP, user agent) | Append-only: sin políticas de escritura, `REVOKE UPDATE, DELETE`, trigger que lanza excepción ante UPDATE/DELETE |
| `notifications` | outbox: `type`, `recipient`, `payload jsonb`, `status` (`PENDING`\|`SENT`\|`FAILED`), `attempts`, `last_error`, `sent_at` | — |
| `app_settings` | fila única: `company_name`, `company_legal_id`, `logo_path`, soporte (`email`, `phone`, `whatsapp`), `admin_notification_emails text[]`, `store_attention_days` (30), `expiring_soon_days` (30), `default_timezone` | CHECK de fila única |

**Decisiones del modelo (desviaciones justificadas de la lista sugerida)**
- **Sin tablas `roles`/`permissions`**: hay dos roles con permisos fijos codificados en RLS/RPC. Tablas de permisos agregarían indirección sin usuario que las configure. Se añaden si aparece un tercer rol (técnico, gerente de tienda).
- **Sin tabla `customers` separada**: los datos del cliente **son parte del registro de activación** y viven en `warranties`. Motivos: (1) la regla "el WhatsApp de la activación es el contacto oficial" exige que editar una garantía no altere otra; con una tabla compartida, editar dentro de 24 h la garantía A cambiaría la garantía B ya bloqueada; (2) una tabla compartida filtraría datos de clientes de la tienda A a la tienda B. El autocompletado de un cliente recurrente se hace buscando en garantías de la **propia** tienda. Índices por cédula/WhatsApp/nombre en `warranties`.
- **`support_contacts` como columnas de `app_settings`**, no tabla.
- **Duración**: `products.default_warranty_days` → se copia al crear el lote → `lots.warranty_days` es la autoridad de sus seriales → se congela en `warranties.duration_days` al activar. **Sin override por serial en el MVP** (el flujo de importación ya configura la duración por lote). Si hace falta, es una columna nullable en `serials` sin tocar lo demás.
- **Unicidad global** de `serial` y de `barcode` (el vendedor busca sin elegir producto, así que la búsqueda debe ser inequívoca). La importación además rechaza un serial que coincida con el barcode de otra unidad (y viceversa) para que la búsqueda por "serial o barcode" nunca sea ambigua.
- **Estado de garantía derivado, no almacenado**: vista `warranties_view` (`security_invoker = true`, RLS aplica) calcula `VOIDED` (si `voided_at`), `EXPIRED` (`now() > expires_at`), `EXPIRING_SOON` (vence en ≤ `expiring_soon_days`), `ACTIVE`. `NOT_ACTIVATED` = serial `AVAILABLE` sin garantía. El estado del **serial** sí se almacena porque es una máquina de estados real, no función del tiempo.
- **Política de 30 días**: `store_attention_days` se congela en la garantía al activar. El `responsible_party` de un reclamo se calcula al abrirlo (`STORE` si está dentro de esos días, si no `MANUFACTURER`) y se guarda como hecho histórico. Es una política comercial configurable, no una regla legal.
- **Vencimiento**: `expires_at = activated_at + duration_days días`, calculado en la base. Se muestra como fecha en la zona horaria de la tienda. (Se revisa en la Fase 5 si el negocio prefiere "válida hasta el final del día N").

---

## E. RLS — estrategia de aislamiento

Helpers en esquema `private` (no expuesto por la API), `SECURITY DEFINER`, `STABLE`, `set search_path = ''`:
- `private.is_admin()` → perfil activo con rol `admin` (en la Fase 8 además exige `aal2`: **un solo punto de cambio**).
- `private.current_store_id()` → `store_id` del vendedor activo cuya tienda está activa; si no, `NULL` (que no coincide con nada).

Se invocan como `(select private.is_admin())` para que Postgres los evalúe **una vez por consulta** y no por fila (patrón recomendado por Supabase).

Se consultan en tabla y no se ponen como claims en el JWT: desactivar a un vendedor o una tienda surte efecto **de inmediato**, sin esperar a que caduque el token. Además, al desactivar se banea al usuario en Auth para matar su refresh token.

| Tabla | Admin | Vendedor |
|---|---|---|
| `profiles` | todo (vía acciones de servidor) | SELECT solo su fila. Sin UPDATE directo (rol y tienda no autoeditables) |
| `stores` | CRUD | SELECT solo su tienda |
| `products` | CRUD | SELECT de activos (catálogo no sensible, para filtros) |
| `lots`, `serials`, `serial_imports*` | CRUD / RPC | **Sin acceso**. La búsqueda para activar va por el RPC `lookup_serial`, que solo devuelve coincidencia exacta con datos mínimos |
| `warranties` (+ vista) | SELECT todo | SELECT `store_id = current_store_id()`. Escritura solo vía RPC |
| `warranty_corrections` | SELECT + decidir vía RPC | SELECT de su tienda; crear vía RPC |
| `warranty_claims`, `technical_reports` | todo vía RPC | SELECT de su tienda; abrir reclamo vía RPC |
| `audit_logs`, `notifications` | SELECT | Sin acceso |
| `app_settings` | UPDATE | SELECT (necesario para el comprobante) |
| Storage `branding` | escribir | leer |

Endurecimiento: `REVOKE ALL` a `anon` sobre todo el esquema `public` (no hay acceso público); registro público **deshabilitado** en Auth; toda función `SECURITY DEFINER` con `search_path = ''`, nombres calificados, `REVOKE EXECUTE FROM public, anon` y verificación explícita del llamante en su primera línea. Supabase Advisors (security + performance) limpios en cada checkpoint.

---

## F. Auth, roles y MFA

- `auth.users → profiles (role, store_id)`. Sin contraseñas en tablas propias.
- **Alta de vendedor** (Server Action, solo admin): verifica admin en la base → `auth.admin.inviteUserByEmail` con `app_metadata {role:'seller', store_id}` usando la clave secreta (server-only) → el trigger crea el perfil **en la misma transacción** que el usuario de Auth. El vendedor define su contraseña desde el email de invitación.
- **Primer admin**: bootstrap documentado (crear usuario en el dashboard + SQL de promoción). Nunca un endpoint de "hazme admin".
- **Sesión**: cookies de `@supabase/ssr`; en el servidor, verificación con `getClaims()` (valida el JWT), nunca confiar en `getSession()`. `proxy.ts` refresca la sesión y redirige; los layouts `admin/` y `tienda/` comprueban el rol en el servidor (UX). La autoridad real es RLS/RPC.
- **Email de Auth** (invitación, recuperación): SMTP propio (Resend) con plantillas en español. El SMTP por defecto de Supabase solo sirve para pruebas (límite de ~2 emails/hora).
- **MFA TOTP** (Google Authenticator, Authy, etc.; gratis en Supabase):
  - **Admin: obligatorio.** Admin sin factor → enrolamiento forzado; con factor y sesión `aal1` → pantalla de desafío. `private.is_admin()` exige `aal2`, así que un token robado sin segundo factor no puede hacer nada administrativo, ni siquiera llamando a la API directamente.
  - **Vendedores: opcional en el MVP** (dispositivos compartidos en tienda, alta rotación, fricción en el flujo principal). Su alcance ya está limitado a una tienda. Se puede volver obligatorio con un ajuste.
  - **Recuperación ante pérdida del dispositivo**: tener un segundo admin y un procedimiento documentado (el dueño del proyecto Supabase elimina el factor desde el dashboard). Un admin único sin procedimiento de recuperación es un riesgo operativo.

---

## G. Importación masiva (300k – 1M+ seriales)

Restricciones reales que condicionan el diseño: límite de body de funciones serverless (4,5 MB en Vercel, 1 MB por defecto en Server Actions), `statement_timeout` de 8 s para el rol `authenticated` en Supabase, y límite de 2 s de CPU en Edge Functions. Por eso ni subir el archivo entero a un servidor ni procesarlo en una Edge Function sirven para 1M filas.

**Flujo:**
1. Admin elige producto → lote (duración heredada, editable) → archivo. Se crea `serial_imports` (`STAGING`).
2. **Parseo en un Web Worker** (Papa Parse en streaming para CSV; SheetJS para Excel). La UI nunca se congela y los seriales existentes de la base nunca se cargan en el navegador.
3. Validación local barata (columnas `serial,codigo_barras`, vacíos, formato), y envío en **bloques de ~5.000 filas** al RPC `stage_import_rows(import_id, rows jsonb)` **directo desde el navegador a Supabase** (sin pasar por Next, sin límites de body). Idempotente por `(import_id, row_number)`: cortes de red → reintento seguro, importación reanudable.
4. El RPC valida **por conjuntos** cada bloque en SQL: normalización, formato, duplicados dentro del bloque (window function) y contra bloques previos (índice en staging), existencia en `serials` (índices únicos) y colisión serial↔barcode. Marca `status/error_code` por fila.
5. **Vista previa**: conteos agregados (`10.000 registros · 9.980 válidos · 10 duplicados · 10 errores`) + muestra paginada de errores, y descarga del reporte de errores como CSV.
6. **Confirmar**: el cliente llama en bucle a `commit_import_batch(import_id)`, que inserta hasta ~20k filas válidas por llamada (`INSERT … SELECT … ON CONFLICT DO NOTHING`; las carreras se marcan como conflicto), actualiza `lots.imported_count` y devuelve lo pendiente → barra de progreso real. Cada llamada cabe en el timeout; si se cierra la pestaña, la importación queda `COMMITTING` y se reanuda.
7. **Una sola entrada de auditoría por importación** (no un millón), con conteos y archivo. Purga del staging al completar.

1M filas ≈ 200 llamadas de staging + ~50 de commit → estimado de 3 a 6 minutos (se mide en la Fase 9). Tamaños de bloque ajustables tras medir.
**Limitación honesta**: un Excel de 1M filas puede consumir mucha memoria en el navegador. Se recomienda CSV para más de ~200k filas, y el tope de Excel se fija tras medirlo. Importar es una tarea de escritorio.

---

## H. Activación atómica

**Recomendación: una función PostgreSQL `activate_warranty(p_code text, p_customer jsonb)` invocada como RPC desde una Server Action.**

Por qué no una "transacción server-side" en Next: supabase-js (PostgREST) no ofrece transacciones de varias sentencias. Hacerlo desde Next obligaría a una conexión Postgres directa con privilegios que salta RLS y crea un segundo camino de datos. Una función Postgres **es** una transacción: o se aplica todo o nada.

Dentro de la función, en una sola transacción:
1. `auth.uid()` → perfil activo, rol `seller`, tienda activa. La tienda **sale del perfil, jamás del cliente**.
2. Normaliza el código, busca por serial o barcode y hace `SELECT … FOR UPDATE` sobre el serial (bloquea ante dos vendedores simultáneos).
3. Verifica: serial existe, `status = 'AVAILABLE'` (no bloqueado, no anulado, no activado), lote activo, producto activo. Si algo falla → excepción con código de error legible, **no se activa nada**.
4. Valida los datos del cliente (nombre, ID normalizado, WhatsApp E.164).
5. `INSERT` en `warranties`: `activated_at = now()` (reloj de la base), `duration_days = lot.warranty_days`, `expires_at` calculado, `store_attention_days` y snapshot completo de producto, condiciones y exclusiones.
6. `UPDATE serials SET status = 'ACTIVATED'`.
7. `INSERT` en `audit_logs` y en `notifications` (outbox del email).
8. Devuelve el id de la garantía.

**Doble cinturón**: `warranties.serial_id` es UNIQUE, así que aunque la función tuviera un bug, la base impide dos garantías para el mismo serial. La firma de la función **no acepta ninguna fecha**: el reloj del navegador es irrelevante por construcción.

Edición en 24 h: RPC `update_warranty_customer(id, fields)` → solo campos del cliente, solo de su tienda, solo si `now() < activated_at + interval '24 hours'`. Cada cambio se audita con valor anterior y nuevo. Pasadas las 24 h → RPC `request_correction`. El admin aprueba o rechaza con `decide_correction`, que aplica el cambio en la misma transacción, verificando que `old_value` sigue vigente.
Serial equivocado: el admin anula la garantía (`void_warranty`, con motivo y auditoría; la fila no se borra) y el vendedor activa el serial correcto. Qué pasa con el serial liberado (vuelve a `AVAILABLE` o pasa a `VOID`) se decide en la Fase 6.

---

## I. PDF + Email

**Comprobante PDF: generado bajo demanda, no almacenado.**
- Route Handler `GET /api/garantias/[id]/comprobante` con la **sesión del usuario**: RLS decide si puede verlo (un vendedor de otra tienda recibe 404). `?download=1` fuerza la descarga.
- Por qué no guardarlo en Storage: los datos ya están congelados en la garantía, así que el PDF es determinista. Almacenarlo cuesta espacio, duplica permisos (políticas de Storage) y queda desactualizado cuando se aprueba una corrección. Se incluye "emitido el …" en el documento.
- "Generación automática": al activar, la pantalla de éxito ofrece de inmediato **Ver / Descargar / Imprimir / Compartir** (Web Share API con el archivo en móvil, lo que permite enviarlo por WhatsApp; fallback a descarga).
- Contenido: empresa y logo (`app_settings` + bucket `branding`), producto, serial, código de barras, cliente, ID, WhatsApp, tienda, activación, duración, vencimiento, política de atención (tienda los primeros N días), condiciones, exclusiones y soporte.
- **Sin enlaces públicos al PDF** en el MVP (expondrían datos personales). Si se necesitan, serán tokens firmados con caducidad.

**Email al admin por activación: patrón outbox.**
- La activación inserta la fila en `notifications` **dentro de la misma transacción**: nunca hay una activación sin notificación pendiente, y un fallo del proveedor de email no revierte la activación.
- La Edge Function `dispatch-notifications` (con la clave de Resend como secreto, solo ahí), invocada por `pg_cron` + `pg_net` cada minuto, toma las pendientes con `FOR UPDATE SKIP LOCKED`, envía, marca `SENT` o incrementa `attempts` y reintenta con límite. Latencia de 1 minuto como máximo; los reintentos vienen incluidos.
- El proveedor queda aislado en una función (~20 líneas): cambiar de Resend a Brevo o SES no toca nada más.

---

## J. Seguridad — riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Vendedor llama la API a mano para acciones admin u otra tienda | RLS + RPC con verificación del llamante; sin políticas de escritura directa; tests pgTAP que lo intentan explícitamente |
| Escalada de rol editando el perfil | Rol y tienda solo desde `app_metadata`/admin; sin UPDATE en `profiles` para el usuario |
| Filtración de la clave secreta | Solo en `lib/supabase/admin.ts` con `import 'server-only'` (el build falla si llega al cliente) y en secretos de la Edge Function; nunca `NEXT_PUBLIC_` |
| XSS → robo de sesión (las cookies de `@supabase/ssr` son legibles por JS por diseño) | CSP estricta con nonce, sin `dangerouslySetInnerHTML`, escape de React, validación zod |
| CSRF | Las Server Actions verifican `Origin` contra `Host` (nativo de Next); los Route Handlers que mutan no existen (el PDF es GET de solo lectura); `SameSite=Lax` |
| Inyección SQL | PostgREST parametriza; en funciones SQL no se usa SQL dinámico (si hiciera falta, `format('%I/%L')`) |
| Manipulación de fechas | La firma de los RPC no acepta fechas; `now()` de la base |
| Modificar garantías históricas | Trigger de inmutabilidad sobre fechas y snapshot |
| Borrado de auditoría | Append-only con trigger que bloquea UPDATE/DELETE incluso a `service_role` |
| Fuerza bruta de login | Rate limits nativos de Supabase Auth (configurables) + MFA en admin |
| Enumeración de seriales por un vendedor | `lookup_serial` solo hace coincidencia exacta y devuelve datos mínimos; throttle por usuario en la Fase 8 si hace falta |
| Archivos maliciosos o enormes en importación | Parseo en el cliente (el archivo nunca se ejecuta en el servidor); el servidor revalida cada fila; límites de tamaño y filas; solo admin |
| Headers | HSTS, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`, `X-Content-Type-Options` en `next.config` |
| Datos personales (ID, WhatsApp) en varios países | Aviso de privacidad en el comprobante, acceso mínimo por tienda, política de retención a definir con asesoría legal (Fase 10) |

---

## K. Fases (orden recomendado)

Se mantiene la organización propuesta, con **dos ajustes justificados**:
1. **La tabla `stores` y `profiles.store_id` entran en la Fase 1** (no en la 4), porque el aislamiento por tienda es el fundamento de RLS y el test "Seller A → Store B ✗" debe existir desde el principio. La Fase 4 conserva la **UI** de tiendas y vendedores y la invitación de usuarios.
2. **La infraestructura de auditoría (tabla append-only + trigger genérico) entra en la Fase 1.** Cada fase audita sus acciones críticas desde el primer día; añadirlo al final obligaría a rehacer y re-testear todo. La Fase 8 conserva el visor de auditoría, eventos de login/logout, MFA y el endurecimiento.

Cada fase sigue: ANALIZAR → IMPLEMENTAR → TESTEAR → CORREGIR → VERIFICAR → DOCUMENTAR, y cierra con checkpoint (tests, typecheck, lint, build, pgTAP, advisors) + actualización de `docs/PROGRESS.md` en el formato del §49. No se avanza con problemas críticos abiertos.

| Fase | Contenido | Tests clave |
|---|---|---|
| **0** | Este plan → `docs/PROJECT-PLAN.md`, `ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`, `PROGRESS.md` + `CLAUDE.md` del proyecto (reglas §48–50); `git init` | — |
| **1 Fundación** | Scaffold Next 16 + shadcn; clientes Supabase; `proxy.ts`; migraciones base (`private`, `profiles`, `stores`, `app_settings`, helpers RLS, `audit_logs` + trigger, trigger `auth.users → profiles`, revokes a `anon`); login, logout, recuperar y actualizar contraseña; shells admin (escritorio) y tienda (mobile-first con CTA "Activar garantía"); design system; infra de pgTAP, Vitest y Playwright | RLS de perfiles y tiendas, rol no autoeditable, `anon` sin acceso, auditoría inmutable, smoke de login |
| **2** | Productos, lotes, seriales (CRUD admin, bloquear/anular con motivo, listado paginado por keyset, filtros) | Constraints, FK compuesta, transiciones de estado, vendedor sin acceso a seriales |
| **3** | Importación CSV/Excel (sección G) | Duplicados internos y en base, vacíos, columnas erróneas, archivo vacío, colisión serial↔barcode, reintento idempotente, carga de 1M sintética en la base local |
| **4** | UI de tiendas y vendedores, invitación, desactivación y ban | Admin crea vendedor; vendedor desactivado pierde acceso de inmediato |
| **5** | `lookup_serial`, `activate_warranty`, flujo de activación móvil (cámara, lector-teclado, manual), listados y búsqueda de la tienda, dashboard de tienda, edición en 24 h | AVAILABLE→ok, ACTIVATED→rechazo, concurrencia (2 activaciones simultáneas → 1 gana), snapshot 365→730, fecha del servidor, tienda del perfil |
| **6** | Correcciones, PDF, outbox + Edge Function + Resend, SMTP de Auth, anulación de garantía | <24 h edita / >24 h bloquea y crea corrección; aprobar aplica y audita; PDF 404 para otra tienda; reintento de email |
| **7** | Reclamos + reportes técnicos + historial de la garantía | Transiciones, `responsible_party` (día 30 vs 31), aislamiento por tienda |
| **8** | Visor de auditoría, eventos de login/logout, MFA (admin obligatorio, `aal2` en `is_admin()`), CSP y headers, throttles | Admin `aal1` no puede operar; vendedor opcional; headers presentes |
| **9** | Performance (EXPLAIN de búsquedas y dashboard con 1M), dashboard admin, QA completo, proyecto de producción, backups, despliegue, runbook | E2E de los flujos críticos; tiempos medidos |
| **10** | Propiedad intelectual, licencia, entrega, documentación final. Solo mecanismos **visibles y documentados** (estado del servicio con aviso); nunca kill switch oculto, backdoor ni destrucción de datos. Revisión jurídica antes de firmar | — |

---

## L. Criterios de aceptación (los 28 del encargo → fase)

1–3 producto, lote y duración → F2 · 4–5 importar y validar duplicados → F3 · 6–8 tienda, vendedor y login → F1/F4 · 9–12 buscar serial/barcode, escanear, registrar cliente → F5 · 13–16 activar, fecha del servidor, vencimiento, snapshot → F5 · 17–18 PDF y email → F6 · 19–20 consultar y editar en 24 h → F5 · 21–22 corrección y aprobación → F6 · 23–24 reclamo y reporte técnico → F7 · 25 RLS por tienda → F1 en adelante (test en cada fase) · 26 auditoría → F1 en adelante · 27 MFA → F8 · 28 grandes volúmenes → F3/F9.

---

## M. Riesgos

1. **Cualquier tienda puede activar cualquier serial disponible** (los seriales no están asignados a tiendas; gana la primera). Mitigación: auditoría + `lookup` exacto + throttle. A decidir con el negocio: asignar lotes a tiendas en el futuro.
2. **Límites de planes gratuitos**: Resend 100 emails/día (activaciones + emails de Auth comparten la cuota); Supabase Free se pausa tras 7 días sin actividad, no tiene backups y tiene 500 MB (1M seriales + índices ≈ 300–400 MB); Vercel Hobby prohíbe el uso comercial.
3. **Excel muy grande** en el navegador (memoria) → CSV recomendado, tope medido.
4. **Timeouts de 8 s** en operaciones masivas → todo en bloques, medido en la Fase 9.
5. **Varios países**: husos horarios (UTC en la base, zona por tienda al mostrar), formatos de ID heterogéneos (validación genérica), leyes de garantía y de datos personales distintas (los textos los define el cliente con su abogado).
6. **Bloqueo de admin por MFA** → segundo admin + procedimiento documentado.
7. **APIs nuevas** (Next 16, `@react-pdf` en Node runtime) → leer la documentación de la versión instalada y hacer un spike del PDF al inicio de la Fase 6.
8. **Sin Docker** en esta máquina → no hay stack local ni pgTAP hasta instalar Docker Desktop (WSL2). Alternativa más débil: proyecto Supabase de desarrollo en la nube.
9. **Dependencia de Supabase**: mitigada porque todo es Postgres estándar + migraciones SQL portables.

---

## N. Costos (estimados, a verificar al contratar)

| Servicio | Propósito | Costo | Límites del gratuito | Alternativa |
|---|---|---|---|---|
| Supabase | DB, Auth, Edge, Storage | Dev: 0 · **Prod: Pro 25 USD/mes** (necesario por backups, sin pausa y 8 GB) | 500 MB DB, 1 GB Storage, 50k MAU, pausa tras 7 días, sin backups, 2 proyectos | Postgres autogestionado (no recomendado) |
| Hosting Next.js | App | Vercel Pro 20 USD/mes **o** Cloudflare Workers (OpenNext) 0 USD | Vercel Hobby: no comercial. Cloudflare free: 100k req/día, uso comercial permitido | Netlify |
| Resend | Email de activación + SMTP de Auth | 0 → 20 USD/mes (50k emails) | 3.000/mes, 100/día, 1 dominio | Brevo (300/día gratis), Amazon SES (~0,10 USD/1.000) |
| Dominio | Deliverability del email y URL | ~10–15 USD/año | — | Necesario |
| GitHub | Repo privado | 0 | — | — |
| Librerías | Todas open source | 0 | — | — |

**Total producción estimado: ~25–45 USD/mes + dominio.** Desarrollo: 0 USD.

---

## O. Primera fase a implementar (tras aprobar)

**Fase 0 (cierre):**
1. `git init` en `chino` (el remoto se agrega cuando crees el repo en GitHub).
2. Crear `docs/PROJECT-PLAN.md` (este plan), `docs/ARCHITECTURE.md` (C, F, I), `docs/DATABASE.md` (D, E, G, H), `docs/SECURITY.md` (J), `docs/PROGRESS.md` (Fase 0 completada) y `CLAUDE.md` con las reglas de trabajo (§48–50, "no hacer").
3. Guardar en memoria: la cuenta de Supabase y el repo de GitHub de este proyecto son nuevos; no usar la cuenta del MCP conectado.

**Prerrequisitos del usuario para la Fase 1:** instalar Docker Desktop (WSL2), crear el repo en GitHub y el proyecto Supabase de desarrollo en la cuenta nueva (este último puede esperar: el desarrollo arranca contra el stack local).

**Fase 1 — Fundación:**
- `create-next-app` (Next 16, TS, Tailwind, App Router, ESLint) + shadcn init + dependencias de la sección C.
- `lib/supabase/{client,server,admin}.ts`, `proxy.ts`, variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` (server-only), `.env.example` sin valores.
- `npx supabase init` + migraciones: extensiones (`pg_trgm`), esquema `private`, `stores`, `profiles`, `app_settings`, helpers `is_admin`/`current_store_id`, `audit_logs` + trigger genérico + inmutabilidad, trigger `auth.users → profiles`, revokes a `anon`.
- Páginas de login, logout, recuperar y actualizar contraseña; layouts protegidos admin/tienda; design system sobrio (tokens, tipografía, estados de carga, vacío y error).
- Tests: pgTAP (aislamiento de tiendas en `profiles`/`stores`, rol no autoeditable, `anon` denegado, auditoría no borrable), Vitest configurado, Playwright smoke de login.
- Checkpoint: `npm run lint`, `tsc --noEmit`, `npm run build`, `npx supabase test db`, advisors → `docs/PROGRESS.md`.

## Verificación (cómo se comprueba el sistema de punta a punta)

- **Base de datos**: `npx supabase db reset` (migraciones limpias) + `npx supabase test db` (pgTAP: RLS, RPC, 24 h simulando `activated_at` en el pasado, snapshot, concurrencia, importación).
- **App**: `npm run lint && npx tsc --noEmit && npm run build && npx vitest run`.
- **E2E**: `npx playwright test` contra el stack local: login → importar CSV → invitar vendedor → activar desde un viewport móvil → PDF → corrección → reclamo.
- **Seguridad**: con la sesión de un vendedor, llamadas manuales a PostgREST/RPC contra otra tienda y acciones admin (deben fallar); Supabase Advisors sin alertas.
- **Volumen**: importación sintética de 1M filas en local, midiendo el tiempo por bloque y el `EXPLAIN ANALYZE` de las búsquedas.

---

## Registro de revisión — 2026-09-14 (v2)

Revisión solicitada por el usuario antes de iniciar la Fase 1. No se tocó código (no existía ninguno). Detalle completo en los documentos vivos; aquí solo el resumen de qué cambió y por qué.

### Cambios realizados

1. **Roles**: se documentan explícitamente como MASTER/ADMIN y SELLER (nombres de negocio), manteniendo los valores de columna `admin`/`seller` — no había incompatibilidad técnica que justificara renombrarlos. Se agregó la lista explícita de lo que SELLER **no puede** hacer, y una nota de que un tercer rol futuro (técnico, gerente) no requiere rediseñar el esquema. → `ARCHITECTURE.md`, "Roles y permisos".
2. **Separación app admin vs. propietario de infraestructura**: sección nueva dejando explícito que MASTER/ADMIN opera la app, no GitHub/Supabase/Vercel/Resend/el código. Es la base conceptual de la Fase 10. → `ARCHITECTURE.md`.
3. **Importación masiva**: se agregaron los estados `COMMITTING`/`FAILED`/`CANCELLED` (antes solo implícitos), la acción admin "Cancelar importación" (`cancel_import`, solo antes de confirmar) y su limpieza de staging (`purge_import_staging`). Se hizo explícita la vista previa obligatoria y la acción "Confirmar importación" como paso atómico (`start_import_commit`) a prueba de doble confirmación. Se **retiró** la cifra "1M = 3-6 minutos" como si fuera una garantía; el requisito ahora se expresa como corrección + reanudabilidad + idempotencia, con la velocidad real a medir en la Fase 9. Se documentó explícitamente qué pasa ante cierre de navegador, corte de red o reinicio en cada etapa. → `DATABASE.md`, "Importación masiva".
4. **Casos de prueba de importación**: se listó explícitamente el set completo pedido (archivo vacío, columnas incorrectas, duplicados, colisiones serial↔barcode, mayúsculas/espacios, reintentos, doble confirmación, 100k/300k/1M). → `DATABASE.md`.
5. **`customers`**: se documentó explícitamente como decisión de MVP **reversible**, con el camino de migración (columna `warranties.customer_id` nullable + tabla `customers` nueva) que no rompe el snapshot histórico. → `DATABASE.md`, "Decisiones del modelo".
6. **Mínimo privilegio para SELLER**: se revisó tabla por tabla. Dos hallazgos reales se corrigieron: (a) `app_settings` se dividió en `app_settings` (público, incluye lo necesario para el comprobante) y `notification_settings` (solo admin, `admin_notification_emails` no debía ser legible por vendedores); (b) `technical_reports` deja de tener SELECT directo para `seller` (el diagnóstico interno no es información de tienda, solo el resumen del reclamo). `products`, `lots`/`serials` y `warranties` se revisaron y ya cumplían el principio (se documentó por qué). → `ARCHITECTURE.md` ("Mínimo dato necesario") y `DATABASE.md`.
7. **Configuración de empresa**: `app_settings` se reorganizó explícitamente en los cuatro grupos pedidos (Empresa, Garantías, Sistema, Soporte) con columnas concretas. → `DATABASE.md`.
8. **Backup y recuperación**: sección nueva (qué es crítico, estrategia, qué se verifica al contratar, restauración, prueba periódica). → `SECURITY.md`.
9. **Observabilidad**: sección nueva, minimalista, apoyada en lo que Supabase/Vercel ya dan y en columnas de estado que el propio esquema ya tenía (`serial_import_rows.error_code`, `notifications.last_error`), sin agregar una plataforma de APM en el MVP. → `ARCHITECTURE.md`.
10. **Notificaciones/email desacoplado**: se explicitó la capa `NotificationService` → `EmailProvider` → Resend, y que los precios/límites de proveedores externos se verifican al implementar, no se asumen fijos. → `ARCHITECTURE.md`.
11. **Hosting**: se revirtió a Vercel como única opción recomendada (se había sugerido Cloudflare Workers como alternativa de costo; se retiró — no hay razón técnica real hoy, solo ahorro, que no justifica la complejidad de evaluar una segunda plataforma ahora). → `ARCHITECTURE.md`.
12. **Checklist de funciones `SECURITY DEFINER`**: sección nueva con 5 puntos de revisión (search_path, revoke, re-verificación del llamante, ningún parámetro de identidad confiado, test pgTAP que intenta explotarla) aplicada a cada RPC crítico. → `SECURITY.md`.
13. **Costos**: se reforzó la advertencia de que los precios de Supabase/Vercel/Resend son variables y se verifican al contratar, sin convertirlos en requisito técnico. (El contenido económico en sí no cambió; ver sección N de este archivo.)

### Decisiones mantenidas (no se tocaron)

Toda la arquitectura principal del plan v1: Next.js + React + TypeScript, Supabase como backend único, Postgres como autoridad de las reglas críticas, Supabase Auth, RLS, RPC para operaciones críticas, activación atómica por función Postgres con `SELECT ... FOR UPDATE`, snapshot histórico inmutable, auditoría append-only, MFA obligatorio para MASTER/ADMIN, importación masiva por lotes desde el navegador, PDF bajo demanda (no almacenado), patrón outbox para email, Edge Function para el envío, sin backend Express/Nest separado, sin secretos en el frontend, sin mecanismos ocultos de apagado. El orden de fases (con los dos ajustes ya justificados en la sección K) tampoco cambió.

### Riesgos que siguen abiertos

- Los seriales no están asignados a tiendas (gana la primera activación); es una decisión de negocio pendiente, no técnica.
- Sin Docker en la máquina de desarrollo: bloquea Supabase local y pgTAP hasta instalarlo.
- Precios y límites exactos de Supabase/Vercel/Resend: se verifican al contratar, no antes.
- Backup: retención y frecuencia exactas dependen del plan de Supabase contratado — marcado como "verificar al configurar producción" en `SECURITY.md`.
- Tope de tamaño de Excel en el navegador y tiempos reales de importación de 1M: pendientes de medir en la Fase 9 (o antes, si se prueba con Supabase local).

### Estado final

**LISTO PARA FASE 1.**
