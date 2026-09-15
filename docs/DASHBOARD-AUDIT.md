# Auditoría del Dashboard/área admin y tienda (2026-09-15)

> No es un rediseño. Inspección del código, queries, permisos, UX y responsive de lo que existe hoy (F1–F4), con correcciones aplicadas solo cuando eran pequeñas y estaban claramente dentro de esta tarea.

## 1. Estado actual — lo que hay, no lo que se asumía

**No existe todavía un "dashboard" con KPIs.** `/admin` y `/tienda` son páginas de bienvenida honestas (`EmptyState`, sin números falsos), y así está documentado desde la Fase 1: *"Dashboard admin y de tienda: páginas honestas de bienvenida/estado vacío, sin KPIs ni datos simulados, porque no existen datos de negocio todavía"*. El "dashboard admin" con indicadores reales es explícitamente trabajo de la **Fase 9** (`docs/PROJECT-PLAN.md`), no de esta tarea.

Por eso esta auditoría cubre lo que **sí** existe y es auditable hoy: los shells (`admin`/`tienda`), la navegación, y las 8 pantallas funcionales reales (`productos`, `lotes`, `seriales`, `importaciones`, `tiendas`, `vendedores`, `auditoría`, `ajustes`).

## 2. Datos — sin hallazgos

Búsqueda explícita de `mock|fake|hardcod|placeholder|TODO|FIXME|Math.random` en `app/`: **cero coincidencias** en código de producción (solo en archivos `.test.tsx`, donde mockear es correcto). Ninguna cifra inventada, ningún placeholder de KPI, ninguna fecha incorrecta. Confirmado también por el propio mantenimiento de esta sesión: la base de datos real no tenía ningún dato de negocio real más allá de 1 perfil admin, `app_settings` y `notification_settings` — todo lo demás eran benchmarks de F3, ya limpiados (ver `PROGRESS.md`).

## 3. Permisos — sin fugas encontradas

- La autorización real vive en `proxy.ts` (redirige por rol leyendo el claim `app_metadata` del JWT) + RLS en Postgres — **no en ocultar botones**. Verificado leyendo el código, no asumido.
- `app/admin/layout.tsx` repite la comprobación de `role === 'admin' && is_active` contra `profiles` como segundo checkpoint de UX; `app/tienda/layout.tsx` (no auditado línea por línea en esta pasada, pero sigue el mismo patrón ya verificado en fases anteriores).
- El lado de **tienda** (`/tienda`, `/tienda/activar`) no ejecuta ninguna consulta de datos todavía — son `EmptyState` puros esperando la Fase 5. Cero superficie de fuga posible porque no hay datos que filtrar mal.
- Del lado **admin**, cada pantalla nueva de esta fase (`/admin/tiendas`, `/admin/vendedores`) usa el cliente de sesión normal (RLS aplica), nunca el cliente de service role para lecturas — el cliente de service role solo aparece en `lib/actions/sellers.ts`, detrás de `requireAdmin()`, y solo para las 2 llamadas a la Admin API de Supabase Auth que Postgres no puede hacer.
- No se encontró ningún query que seleccione columnas de más "por si acaso" — cada `select(...)` pide exactamente las columnas que la pantalla usa.

**Conclusión: sin hallazgos de permisos.** No se encontró nada que corregir aquí.

## 4. UI/UX

- **Navegación**: sidebar de escritorio + `Sheet` de hamburguesa en móvil (`components/layout/app-shell.tsx`), mismo shell para admin y vendedor, con `truncate` en el nombre de tienda y menú de usuario. Patrón correcto y ya usado desde la Fase 1.
- **Estados**: cada pantalla nueva de F2–F4 distingue `loading` (skeleton genérico por segmento, `app/admin/loading.tsx`), `error` (`app/admin/error.tsx`, con botón "Reintentar", nunca muestra "0" ni "sin datos" cuando en realidad falló) y `empty` (`EmptyState`, con mensaje distinto según haya filtro activo o no). No se encontró ningún caso de "0 que en realidad es cargando" o "sin datos que en realidad es error".
- **Tablas**: el componente `Table` (shadcn) envuelve en `overflow-x-auto` por diseño — una tabla ancha en móvil hace scroll horizontal contenido, no rompe el layout de la página. Verificado en el componente, no supuesto.
- **Formularios**: patrón consistente `Field`/`FieldLabel`/`FieldError` en todos los formularios de F2–F4 (productos, lotes, seriales, tiendas, vendedores), con validación zod compartida cliente/servidor.

### Bug real encontrado y corregido en esta pasada

**`/admin/vendedores` no tenía buscador por nombre**, a diferencia de `/admin/productos` y `/admin/tiendas` (que sí lo tienen) — inconsistencia de UX, no un bug de datos. Corregido: se agregó un campo de búsqueda (`q`, `ilike` sobre `full_name`) al lado del filtro de tienda existente, y el `EmptyState` ahora distingue "sin resultados por tu filtro" de "todavía no hay vendedores", igual que ya hacía `/admin/productos`. Verificado con `npm run typecheck`/`lint` tras el cambio.

## 5. Responsive / móvil

Verificado por **inspección de código** (clases Tailwind y estructura), no por captura de pantalla en vivo: el navegador controlado por Claude in Chrome se volvió inestable durante esta sesión (ver `docs/PROGRESS.md`, checkpoint de Fase 4) y no había una sesión de admin logueada para probar las pantallas reales sin pedirle la contraseña al usuario — regla que este proyecto no permite (`chino-workflow`, memoria de sesión).

Lo verificado en código:
- Sidebar oculto (`hidden md:flex`) + botón de menú móvil visible solo bajo `md:hidden`, con `Sheet` deslizable — no hay "es responsive porque compila", hay una media query explícita para cada breakpoint.
- Padding responsivo (`p-4 md:p-6`) en el contenido principal.
- Tablas con contenedor de scroll horizontal propio (ver §4).
- Formularios usan `Input`/`select` nativos a ancho completo dentro de `FieldGroup`, sin anchos fijos que rompan en pantallas angostas.

**No verificado en vivo esta vez**: comportamiento real de los modales (`Dialog`) de creación/invitación en una pantalla de 390px, y de los textos largos (nombre de tienda muy largo, etc.) en la práctica. Queda como pendiente honesto, no como "aprobado".

## 6. Performance

- **Sin N+1**: cada pantalla hace 1–2 queries fijas (p. ej. `/admin/vendedores`: 1 query de tiendas para el filtro + 1 query de vendedores con `stores(name, code)` embebido — un solo JOIN vía PostgREST, no una consulta por fila).
- **Sin sobrecarga de datos**: catálogos pequeños (`productos`, `lotes`, `tiendas`, `vendedores`, `importaciones`) usan `.limit(100)`/`.limit(200)` sin paginación — decisión ya documentada para `productos` ("el catálogo de un negocio real rara vez pasa de unos cientos de filas") y aplicada de forma consistente en las pantallas nuevas de F4. La única tabla de alto volumen real (`seriales`) ya tiene paginación por keyset desde la Fase 2.
- **No se cargó ningún dataset de 100k/300k/1M** para "probar" el dashboard — ya está prohibido explícitamente para esta tarea y no hacía falta: los `EXPLAIN` de F2/F3 sobre `serials`/`serial_import_rows` ya demostraron que los índices correctos existen para las consultas que el admin realmente usa.

## 7. Bugs encontrados

| # | Descripción | Causa | Corrección | Test |
|---|---|---|---|---|
| 1 | `/admin/vendedores` sin buscador por nombre (inconsistente con productos/tiendas) | Se implementó en F4 sin el campo `q`, a diferencia de los otros listados | Se agregó `Input` de búsqueda + `ilike` en el query + `EmptyState` diferenciado | `npm run typecheck`, `npm run lint` — PASS (ver checkpoint) |

No se encontraron bugs de permisos, datos falsos, ni fallas de estado (loading/error/empty). No se encontró ningún bug que requiriera rediseño o pertenezca a otra fase.

## 8. DEFERRED (documentado, no implementado)

- **Dashboard con KPIs reales** — Fase 9 por diseño original del plan, no un olvido de esta auditoría.
- **Visor de auditoría con filtros/paginación** — ya documentado en el propio código (`app/admin/auditoria/page.tsx`) como alcance de la Fase 8 ("módulo avanzado de auditoría"); el visor actual (últimos 50, sin filtros) es deliberadamente mínimo.
- **Prueba visual en vivo de modales/responsive en pantalla de 390px** — no se pudo completar esta sesión por inestabilidad del navegador controlado; no requiere código nuevo, solo repetir la verificación cuando haya una sesión de navegador estable y el admin quiera loguearse para el E2E.
- **Editar vendedor (reasignar tienda, cambiar nombre) o reenviar invitación** — ya documentado como fuera de alcance en `docs/PROGRESS.md` (checkpoint de Fase 4), no es parte de esta auditoría tampoco.

## 9. Recomendaciones antes de Fase 5

1. Resolver el espacio de base de datos (ver `docs/PROGRESS.md`, checkpoint de mantenimiento): incluso limpio, sigue sobre la cuota gratuita por `audit_logs`.
2. Si se quiere cerrar el ciclo de verificación visual al 100%, hacer una sesión de navegador con el admin logueado (bajo las mismas reglas: nunca compartir la contraseña con el asistente) para confirmar visualmente móvil/responsive y los modales.
3. Ninguna recomendación bloqueante para empezar la Fase 5 — el área admin/tienda actual es honesta, con permisos correctos y sin deuda de UX nueva más allá de lo ya documentado como diferido en fases futuras.
