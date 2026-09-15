# Progreso

> Se actualiza al cerrar cada fase con el formato del checkpoint. Lo más reciente va arriba.

## Estado general

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Auditoría y arquitectura | Completada (2026-09-14) |
| 1 | Fundación (Supabase, Auth, perfiles, tiendas, RLS, auditoría, layout, design system, testing) | **Completada y verificada contra el proyecto real (2026-09-14)** |
| 2 | Productos + lotes + seriales | **Completada y verificada contra el proyecto real (2026-09-15)** |
| 3 | Importación CSV/Excel | Pendiente |
| 4 | UI de tiendas + vendedores | Pendiente |
| 5 | Activación de garantías | Pendiente |
| 6 | Correcciones + comprobantes + email | Pendiente |
| 7 | Reclamos + reportes técnicos | Pendiente |
| 8 | Visor de auditoría + seguridad avanzada + MFA | Pendiente |
| 9 | Performance + QA + producción | Pendiente |
| 10 | Propiedad intelectual + licencia + documentación final | Pendiente |

---

## Fase 2 — Productos + lotes + seriales (checkpoint definitivo)

```text
FASE: 2 — Productos + lotes + seriales
ESTADO: COMPLETA. Implementada y verificada de punta a punta contra el
        proyecto Supabase real (eaxzhjodudrshblvcghv) y desde el navegador
        con el admin real.

COMPLETADO:
- Revisión previa aprobada por el usuario: docs/PHASE-2-REVIEW.md
  (verdict: LISTO PARA IMPLEMENTAR), seguida de 4 decisiones definitivas
  del usuario que fijan el modelo (ver DECISIONES).
- Migraciones nuevas (versionadas, aplicadas y verificadas una por una):
  products_and_lots, serials, serials_rpc, phase2_rls, serials_fk_index.
- `products`/`lots`: catálogo de escritura directa para admin (RLS +
  trigger de auditoría reutilizado de la Fase 1). `products.code`
  inmutable tras crear (trigger que lanza excepción). `lots.code` único
  por producto, no globalmente. `lots.expected_count` informativo, nunca
  bloquea nada.
- `serials`: máquina de estados 100% por RPC (`create_serial`,
  `block_serial`, `unblock_serial`, `void_serial`), sin política de
  escritura directa para nadie (ni admin). FK compuesta
  `(lot_id, product_id) → lots(id, product_id)`. Colisión serial↔barcode
  rechazada en el RPC. Globalmente únicos, sin asignación a tienda
  (decisión del usuario).
- RLS: `products`/`lots` admin-todo + seller-select de activos (mismo
  patrón que `app_settings`); `serials` seller sin acceso, admin
  select-only (las escrituras solo existen vía RPC).
- UI real completa: admin (listar/buscar/filtrar/crear/editar/
  activar-desactivar/detalle de productos y lotes; listar con paginación
  por keyset/buscar exacto/filtrar/detalle/bloquear/desbloquear/anular de
  seriales, con confirmación explícita y motivo obligatorio en bloqueo y
  anulación) y vistas mínimas para vendedor (sin flujo de activación —
  Fase 5).
- Tests escritos y corridos: Vitest (esquemas zod de productos/lotes/
  seriales), pgTAP real contra el proyecto (19 + 24 = 43 tests).
- Verificación E2E real en el navegador con el admin real (ver TESTS):
  crear producto, crear lote, editar lote, crear serial, bloquear,
  desbloquear, anular — cada paso confirmado visualmente y contra
  `audit_logs` real.

TESTS:
- Lint (`npm run lint`): PASS.
- Typecheck (`tsc --noEmit`): PASS.
- Build (`npm run build`): PASS — todas las rutas nuevas quedan ƒ.
- Unit (`npx vitest run`): PASS — 31/31 (15 de Fase 1 + 16 nuevos de
  productos/lotes/seriales).
- Playwright (regresión de Fase 1, `tests/e2e/login.spec.ts`): PASS —
  4/4, sin regresión.
- **pgTAP contra el proyecto real: PASS — 43/43**
  (`05_products_and_lots.sql` 19/19, `06_serials.sql` 24/24).
- **Supabase Advisors**: revisados antes y después. Un hallazgo de
  performance real (`serials_lot_id_product_id_fkey` sin índice) corregido
  con la migración `serials_fk_index` y reverificado. El resto son
  hallazgos ya conocidos/esperados de Fase 1 (funciones `SECURITY
  DEFINER` ejecutables por diseño, `leaked_password_protection`
  pendiente de Fase 8) — ninguno nuevo introducido por esta fase.
- **E2E real desde el navegador (admin real, no simulado)**: producto
  creado (`E2E-001`, normalizado a mayúsculas), lote creado bajo ese
  producto, serial creado bajo ese lote (normalizado, estado
  `AVAILABLE`), bloqueado (motivo obligatorio verificado: el formulario
  rechaza el envío vacío), desbloqueado, anulado (con el diálogo de
  confirmación explícita y advertencia de irreversibilidad pedidos en el
  encargo). Cada paso confirmado en `/admin/auditoria` con el actor
  `admin` real. Datos de prueba borrados de la base al terminar (no son
  datos de negocio del cliente).

BUGS ENCONTRADOS Y CORREGIDOS (durante la verificación E2E de esta misma
fase, antes de cerrarla):
1. **Bug real de datos**: el formulario de creación de lote precargaba
   `warrantyDays: 365` como valor por defecto en el campo numérico. Un
   flujo normal (clic en el campo + escribir la duración real) no
   selecciona el texto precargado, así que el navegador **concatena** en
   vez de reemplazar (p. ej. escribir "180" sobre "365" da "365180"), y el
   dato se guarda sin ningún aviso porque `365180` sigue siendo un entero
   positivo válido para el CHECK. Reproducido en vivo creando un lote real
   (quedó con 365180 días de garantía). Corregido quitando el valor por
   defecto (`app/admin/lotes/lot-form.tsx`): el campo ahora empieza vacío
   y obliga a escribir la duración real. El lote de prueba se corrigió
   desde la propia UI de edición antes de continuar.
2. **Bug real de la API**: `/admin/seriales` y `/admin/seriales/[id]`
   fallaban con `Ocurrió un error` al cargar. Causa: el embed
   `lots(code)` desde `serials` es ambiguo para PostgREST
   (`PGRST201` — la FK compuesta `(lot_id, product_id)` crea una segunda
   relación `serials↔lots` además de la simple `serials.lot_id`, y
   PostgREST no puede elegir sola). Corregido nombrando la relación
   explícitamente: `lots!serials_lot_id_fkey(code)` en
   `app/admin/seriales/page.tsx` y `app/admin/seriales/[id]/page.tsx`.
   Verificado recargando ambas páginas y con el flujo completo de
   creación/bloqueo/desbloqueo/anulación después del fix.

Ambos bugs se encontraron usando la UI real como lo haría un admin, no
solo con datos sintéticos por SQL — confirma el valor de la verificación
E2E manual además de pgTAP.

RIESGOS:
- Entorno de desarrollo con ~3.9 GB de RAM totales: el servidor de
  desarrollo (`next dev --webpack`) se quedó sin memoria una vez durante
  esta verificación (`Jest worker encountered ... exceeding retry limit`,
  causado por el pool de workers de compilación de Webpack, no por el
  código de la aplicación) y tuvo que reiniciarse. No afecta a
  `next build` (producción) ni a ningún resultado de test — ver el mismo
  riesgo ya documentado en el checkpoint de Fase 1.
- `lots.imported_count` se recalcula con una subconsulta en cada
  INSERT/DELETE de `serials`; correcto para uso administrativo uno-a-uno,
  pero ineficiente para la inserción masiva de la Fase 3 (documentado en
  el propio código de la migración; revisar al implementar importación).
- Riesgo de negocio ya conocido (seriales sin asignar a tienda) sin
  cambios — ver `docs/SECURITY.md`, "Riesgo de negocio abierto".

DECISIONES (dadas por el usuario antes de implementar, no reabrir):
1. `lots.code` único por producto (`UNIQUE(product_id, code)`), no
   globalmente único.
2. Sin asignación de seriales a tiendas todavía: siguen globalmente
   únicos; no se agrega `store_id` ni el flujo hasta que sea
   estrictamente necesario.
3. `products.code` inmutable tras la creación; cualquier corrección
   futura deberá ser un flujo administrativo explícito y auditado
   (no existe todavía — no se pidió para esta fase).
4. `lots.expected_count` es puramente informativo: nunca bloquea la
   creación, importación ni uso de un lote.

Explícitamente no implementado en esta fase (fuera del alcance pedido):
importación CSV/Excel, staging, workers, importación de 100k–1M,
activación de garantías, correcciones, PDF, email, reclamos, reportes
técnicos, licencia/propiedad intelectual.

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario (no se hace
  automáticamente al cerrar la fase).
- Fase 3 — Importación CSV/Excel, cuando el usuario lo indique.
```

## Fase 1 — Fundación (checkpoint definitivo)

```text
FASE: 1 — Fundación
ESTADO: COMPLETA. Verificada de punta a punta contra el proyecto Supabase
        real (cuenta nueva, "WGPLatam's Project", eaxzhjodudrshblvcghv) y
        contra un admin real, con credenciales reales, desde el navegador.

COMPLETADO (además de todo lo ya implementado — ver más abajo, sección
"Implementación (2026-09-14, primera pasada)"):
- Migraciones aplicadas contra el proyecto real (las 5 de la fundación +
  2 migraciones de corrección — ver PROBLEMAS): tablas, funciones,
  triggers, políticas RLS y grants verificados uno por uno con consultas
  de sistema (pg_policies, information_schema, pg_proc), no solo "aplicó
  sin error".
- pgTAP corrido de verdad contra el proyecto real (la extensión pgtap SÍ
  está disponible en Supabase hospedado — no hizo falta Docker):
  01_provisioning_and_roles 7/7, 02_rls_isolation 14/14,
  03_audit_append_only 9/9, 04_settings_and_deactivation 8/8 → 38/38 PASS.
- Supabase Advisors revisados uno por uno (ver PROBLEMAS y DECISIONES).
- Bootstrap real del primer MASTER/ADMIN: usuario creado por el usuario en
  el dashboard de Supabase Auth, promovido con el procedimiento exacto de
  ARCHITECTURE.md (dos UPDATE), verificado con private.is_admin() = true
  simulando su sesión real antes de que él iniciara sesión.
- E2E real de autenticación, RLS y aislamiento, con el admin real desde el
  navegador (no simulado):
  - Login real → redirige a /admin, evento "login" auditado con su
    actor_id real.
  - /tienda como admin → redirige de vuelta a /admin (aislamiento de área
    por rol, en producción real).
  - /admin/auditoria muestra el historial real (creación de perfil,
    promoción a admin, login) — visor de auditoría funcionando con datos
    reales, no datos de prueba insertados por mí.
  - /admin/ajustes: guardó "Empresa de Prueba E2E" desde la UI real, se
    persistió en app_settings y quedó auditado — la prueba definitiva de
    que el bug de auditoría (ver PROBLEMAS) quedó resuelto de punta a
    punta, no solo por SQL directo.
  - Logout real → evento "logout" auditado, sesión terminada de verdad
    (confirmado: /admin sin sesión redirige a /login?next=/admin).

COMPLETADO (implementación, primera pasada — sin cambios respecto a lo ya
reportado):
- Scaffold Next.js 16.3.5 (App Router, Turbopack) + React 19.2.8 + TypeScript
  strict. shadcn/ui inicializado (preset base-ui, no Radix — ver
  ARCHITECTURE.md) con los primitivos de layout/formularios necesarios.
- lib/supabase/{client,server,admin}.ts: separación cliente/servidor/service
  role. admin.ts con `import "server-only"`, sin usar todavía (queda listo
  para la Fase 4).
- .env.example sin secretos; .gitignore corregido para no excluir
  .env.example por accidente y para ignorar .claude/ y test-results/.
- Migraciones (supabase/migrations, generadas con `npx supabase migration
  new`): esquema private; stores; profiles (con el CHECK de forma
  role/store_id y role nullable para el bootstrap sin metadata);
  app_settings + notification_settings (singleton, separadas por mínimo
  privilegio); audit_logs append-only + trigger de auditoría genérico sobre
  stores/profiles/app_settings/notification_settings + RPC
  log_audit_event (allow-list login/logout); trigger handle_new_user sobre
  auth.users; helpers private.is_admin()/current_store_id(); políticas RLS
  completas en las 5 tablas; revoke general a anon.
- Auth: login, logout, recuperar contraseña, actualizar contraseña,
  app/auth/callback (intercambio de code — sin esto la recuperación de
  contraseña no podría completarse nunca). Validación con zod +
  react-hook-form.
- proxy.ts (nombre correcto en Next 16, confirmado leyendo
  node_modules/next/dist/docs — no se asumió que fuera middleware.ts):
  refresca sesión, aplica la CSP con nonce por request, protege /admin y
  /tienda por rol vía getClaims(). Cierra en falso si Supabase no responde.
- CSP con nonce + strict-dynamic (proxy.ts) y el resto de headers de
  seguridad (next.config.ts: HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy, X-Content-Type-Options). La CSP con nonce exige
  renderizado dinámico en toda la app (force-dynamic en el layout raíz).
- Shells admin (sidebar de escritorio) y tienda (nav mobile-first con
  Sheet), estados de carga (loading.tsx), error (error.tsx) y vacío
  (EmptyState) siguiendo las convenciones de archivo de Next.
- Páginas reales (no maquetas): /admin (bienvenida honesta, sin KPIs
  falsos), /admin/auditoria (visor de solo lectura de audit_logs, RLS
  filtra por admin), /admin/ajustes (formulario completo de app_settings —
  Empresa/Garantías/Sistema/Soporte — que persiste vía RLS-gated UPDATE),
  /tienda e /tienda/activar (estados "disponible en la Fase 5", sin
  simular una activación que no existe).
- Tests escritos:
  - Vitest + Testing Library: validación de esquemas zod, roleHomePath/
    areaForPath, y render + interacción del formulario de login (15 tests).
  - Playwright: smoke test de páginas públicas y de la protección de rutas
    sin backend real (4 tests, aprovechando el "cierra en falso" de proxy).
  - pgTAP (supabase/tests/database/*.sql): aprovisionamiento y roles,
    aislamiento RLS admin/tienda A/tienda B, auditoría append-only en dos
    capas (grant + trigger), app_settings vs. notification_settings y
    desactivación instantánea. Escritos y revisados a mano línea por línea
    (no ejecutados — ver BLOQUEADO). En esa revisión se corrigieron 3
    errores reales antes de dejarlos por escritos: dos usos de throws_ok/
    throws_like con la aserción equivocada (RLS en UPDATE no lanza
    excepción, sencillamente no afecta filas — se cambió a verificar que
    el valor no cambió) y un cast inválido (''::json) al simular anon.

TESTS:
- Lint (`npm run lint`): PASS.
- Typecheck (`npm run typecheck`, TypeScript strict): PASS.
- Build (`npm run build`): PASS — todas las rutas quedan ƒ (dinámicas).
- Unit/integración (`npm run test`, Vitest): PASS — 15/15.
- E2E (`npm run test:e2e`, Playwright, contra `next build && next start`):
  PASS — 4/4.
- **pgTAP contra el proyecto real: PASS — 38/38** (01: 7/7, 02: 14/14,
  03: 9/9, 04: 8/8). Ya no depende de Docker: la extensión `pgtap` está
  disponible en Supabase hospedado.
- **Supabase Advisors: revisados.** 1 hallazgo de seguridad real corregido
  (ver PROBLEMAS); el resto son esperados/no accionables (ver DECISIONES).
- **E2E de autenticación real: PASS.** Login/logout con el admin real,
  aislamiento admin↔tienda, auditoría real, guardado real en Ajustes — ver
  arriba. Único pendiente genuino: invitar un vendedor de prueba real
  (necesita `lib/supabase/admin.ts` en uso, que es trabajo de Fase 4, no
  de Fase 1).

PROBLEMAS (todos encontrados en esta verificación y corregidos antes de
cerrar la fase — ninguno queda abierto):

1. **Bug real de producción**: `private.audit_row_change()` asumía que
   toda columna `id` es `uuid`. `app_settings`/`notification_settings`
   usan `id boolean` (patrón singleton) → cualquier UPDATE sobre esas
   tablas fallaba con `invalid input syntax for type uuid`. En la
   práctica: **el admin no podía guardar Ajustes**. Corregido con la
   migración `fix_audit_entity_id_cast` (envuelve el cast en manejo de
   excepción; si el id no es uuid, se audita con `entity_id = NULL`).
   Verificado primero por SQL, después end-to-end desde la UI real.
2. **Hallazgo de Supabase Advisors**: `public.log_audit_event` quedó
   ejecutable por `anon` pese al `revoke ... from public` de la migración
   original. Causa: Supabase concede `EXECUTE` en funciones nuevas de
   `public` directamente a `anon`/`authenticated`/`service_role` por
   nombre (no vía el pseudo-rol `PUBLIC`). Corregido con la migración
   `harden_function_grants`; `docs/SECURITY.md` actualizado para que no
   se repita en las próximas fases.
3. **`next dev` (Turbopack) crashea en esta máquina Windows** compilando
   `app/globals.css` (proceso nativo con fallo `0xc0000142`) — sin
   errores visibles en consola, deja la página sin hidratar. Sin relación
   con el código: `next build` (producción, también Turbopack) compila
   sin problema. Workaround: `npm run dev:webpack` (nuevo script). Ver
   `docs/ARCHITECTURE.md`, "Nota de entorno: Turbopack en desarrollo".
4. Faltaba `allowedDevOrigins: ["127.0.0.1"]` en `next.config.ts` (dev
   solamente) — sin esto Next bloquea sus propios recursos de desarrollo
   cuando se accede por IP en vez de por `localhost`, dejando la
   hidratación a medias. Agregado con comentario explicando por qué.
5. **Bug real en `components/layout/user-menu.tsx`**: usaba `onSelect`
   en `DropdownMenuItem`, que es la API de Radix — el `Menu.Item` de
   base-ui (lo que usa esta versión de shadcn) solo tiene `onClick`. El
   botón "Cerrar sesión" nunca disparaba nada. Corregido a `onClick`;
   verificado que no había más usos de `onSelect` en el proyecto.
6. **Bug real, mismo archivo**: `DropdownMenuLabel` (basado en
   `Menu.GroupLabel` de base-ui) exige estar dentro de `<Menu.Group>` —
   usarlo suelto lanza `MenuGroupContext is missing`. Corregido
   envolviéndolo en `<DropdownMenuGroup>`.
7. Además, al escribir las pruebas pgTAP contra el proyecto real se
   encontraron y corrigieron 4 errores en los propios archivos de test
   (no en el código de producción): permisos sobre la tabla temporal de
   reporte al simular `anon`/`authenticated`, uso de `throws_ok` con un
   SQLSTATE que esta versión de pgTAP no resuelve como se esperaba
   (se cambió a `throws_like` por mensaje), y tres casos donde se asumió
   "sin GRANT → excepción" cuando en realidad hay GRANT de tabla y RLS
   filtra en silencio a 0 filas.
8. El paquete `supabase` (CLI) se había quedado fuera de `package.json`
   por un fallo de una instalación anterior (conflicto de peer deps de
   vitest) que abortó silenciosamente sin instalar nada; detectado y
   corregido.

RIESGOS:
- Los seriales no están asignados a tiendas (ver `docs/SECURITY.md`,
  "Riesgo de negocio abierto") — decisión de negocio pendiente, no
  técnica, no afecta a la Fase 1.
- `@vitest/mocker` (dependencia de vitest, solo para tests) tiene un
  advisory moderado (path traversal) sin fix disponible en la versión 3.x
  que usamos (la 5.x que lo arregla rompe el peer de `@types/node`).
  Riesgo de herramienta de desarrollo, no llega a producción.
- `next dev` con Turbopack no es utilizable en esta máquina para este
  proyecto (usar `npm run dev:webpack`); no se ha probado en otras
  máquinas Windows — podría ser específico de este entorno.
- Invitar un vendedor real (Admin API con `SUPABASE_SECRET_KEY`) sigue
  sin probarse end-to-end porque es trabajo de Fase 4, no de Fase 1.

DECISIONES:
- `profiles.role` acepta NULL (usuario sin aprovisionar) además de
  'admin'/'seller', para que el bootstrap del primer admin (creado a mano
  en el dashboard, sin app_metadata) no rompa la inserción en auth.users.
  Documentado en ARCHITECTURE.md, "Auth" — y verificado con el admin real.
- MFA: no se implementó ninguna pantalla de enrolamiento/desafío en esta
  fase (corresponde a la Fase 8 según el plan). Se evitó deliberadamente
  crear una pantalla o ruta /mfa que no hiciera nada real — "no simular
  seguridad que no existe" (regla explícita del encargo). Lo que sí quedó
  listo: el comentario en `private.is_admin()` señalando el único punto
  donde añadir la exigencia de aal2.
- Dashboard admin y de tienda: páginas honestas de bienvenida/estado vacío,
  sin KPIs ni datos simulados, porque no existen datos de negocio todavía.
- CSP con nonce (no solo 'unsafe-inline'): se aceptó el costo de forzar
  renderizado dinámico en toda la app porque ya era el caso para las
  páginas protegidas (auth), y es lo que docs/SECURITY.md pedía
  explícitamente ("CSP estricta con nonce").
- Vista de auditoría mínima en /admin/auditoria (solo lectura, sin
  filtros/paginación): se consideró "infraestructura técnica mínima" (item
  13/18 del encargo), no el "módulo avanzado" reservado a la Fase 8, y es
  la única forma de comprobar de punta a punta que la auditoría real
  funciona sin esperar a esa fase.
- No se creó una tabla `customers` ni ninguna tabla de Fase 2+; no se creó
  UI de gestión de tiendas/usuarios (eso es Fase 4 según el plan
  aprobado) — solo la tabla `stores` y sus políticas RLS, tal como pide
  el punto 5 del encargo ("tabla y estructura", no la UI).
- Advisor `multiple_permissive_policies` (WARN, performance) en `profiles`
  y `stores`: real pero de bajo impacto con las tablas casi vacías; se
  difiere a la Fase 9 (Performance), tal como ya lo asigna el plan, salvo
  que el usuario pida adelantarlo. Advisor `unused_index` (INFO): esperado,
  sin tráfico real todavía. Advisor sobre `public.rls_auto_enable()`
  (SECURITY DEFINER ejecutable): función propia de la plataforma Supabase,
  no creada por este proyecto — no se modifica.
- No se cambió `"dev": "next dev"` por defecto en `package.json` pese al
  hallazgo de Turbopack: es un problema de esta máquina/plataforma, no del
  proyecto; se documentó y se agregó `dev:webpack` como alternativa en vez
  de imponer un motor distinto a quien no lo necesite.

SIGUIENTE:
- Fase 2 — Productos + lotes + seriales.
```

## Fase 0 — Revisión del plan

```text
FASE: 0 — Revisión del plan (a pedido del usuario, antes de Fase 1)
ESTADO: Completada (2026-09-14)

COMPLETADO:
- Revisión de rol MASTER/ADMIN vs. SELLER: capacidades explícitas y lista de "no puede".
- Separación documentada entre MASTER/ADMIN (rol de app) y propiedad de infraestructura
  (GitHub, Supabase, Vercel, Resend, código) — base conceptual de la Fase 10.
- Importación masiva: estados COMMITTING/FAILED/CANCELLED, cancelación solo antes de
  confirmar, confirmación atómica a prueba de doble clic, vista previa obligatoria,
  retirada la cifra "1M = 3-6 min" como garantía, casos de prueba explícitos,
  walkthrough de reanudación ante cierre de navegador/corte de red/reinicio.
- customers documentado como decisión de MVP reversible con camino de migración.
- Revisión de mínimo privilegio tabla por tabla para SELLER: app_settings dividida
  (público / notification_settings admin-only), technical_reports sin SELECT directo
  para seller.
- app_settings reorganizada en Empresa / Garantías / Sistema / Soporte.
- Secciones nuevas: Backup y recuperación (SECURITY.md), Observabilidad (ARCHITECTURE.md),
  checklist de funciones SECURITY DEFINER (SECURITY.md).
- Notificaciones: capa NotificationService → EmailProvider → Resend explicitada.
- Hosting: se mantiene Vercel como única opción recomendada (se retiró la alternativa
  de Cloudflare Workers, sin razón técnica real que la justificara).
- Documentos actualizados de forma coherente: ARCHITECTURE.md, DATABASE.md, SECURITY.md,
  CLAUDE.md. PROJECT-PLAN.md se conservó como registro histórico (v1) con un
  "Registro de revisión" (v2) añadido al final.

TESTS:
- No aplica (revisión de documentación, sin código).

PROBLEMAS:
- Ninguno.

RIESGOS:
- Ver PROJECT-PLAN.md, "Registro de revisión — Riesgos que siguen abiertos".
  Resumen: asignación de seriales a tiendas (decisión de negocio), falta de Docker en
  la máquina de desarrollo, precios exactos de proveedores externos por verificar al
  contratar, retención de backups por verificar según el plan de Supabase, tiempos
  reales de importación de 1M por medir.

DECISIONES:
- Ver PROJECT-PLAN.md, "Registro de revisión — Cambios realizados" (13 puntos) y
  "Decisiones mantenidas" (arquitectura principal sin cambios).

SIGUIENTE:
- Fase 1 — Fundación, sin cambios respecto al plan original (ver PROJECT-PLAN.md,
  sección O). Prerrequisitos del usuario siguen pendientes: Docker Desktop, repo en
  GitHub, proyecto Supabase de desarrollo en la cuenta nueva.
```

## Fase 0 — Auditoría y arquitectura

```text
FASE: 0 — Auditoría y arquitectura
ESTADO: Completada (2026-09-14)

COMPLETADO:
- Inspección del repositorio: vacío, sin git. Greenfield.
- Inspección del entorno: Node 24.15, npm 11.12, git 2.54. Sin Supabase CLI ni Docker.
- Stack alineado con los otros proyectos del autor (Next 16, React 19, @supabase/ssr, shadcn/Tailwind 4, zod 4).
- Plan técnico aprobado → docs/PROJECT-PLAN.md.
- Documentos vivos: ARCHITECTURE.md, DATABASE.md, SECURITY.md, PROGRESS.md; CLAUDE.md con reglas de trabajo.
- git init (rama main, sin commits todavía).

TESTS:
- No aplica (sin código).

PROBLEMAS:
- Ninguno.

RIESGOS:
- Sin Docker no se puede levantar Supabase local ni correr pgTAP.
- Límites de planes gratuitos (Resend 100/día, Supabase Free sin backups y con pausa, Vercel Hobby no comercial).
- Cualquier tienda puede activar cualquier serial disponible (decisión de negocio pendiente).
- Ver la lista completa en PROJECT-PLAN.md, sección M.

DECISIONES:
- Una empresa por instalación (sin tenant_id).
- Varios países: ID de cliente genérico, WhatsApp E.164, zona horaria por tienda.
- Vendedores con email real (invitación/recuperación nativas).
- Volumen de activaciones desconocido: se empieza con Resend gratis, proveedor aislado en una función.
- Repo de GitHub nuevo y cuenta de Supabase nueva (no la conectada por MCP en el entorno).
- Ajustes de fases: stores + profiles.store_id y la infraestructura de auditoría pasan a la Fase 1.
- Sin tablas roles/permissions ni customers (justificado en DATABASE.md).
- PDF bajo demanda (no almacenado); email por outbox + Edge Function + pg_cron.
- Activación atómica con una función PostgreSQL (RPC).

SIGUIENTE:
- Prerrequisitos del usuario: instalar Docker Desktop (WSL2); crear el repo en GitHub;
  crear el proyecto Supabase de desarrollo en la cuenta nueva (puede esperar: se arranca en local).
- Fase 1 — Fundación (ver PROJECT-PLAN.md, sección O).
  Nota: create-next-app se niega a escribir en carpetas con archivos que no reconoce (p. ej. CLAUDE.md).
  Generar el scaffold en una carpeta temporal y moverlo, fusionando su CLAUDE.md/AGENTS.md con el nuestro.
```
