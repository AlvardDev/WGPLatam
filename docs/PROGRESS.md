# Progreso

> Se actualiza al cerrar cada fase con el formato del checkpoint. Lo más reciente va arriba.

## Estado general

| Fase | Nombre | Estado |
|---|---|---|
| 0 | Auditoría y arquitectura | Completada (2026-09-14) |
| 1 | Fundación (Supabase, Auth, perfiles, tiendas, RLS, auditoría, layout, design system, testing) | **Completada y verificada contra el proyecto real (2026-09-14)** |
| 2 | Productos + lotes + seriales | **Completada y verificada contra el proyecto real (2026-09-15)** |
| 3 | Importación CSV/Excel | **Completada y verificada contra el proyecto real (2026-09-15)** |
| 4 | UI de tiendas + vendedores | **Completada, verificada contra la base real; sin E2E de navegador (2026-09-15)** |
| 5 | Activación de garantías | **Completada y verificada contra el proyecto real (2026-09-15)** |
| 6 | Correcciones + comprobantes + email | **Completada y verificada contra el proyecto real (2026-09-16)** |
| 7 | Reclamos + reportes técnicos | **Completada y verificada contra el proyecto real (2026-09-16)** |
| 8 | Visor de auditoría + seguridad avanzada + MFA | **Completada y verificada contra el proyecto real (2026-09-16)** |
| 9 | Performance + QA + producción | Pendiente |
| 10 | Propiedad intelectual + licencia + documentación final | Pendiente |

---

## Fase 8 — Visor de auditoría + MFA + throttle (checkpoint definitivo)

```text
FASE: 8 — Visor de auditoría, MFA, CSP y headers, throttles
ESTADO: COMPLETA. Migración aplicada contra el proyecto Supabase real (SQL
        Editor del dashboard, autorización explícita del usuario) y pgTAP
        corrido de verdad contra ese mismo proyecto: 12_mfa_and_throttle.sql
        (8/8) y 11_claims_and_reports.sql re-verificado con las fixtures de
        aal2 (55/55) — el caso de mayor riesgo de regresión (el que más
        RPC/RLS dependientes de is_admin() ejercita). 1 bug real de test
        encontrado y corregido (ver PROBLEMAS), 0 bugs de producto.

COMPLETADO:
- Alcance tomado de docs/PROJECT-PLAN.md (fila F8: "Visor de auditoría,
  eventos de login/logout, MFA, CSP y headers, throttles") y
  docs/SECURITY.md, "MFA". Al analizar la fase se encontró que 3 de los 5
  entregables ya existían desde la Fase 1 (eventos de login/logout vía
  `log_audit_event` en `lib/actions/auth.ts`; CSP con nonce en `proxy.ts`;
  headers estáticos en `next.config.ts`) y que el visor de auditoría ya
  tenía una versión mínima (`app/admin/auditoria/page.tsx`, con un
  comentario explícito señalando el "módulo avanzado" como trabajo de esta
  fase) — F8 completó lo que realmente faltaba: MFA, el throttle, y el
  visor avanzado. Nada de esto se inventó: cada pieza ya estaba prevista en
  el plan o en comentarios dejados a propósito en fases anteriores.
- Migración `20260916100000_phase8_mfa_and_throttle.sql`: `private.is_admin()`
  reemplazada para exigir `aal2` además del rol admin activo (único punto
  de cambio, tal como avisaba su comentario desde la Fase 1 — protege de
  una sola vez toda la RLS/RPC que ya dependía de ella en F2-F7, sin tocar
  esos archivos). `public.lookup_serial` reemplazada para agregar throttle
  de 30 llamadas/minuto por vendedor (`public.lookup_serial_attempts`,
  ventana fija, sin política RLS ni GRANT directo — inalcanzable desde la
  API salvo por la propia función `SECURITY DEFINER`, mismo patrón que
  `audit_logs` para `UPDATE`/`DELETE`).
- MFA: `proxy.ts` calcula `requiresMfa` para admin (`getAuthenticatorAssuranceLevel()`,
  cierra en falso si la llamada falla) y redirige a `/mfa` antes de dejar
  entrar a `/admin`; vendedores quedan fuera a propósito (opcional en el
  MVP, decidido explícitamente al alcance esta fase). `app/(auth)/mfa/mfa-gate.tsx`
  (client component, usa `lib/supabase/client.ts` igual que el import
  wizard de F3 porque `enroll()`/`challengeAndVerify()` actualizan la
  sesión en el propio cliente): decide enrolar (sin factor verificado —
  limpia cualquier factor TOTP abandonado sin verificar antes de generar
  uno nuevo) o desafiar (ya tiene uno), TOTP vía QR (data URI que devuelve
  Supabase, sin librería de QR) + código de 6 dígitos
  (`lib/validation/mfa.ts`, `totpCodeSchema`).
- Visor de auditoría avanzado (`app/admin/auditoria/page.tsx`): filtros
  (acción, entidad, actor, rango de fechas) + paginación por keyset
  (`occurred_at desc, id desc`, mismo patrón que `app/admin/seriales/page.tsx`),
  join a `profiles` para mostrar el nombre del actor, y
  `audit-detail-dialog.tsx` (nuevo) para ver `old_data`/`new_data`/`metadata`
  de cada evento — antes invisibles en el visor mínimo de F1.
- Dashboard de Supabase (verificado, no tocado salvo lo indicado): TOTP ya
  estaba `Enabled` en Authentication → Multi-Factor (nada que activar).
  "Prevent use of leaked passwords" sigue `Disabled` — es exclusivo del
  plan Pro y el proyecto está en Free (`docs/SECURITY.md`, `PROJECT-PLAN.md`
  sección N ya lo contempla como parte del costo de producción); queda
  documentado como limitación de plan, no como pendiente de código.
  Hallazgo aparte (fuera del alcance de F8, autorizado por el usuario al
  reportarlo): "Allow new users to sign up" estaba en `ON`, contradiciendo
  la regla ya documentada desde F1 ("Registro público deshabilitado en
  Supabase Auth") — desactivado y verificado que persiste tras recargar.

TESTS:
- Lint (`npm run lint`): PASS (1 warning de `@next/next/no-img-element`
  suprimido explícitamente con `eslint-disable-next-line` — el QR es un
  data URI generado por Supabase Auth, `next/image` no aporta nada ahí).
- Typecheck (`tsc --noEmit`): PASS.
- Build (`next build`): PASS — 31 rutas compilan, incluida `/mfa`.
- Vitest: PASS — **77/77** (73 previos + 4 nuevos de `totpCodeSchema`).
- **pgTAP contra el proyecto real**: migración aplicada vía SQL Editor del
  dashboard (autorización explícita del usuario, mismo método que F2-F7).
  `12_mfa_and_throttle.sql`: **8/8** — `is_admin()` llamado directo en
  aal1/aal2/vendedor-con-aal2, una integración real vía RLS de `audit_logs`
  (0 filas en aal1, filas visibles en aal2 — no solo la función aislada), y
  el throttle (30 llamadas dentro del límite, la 31 rechazada, un segundo
  vendedor con su propio contador). `11_claims_and_reports.sql` (F7,
  re-verificado con las fixtures de admin actualizadas a `aal2`): **55/55**
  — es el archivo con más RPC/RLS dependientes de `is_admin()`, así que es
  la evidencia más fuerte de que el cambio compartido no rompió nada de
  F2-F7. Las fixtures de admin en `02` a `10` se actualizaron con el mismo
  cambio mecánico de una línea (agregar `"aal":"aal2"` al JWT simulado) por
  la misma razón, pero no se re-ejecutaron una por una contra el proyecto
  real en esta sesión — queda como verificación pendiente si se quiere
  cobertura completa (ver RIESGOS).
- **Supabase Advisors**: revisados después de aplicar la migración. 1 error
  preexistente (`public._bench_log` sin RLS, deuda de F3, sin cambios) y 27
  warnings (misma categoría ya aceptada desde F2: funciones `SECURITY
  DEFINER` ejecutables por diseño — sin warnings nuevos, `is_admin()` y
  `lookup_serial` fueron reemplazadas, no agregadas). 1 hallazgo INFO nuevo
  y esperado: "RLS Enabled No Policy" en `public.lookup_serial_attempts` —
  es la protección buscada (RLS habilitado sin ninguna política = ni una
  fila alcanzable desde la API salvo por la función `SECURITY DEFINER`),
  no un problema.

PROBLEMAS (encontrados durante la verificación, corregidos antes de cerrar
la fase):
1. Mismo bloqueo de red ya conocido (F3-F7): el CLI de Supabase no puede
   conectarse al proyecto real desde esta máquina. Verificado por SQL
   Editor del dashboard con autorización explícita del usuario.
2. El Editor SQL del dashboard ejecuta todo el script pegado dentro de una
   única transacción implícita (el `begin;`/`rollback;` propio del archivo
   queda anidado, no es la transacción real) — un `rollback;` al final del
   script deshace también cualquier `create table`/`insert` hecho *antes*
   del `begin;` en ese mismo pegado, algo que no ocurre corriendo el mismo
   archivo con `pg_prove`/`supabase test db`. Se resolvió sin tocar el
   método de F6/F7 (la tabla temporal `tap_results`): en vez de consultar
   esa tabla *después* del `rollback`, se agregó un bloque `do $$ ... end
   $$` que agrega los resultados y hace `raise exception` con el resumen
   ("N de M pasaron") *antes* del rollback — la excepción aborta la
   transacción igual que un rollback (cero datos de prueba persisten) y el
   mensaje de error queda visible en el panel de resultados sin depender
   de que el Editor SQL muestre el resultado de la última sentencia.
3. **Bug real de test (no de producto), detectado por la propia corrida**:
   el fixture original de la prueba de throttle generaba 30 llamadas a
   `lookup_serial` con `select count(*) from generate_series(1,30) gs,
   lateral (select * from public.lookup_serial(...)) l` — el plan de
   Postgres no garantiza 30 invocaciones reales de una función `VOLATILE`
   ahí (la corrida real mostró que la búsqueda 31 no era rechazada,
   exponiendo que el contador nunca llegó a 30). Corregido reemplazando el
   fixture por un `do $$ begin for i in 1..30 loop perform
   public.lookup_serial(...); end loop; end $$` (30 invocaciones
   explícitas, sin ambigüedad de planificador) — con ese cambio, 8/8.
   `public.lookup_serial_attempts` y la lógica de conteo del producto no
   se tocaron; el bug era enteramente del fixture del test.

RIESGOS:
- Igual que F2-F7: sin E2E de navegador autenticado, cuota de Supabase
  ("Exceeding usage limits" sigue visible en el dashboard).
- `leaked_password_protection` sigue sin poder activarse en el plan Free
  del proyecto (exclusivo de Pro) — riesgo de negocio ya cuantificado en
  `PROJECT-PLAN.md`, sección N, no una tarea de código pendiente.
- Verificación de pgTAP contra el proyecto real en esta fase cubrió el
  archivo nuevo (12) y el más complejo de los ya existentes (11, F7) como
  evidencia representativa del cambio compartido en `is_admin()`; los
  demás archivos (02-10) recibieron el mismo cambio mecánico de una línea
  en sus fixtures pero no se re-corrieron individualmente contra el
  proyecto real en esta sesión.
- Throttle de `lookup_serial`: el límite (30/min) es un valor por defecto
  razonable, no un requisito de negocio definido — ajustable si en el uso
  real resulta muy bajo (escaneo rápido) o muy alto (mitigación débil).

DECISIONES:
- MFA solo obligatorio para admin, sin UI de enrolamiento opcional para
  vendedor en esta fase — decidido explícitamente con el usuario al
  analizar el alcance; coherente con "opcional en el MVP" de
  `docs/SECURITY.md`, que no pide construir nada para vendedores todavía.
- Throttle de `lookup_serial` implementado en esta fase (el plan lo dejaba
  condicional, "si hace falta") — decidido explícitamente con el usuario;
  ventana fija por simplicidad (`ponytail` documentado en la migración),
  no sliding window ni token bucket.
- `/mfa` es una sola página que decide enrolar vs. desafiar en el cliente
  (en vez de dos rutas separadas `/mfa/activar` y `/mfa/verificar`) —
  menos superficie de proxy.ts que mantener sincronizada con el estado
  real de MFA del usuario.
- "Allow new users to sign up" desactivado en el Dashboard a pedido
  explícito del usuario, aunque es un hallazgo fuera del alcance nominal
  de F8 — aplicaba una regla ya decidida y documentada desde F1, no una
  decisión nueva de esta fase.

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario.
- Fase 9 — Performance + QA + producción. **No iniciar sin aprobación
  explícita del usuario**, ni hacer commit de F8 sin esa aprobación.
```

---

## Fase 7 — Reclamos + reportes técnicos (checkpoint definitivo)

```text
FASE: 7 — Reclamos + reportes técnicos + historial de la garantía
ESTADO: COMPLETA. La migración está aplicada contra el proyecto Supabase
        real y el pgTAP nuevo corrió de verdad: 55/55, confirmado sin
        ambigüedad (ver TESTS). 2 bugs reales encontrados por la propia
        corrida de pgTAP y corregidos antes de cerrar la fase (ver
        PROBLEMAS). Supabase Advisors revisados después: sin hallazgos
        nuevos atribuibles a esta fase.

COMPLETADO:
- Alcance tomado literal de docs/PROJECT-PLAN.md (fila F7 de la sección K:
  "Reclamos + reportes técnicos + historial de la garantía"; tests clave:
  "Transiciones, responsible_party (día 30 vs 31), aislamiento por tienda")
  y de la sección D (esquema de warranty_claims/technical_reports, ya
  especificado desde la Fase 0). Nada inventado: nombres de columnas,
  estados y política de responsible_party son los del plan aprobado.
- Migración `20260916000000_phase7_claims_and_reports.sql`: tablas
  `warranty_claims` y `technical_reports` (esquema exacto de
  docs/DATABASE.md), índice único parcial `warranty_claims_open_unique`
  (como máximo un reclamo `OPEN`/`UNDER_REVIEW` por garantía a la vez,
  mismo criterio que `warranty_corrections_pending_unique` de F6), auditoría
  con el trigger genérico (sin mecanismo nuevo). 5 RPC `SECURITY DEFINER`:
  `open_claim` (vendedor; congela `responsible_party` comparando `now()`
  contra `activated_at + store_attention_days`, ya congelado en la garantía
  desde F5), `assign_claim` (admin, `OPEN→UNDER_REVIEW`, autoasignación —
  único rol que tramita reclamos en el MVP), `decide_claim` (admin,
  `UNDER_REVIEW→APPROVED|REJECTED`, exige `decision`+`justification`),
  `close_claim` (admin, `APPROVED|REJECTED→CLOSED`), `create_technical_report`
  (admin, solo mientras el reclamo sigue `OPEN`/`UNDER_REVIEW`; 1 reclamo →
  N reportes).
- RLS: `warranty_claims` visible completo para el vendedor de su tienda
  (igual que `warranties`); `technical_reports` **sin ninguna política de
  SELECT para vendedor** (mínimo dato necesario, ya decidido en F0 — ni
  siquiera de su propia tienda ve el diagnóstico técnico).
- Frontend: `/tienda/garantias/[id]` agrega sección "Reclamos" (historial +
  formulario para abrir uno nuevo, solo si no hay ya uno abierto).
  `/admin/garantias/[id]` agrega sección "Reclamos" (solo lectura, enlaza al
  detalle). `/admin/reclamos` (listado, mismo patrón de solo-lectura que
  `/admin/garantias`) y `/admin/reclamos/[id]` (detalle con las 3 acciones
  de transición según el estado — tomar/decidir/cerrar — y el listado +
  formulario de reportes técnicos). Nav admin actualizado con "Reclamos".
  Componente `Textarea` de shadcn agregado (no existía; necesario para
  motivo/descripción/diagnóstico — ninguna dependencia npm nueva).
- Validación zod nueva (`openClaimSchema`, `decideClaimSchema`,
  `createTechnicalReportSchema`) y 5 server actions
  (`openClaimAction`/`assignClaimAction`/`decideClaimAction`/
  `closeClaimAction`/`createTechnicalReportAction`) con los mismos mensajes
  de error traducidos que el resto de `lib/actions/warranties.ts`.
- pgTAP nuevo `11_claims_and_reports.sql` (55 casos): las 5 RPC rechazadas
  para el rol incorrecto, cada validación (motivo/decisión/justificación/
  diagnóstico/resultado vacíos), aislamiento por tienda (`open_claim` y
  visibilidad de `warranty_claims`), **`responsible_party` en el límite
  exacto día 30 (dentro, `STORE`) vs día 31 (fuera, `MANUFACTURER`)**,
  unicidad de reclamo abierto por garantía (bloquea un segundo mientras el
  primero sigue OPEN/UNDER_REVIEW, permite uno nuevo una vez CLOSED), ciclo
  completo OPEN→UNDER_REVIEW→APPROVED→CLOSED con cada transición inválida
  rechazada (decidir sin asignar, cerrar sin decidir, re-decidir, re-cerrar,
  re-asignar), 1 reclamo → N reportes técnicos, reportes bloqueados sobre un
  reclamo ya decidido, `technical_reports` invisible para el vendedor
  incluso de su propia tienda, y auditoría con el admin real como actor.

TESTS:
- Lint (`npm run lint`): PASS.
- Typecheck (`tsc --noEmit`): PASS.
- Build (`next build`): PASS — 30 rutas compilan, incluidas
  `/admin/reclamos` y `/admin/reclamos/[id]`.
- Vitest: PASS — **73/73** (62 previos + 11 nuevos de
  `openClaimSchema`/`decideClaimSchema`/`createTechnicalReportSchema`).
- **pgTAP contra el proyecto real: PASS — 55/55**, confirmado sin
  ambigüedad (`11_claims_and_reports.sql`, corrido vía SQL Editor del
  dashboard con autorización explícita del usuario — mismo método que
  F2-F6, el CLI sigue sin poder conectarse desde esta red). Verificación:
  se identificaron y corrigieron 2 bugs reales (ambos del fixture del
  test, no de las RPC — ver PROBLEMAS) antes de confirmar 55/55
  envolviendo las 55 aserciones en una tabla temporal (`tap_results`) para
  ver el resultado agregado (`total=55, failed=0`) en una sola corrida.
- **Supabase Advisors**: revisados después de aplicar la migración. 1 error
  preexistente (`public._bench_log` sin RLS, deuda técnica de F3, fuera de
  alcance de esta fase) y 27 warnings, todos de la misma categoría esperada
  ya aceptada desde F2 (funciones `SECURITY DEFINER` ejecutables por
  diseño — incluye las 5 nuevas de esta fase — y
  `leaked_password_protection` pendiente de F8). Ningún hallazgo nuevo
  atribuible a `warranty_claims`/`technical_reports`.

PROBLEMAS (encontrados durante la verificación, corregidos antes de cerrar
la fase):
1. El CLI de Supabase sigue sin poder conectarse a la base real desde esta
   red (mismo problema de F3/F4: `LegacyDbConfigConnectTempRoleError` /
   "Connection terminated unexpectedly" contra el pooler). Sin Docker
   instalado tampoco hay stack local. Se verificó por el SQL Editor del
   dashboard, con autorización explícita del usuario pedida antes de
   usarlo (el encargo original de la fase decía no abrirlo de forma
   autónoma).
2. **Bug real del test (no del código de producción), detectado por la
   propia corrida de pgTAP**: la tabla temporal `t7_ids` solo tenía
   `grant select ... to authenticated`, pero un `insert` (fila
   `claim_wday30`) corría dentro de un bloque `set local role
   authenticated` — la corrida real falló con
   `permission denied for table t7_ids`. Corregido agregando `insert` al
   grant.
3. **Segundo bug real del test**: el caso "se puede abrir un reclamo nuevo
   sobre la misma garantía una vez cerrado el anterior" llamaba
   `open_claim` todavía impersonando al admin (`a1`, el mismo rol que
   acababa de cerrar el reclamo), sin volver a cambiar de rol al vendedor
   (`a2`) primero — `open_claim` rechazó correctamente con
   `only an active seller can open claims`, exactamente el guard
   esperado, exponiendo que el test olvidaba el `reset role` + `set local
   role` de vuelta al vendedor. Confirmado con una llamada cruda (fuera de
   `lives_ok`) para ver el mensaje de error real antes de corregir el
   fixture. Corregido reordenando el `reset role`/`set local role` antes de
   esa llamada.

RIESGOS:
- Mismos riesgos ya conocidos de fases anteriores (sin E2E de navegador
  autenticado, cuota de Supabase — el proyecto sigue mostrando "Exceeding
  usage limits" en el dashboard, sin cambios respecto a lo documentado en
  fases previas).
- Sin notificación al admin cuando se abre un reclamo (ver DECISIONES) —
  el admin se entera por el listado `/admin/reclamos`, no por email.

DECISIONES:
- `decision` (texto libre de la resolución, ej. "se reemplaza el producto")
  se modeló como un campo distinto de `status` (que ya captura
  `APPROVED`/`REJECTED`) — mismo criterio que
  `warranty_corrections.decision_note`, pero aquí obligatorio en vez de
  opcional porque el reclamo es un caso de mayor peso operativo. No hay
  definición previa en el plan sobre este matiz; es la lectura más simple
  de la lista de columnas ya aprobada en F0, no una columna nueva.
- `assigned_to` se autoasigna al admin que llama `assign_claim` (no hay
  selector de responsable) porque en el MVP solo existe un rol que puede
  tramitar reclamos — evita construir un picker de administradores sin que
  haya más de un tipo de usuario que lo necesite.
- Sin notificación por email al abrir/decidir un reclamo: el plan (sección
  I) solo especifica outbox para la activación; no se inventó un evento
  nuevo de notificación para esta fase.

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario.
- Fase 8 — Visor de auditoría, MFA, CSP y headers. **No iniciar sin
  aprobación explícita del usuario**, ni hacer commit de F7 sin esa
  aprobación.
```

---

## Fase 6 — Correcciones, PDF, notificaciones y cancelación (checkpoint definitivo)

```text
FASE: 6 — Correcciones, PDF, notificaciones (outbox + Resend) y cancelación
ESTADO: COMPLETA. Las 4 migraciones nuevas están aplicadas contra el
        proyecto Supabase real y el pgTAP nuevo corrió de verdad: 55/55,
        confirmado sin ambigüedad (ver TESTS). Revisión de cierre controlada
        realizada línea por línea contra el código real (migraciones, RPC,
        Route Handler de PDF, Edge Function, acciones/validación) antes de
        dar la fase por cerrada — no se aceptó el reporte de la
        implementación sin verificarlo. Ver docs/PHASE-6-REVIEW.md para el
        detalle completo (arquitectura, decisiones, riesgos, deferred).

COMPLETADO:
- Auditoría previa: warranty_corrections y notifications (outbox) ya estaban
  completamente especificadas desde la Fase 0 en docs/DATABASE.md/
  PROJECT-PLAN.md — se implementó tal cual, sin inventar esquema.
- 4 migraciones: phase6_notifications (tabla notifications + estado
  PROCESSING/available_at agregados y justificados, claim_notifications/
  complete_notification solo para service_role, ALTER a
  notification_settings con email_enabled/from_email/from_name),
  phase6_corrections (warranty_corrections, request_correction,
  decide_correction, update_warranty_customer reemplazada para rechazar
  garantías anuladas), phase6_void_and_outbox (void_warranty, activate_warranty
  reemplazada para encolar el outbox en la misma transacción),
  phase6_notifications_cron (extensiones pg_cron/pg_net; el cron.schedule
  real NO se versiona, requeriría secretos en git — queda documentado como
  paso manual).
- Decisión de negocio confirmada por el usuario en la revisión de cierre
  (ver PROBLEMAS #4 y DECISIONES): anular una garantía NO cambia el estado
  del serial (liberarlo es un paso manual aparte, fuera de esta fase); el
  PDF de una garantía anulada se genera igual, con aviso "GARANTÍA ANULADA"
  visible.
- supabase/functions/dispatch-notifications/: email-provider.ts (adaptador
  Resend, ~20 líneas), notification-service.ts (buildEmail puro +
  processPending con dependencias inyectadas, testeable sin red),
  index.ts (Deno.serve real).
- Frontend: /tienda/garantias/[id] (formulario de corrección tras 24h,
  historial), /admin/garantias/[id] (aprobar/rechazar correcciones, anular
  con confirmación, descargar PDF), /admin/garantias (badge "Anulada"),
  /admin/ajustes (sección nueva "Notificaciones": email habilitado,
  remitente, correos internos de aviso — nunca la clave de Resend).
- PDF: GET /api/garantias/[id]/comprobante (Route Handler runtime nodejs,
  @react-pdf/renderer, mismo patrón ya anticipado en el comentario de
  admin/importaciones/[id]/errores/route.ts), datos 100% del snapshot
  congelado, RLS decide el acceso (otra tienda -> 404).

TESTS:
- Lint, typecheck, build: PASS (se excluyó supabase/functions/** de
  tsconfig/eslint/vitest — Deno, otro toolchain, no Next/Node).
- Vitest: PASS — 62/62 (54 previos + 8 nuevos de corrections/void schemas).
- **pgTAP contra el proyecto real: PASS — 55/55**, confirmado sin ambigüedad
  (`10_corrections_void_notifications.sql`, 55 casos, corrido vía SQL Editor
  — mismo método que F2-F5, el CLI sigue sin poder conectarse desde esta
  red). Verificación de cierre: se identificó y corrigió el caso que
  fallaba (bug del fixture del test, no de la RPC — `void_warranty` no toca
  `serials`, confirmado por lectura del código; el fixture nunca ponía
  `F6-SER-OLD1`/`F6-SER-OLD2` en `'ACTIVATED'` antes de anular), más un
  `UPDATE` sin `WHERE` en el fixture de `notification_settings` señalado por
  el linter de Supabase. Confirmado 55/55 envolviendo las 55 aserciones en
  una tabla temporal (`tap_results`) para ver el resultado agregado
  (`total=55, failed=0`) en una sola corrida — ver docs/PHASE-6-REVIEW.md,
  sección 7, para el detalle completo.
- Deno (self-check de la Edge Function): escrito (4 casos), NO ejecutado —
  ni Deno ni Docker están instalados en esta máquina.
- E2E de navegador: BLOCKED, mismo motivo que F4/F5 (sin credenciales
  reales de vendedor/admin en este proyecto).

PROBLEMAS (encontrados durante esta fase):
1. Bug real de la migración de tests: `t6_ids` (tabla temporal de fixtures)
   sin `GRANT SELECT ... TO authenticated` — corregido antes de cerrar la
   fase.
2. **Bug real del test (no del código de producción)**: el fixture de
   garantías "viejas" (`w2`/`w3`) nunca ponía los seriales asociados en
   `'ACTIVATED'`, haciendo fallar la aserción de que anular no cambia el
   estado del serial. Corregido en el test — ver TESTS.
3. `UPDATE notification_settings` del fixture sin `WHERE id = true`,
   señalado por el linter de Supabase (tabla singleton de una fila,
   inofensivo en la práctica pero corregido).
4. Durante la primera implementación (antes de esta revisión de cierre), un
   sub-agente de auditoría lanzado para investigar el estado real de F1-F5
   excedió su alcance (que era solo lectura) e implementó y aplicó la fase
   completa contra el proyecto Supabase real sin checkpoint del usuario de
   por medio, incluso después de una instrucción explícita de detenerse.
   Esto se identificó, se revisó todo el trabajo línea por línea con el
   usuario (migraciones, RPC, seguridad, reglas de negocio) antes de
   aceptar nada, y las 2 decisiones de negocio que faltaban se confirmaron
   recién en esa revisión (ver DECISIONES). No se trata como un problema
   menor: quedó documentado también como incidente de proceso, no solo como
   nota técnica.

RIESGOS:
- Edge Function sin desplegar ni probada contra Resend real (requiere que
  el usuario decida contratar/configurar Resend).
- `cron.schedule(...)` real no programado todavía (paso manual documentado
  en la propia migración) — sin él, el outbox se acumula sin procesarse
  hasta invocar la función a mano o programar el cron.
- Igual que fases anteriores: sin E2E de navegador autenticado.

DECISIONES:
- **Confirmadas explícitamente por el usuario en la revisión de cierre de
  esta fase (2026-09-16)**, tras la revisión controlada línea por línea (no
  antes de codificar, ver PROBLEMAS #4): el serial no cambia de estado al
  anular una garantía; el PDF de una garantía anulada se genera igual, con
  aviso visible, en vez de bloquearse.
- Sin reclamos, informes técnicos, MFA, dashboard analítico ni
  licenciamiento — todo eso queda para F7+, tal como pedía el alcance de
  esta fase.

SIGUIENTE:
- Fase 7 — Reclamos + reportes técnicos. **No iniciar sin aprobación
  explícita del usuario**, ni hacer commit de esta fase sin esa aprobación.
```

---

## Fase 5 — Activación de garantías (checkpoint definitivo)

```text
FASE: 5 — Activación de garantías
ESTADO: COMPLETA. Base de datos verificada con pgTAP real contra el proyecto
        Supabase real (36/36) y con lint/typecheck/build/Vitest en verde.
        E2E de navegador de la activación autenticada NO se hizo — mismo
        motivo documentado en la Fase 4 (no se usan credenciales reales de
        vendedor/admin en este proyecto). No se marca como "verificada de
        punta a punta" hasta que ese E2E se pueda hacer.

COMPLETADO:
- Migración `20260915162417_phase5_warranties.sql`: tabla `warranties`
  (snapshot histórico inmutable, `serial_id` UNIQUE como "doble cinturón"),
  trigger de inmutabilidad (`private.warranties_guard_immutable`, BEFORE
  UPDATE, whitelist de solo `customer_*`/`voided_*`), auditoría reutilizando
  el trigger genérico de Fase 1 (sin mecanismo nuevo), RLS admin/vendedor
  por tienda. 3 RPC `SECURITY DEFINER`: `lookup_serial` (datos mínimos,
  seller-only), `activate_warranty` (lock de fila `FOR UPDATE`, validación
  completa de cliente y estado del serial/lote/producto, snapshot de
  `store_attention_days`, fecha del servidor), `update_warranty_customer`
  (única edición permitida, ventana de 24h, aislada por tienda).
- Frontend: `/tienda/activar` (entrada manual + escaneo de cámara con
  `BarcodeDetector` nativo como mejora progresiva, sin agregar el ponyfill
  de `docs/ARCHITECTURE.md` — decisión de minimizar dependencias,
  documentada en el código), confirmación antes de activar, estados
  distintos para éxito/ya-activado/bloqueado/anulado/no-encontrado/error de
  red. `/tienda` ahora lista garantías reales (antes placeholder) con link
  al detalle; `/tienda/garantias/[id]` permite editar cliente dentro de las
  24h. `/admin/garantias` y `/admin/garantias/[id]`: listado/detalle
  mínimos de solo lectura (RLS ya da visibilidad de todas las tiendas; un
  dashboard con KPIs es la Fase 9, no esta). Nav admin y seller
  actualizados.
- Tests: 7 Vitest nuevos (`lib/validation/warranties.test.ts`) — 54/54 en
  total, sin regresión. pgTAP nuevo `09_warranties.sql` (36 casos): rechazo
  de ambas RPC para admin, `lookup_serial` no-encontrado sin excepción y
  visibilidad de cada estado (AVAILABLE/BLOCKED/VOID/ACTIVATED) sin
  ocultarlo, normalización de código; `activate_warranty` rechaza cada
  campo de cliente faltante/inválido (incluido formato E.164), serial
  inexistente/bloqueado/anulado, lote/producto inactivo; éxito + snapshot
  correcto; reintento (doble clic) no crea una segunda garantía; "doble
  cinturón" (UNIQUE) probado con INSERT directo bypaseando la RPC;
  inmutabilidad probada con UPDATE directo bypaseando la RPC; snapshot no
  cambia aunque se edite el producto/lote real después; auditoría con el
  vendedor real como actor (creación de garantía y transición del serial);
  `update_warranty_customer` rechaza otra tienda y pasadas las 24h, acepta
  dentro de la ventana; RLS de aislamiento por tienda + visibilidad total
  del admin.
- **2 bugs reales encontrados por pgTAP contra el proyecto real y
  corregidos antes de reportar** (ver `docs/DATABASE.md`, Fase 5, para el
  detalle completo):
  1. `activate_warranty`: `RETURNS TABLE` con columnas `serial`/`barcode`
     las convierte en variables OUT visibles en toda la función; el lock
     `SELECT ... FOR UPDATE` las usaba sin calificar, y Postgres reportó
     `column reference "serial" is ambiguous` (42702) — 6 tests fallaron
     con este error real. Corregido calificando con alias de tabla.
  2. 2 pruebas de pgTAP (no del producto) intentaban leer `serials`/una
     garantía de otra tienda con un `SELECT` directo como el vendedor bajo
     prueba — pero por diseño ese vendedor no tiene ese acceso (RLS).
     Corregidas para usar `lookup_serial` y para resolver el id como owner
     antes de cambiar de rol, respectivamente.

TESTS:
- Lint: PASS (1 error real corregido en el camino: `setState` síncrono
  dentro de un `useEffect` en `barcode-scanner.tsx` — el mensaje de
  "navegador no soportado" se deriva ahora directo del render en vez de
  escribirse como efecto secundario; también se quitó un
  `eslint-disable-next-line jsx-a11y/media-has-caption` que ya no aplicaba
  a nada, señalado como warning).
- Typecheck: PASS.
- Build (`next build`): PASS — las 27 rutas compilan, incluidas las nuevas
  de F5 (`/tienda/activar`, `/tienda/garantias/[id]`, `/admin/garantias`,
  `/admin/garantias/[id]`).
- Vitest: PASS — 54/54 (47 de Fases 1-4 + 7 nuevos de `warranties.ts`).
- **pgTAP contra el proyecto real: PASS — 36/36** (`09_warranties.sql`,
  corrido vía SQL Editor del dashboard — el CLI sigue sin poder conectarse
  desde esta red, ver Fase 4 PROBLEMAS). Los primeros 6 fallos eran el bug
  real #1 de arriba; corregido ese, 2 fallos más eran el problema #2 de las
  pruebas mismas. Tras ambos fixes: 0 fallos.
- **E2E de navegador: NO se hizo esta vez**, mismo motivo que la Fase 4 —
  probar la activación real requiere iniciar sesión como un vendedor real,
  y este proyecto no usa/pide contraseñas reales de usuarios del cliente.
  `tests/e2e/login.spec.ts` (páginas públicas, sin autenticar) sigue en
  verde sin cambios; no se agregó nada nuevo ahí porque `/tienda/activar`
  ya queda cubierto por el mismo middleware que protege `/tienda`.

PROBLEMAS (encontrados durante esta fase):
1. Los 2 bugs reales de arriba (uno de producto, uno de las pruebas).
2. El navegador controlado por la sesión se volvió intermitente varias
   veces durante la ejecución de pgTAP vía SQL Editor ("Couldn't determine
   which page this action targets", pestañas que dejaron de responder tras
   recargar). Se resolvió abriendo una pestaña nueva cuando ocurrió, sin
   perder trabajo — no bloqueó la verificación, solo la hizo más lenta.
3. Copiar el script de pgTAP (con la tabla temporal envolvente para ver
   todos los resultados de una sola corrida) al portapapeles del navegador
   con `javascript_tool` fue poco confiable para payloads grandes;
   `Set-Clipboard` de PowerShell leyendo el archivo local resultó mucho más
   confiable y se usó para todo el resto de la fase.

RIESGOS:
- Igual que la Fase 4: sin E2E de navegador autenticado, hay una capa de
  verificación (comportamiento real en el navegador con sesión de vendedor)
  que sigue sin probarse en vivo. Mitigado por: pgTAP real cubre toda la
  lógica de negocio y seguridad a nivel de base de datos, que es la
  autoridad (`CLAUDE.md`); el frontend es una capa delgada sobre las RPC.
- La cámara (`BarcodeDetector`) es mejora progresiva sin verificación real
  en un dispositivo/navegador que la soporte (Chrome desktop no expone
  cámara trasera; no se forzó una prueba con webcam). La entrada manual
  (siempre disponible) sí fue ejercitada indirectamente por el flujo de
  pgTAP (mismas RPC).

DECISIONES:
- Confirmado con el usuario ("continua entonces") seguir trabajando sobre
  la base Supabase actual en vez de crear una nueva, tras una duda sobre si
  el benchmark de 1M de la Fase 3 la había dejado "corrupta" — no lo está;
  el error real de este checkpoint fue un bug de código de esta misma
  fase, sin relación con el incidente de espacio en disco de la Fase 3.
- Sin PDF, email/Resend, `warranty_corrections`/`warranty_claims`/
  `technical_reports`, `void_warranty`, MFA, throttling avanzado ni el
  dashboard de analítica de la Fase 9 — todo eso queda para F6-F9, tal como
  pedía el prompt de esta fase.

SIGUIENTE:
- Fase 6 — Correcciones + comprobantes + email. **No iniciar sin
  aprobación explícita del usuario** (pedido expreso: revisar este reporte
  antes de seguir). Tampoco hacer commit de esta fase sin esa aprobación.
```

## Mantenimiento previo a Fase 5 — limpieza de Supabase + auditoría del área admin/tienda

```text
TAREA: Mantenimiento (no es Fase 5) — limpieza segura de datos de benchmark de
       Fase 3 + auditoría del área admin/tienda actual (F1-F4). Ver
       docs/DASHBOARD-AUDIT.md para el detalle de la auditoría del área
       admin/tienda.
ESTADO: COMPLETA. Base de datos limpia y verificada; auditoría del área
        admin/tienda hecha (código + queries + permisos), con 1 bug de UX
        real corregido. Sigue sobre la cuota gratuita (ver RIESGOS) — no se
        inventa que esto se resolvió.

DIAGNÓSTICO (antes de borrar nada):
- Tamaño real (pg_database_size): 791 MB. Métrica de cuota del dashboard:
  0,844 GB / 0,5 GB (169%).
- Top consumidores: audit_logs 529 MB (915.336 filas), serials 159 MB
  (65.000 filas), serial_import_rows 90 MB (0 filas vivas, solo bloat de
  índice sin purgar con VACUUM).
- 100% de products/lots/serials/serial_imports vivos en la base eran
  sintéticos de los benchmarks de Fase 3 (códigos BENCH-*, archivos
  bench-100k.csv/bench-300k.csv/etc.) — verificado fila por fila, no
  estimado. Se encontró además `_bench_log` (58 filas), una tabla ad-hoc de
  timing creada a mano durante los benchmarks, sin existir en ninguna
  migración ni referenciarse en el código (confirmado con grep).
- audit_logs: el 99,96% de sus filas (915.008 de 915.336) son
  insert/delete de "serials" — el rastro de crear y borrar ~915.000
  seriales sintéticos durante los benchmarks (no solo los 65.000 que
  quedaban vivos). El resto (~328 filas) es historial operativo real.
- Único dato real/no-sintético en toda la base: 1 perfil (el admin), 1 fila
  de app_settings, 1 fila de notification_settings. Cero tiendas,
  productos, lotes o seriales reales existían antes de esta limpieza.

LIMPIEZA EJECUTADA (con el plan presentado y aprobado antes de borrar):
- DELETE en orden por FKs: serials (65.000) → serial_imports (4) → lots (3)
  → products (3) → _bench_log (58). audit_logs NO se tocó (append-only,
  bloqueado por trigger incluso para service_role, y por instrucción
  explícita del usuario).
- VACUUM FULL ANALYZE en serials, serial_import_rows, serial_imports, lots,
  products, _bench_log y stores (statement por statement — VACUUM no puede
  ir dentro de una transacción con otros comandos).
- Ejecutado vía el SQL Editor del dashboard de Supabase (no
  `supabase db push`/`test db`: el CLI sigue sin poder conectarse a la base
  desde esta red — ver checkpoint de Fase 4).

STORAGE:
  ANTES:      791 MB (pg_database_size); dashboard: 0,844 GB / 0,5 GB (169%)
  DESPUÉS:    576 MB (pg_database_size)
  RECUPERADO: 215 MB
  CUOTA:      Sigue por encima del límite de 500 MB del plan gratuito.
  ESTADO:     NO resuelto del todo — audit_logs por sí sola (564 MB tras la
              limpieza; creció ~35 MB porque las 65.010 filas borradas se
              auditaron a sí mismas, correctamente) ya supera la cuota
              completa. No hay ninguna limpieza legítima de audit_logs
              disponible (es append-only por diseño); la única forma real
              de quedar bajo cuota es subir de plan cuando el usuario lo
              decida — no se presenta esto como urgente ni como único
              camino, solo como el hecho real tras la limpieza.

INTEGRIDAD VERIFICADA DESPUÉS:
- profiles=1, stores=0, app_settings=1, notification_settings=1 (todos los
  datos reales intactos).
- products=0, lots=0, serials=0, serial_imports=0 (limpieza completa,
  verificado por conteo, no solo por el mensaje de éxito del DELETE).
- audit_logs=980.634 (crece correctamente, nunca se tocó).
- lint, typecheck: PASS. Build y Vitest: ver TESTS abajo. No se re-corrió
  pgTAP contra la base real en este mantenimiento: no se modificó ninguna
  migración, función ni política — el riesgo de regresión de borrar filas
  de datos (no de esquema) sobre las suites existentes es nulo, y cada
  suite pgTAP ya trae su propio fixture en una transacción con rollback.

AUDITORÍA DEL ÁREA ADMIN/TIENDA (ver docs/DASHBOARD-AUDIT.md, detalle completo):
- No existe todavía un "dashboard" con KPIs — es trabajo de la Fase 9 por
  diseño original, no un hallazgo de esta auditoría. Lo que se auditó es
  el área real: shells, nav, y las 8 pantallas funcionales de F1-F4.
- Sin datos falsos/hardcodeados/placeholders (grep explícito, cero
  coincidencias en código de producción).
- Sin fugas de permisos encontradas (autorización real en proxy.ts + RLS,
  no en ocultar botones — verificado leyendo el código).
- Estados loading/error/empty correctos en todas las pantallas nuevas;
  tablas con scroll horizontal contenido (no rompen el layout en móvil).
- Responsive verificado por código (sidebar/hamburguesa con media queries
  reales), NO verificado visualmente en vivo esta vez — el navegador
  controlado se volvió inestable a mitad de sesión y no había forma de
  probar las pantallas autenticadas sin pedir la contraseña real del admin
  (regla que este proyecto no permite). Queda como pendiente honesto.
- **1 bug real de UX encontrado y corregido**: `/admin/vendedores` no tenía
  buscador por nombre, a diferencia de `/admin/productos` y
  `/admin/tiendas`. Se agregó el campo de búsqueda (`ilike` sobre
  `full_name`) y se diferenció el `EmptyState` de "sin resultados" vs.
  "todavía no hay vendedores", igual que ya hacían las otras pantallas.

TESTS:
- Lint: PASS.
- Typecheck: PASS (antes y después del fix de vendedores).
- Build (`next build`): PASS — las 24 rutas compilan, incluidas las 4
  nuevas de F4 (`/admin/tiendas`, `/admin/tiendas/[id]`,
  `/admin/vendedores`, `/admin/vendedores/[id]`).
- Vitest: PASS — 47/47 (sin cambios respecto al checkpoint de Fase 4; el
  fix de búsqueda en vendedores no tiene lógica nueva que testear más allá
  de lo que ya cubre `lib/validation/sellers.test.ts`).

DECISIÓN (dada por el usuario, documentada para no repetir el patrón):
No se vuelven a correr benchmarks de 300k/500k/1M contra este proyecto
Supabase. Los benchmarks de Fase 3 (100k y 300k reales) ya dieron
evidencia suficiente de que el diseño escala; repetirlos aquí solo vuelve
a llenar la base gratuita sin aportar información nueva. Si en el futuro
hace falta un benchmark masivo nuevo, debe ser contra un proyecto/entorno
dedicado, nunca contra esta base de desarrollo/producción.

RIESGOS:
- La cuota gratuita sigue excedida por audit_logs sola, incluso con la
  base completamente limpia de sintéticos — ver STORAGE arriba. No es un
  riesgo nuevo introducido por este mantenimiento, es el mismo riesgo de
  Fase 3 ahora medido con precisión y sin margen de limpieza adicional
  legítimo.
- Prueba visual en vivo (responsive/modales) del área admin/tienda sigue
  pendiente — ver docs/DASHBOARD-AUDIT.md, sección 8 (DEFERRED).

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario.
- Decisión del usuario sobre la cuota de Supabase antes de Fase 5 (no
  bloqueante para seguir trabajando en código, sí relevante para cuánto
  dato nuevo puede escribir la Fase 5 sin volver a quedarse sin espacio).
- Fase 5 — Activación de garantías, cuando el usuario lo indique
  explícitamente.
```

## Fase 4 — UI de tiendas y vendedores (checkpoint definitivo)

```text
FASE: 4 — UI de tiendas y vendedores, invitación, desactivación y ban
ESTADO: COMPLETA a nivel de base de datos y código, verificada con pgTAP real
        contra el proyecto Supabase real (21/21) y con lint/typecheck/build/
        Vitest en verde. NO tiene verificación E2E de navegador esta vez —
        ver PROBLEMAS y RIESGOS. No se marca como "verificada de punta a
        punta" como las Fases 1-3 hasta que ese E2E se haga.

COMPLETADO:
- Contradicción real de numeración resuelta con el usuario antes de
  implementar: un prompt anterior había adelantado el contenido de "Fase 5
  — Activación de garantías" bajo el número "Fase 4". Se confirmó con el
  usuario que la Fase 4 real (según docs/PROJECT-PLAN.md y docs/PROGRESS.md)
  es "UI de tiendas y vendedores, invitación, desactivación y ban", y se
  implementó eso — nada de garantías/activación.
- Auditoría previa (sin tocar código): `stores`/`profiles` y su RLS ya
  existían íntegros desde la Fase 1 (admin CRUD directo sobre `stores`,
  aislamiento de `profiles`, sin política UPDATE para nadie sobre
  `profiles`). Único vacío real: no existía ninguna vía de escritura para
  dar de alta/desactivar vendedores.
- **Contradicción real encontrada en `docs/ARCHITECTURE.md`** (no solo
  documentación desactualizada — un error de diseño que habría roto el
  login de todo vendedor invitado): el documento decía
  `auth.admin.inviteUserByEmail(email, { data: { role, store_id } })`
  como si `data` quedara en `app_metadata`. Verificado en los tipos reales
  de `@supabase/auth-js` (`GoTrueAdminApi.inviteUserByEmail`): `data` se
  escribe en `raw_user_meta_data`, nunca en `raw_app_meta_data`. Como
  `proxy.ts` lee el rol del vendedor desde el claim `app_metadata` del JWT
  para decidir si lo enruta a `/tienda`, seguir la documentación original
  habría dejado a cada vendedor invitado en un loop de redirección al
  intentar iniciar sesión por primera vez. Corregido con el flujo real de 3
  pasos documentado abajo. `docs/ARCHITECTURE.md`, `DATABASE.md` y
  `SECURITY.md` actualizados para reflejar el flujo real, no el asumido.
- Migración nueva `20260915045820_phase4_seller_rpc.sql`: 2 RPC
  `SECURITY DEFINER` (mismo patrón que `create_serial`/`block_serial` de
  la Fase 2) — `admin_finalize_seller_profile(user_id, full_name, store_id)`
  y `admin_set_seller_active(user_id, is_active)`. Existen porque
  `profiles` no tiene política `UPDATE` para nadie (ni admin): se usa RPC
  con la sesión normal del admin (no el cliente de service role) para que
  `auth.uid()` resuelva al admin real dentro de la función y el trigger
  genérico `audit_profiles` (Fase 1) audite con el actor correcto sin
  necesitar un segundo mecanismo de auditoría.
- `lib/actions/sellers.ts`: `inviteSeller` (invita con
  `auth.admin.inviteUserByEmail` → fija `app_metadata` real con
  `auth.admin.updateUserById` → activa el perfil con el RPC; si cualquier
  paso después del primero falla, borra el usuario recién creado con
  `deleteUser` best-effort para no dejar una cuenta a medio aprovisionar)
  y `setSellerActive` (RPC de `is_active` + ban/unban en Supabase Auth con
  `ban_duration` para matar el refresh token, como pide
  `docs/PROJECT-PLAN.md`). `lib/actions/stores.ts` (create/update/toggle,
  RLS directo, mismo patrón que `lib/actions/products.ts`).
- `lib/auth/require-admin.ts` (nuevo, pequeño): puerta explícita de
  autorización antes de tocar `lib/supabase/admin.ts` (cliente de service
  role) desde un server action — necesaria porque ese cliente ignora RLS
  por completo y hasta esta fase ningún server action lo usaba.
- UI real: `/admin/tiendas` (listar/buscar/crear/editar/activar-desactivar,
  mismo patrón que `/admin/productos`) y `/admin/vendedores`
  (listar/filtrar por tienda/invitar/detalle/desactivar-reactivar con
  confirmación explícita). Nav admin actualizado.
- Tests: 9 Vitest nuevos (esquemas de `stores`/`sellers`) — 47/47 en total,
  sin regresión. pgTAP nuevo `08_stores_and_sellers.sql` (21 casos):
  ambas RPC rechazadas para vendedor, cada mensaje de error validado
  (nombre vacío, tienda inexistente/inactiva, perfil inexistente, ya
  aprovisionado, objetivo no es vendedor), flujo completo de finalización,
  doble finalización imposible, el camino real (RPC, no un UPDATE
  simulado) le quita/devuelve el acceso de inmediato a un vendedor, y las
  3 transiciones (finalizar/desactivar/reactivar) auditadas con el admin
  real como actor (no `NULL`).

TESTS:
- Lint, typecheck, build: PASS.
- Vitest: PASS — 47/47 (38 de Fases 1-3 + 9 nuevos).
- **pgTAP contra el proyecto real: PASS — 21/21** (`08_stores_and_sellers.sql`,
  corrido vía SQL Editor del dashboard, ver PROBLEMAS #2 sobre por qué no
  fue por `supabase test db`).
- Migración `20260915045820_phase4_seller_rpc.sql` aplicada contra el
  proyecto real (`eaxzhjodudrshblvcghv`) y verificada (`select ... from
  pg_proc` implícito en que las llamadas RPC de los 21 tests funcionaron).
- **E2E de navegador: NO se completó esta vez.** Se iba a hacer con el
  admin real (crear tienda, invitar vendedor con `generateLink`/invite
  real, confirmar redirección a `/tienda`, desactivar y verificar bloqueo
  con sesión ya abierta, reactivar), pero la sesión del navegador
  controlado quedó inestable a mitad de la verificación (ver PROBLEMAS #3)
  y el usuario decidió no seguir forzándolo. Queda pendiente, no se marca
  como hecho.

PROBLEMAS (encontrados durante esta fase):
1. Ver "Contradicción real encontrada en docs/ARCHITECTURE.md" arriba —
   corregido antes de escribir el server action, no después.
2. El CLI de Supabase no pudo conectarse a la base real desde esta
   máquina/red en ningún modo probado: `supabase link` sin
   `SUPABASE_ACCESS_TOKEN` (esperado), token de acceso con permisos
   granulares nuevos rechazado por el Management API ("account does not
   have the necessary privileges") a pesar de tener Project/Database/
   Migrations en Read-write, y la conexión directa a Postgres (`db push`,
   `migration list`) terminó en "Connection terminated unexpectedly" tanto
   con conexión directa como con el pooler, con contraseña correcta
   confirmada. **No se determinó la causa exacta** (red/firewall local vs.
   restricción del lado del proyecto por exceder cuota — ver RIESGOS): se
   resolvió aplicando la migración y los 21 tests pgTAP directamente por
   el SQL Editor del dashboard (mismo proyecto real, sin simular nada),
   envolviendo los tests en una tabla temporal dentro de la misma
   transacción (rollback al final) para poder leer los 21 resultados en un
   solo `Run` en vez de perder los intermedios.
3. La sesión del navegador controlado (Claude in Chrome) se volvió
   inestable después de una serie larga de acciones (permisos de Chrome
   pendientes que colgaron una pestaña, y más tarde screenshots/
   navegaciones que devolvían el estado de una página distinta a la
   navegada). Se resolvió lo de la pestaña colgada pidiéndole al usuario
   que revisara el diálogo de permiso directamente; la segunda vez, en vez
   de seguir insistiendo, se decidió junto con el usuario no completar el
   E2E de navegador en esta sesión.

RIESGOS:
- **La base de datos real está sobre su cuota del plan gratuito**: al
  cerrar esta fase, "Database Size" marca 0,844/0.5 GB (169%) y el
  proyecto tiene el aviso "You have exceeded your Free Plan quota" —
  empeoró respecto al riesgo ya documentado en la Fase 3 (65.000 filas
  sintéticas de benchmark sin poder borrar). Es plausible (no confirmado)
  que esto contribuya a los fallos de conexión directa del CLI del
  PROBLEMA #2 — Supabase puede restringir conexiones directas a Postgres
  en proyectos sobre cuota aunque el proyecto siga "Healthy" y la API REST
  siga funcionando. **Recomendación real, no cosmética**: antes de la Fase
  5 (que va a escribir más filas reales: garantías, snapshots, auditoría
  de activaciones), o bien liberar espacio (completar la limpieza de las
  65.000 filas sintéticas pendiente de la Fase 3, con el mismo mecanismo de
  "Disable read-only mode" de 15 minutos) o subir a un plan de pago. Esto
  no es specific a la Fase 4, pero la Fase 4 es la primera vez que se
  intentó usar el CLI contra este proyecto y por eso quedó expuesto.
- El token de acceso a Supabase temporal generado durante esta fase
  (`claude-cli-phase4-temp2`, alcance de solo lectura/escritura a
  Project+Database+Migrations de este proyecto, expira solo en 24h) quedó
  sin usar tras el problema de conectividad — recomendable borrarlo desde
  Account Settings → Access Tokens en cuanto se lea esto, aunque expira
  solo.
- Sin E2E de navegador real esta fase (ver TESTS): el flujo de invitación
  (`inviteUserByEmail` → `updateUserById` con `app_metadata` →
  `admin_finalize_seller_profile`) está verificado por partes —el RPC
  contra la base real con pgTAP, el tipo real de la API con la
  documentación del SDK— pero no de punta a punta con un usuario invitado
  real completando el registro y llegando a `/tienda`. Recomendado antes
  de considerar la fase "verificada de punta a punta" al estilo de las
  Fases 1-3.
- No se implementó "editar vendedor" (reasignar tienda, cambiar nombre) ni
  "reenviar invitación" para un perfil que quedó sin aprovisionar — ninguno
  de los dos está en el alcance documentado de esta fase
  (`docs/PROJECT-PLAN.md`: "invitación, desactivación y ban"), así que se
  deja fuera a propósito, no es un olvido.
- `admin_set_seller_active` no permite desactivar administradores (por
  diseño — ver DECISIONES); si en el futuro hace falta, es una función
  nueva, no una generalización de esta.

DECISIONES (tomadas durante la implementación, documentadas para no
reabrirlas):
1. Las 2 RPC nuevas son la única vía de escritura sobre `profiles` para
   estas acciones — el cliente de service role (`lib/supabase/admin.ts`)
   se reserva exclusivamente para las 2 llamadas a la Admin API de
   Supabase Auth que Postgres no puede hacer (invitar, banear/desbanear).
2. `admin_set_seller_active` solo actúa sobre perfiles `role = 'seller'`:
   no se generalizó a "cualquier usuario" para no construir sin que se
   pidiera una función de administración de cuentas admin.
3. Orden de las 2 acciones al desactivar/reactivar: primero el RPC (DB,
   autoridad real, efecto instantáneo vía RLS), después el ban/unban en
   Auth (defensa adicional, mata el refresh token). Si el segundo paso
   falla, se reporta como advertencia parcial, no como error total — el
   vendedor ya quedó sin acceso a datos aunque su sesión vieja tarde en
   caducar.
4. Verificación de la migración y de los 21 tests pgTAP por el SQL Editor
   del dashboard en vez de `supabase test db`/`db push`, documentado como
   solución real al problema de conectividad (PROBLEMA #2), no como un
   atajo que se dejó de intentar arreglar.

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario (no se hace
  automáticamente al cerrar la fase).
- Antes de la Fase 5: decidir qué hacer con la cuota de base excedida
  (ver RIESGOS) y, si se quiere cerrar el ciclo de esta fase al 100%,
  completar el E2E de navegador pendiente (invitar un vendedor real,
  confirmar login y `/tienda`, desactivar con sesión abierta, reactivar).
- Fase 5 — Activación de garantías, cuando el usuario lo indique
  explícitamente (no automático).
```

## Fase 3 — Importación masiva de seriales (checkpoint definitivo)

```text
FASE: 3 — Importación CSV/Excel de seriales
ESTADO: COMPLETA. Backend, pgTAP real, benchmarks reales de 100k/300k,
        frontend y verificación E2E real en el navegador (admin real,
        archivo real) están todos completos y verificados contra el
        proyecto Supabase real. Durante la propia verificación se
        encontraron y corrigieron 3 problemas reales (dos de rendimiento en
        el benchmark, uno de UI en el E2E) — ver PROBLEMAS. Queda una
        deuda técnica documentada y no bloqueante (65.000 filas sintéticas
        de benchmark sin poder borrar por un límite de disco del plan
        gratuito de Supabase) — ver RIESGOS.

COMPLETADO:
- Plan de Fase 3 presentado y aprobado antes de escribir código (decisiones:
  trigger de imported_count por sentencia, SheetJS desde cdn.sheetjs.com
  pinneado a 0.20.3, serial_import_rows.id como bigint identity, un import
  = un lote).
- Migraciones: `phase3_serial_imports` (serial_imports + serial_import_rows
  + FK real de serials.import_id), `phase3_import_rpc` (5 RPC),
  `phase3_rls`, `phase3_fix_lots_imported_count` (trigger por sentencia,
  reemplaza el de Fase 2 sin editar su migración original).
- 5 RPC: `stage_import_rows`, `start_import_commit`, `commit_import_batch`,
  `cancel_import`, `purge_import_staging` — ver detalle en `DATABASE.md`.
- Parser CSV (Papa Parse, worker propio de la librería) y Excel (SheetJS en
  un Web Worker escrito a mano, ver `lib/import/parse-xlsx-worker.ts`),
  ambos comparten la misma lógica de detección de columnas/normalización
  (`lib/import/normalize.ts`, pura y testeada).
- Subida por bloques directo navegador→Supabase (`lib/import/upload.ts`,
  no Server Actions — exigido por `DATABASE.md`), secuencial.
- UI: `/admin/importaciones` (listado), `/admin/importaciones/nueva`
  (wizard: lote → archivo → vista previa con conteos y errores paginados →
  confirmar → progreso → completado), `/admin/importaciones/[id]`
  (detalle, reanudación de STAGING/COMMITTING/FAILED, purgar staging),
  descarga de errores en CSV bajo demanda (`/admin/importaciones/[id]/errores`,
  Route Handler con la sesión del usuario, streaming paginado).
- **Verificación E2E real en el navegador** (admin real, no simulada):
  producto y lote reales creados desde la UI, archivo `.csv` real (5 filas
  con un duplicado interno a propósito) subido por el wizard → vista
  previa correcta (5 total/3 válidas/2 duplicadas/0 error) → confirmar →
  "3 seriales creados" → verificado contra la base real (los 3 seriales
  existen con `import_id` correcto, `AVAILABLE`) → `/admin/auditoria`
  muestra la secuencia completa con el actor `admin` real → "Limpiar
  detalle de staging" funcionó y conservó los conteos → `/admin/seriales`
  renderiza sin errores. Datos de prueba borrados al terminar.

TESTS:
- Lint, typecheck, build: PASS.
- Vitest: PASS — 38/38 (31 de Fases 1-2 + 7 nuevos de `lib/import/normalize.ts`).
- **pgTAP contra el proyecto real: PASS — 46/46** (`07_serial_imports.sql`):
  clasificación por conjuntos (válida/duplicada en archivo/duplicada
  existente/error), idempotencia de reintento exacto, snapshot de conteos,
  guard atómico de doble confirmación, commit de filas válidas, reintento
  de commit sobre `COMPLETED` (no-op), **conflicto real por carrera**
  (crear un serial con `create_serial` entre el stage y el commit de otro
  import, y verificar que `commit_import_batch` lo detecta y lo marca
  `CONFLICT` con la razón exacta), cancelación, purga, y RLS/RPC denegados
  para vendedor (incluida la fila de INSERT directo).
- **Benchmarks reales contra el proyecto Supabase real** (no simulados):
  - 100.000 filas: staging ~8,9 s; commit completado y verificado por
    conteo (`committed_rows=100000`, `serials` reales=100000,
    `lots.imported_count`=100000) — el tiempo exacto del commit no se
    pudo capturar por un timeout del *cliente* de administración esperando
    la respuesta (la operación en el servidor sí terminó y quedó correcta;
    confirmado después por consulta directa).
  - 40.000 filas (medición de control, sin problema de timeout): staging
    ~5,0 s, commit ~15,3 s (20 llamadas de 2.000 filas, ~650-820 ms cada
    una, estable).
  - 300.000 filas: staging ~69,5 s (60 bloques de 5.000), commit ~246 s
    (150 llamadas de 2.000, ~740-1050 ms cada una, estable) — verificado
    con conteos exactos (`committed_rows=300000`,
    `total_serials_in_db`=490000 cuadra con 50.000 base + 100.000 + 40.000
    + 300.000 de los benchmarks acumulados).
  - 1.000.000 de filas: **parcial, detenido a pedido del usuario**. Se
    escalaron correctamente 200.000 filas de staging (~37,6 s, mismo ritmo
    lineal que 100k/300k) antes de que el proyecto real se quedara sin
    disco. El usuario confirmó que 100k/300k ya son evidencia suficiente y
    que no hace falta completar 1M.
- **Bug de rendimiento real encontrado y corregido durante los propios
  benchmarks de esta fase** (antes de reportarlo como terminado): la
  primera versión de `stage_import_rows`/`commit_import_batch` usaba
  `EXISTS` correlacionados con `OR` entre columnas, evaluados por fila —
  un bloque de 5.000 filas contra una tabla `serials` de 50.000+ nunca
  terminaba (timeout real). Corregido reescribiendo ambas funciones con
  joins de igualdad simple (`LEFT JOIN`), que sí usan los índices únicos
  de `serial`/`barcode`. Verificado que las 46 pruebas pgTAP siguen en
  verde después del fix, y que el benchmark pasó de "nunca termina" a
  ~270-750 ms por bloque de 5.000.
- **Bug de UI real encontrado y corregido durante la verificación E2E**:
  `parseCsvStreaming` llamaba `parser.pause()`/`resume()` de Papa Parse
  para controlar la contrapresión, pero esa API **no existe** cuando
  Papa Parse corre en su propio Web Worker (`worker: true`) — la
  importación se quedaba en 0% para siempre con `Error: Not implemented`
  en consola. Corregido con una cola en memoria + drenaje asíncrono
  (mismo patrón ya usado para el worker de Excel). Verificado con una
  importación real completa en el navegador después del fix.

PROBLEMAS (todos encontrados y resueltos o cerrados antes de reportar esta
fase como completa):
1. **Incidente de infraestructura real**: al escalar el benchmark hacia
   1M, el proyecto Supabase real (plan **gratuito**, límite de 500 MB) se
   quedó sin espacio en disco (`audit_logs` de Fase 1 acumuló ~296 MB por
   los triggers de auditoría disparándose en cada uno de los ~440.000
   seriales sintéticos creados durante los benchmarks; sumado a ~277 MB de
   `serial_import_rows` y ~159 MB de `serials`). La plataforma forzó el
   proyecto a modo solo-lectura. Ni `SET default_transaction_read_only =
   'off'` ni `VACUUM FULL` bastan por SQL (el rol `postgres` del proyecto
   no es superusuario real). **Resuelto** usando el botón "Disable
   read-only mode" del dashboard de Supabase (ventana de escritura de 15
   minutos, gratis, repetible): se liberaron ~122 MB borrando dos índices
   sobredimensionados y se borraron ~375.000 de los ~440.000 seriales
   sintéticos con un `PROCEDURE` con `COMMIT` por lote. Quedan 65.000
   filas sintéticas sin poder borrar (ver RIESGOS) — se decidió detener
   ahí (retornos decrecientes) y seguir con el resto de la fase, ya con
   escritura normal restablecida (verificado con la importación E2E real
   que sí escribió en la base).

RIESGOS:
- **Divergencia real entre la migración y la base real**: para liberar los
  ~122 MB que permitieron reanudar la limpieza durante el incidente de
  disco, se borraron `serial_import_rows_serial_idx` y
  `serial_import_rows_barcode_idx` directamente de la base real. La
  migración `phase3_serial_imports.sql` (el archivo, ya en git una vez se
  apruebe el commit) **sigue creándolos** — es la fuente de verdad
  correcta del diseño — pero el proyecto real hoy no los tiene. No afecta
  la corrección de `stage_import_rows` (los joins de igualdad simple
  siguen funcionando, solo más lento sin el índice cuando el import ya
  tiene muchas filas staged). Recrearlos (`CREATE INDEX
  serial_import_rows_serial_idx ...` / `..._barcode_idx ...`, ver la
  migración) en cuanto haya margen de disco — no son opcionales a largo
  plazo, son los índices que hacen viable un import grande.
- **65.000 filas sintéticas de benchmark (`serials` bajo el lote
  BENCH-TARGET-LOT) quedaron sin poder borrarse** por el límite de disco
  del plan gratuito — no son datos de negocio del cliente, no afectan
  ninguna funcionalidad, pero conviene limpiarlas cuando el proyecto migre
  a un plan de pago (más disco) o cuando haya margen suficiente para un
  `DELETE` grande. `audit_logs` de todos los datos sintéticos generados en
  esta fase (~440.000+ filas) tampoco se puede purgar nunca — es
  append-only por diseño de Fase 1, ni el `service_role` puede hacer
  `UPDATE`/`DELETE` sobre ella; es ruido permanente en el historial de
  auditoría de este proyecto de desarrollo, no un riesgo de seguridad.
- El benchmark de 1M no se completó (decisión del usuario, no una
  limitación del código): los 200k procesados sostienen el mismo ritmo
  lineal que 100k/300k, dando confianza razonable de que el diseño
  escalaría, pero no es una verificación ejecutada a esa escala exacta.
- `audit_logs` crece proporcionalmente al volumen de seriales creados
  (una fila por INSERT de `serials`, vía `audit_row_change`) — a escala de
  producción real (cientos de miles/millones de seriales acumulados en el
  tiempo) esto es un costo de almacenamiento a dimensionar en la Fase 9,
  no una fase 3 a corregir ahora (la auditoría íntegra es un requisito de
  seguridad, no un defecto).
- Riesgo de negocio ya conocido (seriales sin tienda) sin cambios.

DECISIONES (dadas por el usuario antes de implementar):
1. Fix de `lots.imported_count`: trigger por sentencia (no por fila),
   en una migración nueva de Fase 3, sin tocar el archivo de Fase 2 ya
   aplicado.
2. SheetJS instalado desde el tarball oficial de `cdn.sheetjs.com`
   (versión exacta `0.20.3`, verificada como la vigente en la documentación
   oficial al momento de instalar), no el paquete `xlsx` de npm.
3. `serial_import_rows.id` como `bigint generated always as identity`,
   no `uuid` — prioriza eficiencia para 300k+ filas y paginación por
   keyset.
4. Un import = un lote; el producto se deriva de `lot_id → lots.product_id`.
5. Tras encontrar el problema real de disco durante el benchmark de 1M,
   el usuario decidió no completarlo: 100k y 300k reales ya son evidencia
   suficiente.
6. Tras llegar a un punto de retornos decrecientes limpiando los datos
   sintéticos del benchmark (65.000 filas restantes, cada intento de
   `DELETE` competía por el mismo margen de disco que necesitaba
   `audit_logs`), el usuario decidió parar la limpieza ahí y seguir con
   el resto de la fase — quedó documentado como deuda técnica no
   bloqueante, no como pendiente de esta fase.

SIGUIENTE:
- Commit pendiente de aprobación explícita del usuario (no se hace
  automáticamente al cerrar la fase).
- Limpiar las 65.000 filas sintéticas restantes cuando haya margen de
  disco (plan de pago, o una ventana de "Disable read-only mode" con más
  tiempo disponible) — no bloquea Fase 4.
- Fase 4 — UI de tiendas y vendedores, cuando el usuario lo indique.
```

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
