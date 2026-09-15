-- Fase 5 — Activación de garantías
--
-- Tabla ya especificada desde la Fase 0 (docs/PROJECT-PLAN.md, sección D;
-- docs/DATABASE.md, "Tablas"/"Decisiones del modelo") — se implementa tal
-- cual estaba documentada, no se inventa un esquema nuevo. Snapshot
-- histórico completo (no depende de products/lots vigentes), 1 serial → 1
-- garantía (UNIQUE + FOR UPDATE en la RPC), trigger que congela todo salvo
-- los campos de cliente y los de anulación (reservados para void_warranty,
-- Fase 6 — no se usan todavía, pero el esquema ya les deja sitio para no
-- tener que volver a tocar este trigger).
--
-- Deliberadamente fuera de esta migración (alcance real de Fase 5, ver
-- CLAUDE.md/encargo de la sesión):
-- - warranty_corrections/warranty_claims/technical_reports (Fase 6/7).
-- - notifications (outbox de email) y el INSERT que activate_warranty haría
--   ahí según el diseño original — no existe la tabla, y correo/Resend es
--   explícitamente Fase 6. La auditoría de la activación no depende de esto
--   (la da el trigger genérico, no un insert manual al outbox).
-- - warranties_view (estado derivado ACTIVE/EXPIRED/EXPIRING_SOON/VOIDED):
--   ninguna pantalla de Fase 5 necesita esa granularidad; se agrega cuando
--   Fase 6/7 la necesiten para elegibilidad de correcciones/reclamos.
-- - Índices de autocompletado de cliente (customer_national_id/whatsapp,
--   GIN pg_trgm sobre customer_name): la función de autocompletado no es
--   parte del alcance pedido para Fase 5.

create table public.warranties (
  id uuid primary key default gen_random_uuid(),
  serial_id uuid not null unique references public.serials (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  seller_id uuid not null references auth.users (id) on delete restrict,
  activated_at timestamptz not null default now(),
  duration_days integer not null,
  expires_at timestamptz not null,
  store_attention_days integer not null,
  -- snapshot: nunca se relee de products/lots después de activar
  product_id uuid not null references public.products (id) on delete restrict,
  product_code text not null,
  product_name text not null,
  serial text not null,
  barcode text not null,
  lot_code text not null,
  conditions text not null,
  exclusions text[] not null default '{}',
  -- cliente: única parte editable, y solo por RPC (ver update_warranty_customer)
  customer_name text not null,
  customer_national_id text not null,
  customer_whatsapp text not null,
  -- anulación: reservado para void_warranty (Fase 6), sin usar todavía
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  voided_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warranties_duration_positive check (duration_days > 0),
  constraint warranties_expires_after_activation check (expires_at > activated_at),
  constraint warranties_customer_name_not_blank check (length(trim(customer_name)) > 0),
  constraint warranties_customer_national_id_not_blank check (length(trim(customer_national_id)) > 0),
  constraint warranties_customer_whatsapp_not_blank check (length(trim(customer_whatsapp)) > 0)
);

comment on table public.warranties is
  'Snapshot histórico e inmutable de una activación. serial_id UNIQUE es el "doble cinturón": aunque activate_warranty tuviera un bug, la base impide dos garantías para el mismo serial. Solo customer_*/voided_* pueden cambiar después de creada (ver private.warranties_guard_immutable).';

-- ---------------------------------------------------------------------------
-- Inmutabilidad: nada del snapshot, las fechas, la duración, el serial, la
-- tienda o el vendedor puede cambiar después de creada la garantía — para
-- ningún rol, ni siquiera admin (no hay política UPDATE para nadie salvo
-- las RPC, que corren como el owner de la tabla). Los únicos campos que
-- SÍ pueden cambiar: customer_name/national_id/whatsapp (RPC
-- update_warranty_customer, dentro de las 24h) y voided_at/by/reason (RPC
-- void_warranty, Fase 6).
-- ---------------------------------------------------------------------------
create or replace function private.warranties_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.serial_id is distinct from old.serial_id
    or new.store_id is distinct from old.store_id
    or new.seller_id is distinct from old.seller_id
    or new.activated_at is distinct from old.activated_at
    or new.duration_days is distinct from old.duration_days
    or new.expires_at is distinct from old.expires_at
    or new.store_attention_days is distinct from old.store_attention_days
    or new.product_id is distinct from old.product_id
    or new.product_code is distinct from old.product_code
    or new.product_name is distinct from old.product_name
    or new.serial is distinct from old.serial
    or new.barcode is distinct from old.barcode
    or new.lot_code is distinct from old.lot_code
    or new.conditions is distinct from old.conditions
    or new.exclusions is distinct from old.exclusions
    or new.created_at is distinct from old.created_at
  then
    raise exception 'warranties: solo los campos de cliente o de anulación pueden modificarse después de activar';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger warranties_guard_immutable
  before update on public.warranties
  for each row execute function private.warranties_guard_immutable();

create trigger audit_warranties
  after insert or update or delete on public.warranties
  for each row execute function private.audit_row_change();

-- store_id, activated_at desc: el listado de garantías de una tienda
-- (app/tienda). serial_id ya es UNIQUE (índice implícito).
create index warranties_store_activated_idx on public.warranties (store_id, activated_at desc);

-- ---------------------------------------------------------------------------
-- RLS: escritura solo por RPC (sin grant de insert/update/delete para
-- nadie). Mismo molde que serials_admin_select de phase2_rls.sql.
-- ---------------------------------------------------------------------------
alter table public.warranties enable row level security;

revoke all on public.warranties from authenticated;
grant select on public.warranties to authenticated;

create policy warranties_admin_select
  on public.warranties for select
  to authenticated
  using ((select private.is_admin()));

create policy warranties_seller_select
  on public.warranties for select
  to authenticated
  using (store_id = (select private.current_store_id()));

-- ---------------------------------------------------------------------------
-- lookup_serial: solo lectura, solo vendedor activo. Nunca expone lot_id,
-- import_id ni status_reason — la lista de columnas de RETURNS TABLE es en
-- sí misma el contrato de "mínimo dato necesario" (ver docs/ARCHITECTURE.md).
-- Coincidencia exacta por serial O barcode (ambos únicos y sin colisión
-- cruzada entre sí, garantizado por private.check_serial_collision desde la
-- Fase 2, así que como mucho hay una fila).
-- ---------------------------------------------------------------------------
create or replace function public.lookup_serial(p_code text)
returns table (
  serial_id uuid,
  serial text,
  barcode text,
  product_code text,
  product_name text,
  warranty_duration_days integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := private.normalize_code(p_code);
begin
  if (select private.current_store_id()) is null then
    raise exception 'only an active seller can look up serials' using errcode = '42501';
  end if;

  return query
  select s.id, s.serial, s.barcode, p.code, p.name, l.warranty_days, s.status
  from public.serials s
  join public.products p on p.id = s.product_id
  join public.lots l on l.id = s.lot_id
  where s.serial = v_code or s.barcode = v_code;
end;
$$;

comment on function public.lookup_serial(text) is
  'Solo vendedor activo. Coincidencia exacta, columnas mínimas (nunca lot_id/import_id/status_reason). Sin auditoría: es de solo lectura y se puede llamar mientras el usuario todavía está escribiendo/escaneando.';

revoke all on function public.lookup_serial(text) from public;
revoke all on function public.lookup_serial(text) from anon;
grant execute on function public.lookup_serial(text) to authenticated;

-- ---------------------------------------------------------------------------
-- activate_warranty: única forma de crear una garantía. Transaccional (la
-- función completa es la transacción de la llamada RPC): o se aplica todo
-- (warranty + serial→ACTIVATED) o nada. "FOR UPDATE" sobre el serial es lo
-- que resuelve la concurrencia real: dos llamadas simultáneas para el mismo
-- serial se serializan ahí — la segunda espera, y cuando el lock se libera
-- relee el estado ya en ACTIVATED y falla con un mensaje claro, nunca crea
-- una segunda garantía. La firma no acepta ninguna fecha ni store_id: salen
-- siempre de auth.uid()/private.current_store_id(), nunca del cliente.
-- ---------------------------------------------------------------------------
create or replace function public.activate_warranty(p_code text, p_customer jsonb)
returns table (
  warranty_id uuid,
  activated_at timestamptz,
  expires_at timestamptz,
  duration_days integer,
  product_name text,
  serial text,
  barcode text,
  lot_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
  v_seller_id uuid := auth.uid();
  v_code text := private.normalize_code(p_code);
  v_serial public.serials%rowtype;
  v_product public.products%rowtype;
  v_lot public.lots%rowtype;
  v_customer_name text := trim(p_customer ->> 'name');
  v_customer_national_id text := private.normalize_code(p_customer ->> 'national_id');
  v_customer_whatsapp text := trim(p_customer ->> 'whatsapp');
  v_store_attention_days integer;
  v_duration_days integer;
  v_activated_at timestamptz := now();
  v_expires_at timestamptz;
  v_warranty_id uuid;
begin
  if v_store_id is null then
    raise exception 'only an active seller can activate warranties' using errcode = '42501';
  end if;

  if v_customer_name is null or length(v_customer_name) = 0 then
    raise exception 'customer name is required';
  end if;
  if v_customer_national_id is null or length(v_customer_national_id) = 0 then
    raise exception 'customer national id is required';
  end if;
  if v_customer_whatsapp is null or length(v_customer_whatsapp) = 0 then
    raise exception 'customer whatsapp is required';
  end if;
  if v_customer_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'customer whatsapp must be in E.164 format';
  end if;

  -- "serial"/"barcode" están calificados con el alias "s": son también
  -- columnas de RETURNS TABLE (por eso quedan como variables visibles en
  -- todo el cuerpo de la función), y sin calificar Postgres no puede saber
  -- si "serial = v_code" se refiere a la variable de salida o a la columna
  -- de la tabla ("column reference is ambiguous", encontrado al correr el
  -- pgTAP real de esta migración).
  select s.* into v_serial from public.serials s where s.serial = v_code or s.barcode = v_code for update;
  if v_serial.id is null then
    raise exception 'serial not found';
  end if;
  if v_serial.status = 'ACTIVATED' then
    raise exception 'serial already activated';
  end if;
  if v_serial.status = 'BLOCKED' then
    raise exception 'serial is blocked';
  end if;
  if v_serial.status = 'VOID' then
    raise exception 'serial is void';
  end if;
  -- única posibilidad restante: AVAILABLE (constraint de la tabla serials)

  select * into v_product from public.products where id = v_serial.product_id;
  if not v_product.is_active then
    raise exception 'product is not active';
  end if;

  select * into v_lot from public.lots where id = v_serial.lot_id;
  if not v_lot.is_active then
    raise exception 'lot is not active';
  end if;

  v_duration_days := v_lot.warranty_days;
  v_expires_at := v_activated_at + (v_duration_days || ' days')::interval;
  select store_attention_days into v_store_attention_days from public.app_settings where id = true;

  insert into public.warranties (
    serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
    product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
    customer_name, customer_national_id, customer_whatsapp
  )
  values (
    v_serial.id, v_store_id, v_seller_id, v_activated_at, v_duration_days, v_expires_at,
    v_store_attention_days,
    v_product.id, v_product.code, v_product.name, v_serial.serial, v_serial.barcode, v_lot.code,
    v_product.warranty_conditions, v_product.warranty_exclusions,
    v_customer_name, v_customer_national_id, v_customer_whatsapp
  )
  returning id into v_warranty_id;

  update public.serials set status = 'ACTIVATED' where id = v_serial.id;

  return query
  select v_warranty_id, v_activated_at, v_expires_at, v_duration_days,
         v_product.name, v_serial.serial, v_serial.barcode, v_lot.code;
end;
$$;

comment on function public.activate_warranty(text, jsonb) is
  'Única vía para crear una garantía. p_customer: {"name","national_id","whatsapp"}. Transacción única: FOR UPDATE sobre el serial serializa activaciones concurrentes del mismo serial (la segunda ve el estado ya ACTIVATED y falla, nunca crea una segunda garantía). warranties.serial_id UNIQUE es el respaldo si algo fallara.';

revoke all on function public.activate_warranty(text, jsonb) from public;
revoke all on function public.activate_warranty(text, jsonb) from anon;
grant execute on function public.activate_warranty(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- update_warranty_customer: única edición permitida sobre una garantía ya
-- activada, y solo dentro de las 24h siguientes a la activación (ver
-- docs/PROJECT-PLAN.md, sección H). Pasadas las 24h, la vía es
-- request_correction/decide_correction — Fase 6, no implementado aquí.
-- ---------------------------------------------------------------------------
create or replace function public.update_warranty_customer(p_warranty_id uuid, p_customer jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
  v_warranty public.warranties%rowtype;
  v_customer_name text := trim(p_customer ->> 'name');
  v_customer_national_id text := private.normalize_code(p_customer ->> 'national_id');
  v_customer_whatsapp text := trim(p_customer ->> 'whatsapp');
begin
  if v_store_id is null then
    raise exception 'only an active seller can edit warranty customer data' using errcode = '42501';
  end if;

  select * into v_warranty from public.warranties where id = p_warranty_id for update;
  if v_warranty.id is null then
    raise exception 'warranty not found';
  end if;
  if v_warranty.store_id <> v_store_id then
    raise exception 'warranty belongs to another store' using errcode = '42501';
  end if;
  if now() >= v_warranty.activated_at + interval '24 hours' then
    raise exception 'edit window has expired';
  end if;

  if v_customer_name is null or length(v_customer_name) = 0 then
    raise exception 'customer name is required';
  end if;
  if v_customer_national_id is null or length(v_customer_national_id) = 0 then
    raise exception 'customer national id is required';
  end if;
  if v_customer_whatsapp is null or length(v_customer_whatsapp) = 0 then
    raise exception 'customer whatsapp is required';
  end if;
  if v_customer_whatsapp !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'customer whatsapp must be in E.164 format';
  end if;

  update public.warranties
  set customer_name = v_customer_name,
      customer_national_id = v_customer_national_id,
      customer_whatsapp = v_customer_whatsapp
  where id = p_warranty_id;
end;
$$;

comment on function public.update_warranty_customer(uuid, jsonb) is
  'Solo campos de cliente, solo de su propia tienda, solo si now() < activated_at + 24h. Auditado por el trigger genérico (old_data/new_data muestran el cambio).';

revoke all on function public.update_warranty_customer(uuid, jsonb) from public;
revoke all on function public.update_warranty_customer(uuid, jsonb) from anon;
grant execute on function public.update_warranty_customer(uuid, jsonb) to authenticated;
