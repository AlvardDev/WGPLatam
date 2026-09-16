# Sistema de Gestión de Garantías

Aplicación web para gestionar garantías de productos por número de serie y código de barras: productos, lotes, seriales, tiendas, vendedores, activaciones, correcciones, reclamos, reportes técnicos, comprobantes PDF, email, auditoría y MFA.

Stack: Next.js 16 (App Router) + React 19 + TypeScript + Supabase (Postgres, Auth, RLS, Edge Functions, Storage).

## Documentación (leer antes de trabajar)

- `docs/PROJECT-PLAN.md`: plan aprobado (registro histórico, no se edita).
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`: documentos vivos.
- `docs/PROGRESS.md`: estado de cada fase y siguiente paso.

## Cuentas

- El repo de GitHub y el proyecto Supabase de este sistema son **nuevos** y usan otra cuenta.
- **No** usar la cuenta de Supabase conectada por MCP en este entorno (org "AlvardDev's Org") para este proyecto.

## Roles

- Tres roles: **SUPERADMIN** (`profiles.role = 'superadmin'`, el desarrollador/operador — gestiona otras cuentas admin, hereda todo lo de MASTER/ADMIN), **MASTER/ADMIN** (`profiles.role = 'admin'`, el cliente dueño del negocio) y **SELLER** (`profiles.role = 'seller'`, con `store_id` obligatorio). Ver `docs/ARCHITECTURE.md`, "Roles y permisos", para la lista completa de qué puede y qué no puede hacer cada uno.
- MASTER/ADMIN controla el sistema **desde la interfaz de la app**. Eso no lo convierte en dueño de GitHub, Supabase, Vercel, Resend ni del código — la propiedad de infraestructura es un tema aparte (Fase 10). Nunca mezclar ambos conceptos en la UI ni en el código.
- Mínimo privilegio y mínimo dato necesario: antes de dar SELECT completo de una tabla a `seller`, preguntar qué columnas necesita realmente la pantalla. Ejemplos ya decididos: sin acceso a `lots`/`serials` (solo `lookup_serial` con columnas mínimas), sin acceso a `technical_reports` completos, sin acceso a `notification_settings`.

## Forma de trabajo

- Fase por fase, nunca todo de golpe: ANALIZAR → IMPLEMENTAR → TESTEAR → CORREGIR → VERIFICAR → DOCUMENTAR.
- No pasar a la siguiente fase con problemas críticos abiertos.
- Al cerrar cada fase: tests, typecheck, lint, build, `npx supabase test db`, Supabase Advisors. Luego actualizar `docs/PROGRESS.md` y presentar el checkpoint:

```text
FASE:
ESTADO:
COMPLETADO:
TESTS:
PROBLEMAS:
RIESGOS:
DECISIONES:
SIGUIENTE:
```

## Importación masiva

- Estados de `serial_imports`: `STAGING → COMMITTING → COMPLETED`, con `FAILED` y `CANCELLED` como salidas. Cancelar solo se permite antes de confirmar (`STAGING`); una vez confirmada (`COMMITTING`), corre hasta el final porque es idempotente y reanudable.
- Vista previa (conteos + errores paginados + CSV de errores) es obligatoria antes de poder confirmar. "Confirmar importación" es una acción explícita y atómica (`start_import_commit`), a prueba de doble clic o dos admins a la vez.
- No prometer tiempos de importación como garantía ("1M en 3-6 min" no es un requisito). El requisito real es: segura, reanudable, idempotente, sin pérdida de datos. La velocidad se mide en la Fase 9. Ver `docs/DATABASE.md`, "Importación masiva", para el detalle completo de reanudación ante cierre de pestaña, corte de red o reinicio.

## Reglas de arquitectura

- La base de datos es la autoridad: rol, tienda, estado del serial, ventana de 24 h y fechas se aplican en Postgres (RLS + RPC).
- Lecturas vía RLS; escrituras críticas (seriales, garantías, correcciones, reclamos) solo vía RPC `SECURITY DEFINER` con `search_path = ''` y verificación del llamante.
- La clave secreta de Supabase solo en `lib/supabase/admin.ts` (`import 'server-only'`). Nunca `NEXT_PUBLIC_` para secretos.
- En el servidor, verificar la sesión con `getClaims()`, no con `getSession()`.
- Software y datos del negocio separados: datos de la empresa, clientes, tiendas y seriales nunca en el repo ni en seeds de producción.
- Next.js 16 tiene APIs nuevas (`proxy.ts` en lugar de `middleware.ts`, APIs de request asíncronas). Leer la documentación de la versión instalada antes de escribir código de Next.

## No hacer

- Borrar trabajo existente o tests para que pasen.
- Desactivar RLS o crear políticas permisivas para simplificar.
- Exponer la clave secreta ni guardar contraseñas manualmente.
- Confiar en el frontend para autorizar o en el reloj del navegador para fechas.
- Permitir seriales inventados por vendedores.
- Modificar garantías históricas (fechas, duración, snapshot).
- Cargar grandes datasets completos en el frontend.
- Introducir servicios externos innecesarios, sobreingenierizar o crear un backend separado sin justificación documentada.
- Implementar mecanismos ocultos de apagado, backdoors o destrucción de datos.
- Inventar requisitos, tablas, APIs o funcionalidades.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
