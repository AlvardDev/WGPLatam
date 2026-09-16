# Arquitectura

> Documento vivo. Fuente: plan aprobado (`PROJECT-PLAN.md`) y su revisión del 2026-09-14. Se actualiza al cerrar cada fase.

## Contexto de despliegue

- **Una empresa por instalación**: cada cliente tiene su propio despliegue de Next.js y su propio proyecto Supabase. No hay `tenant_id`.
- **Varios países**: fechas en UTC en la base; se muestran en la zona horaria de la tienda (`stores.timezone`, con `app_settings.default_timezone` por defecto).
- Repo en GitHub (por crear) y **cuenta de Supabase nueva**, distinta de la conectada por MCP en el entorno de desarrollo.

## Vista general

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
  ├─ Edge Function dispatch-notifications (clave del proveedor de email solo aquí) ← pg_cron cada minuto
  └─ Storage: bucket `branding` (logo de la empresa). Nada más en el MVP.
```

## Principios

1. **La base de datos es la autoridad.** Rol, tienda, estado del serial, ventana de 24 h y fechas se aplican en Postgres. El frontend solo mejora la UX.
2. **Lecturas vía RLS, escrituras críticas vía RPC.** Seriales, garantías, correcciones y reclamos no tienen políticas de escritura directa para `authenticated`. El catálogo (productos, tiendas, lotes) se escribe directo con políticas solo-admin y trigger de auditoría.
3. **Sin backend separado.** Next.js + RPC de Postgres + una Edge Function cubren todo.
4. **Software ≠ datos del negocio.** El repo contiene código, migraciones de esquema y documentación técnica. Nombre de empresa, logo, contactos, textos de garantía, tiendas, seriales y clientes viven en la base y el Storage del cliente, nunca en el repo ni en seeds de producción.
5. **Mínimo privilegio y mínimo dato necesario.** Cada rol ve solo lo que necesita para hacer su trabajo, no todo lo que la tabla contiene. Ver "Roles y permisos" abajo.

## Stack

| Capa | Elección |
|---|---|
| Framework | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript strict |
| Supabase | `@supabase/ssr`, `@supabase/supabase-js`, tipos con `supabase gen types`, CLI como devDependency (`npx supabase`) |
| UI | shadcn/ui + Tailwind 4, lucide, sonner |
| Formularios | react-hook-form + zod 4 (esquemas compartidos cliente/servidor en `lib/validation`) |
| Fechas | date-fns 4 + `@date-fns/tz` |
| Importación | Papa Parse (CSV en streaming, Web Worker); SheetJS desde `cdn.sheetjs.com` (no la versión de npm) |
| Escaneo | `BarcodeDetector` nativo + ponyfill `barcode-detector` (zxing-wasm auto-hospedado) |
| PDF | `@react-pdf/renderer` en Route Handler con runtime Node (spike al inicio de la Fase 6) |
| Email | Resend como primer proveedor, detrás de un adaptador (ver "Notificaciones") |
| Tests | pgTAP (`supabase test db`), Vitest, Playwright |

`npx shadcn@latest init` en esta versión usa primitivas de **base-ui** (`@base-ui/react`), no Radix: la composición ("renderizar como otro elemento") se hace con la prop `render={<Elemento />}`, no con `asChild`. Ejemplo: `<Button render={<Link href="/x">Texto</Link>} />`.

## Estructura del repo

```
app/(auth)/{login,recuperar,actualizar-clave,mfa}
app/admin/...            dashboard, productos, lotes, seriales, importaciones, tiendas,
                          usuarios, garantias, correcciones, reclamos, auditoria, ajustes
app/tienda/...           inicio, activar, garantias, correcciones, reclamos
app/api/garantias/[id]/comprobante/route.ts   (PDF bajo demanda)
lib/supabase/{client,server,admin}.ts
lib/validation/*.ts
components/ui
proxy.ts
supabase/migrations/*.sql  supabase/tests/*.sql  supabase/functions/dispatch-notifications
tests/e2e
docs/  CLAUDE.md
```

Código e identificadores en inglés; UI y URLs en español.

## Variables de entorno

| Variable | Dónde | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Next (cliente y servidor) | Pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Next (cliente y servidor) | Pública; RLS la limita |
| `SUPABASE_SECRET_KEY` | Next, **solo servidor** (`lib/supabase/admin.ts`) | Nunca con prefijo `NEXT_PUBLIC_` |
| `RESEND_API_KEY` | Secreto de la Edge Function | Next no la necesita |

`.env.example` solo lleva nombres, nunca valores.

## Roles y permisos

Dos roles en el MVP, valores de columna `admin` / `seller` en `profiles.role`. Nombres conceptuales del negocio: **MASTER/ADMIN** y **SELLER**. No se cambia el nombre de la columna por preferencia: no hay incompatibilidad técnica que lo justifique.

### MASTER / ADMIN (`role = 'admin'`)

Administra el sistema **a través de la interfaz de la aplicación**. Puede:

- crear, editar y activar/desactivar productos;
- crear y administrar lotes;
- importar, bloquear y anular seriales;
- crear y administrar tiendas;
- invitar y desactivar vendedores;
- consultar garantías globalmente;
- aprobar/rechazar correcciones;
- gestionar reclamos y reportes técnicos;
- consultar auditoría;
- configurar empresa, soporte y políticas del sistema (`app_settings`);
- gestionar MFA y seguridad de su propia cuenta y de las cuentas de vendedores (desactivar, forzar reautenticación).

### SELLER (`role = 'seller'`, con `store_id` obligatorio)

Pertenece a una única tienda. Puede:

- buscar y escanear serial/barcode;
- activar garantías;
- registrar clientes;
- editar los campos permitidos durante las primeras 24 horas;
- solicitar correcciones después de las 24 horas;
- consultar garantías de su tienda;
- abrir reclamos de su tienda;
- consultar/descargar comprobantes autorizados.

**No puede** (aplicado en RLS/RPC, no solo oculto en la UI):

- crear, importar o modificar seriales ni lotes;
- cambiar la duración de una garantía;
- cambiar la fecha de activación, el vencimiento o cualquier dato del snapshot;
- manipular el reloj (ningún RPC acepta fechas del cliente);
- acceder a otra tienda;
- modificar su propio rol o el de nadie;
- acceder a auditoría global ni a reportes técnicos completos (ver "Mínimo dato necesario" abajo);
- cambiar configuración global;
- crear administradores ni otros vendedores.

**Tercer rol futuro**: el diseño no lo necesita hoy, pero deja espacio para uno (p. ej. `technician` o `store_manager`) sin rediseñar el esquema: se añadiría un valor más al `CHECK` de `profiles.role` y las políticas/RPC que lo requieran. No se crea una tabla `roles`/`permissions` genérica mientras solo existan permisos fijos por rol — agregarla ahora sería una abstracción sin usuario que la configure.

### Mínimo dato necesario (repaso tabla por tabla)

| Tabla/recurso | Qué ve el vendedor | Por qué |
|---|---|---|
| `products` | Catálogo de productos activos completo (nombre, código, condiciones, exclusiones, cómo funciona) | Es texto comercial/de garantía, no dato interno; lo necesita para explicarle al cliente al activar |
| `lots`, `serials`, `serial_imports*` | Nada directo | Cantidades, orígenes y estado de inventario son información administrativa. El vendedor busca vía `lookup_serial`, que devuelve solo `serial`, `barcode`, `product_code`, `product_name`, `warranty_duration_days`, `status` — nunca `lot_id`, `import_id` ni `status_reason` |
| `warranties` | Las de su tienda, todas las columnas | Es su trabajo diario |
| `warranty_claims` | Las de su tienda | — |
| `technical_reports` | **Nada directo**; ve el estado/decisión del reclamo asociado, no el diagnóstico técnico completo | Diagnóstico, pruebas y observaciones son trabajo interno de soporte técnico, no información operativa de tienda |
| `app_settings` | Los campos públicos de empresa/soporte/política de garantía necesarios para el comprobante | Ver split con `notification_settings` en `DATABASE.md` |
| `notification_settings` (`admin_notification_emails`, etc.) | Nada | Es configuración operativa interna, no dato de negocio de tienda |
| `audit_logs` | Nada | Trazabilidad global es responsabilidad del admin |

Este principio se revisa en cada fase que toque una tabla nueva: antes de dar SELECT completo a `seller`, preguntar qué columnas necesita realmente la pantalla que las usa.

## Auth (implementado en la Fase 1)

- `auth.users → profiles`: el trigger `private.handle_new_user()` (migración `auth_user_provisioning`) crea el perfil al insertarse el usuario, leyendo **solo** `raw_app_meta_data` (nunca `raw_user_meta_data`, que el propio usuario puede tocar desde el cliente).
- **Primer admin**: un usuario creado a mano en el dashboard de Supabase (sin `app_metadata`) recibe un perfil con `role = null`, `is_active = false` — sin acceso a nada. Para promoverlo:
  ```sql
  update auth.users set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', 'admin')
    where email = 'admin@empresa.com';
  update public.profiles set role = 'admin', store_id = null, is_active = true
    where id = (select id from auth.users where email = 'admin@empresa.com');
  ```
  (El trigger solo corre en el INSERT original; por eso el segundo UPDATE es manual.) No existe ni existirá un endpoint para volverse admin.
- **Alta de vendedor** (Fase 4, `lib/actions/sellers.ts`): **no** es una sola llamada — este documento decía antes que sí, y era falso. `auth.admin.inviteUserByEmail(email, { data })` escribe `data` en `raw_user_meta_data`, nunca en `raw_app_meta_data` (verificado en el tipo `InviteUserByEmailOptions` de `@supabase/auth-js`: el campo está documentado como "maps to the user_metadata column"). Por eso el trigger crea el perfil sin rol (`role = null`, `is_active = false`, igual que el bootstrap manual del primer admin de arriba). El flujo real, en 3 pasos:
  1. `inviteUserByEmail(email, { data: { full_name }, redirectTo })` — crea el usuario y envía el correo.
  2. `updateUserById(user.id, { app_metadata: { role: 'seller', store_id, full_name } })` — esto sí llega a `app_metadata`, la fuente que `proxy.ts` lee del JWT en logins futuros para decidir si enruta a `/tienda`; sin este paso el vendedor invitado quedaría en un loop de redirección al iniciar sesión por primera vez.
  3. RPC `admin_finalize_seller_profile(user_id, full_name, store_id)` (con la sesión normal del admin, no con la service key) — activa el perfil (`role = 'seller'`, `store_id`, `is_active = true`). Es un RPC y no un UPDATE directo con el cliente de service role sobre `profiles` para que `auth.uid()` resuelva al admin real dentro de la función y el trigger `audit_profiles` (Fase 1) audite con el actor correcto en vez de `NULL`.

  Si el paso 2 o el 3 falla, el server action borra el usuario recién creado (`deleteUser`, best-effort) para no dejar una cuenta a medio aprovisionar. Desactivar/reactivar un vendedor sigue el mismo principio: `admin_set_seller_active(user_id, is_active)` por RPC (autoridad de RLS, efecto inmediato) + `updateUserById(user_id, { ban_duration })` con el cliente de service role para matar su refresh token (ver `docs/PROJECT-PLAN.md`).
- **Sesión**: `proxy.ts` y los layouts `admin/`/`tienda/` verifican con `supabase.auth.getClaims()`, nunca con `getSession()`. `proxy.ts` trata cualquier error de `getClaims()` (Supabase caído, mal configurado) como no autenticado — cierra en falso, nunca dejaría pasar una ruta protegida por un fallo de red.
- Los layouts `admin/`/`tienda/` repiten la comprobación de rol/`is_active` contra `profiles` (una consulta más) como segundo checkpoint de UX; la autoridad real sigue siendo RLS.
- **MFA**: ver `docs/SECURITY.md`, sección "MFA" — obligatorio para admin, implementado en la Fase 8 (`private.is_admin()` exige `aal2`; `proxy.ts` redirige a `/mfa`; `app/(auth)/mfa/mfa-gate.tsx` decide enrolar o desafiar).

## Administración de la aplicación vs. propiedad de infraestructura

El rol **MASTER/ADMIN** controla el sistema **desde la interfaz web**: productos, tiendas, garantías, usuarios de la aplicación, configuración de negocio. Esto es independiente y **no implica** ser dueño o tener acceso a:

- el repositorio de GitHub;
- el panel de Supabase (proyecto, billing, backups, secretos);
- la cuenta de hosting (Vercel);
- la cuenta del proveedor de email (Resend);
- la infraestructura y las cuentas de desarrollo en general;
- el código fuente.

El acceso a infraestructura técnica es una cuestión de **despliegue, operación y propiedad/licencia**, separada del rol de negocio dentro de la app. Un MASTER/ADMIN puede cambiarse la contraseña de otro vendedor desde el panel; no puede (por ese rol) entrar al dashboard de Supabase.

Esta separación es la base de la **Fase 10** (propiedad intelectual, licencia, entrega, mantenimiento, soporte, estado del servicio) y no se implementa nada de infraestructura relacionada con licenciamiento antes de esa fase.

## PDF

- `GET /api/garantias/[id]/comprobante` con la sesión del usuario: RLS decide el acceso (otra tienda → 404). `?download=1` fuerza la descarga.
- Generado **bajo demanda**, no almacenado: la garantía está congelada, así que el PDF es determinista, no ocupa Storage y refleja las correcciones aprobadas. Incluye "emitido el …".
- Tras activar: Ver / Descargar / Imprimir / Compartir (Web Share API con el archivo; fallback a descarga).
- Sin enlaces públicos en el MVP.
- Errores de generación (plantilla, datos faltantes) se capturan server-side y quedan en los logs de la plataforma de hosting (ver "Observabilidad"); no hay servicio adicional para esto en el MVP.

## Notificaciones (outbox + proveedor desacoplado)

Capas, de negocio a proveedor:

```
activate_warranty (RPC)
      ↓ inserta fila en la tabla "notifications" (outbox), misma transacción
NotificationService  ── Edge Function dispatch-notifications, invocada por pg_cron cada minuto
      ↓ toma pendientes con FOR UPDATE SKIP LOCKED
EmailProvider          ── módulo adaptador (~20 líneas): send(to, subject, body) → {ok, providerId, error}
      ↓
Resend (implementación actual del adaptador)
```

- La lógica de garantías nunca importa el SDK de Resend directamente; solo conoce `NotificationService`/la tabla `notifications`.
- Cambiar de proveedor (Resend → Brevo, SES, etc.) implica reemplazar únicamente el módulo `EmailProvider`.
- Un fallo del proveedor nunca revierte una activación: la fila queda `FAILED` con `last_error`, y se reintenta con límite.
- **Precios y límites de Resend (u otro proveedor) se verifican al momento de implementar/contratar**, no se asumen permanentes. La sección de costos del plan es una estimación, no un requisito técnico.

## Hosting

**Vercel** como plataforma de despliegue de Next.js: es la opción de referencia del framework, con el mejor soporte para Server Actions, Route Handlers en runtime Node (necesario para el PDF) y despliegue continuo desde GitHub. Prioridad: simplicidad, compatibilidad, mantenimiento, seguridad, facilidad de despliegue.

- **Desarrollo**: plan gratuito.
- **Producción**: plan Pro (de pago) — el plan Hobby prohíbe el uso comercial. Precio exacto a verificar al contratar.

No se evalúan alternativas (Cloudflare Workers u otras) sin una razón técnica real que surja durante el desarrollo; si aparece, se documenta la comparación antes de cambiar.

### Nota de entorno: Turbopack en desarrollo (Windows)

`next dev` (Turbopack, el motor por defecto) puede colapsar en Windows al compilar `app/globals.css`: un proceso nativo que lanza para el pipeline de PostCSS muere con `0xc0000142` (fallo de inicialización de DLL), y el error se manifiesta en el navegador como si la página no reaccionara — el HTML se sirve pero el bundle de cliente nunca termina de compilar, así que React no hidrata y un `<form>` cae al envío nativo del navegador (visto por primera vez: la contraseña de login apareció en la URL). No depende del código de la aplicación: `lightningcss` (el módulo nativo de Tailwind 4) carga bien fuera de Turbopack, y el **build de producción** (`next build`, que también usa Turbopack) compila sin problema — el fallo es específico del compilador incremental de `next dev` en esta plataforma.

**Workaround verificado**: `npm run dev:webpack` (`next dev --webpack`) en vez de `npm run dev`. Es más lento en la primera compilación de cada ruta, pero estable. Si `next dev` (Turbopack) funciona sin problemas en tu máquina, úsalo con normalidad — esto es una nota de compatibilidad, no un cambio de configuración por defecto.

## Observabilidad

Estrategia mínima, apoyada en lo que Supabase y Vercel ya dan sin costo ni dependencia nueva — no se monta una plataforma de APM en el MVP:

| Qué detectar | Dónde se ve | Notas |
|---|---|---|
| Errores de RPC / Postgres | Logs de Supabase (`query_logs` / dashboard) | Incluye errores de las funciones `SECURITY DEFINER` |
| Errores de autenticación | Logs de Supabase Auth | Intentos fallidos, rate limiting |
| Errores de importación | `serial_import_rows.status/error_code`, `serial_imports.status` | Ya forman parte del modelo de datos; no hace falta un sistema aparte |
| Fallos de la Edge Function de notificaciones | `notifications.status = 'FAILED'` + `last_error`, logs de la función | Pantalla admin "Notificaciones fallidas" (Fase 6/8) |
| Operaciones lentas | Supabase Performance Advisor + `pg_stat_statements` (activado por defecto) | Se consulta bajo demanda, no hay alertas automáticas en el MVP |
| Errores de generación de PDF | Logs del servidor (Vercel) | `console.error` capturado por el runtime |
| Errores críticos de frontend | Error boundaries de Next.js + logs de Vercel | Sentry (plan gratuito, ~5k eventos/mes) es la vía de escalamiento si esto resulta insuficiente — se evalúa en la Fase 9, no se agrega antes |
| Fallos de producción en general | Vercel Logs/Analytics + Supabase Logs | Sin servicio adicional en el MVP |

Principio: reusar lo que ya viene con Supabase/Vercel y con el propio modelo de datos (columnas de estado y error) antes de sumar una herramienta nueva. Se reevalúa en la Fase 9 con datos reales de uso.
