# Revisión técnica — Fase 2: Productos → Lotes → Seriales

> Documento de planificación, no de implementación. No crea tablas, migraciones ni código.
> Basado en la inspección directa de: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`,
> `docs/SECURITY.md`, `docs/PROJECT-PLAN.md`, `docs/PROGRESS.md`, las 7 migraciones reales en
> `supabase/migrations/` (aplicadas contra el proyecto `eaxzhjodudrshblvcghv`, commit
> `b09a2856b222247c14d4975bf59676abf96cb940`) y la estructura real de `app/`, `lib/`,
> `components/`. Fecha: 2026-09-14.

---

## 1. Estado actual (lo que existe de verdad, no lo planeado)

Confirmado por inspección directa de `supabase/migrations/` — **ninguna de las 7 migraciones aplicadas crea `products`, `lots`, `serials`, `serial_imports` ni `serial_import_rows`**:

| # | Migración | Qué crea |
|---|---|---|
| 1 | `20260914201339_profiles_and_stores.sql` | esquema `private`; `public.stores`; `public.profiles`; `private.set_updated_at()` |
| 2 | `20260914201402_app_settings.sql` | `public.app_settings`, `public.notification_settings` (singleton) |
| 3 | `20260914201420_audit_logs.sql` | `public.audit_logs`; `private.block_audit_mutation()`; `private.audit_row_change()` (trigger genérico); `public.log_audit_event()` |
| 4 | `20260914201438_auth_user_provisioning.sql` | `private.handle_new_user()` (trigger sobre `auth.users`) |
| 5 | `20260914201455_rls.sql` | `private.is_admin()`, `private.current_store_id()`; políticas RLS y grants de las 5 tablas de la Fase 1 |
| 6 | `20260914215719_harden_function_grants.sql` | corrige el grant de `anon` sobre `log_audit_event` |
| 7 | `20260914220640_fix_audit_entity_id_cast.sql` | corrige `audit_row_change()` para `id boolean` |

Código de app real (`app/`, `lib/`): solo Auth, shells `admin`/`tienda`, `/admin/auditoria`, `/admin/ajustes`. **No existe ningún archivo bajo `app/admin/productos`, `app/admin/lotes` ni `app/admin/seriales`.** La Fase 2 arranca de cero en cuanto a UI y a esquema de catálogo/inventario — el diseño de `products`/`lots`/`serials` en `docs/DATABASE.md` es un **plan**, todavía no una realidad verificable en la base.

Esto no es un problema: es exactamente lo que corresponde después de una Fase 1 que, correctamente, no tocó nada de Fase 2 (ver `docs/PROGRESS.md`, Fase 1, decisión: *"No se creó una tabla `customers` ni ninguna tabla de Fase 2+"*).

## 2. Qué ya está cubierto por la Fase 1 (reutilizable, no se rediseña)

- **Esquema `private` no expuesto por PostgREST** (confirmado: `supabase/config.toml` solo expone `public`/`graphql_public`) — ahí van los helpers y funciones internas de Fase 2.
- **`private.is_admin()` / `private.current_store_id()`** (`rls.sql`) — se reutilizan tal cual para las políticas de `products`/`lots`/`serials`. No hace falta ni un helper nuevo.
- **Patrón de tabla admin-CRUD ya probado**: `stores_admin_all` (`rls.sql`, `for all ... using (is_admin()) with check (is_admin())`) es el molde exacto para `products`/`lots`.
- **Patrón de "instantáneo ante desactivación"**: `app_settings_select` (`rls.sql`, `using (is_admin() or current_store_id() is not null)`) es el molde para el SELECT de `seller` sobre `products`.
- **`private.set_updated_at()`** — reutilizable en `products`/`lots`/`serials` sin cambios.
- **`private.audit_row_change()`** (ya corregido en la migración 7 para tolerar PKs no-uuid) — reutilizable en `products`/`lots`/`serials` sin cambios; solo hace falta el `create trigger` en cada tabla nueva.
- **Convenciones ya establecidas y probadas** (`docs/DATABASE.md`, "Convenciones"): `uuid` + `gen_random_uuid()`, `created_at`/`updated_at`, estados `text`+`CHECK`, `on delete restrict`, `is_active` en vez de borrado físico. Se siguen sin modificarlas.
- **Principio arquitectónico ya vigente** (`docs/ARCHITECTURE.md`, Principios #2): *"Las tablas con máquinas de estado (seriales, garantías, correcciones, reclamos) no tienen políticas INSERT/UPDATE/DELETE para `authenticated`; solo se modifican a través de funciones. El catálogo (productos, tiendas, lotes) se escribe directo con políticas solo-admin"* — esta frase, ya aprobada en la Fase 0, **decide por sí sola** el punto 10 del encargo (qué es directo y qué es RPC). No es una decisión nueva de esta revisión, es la aplicación literal de algo que ya se aprobó.
- **Checklist de `SECURITY DEFINER`** (`docs/SECURITY.md`) — incluye ya la lección real de Fase 1 ("`REVOKE ... FROM public` no basta en Supabase, hay que revocar de `anon` explícitamente"), aplicable directamente a cualquier RPC nueva de seriales.

## 3. Qué debe construirse en Fase 2

- Tablas `products`, `lots`, `serials` (sin `serial_imports`/`serial_import_rows` — eso es Fase 3, aunque una columna de `serials` debe anticiparlas, ver §9).
- Función `private.normalize_serial_code(text) returns text` — normalización única, reutilizada por Fase 2 y Fase 3.
- Trigger `BEFORE INSERT OR UPDATE` en `serials` que normaliza `serial`/`barcode` antes de guardar.
- RPC: `create_serial`, `block_serial`, `unblock_serial`, `void_serial`.
- Función interna `private.check_serial_collision(p_serial, p_barcode, p_exclude_id)` — la usan `create_serial` ahora y `stage_import_rows` en Fase 3, para no duplicar la lógica de colisión serial↔barcode.
- Políticas RLS + grants de las 3 tablas.
- Triggers `set_updated_at` y `audit_row_change` en `products` y `lots` (en `serials` también, ver §7).
- Trigger que mantiene `lots.imported_count` sincronizado con el conteo real de `serials` (no confiar en que cada RPC lo actualice a mano).
- UI admin: listar/crear/editar productos y lotes (CRUD directo vía Supabase client), listar/crear/bloquear/desbloquear/anular seriales (vía las RPC).
- pgTAP: aislamiento seller↔admin sobre las 3 tablas nuevas, transiciones de estado de `serials`, colisión serial↔barcode, FK compuesta.

## 4. Modelo de datos propuesto

### `products`

```
id uuid pk default gen_random_uuid()
code text not null unique
name text not null
description text
how_it_works text
warranty_conditions text not null default ''
warranty_exclusions text[] not null default '{}'
default_warranty_days integer not null check (default_warranty_days > 0)
is_active boolean not null default true
created_at / updated_at timestamptz
```

Coincide con `docs/DATABASE.md`. Dos ajustes sobre lo ya documentado:
- `warranty_conditions`/`warranty_exclusions` con `not null default` (mismo patrón que `app_settings.default_warranty_exclusions`, ya probado en Fase 1) — evita que Fase 5 tenga que hacer `coalesce()` al copiar el snapshot.
- `default_warranty_days` se sugiere al admin desde `app_settings.default_warranty_days` (ya existe, columna real, Fase 1) **en el formulario**, no como `DEFAULT` de columna — un `DEFAULT` de Postgres no puede leer una tabla mutable en el momento del INSERT sin un trigger adicional, y no vale la pena: es un valor de partida editable, no una regla.

### `lots`

```
id uuid pk default gen_random_uuid()
product_id uuid not null references products(id) on delete restrict
code text not null
warranty_days integer not null check (warranty_days > 0)
received_on date
expected_count integer
imported_count integer not null default 0
is_active boolean not null default true
created_at / updated_at timestamptz
unique (id, product_id)      -- para la FK compuesta de serials
unique (product_id, code)    -- ver hallazgo abajo
```

**Hallazgo real, no una preferencia**: `docs/DATABASE.md` dice `lots`: "`code` unique" (a secas, global). El propio ejemplo del encargo original (`docs/PROJECT-PLAN.md` §14, vía el master prompt) usa códigos de lote genéricos tipo `IMPORT-001`. Si `code` es único **globalmente**, dos productos distintos jamás podrán reutilizar un esquema de nombrado de lotes razonable (`IMPORT-001` para el producto A bloquea `IMPORT-001` para el producto B). Recomiendo **`unique(product_id, code)`** en vez de `unique(code)` global — es la lectura correcta de la intención, no un cambio de diseño. Es la **decisión #1 de la sección 13** si el usuario prefiere mantenerlo global.

`warranty_days` se copia de `products.default_warranty_days` **al crear el lote** (снapshot de un nivel) y desde ahí es la autoridad — así lo dice ya `docs/DATABASE.md`, "Decisiones del modelo". Editar `lots.warranty_days` después de creado el lote es **seguro**: solo afecta a activaciones futuras de seriales `AVAILABLE` de ese lote, nunca a garantías ya activadas (el snapshot real ocurre en `activate_warranty`, Fase 5, no aquí). Esto confirma directamente la petición de "atención especial": el modelo **no necesita rediseño** para que Producto→Lote→Serial→Garantía funcione con snapshots correctos en cascada.

### `serials`

```
id uuid pk default gen_random_uuid()
product_id uuid not null references products(id) on delete restrict
lot_id uuid not null references lots(id) on delete restrict
serial text not null unique
barcode text not null unique
status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ACTIVATED','BLOCKED','VOID'))
status_reason text
import_id uuid            -- sin FK todavía (ver §9); columna lista para Fase 3
created_at / updated_at timestamptz
foreign key (lot_id, product_id) references lots (id, product_id)
check (status_reason is not null or status not in ('BLOCKED','VOID'))
```

`product_id` es redundante respecto a `lot_id → lots.product_id`, y es **intencional**: es lo que hace posible la FK compuesta `(lot_id, product_id)` que impide que un serial "pertenezca" a un lote de un producto distinto — exactamente la garantía de integridad que ya pedía `docs/DATABASE.md`. No es normalización descuidada, es el mecanismo.

## 5. RLS y permisos

| Tabla | Admin | Seller |
|---|---|---|
| `products` | `for all using (is_admin()) with check (is_admin())` — mismo molde que `stores_admin_all` | `for select using (is_active and (is_admin() or current_store_id() is not null))` — mismo molde que `app_settings_select`; ve **todas** las columnas de un producto activo (son datos comerciales/de garantía, no inventario — ya lo dice `docs/ARCHITECTURE.md`, "Mínimo dato necesario") |
| `lots` | `for all using (is_admin())` | **Ninguna política** — cero acceso directo, tal como ya dice `docs/DATABASE.md` |
| `serials` | **Ninguna política de escritura** (ni para admin) — solo lectura: `for select using (is_admin())`. Toda escritura pasa por RPC | **Ninguna política**, ni de lectura. Acceso exclusivamente vía `lookup_serial` (Fase 5, ya diseñada) |

`serials` sin política de escritura ni para `admin` es la parte que más se presta a "corregir por comodidad" — no lo hagan: es la aplicación literal del principio ya aprobado en Fase 0 (§2 de este documento). Mantiene una sola vía de escritura (las 4 RPC) con normalización y validación de colisión garantizadas siempre, sin importar quién llame.

Grants de tabla (mismo patrón explícito que `rls.sql`, no asumir nada del setup por defecto):
- `products`: `select, insert, update, delete` a `authenticated` (RLS decide quién puede cada cosa).
- `lots`: igual.
- `serials`: **solo `select`** a `authenticated` — sin `insert/update/delete` en absoluto, ni para admin. Las RPC (`SECURITY DEFINER`, dueñas de la tabla) escriben sin necesitar ese grant.

## 6. RPC necesarias

Solo para `serials` — `products`/`lots` **no necesitan RPC**, son catálogo de escritura directa (ver §2/§3). Inventar una RPC para crear un producto sería sobreingeniería: `/admin/ajustes` ya prueba que un `.update()` directo gated por RLS funciona bien para catálogo (`lib/actions/app-settings.ts`).

| RPC | Quién | Transición válida | Qué hace |
|---|---|---|---|
| `create_serial(p_product_id, p_lot_id, p_serial, p_barcode)` | admin | — → `AVAILABLE` | Verifica `is_admin()`; verifica que el lote pertenezca al producto y esté activo (`lots.is_active`); normaliza ambos códigos; corre `private.check_serial_collision`; inserta |
| `block_serial(p_serial_id, p_reason)` | admin | `AVAILABLE` → `BLOCKED` | `p_reason` obligatorio (`not null`, `length > 0`) |
| `unblock_serial(p_serial_id)` | admin | `BLOCKED` → `AVAILABLE` | — |
| `void_serial(p_serial_id, p_reason)` | admin | `AVAILABLE` o `BLOCKED` → `VOID` | Permanente: ninguna función posterior debe poder sacar un serial de `VOID` — ni siquiera existe un `unvoid_serial` |

Ninguna acepta `store_id` (no aplica a este dominio) ni fechas. Todas re-verifican `is_admin()` contra `profiles` al inicio, `search_path=''`, `revoke execute from anon` **explícito** (no solo `from public` — lección ya documentada en `docs/SECURITY.md` tras el bug real de `log_audit_event`).

`ACTIVATED` no es alcanzable por ninguna RPC de esta fase — solo lo pondrá `activate_warranty` en la Fase 5. Esto ya es coherente sin cambios: el `CHECK` de `status` permite el valor, pero ninguna función de Fase 2 lo asigna.

## 7. Auditoría

Reutilizar `private.audit_row_change()` tal cual, sin tocarla: agregar
```sql
create trigger audit_products after insert or update or delete on public.products
  for each row execute function private.audit_row_change();
create trigger audit_lots after insert or update or delete on public.lots
  for each row execute function private.audit_row_change();
create trigger audit_serials after insert or update or delete on public.serials
  for each row execute function private.audit_row_change();
```
El trigger es `AFTER`, así que audita el resultado real de la operación sin importar si vino de un `UPDATE` directo (`products`/`lots`) o del `UPDATE` interno de una RPC (`serials`) — cero código adicional en cada RPC para auditar. El diff `old_data`/`new_data` en JSON ya deja ver el cambio de `status` y el `status_reason`, así que no hace falta una acción semántica tipo `'block'`/`'void'` en `audit_logs.action` para Fase 2 — quedaría como `'update'` genérico, legible igual vía el JSON. Etiquetar acciones más descriptivas (si el visor de auditoría de la Fase 8 lo llega a necesitar) es una mejora menor y diferible, no un requisito de Fase 2.

## 8. Índices

- Únicos: `products(code)`, `lots(product_id, code)` (ver hallazgo §4), `serials(serial)`, `serials(barcode)`, `lots(id, product_id)` (soporte de la FK compuesta).
- `serials(lot_id, status)` — ya documentado en `docs/DATABASE.md`.
- Parcial `serials(status) where status = 'AVAILABLE'` — ya documentado; es el que más importa a escala (ver §9).
- `serials(product_id)` — para listar/contar seriales de un producto a través de varios lotes sin pasar por `lot_id`.
- `serials(import_id)` — vacío hasta la Fase 3, pero crearlo ahora evita un `CREATE INDEX` sobre una tabla ya grande más adelante.
- Parciales `products(code) where is_active`, `lots(product_id) where is_active` — para los filtros "solo activos" que ya va a usar tanto el admin como la política RLS del seller.

## 9. Preparación para grandes volúmenes (Fase 3: 100k / 300k / 1M)

1. **`serials.import_id` sin FK todavía.** `serial_imports` no existe hasta la Fase 3. Crear la columna ahora como `uuid null` **sin** `references serial_imports(id)`, y que la migración de Fase 3 agregue la restricción con `ALTER TABLE serials ADD CONSTRAINT ... FOREIGN KEY (import_id) REFERENCES serial_imports(id)` una vez esa tabla exista. Así Fase 2 no depende de una tabla que todavía no se diseña, y Fase 3 no tiene que alterar una tabla `serials` que para entonces puede ya tener cientos de miles de filas.
2. **`private.check_serial_collision()` compartida.** Escribirla ahora como una función SQL de solo lectura (dos `EXISTS` contra los índices únicos de `serial`/`barcode`) para que `create_serial` (Fase 2) y `stage_import_rows` (Fase 3) llamen exactamente la misma lógica — evita que la importación masiva defina sus propias reglas de colisión ligeramente distintas a las del alta manual.
3. **El trigger `BEFORE INSERT` de normalización no es un cuello de botella real**: es un `trim`/`upper` por fila; el costo de I/O de insertar 1M filas domina por completo. No hay que evitarlo por rendimiento.
4. **El índice parcial `serials(status) where status='AVAILABLE'`** es lo que hace viable a escala tanto el dashboard ("cuántos disponibles") como la futura `lookup_serial`: no crece con el histórico de seriales ya `ACTIVATED`.
5. **Nada en el modelo de Fase 2 obliga a re-escribir `serials` en Fase 3.** La tabla de staging (`serial_import_rows`) es independiente; el commit final hacia `serials` es un `INSERT ... SELECT ... ON CONFLICT DO NOTHING` contra las mismas columnas y los mismos índices únicos que Fase 2 ya deja listos.

## 10. Casos límite

- **Colisión cruzada serial↔barcode no es expresable como un `UNIQUE` de columna** (son dos columnas de la misma fila). Debe validarse en `private.check_serial_collision()`, a nivel de aplicación/RPC — un `EXCLUDE` constraint que cubra esto sería una complejidad real de Postgres para un beneficio marginal frente a una función de ~5 líneas.
- **Desactivar un producto con lotes/seriales activos**: se permite sin bloquear (no hay cascada automática); la UI muestra una advertencia informativa ("N lotes activos"), no un candado. No desactiva lotes ni bloquea seriales en cascada — eso sería una acción implícita sorprendente; si el admin quiere congelar el inventario, desactiva el lote o bloquea seriales explícitamente.
- **Desactivar un lote con seriales `AVAILABLE`**: se permite; `create_serial` debe rechazar agregar seriales nuevos a un lote inactivo (`lots.is_active = false` → error explícito), pero los seriales ya existentes conservan su estado.
- **Eliminar (DELETE físico) un producto/lote con hijos**: bloqueado por `on delete restrict` — defensa en profundidad, dado que no existe ninguna acción de "eliminar" en la UI (solo `is_active`).
- **Intentar `void_serial` sobre un serial `ACTIVATED`**: rechazado por la RPC — la Fase 6 (`void_warranty`) es quien gobierna el ciclo de vida de un serial ya usado, no `void_serial`.
- **Dos administradores creando el mismo `serial` a la vez**: el índice único falla la segunda transacción con un error de Postgres claro; no hace falta bloqueo explícito, es el mismo patrón que ya prueban los pgTAP de Fase 1 para condiciones de carrera.

## 11. Tests necesarios (pgTAP, siguiendo el estilo real de Fase 1)

Mismo patrón ya usado y verificado en `supabase/tests/database/02_rls_isolation.sql` (`set local role authenticated; set local request.jwt.claims to ...`):

- Admin puede CRUD `products`/`lots`; seller solo ve activos, sin poder escribir (RLS filtra el `UPDATE`/`INSERT` a 0 filas o `permission denied` según corresponda — **repasar el grant de tabla antes de escribir el `throws_like`**, el mismo error que se cometió y se corrigió en Fase 1 con `stores`/`app_settings`).
- Seller sin ningún acceso a `lots`/`serials`, ni por `SELECT` directo.
- FK compuesta: intentar insertar un `serial` con `lot_id`/`product_id` inconsistentes → falla.
- Transiciones de `serials`: `create_serial` dos veces con el mismo código → falla por unicidad; `block_serial` sobre `ACTIVATED` (simulado) → falla; `void_serial` sobre `VOID` → falla; `unblock_serial` sobre `AVAILABLE` → falla (no hay nada que desbloquear).
- Colisión serial↔barcode: crear serial A con `barcode = "X"`, luego intentar crear serial B con `serial = "X"` → falla.
- Normalización: crear `" abc-001 "` y `"ABC-001"` deben colisionar como el mismo código.
- `create_serial` sobre un lote de otro producto → falla (verifica la relación, no solo la FK).
- `create_serial` sobre un lote inactivo → falla.
- Vendedor invocando cualquiera de las 4 RPC → falla (verificación del rol dentro de la función, no solo RLS — checklist de `docs/SECURITY.md`).

## 12. Riesgos

- **`lots.code` único global vs. por producto** (§4): si se implementa como único global y el negocio ya tiene lotes con códigos repetidos entre productos, habrá fricción real desde el primer uso. Decisión de bajo costo de corregir ahora, alto costo de corregir después con datos ya cargados.
- **`import_id` sin FK temporalmente** (§9): si se olvida agregar la restricción en la migración de Fase 3, `serials.import_id` podría apuntar a imports inexistentes sin que la base lo impida. Mitigación: dejarlo anotado explícitamente en el checklist de Fase 3.
- **Seriales no asignados a tiendas sigue abierto** (`docs/SECURITY.md`, "Riesgo de negocio abierto") — Fase 2 NO lo resuelve ni lo prejuzga (ver §13, decisión pendiente). Confirmado compatible: es aditivo (una columna `store_id` nullable en `lots` el día que se decida), no requiere tocar la unicidad global de `serial`/`barcode`.
- **`imported_count` desincronizado** si algún camino de escritura futuro inserta en `serials` sin pasar por el trigger de conteo — mitigado precisamente por hacerlo un trigger genérico sobre `serials`, no una actualización manual en cada RPC.

## 13. Decisiones que necesito que tomes tú

1. **`lots.code`: ¿único por producto (recomendado) o único globalmente** (como dice hoy `docs/DATABASE.md`)? Afecta directamente cómo se van a nombrar los lotes en la operación real.
2. **¿Los seriales se asignan a tiendas específicas, o cualquier tienda puede activar cualquier serial disponible** (riesgo de negocio ya documentado, no técnico)? No bloquea Fase 2 — se puede decidir más adelante sin romper nada — pero si ya tienes la respuesta, mejor dejarla escrita ahora.
3. **`products.code` — ¿debe ser inmutable una vez creado?** Técnicamente es seguro editarlo (nada referencia por `code`, todo usa `id`), pero si tu operación usa el código en etiquetas/documentos externos al sistema, podría convenir bloquear su edición después de creado. Sin restricción técnica que lo obligue; es una decisión de proceso.
4. **`lots.expected_count`: ¿informativo (recomendado) o debe bloquear el import si no coincide?** Recomiendo informativo — Fase 3 ya valida el archivo por sí sola.

## 14. Cambios recomendados a `PROJECT-PLAN.md`

Ninguno directo: `docs/PROJECT-PLAN.md` es el registro histórico congelado (ya se estableció así en su "Registro de revisión — 2026-09-14 (v2)"); las correcciones de diseño se canalizan a `docs/DATABASE.md`, que sí es la fuente viva. Cuando se implemente Fase 2, `docs/DATABASE.md` debe actualizarse con:
- La tabla `lots` con `unique(product_id, code)` en vez de `unique(code)` (o confirmar explícitamente que se mantiene global, según lo que decidas en §13.1).
- Las 4 RPC de `serials` (`create_serial`, `block_serial`, `unblock_serial`, `void_serial`) en la tabla "RPC críticos".
- La nota de que `serials.import_id` se crea sin FK y la Fase 3 la completa.
- Los índices nuevos de §8.

## 15. Veredicto

**LISTO PARA IMPLEMENTAR FASE 2**

El modelo documentado en `docs/DATABASE.md` es sólido y compatible con Producto → Lote → Serial → Garantía sin necesitar rediseño en la Fase 5 (verificado columna por columna en §4 y §22 del análisis). Los principios de la Fase 0 (`docs/ARCHITECTURE.md` Principios #2) ya deciden qué es directo y qué es RPC — no hay ambigüedad de diseño pendiente. Las 4 decisiones de §13 son afinamientos de bajo riesgo (con una recomendación clara para cada una), no bloqueos: se puede empezar a implementar con las recomendaciones de este documento y ajustar sobre la marcha si decides algo distinto en `lots.code` antes de escribir la migración correspondiente.
