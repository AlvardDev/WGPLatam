-- Código de barras opcional al crear/importar seriales — se puede completar
-- después. Activar una garantía con un serial sin barcode NO está prohibido,
-- pero exige autorización explícita de un admin (serial_barcode_waivers,
-- mismo patrón ya usado por warranty_corrections: solicitud del vendedor →
-- decisión del admin). warranties.barcode pasa a nullable: una garantía
-- activada con autorización guarda ese snapshot sin barcode, a propósito.
-- No se reescribe ninguna migración histórica (mismo criterio que
-- 20260916110000_fix_warranties_guard_message_encoding.sql): las funciones
-- se redefinen acá con create or replace.
--
-- Nota de diseño: la comparación "=" con NULL en Postgres nunca es
-- verdadera, así que toda la detección de colisión/duplicados existente
-- (private.check_serial_collision, los joins de stage_import_rows y
-- commit_import_batch) YA es NULL-safe sin tocarla — un barcode ausente
-- simplemente nunca "choca" con nada. Solo hace falta: permitir NULL en las
-- columnas, dejar de tratar "falta barcode" como error de importación, y
-- resolver la autorización al activar.

alter table public.serials alter column barcode drop not null;
alter table public.serial_import_rows alter column barcode drop not null;
alter table public.serial_imports add column missing_barcode_rows integer not null default 0;
alter table public.warranties alter column barcode drop not null;

comment on column public.serial_imports.missing_barcode_rows is
  'Congelado al completar el import (commit_import_batch), como total_rows/valid_rows/etc — sobrevive a purge_import_staging.';

-- ---------------------------------------------------------------------------
-- serial_barcode_waivers: solicitud del vendedor para activar un serial sin
-- código de barras, y decisión del admin. Mismo shape que warranty_corrections
-- (Fase 6): status PENDING/APPROVED/REJECTED, decided_by/at/note, historial
-- completo (una fila por solicitud, nunca se sobrescribe). store_id es la
-- tienda del vendedor que pide, no del serial (los seriales son globales,
-- sin tienda asignada hasta la activación).
-- ---------------------------------------------------------------------------
create table public.serial_barcode_waivers (
  id uuid primary key default gen_random_uuid(),
  serial_id uuid not null references public.serials (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  requested_by uuid not null references auth.users (id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

comment on table public.serial_barcode_waivers is
  'Autorización para activar una garantía con un serial sin código de barras. Solo lookup_serial/request_barcode_waiver/decide_barcode_waiver la tocan o la exponen — el resto es RLS de solo lectura.';

-- Como máximo una solicitud PENDING por serial a la vez (mismo criterio que
-- warranty_corrections_pending_unique) — no bloquea volver a pedir tras un
-- REJECTED, ese historial queda como fila aparte.
create unique index serial_barcode_waivers_pending_unique
  on public.serial_barcode_waivers (serial_id)
  where status = 'PENDING';

create index serial_barcode_waivers_serial_idx on public.serial_barcode_waivers (serial_id, created_at desc);
create index serial_barcode_waivers_store_idx on public.serial_barcode_waivers (store_id, created_at desc);

create trigger audit_serial_barcode_waivers
  after insert or update or delete on public.serial_barcode_waivers
  for each row execute function private.audit_row_change();

alter table public.serial_barcode_waivers enable row level security;

revoke all on public.serial_barcode_waivers from authenticated;
grant select on public.serial_barcode_waivers to authenticated;

create policy serial_barcode_waivers_admin_select
  on public.serial_barcode_waivers for select
  to authenticated
  using ((select private.is_admin()));

create policy serial_barcode_waivers_seller_select
  on public.serial_barcode_waivers for select
  to authenticated
  using (store_id = (select private.current_store_id()));

-- ---------------------------------------------------------------------------
-- request_barcode_waiver: solo vendedor activo, solo sobre un serial
-- AVAILABLE sin barcode.
-- ---------------------------------------------------------------------------
create or replace function public.request_barcode_waiver(p_serial_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
  v_serial public.serials%rowtype;
  v_waiver_id uuid;
begin
  if v_store_id is null then
    raise exception 'only an active seller can request a barcode waiver' using errcode = '42501';
  end if;

  select * into v_serial from public.serials where id = p_serial_id;
  if v_serial.id is null then
    raise exception 'serial not found';
  end if;
  if v_serial.barcode is not null then
    raise exception 'serial already has a barcode';
  end if;
  if v_serial.status <> 'AVAILABLE' then
    raise exception 'invalid state: serial must be AVAILABLE to request a barcode waiver (current: %)', v_serial.status;
  end if;

  insert into public.serial_barcode_waivers (serial_id, store_id, requested_by)
  values (p_serial_id, v_store_id, auth.uid())
  returning id into v_waiver_id;

  return v_waiver_id;
exception
  when unique_violation then
    raise exception 'a pending barcode waiver request already exists for this serial';
end;
$$;

revoke all on function public.request_barcode_waiver(uuid) from public;
revoke all on function public.request_barcode_waiver(uuid) from anon;
grant execute on function public.request_barcode_waiver(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decide_barcode_waiver: solo admin.
-- ---------------------------------------------------------------------------
create or replace function public.decide_barcode_waiver(
  p_waiver_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_waiver public.serial_barcode_waivers%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can decide barcode waivers' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_waiver from public.serial_barcode_waivers where id = p_waiver_id for update;
  if v_waiver.id is null then
    raise exception 'barcode waiver request not found';
  end if;
  if v_waiver.status <> 'PENDING' then
    raise exception 'barcode waiver request is not pending';
  end if;

  update public.serial_barcode_waivers
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
  where id = p_waiver_id;
end;
$$;

revoke all on function public.decide_barcode_waiver(uuid, text, text) from public;
revoke all on function public.decide_barcode_waiver(uuid, text, text) from anon;
grant execute on function public.decide_barcode_waiver(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- create_serial: p_barcode pasa a opcional. Igual que antes, serial<>barcode
-- y check_serial_collision se saltan solos cuando v_barcode es null.
-- ---------------------------------------------------------------------------
create or replace function public.create_serial(
  p_product_id uuid,
  p_lot_id uuid,
  p_serial text,
  p_barcode text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial text := private.normalize_code(p_serial);
  v_barcode text := nullif(private.normalize_code(p_barcode), '');
  v_lot public.lots%rowtype;
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can create serials' using errcode = '42501';
  end if;

  select * into v_lot from public.lots where id = p_lot_id;
  if v_lot.id is null then
    raise exception 'lot not found';
  end if;
  if v_lot.product_id <> p_product_id then
    raise exception 'lot does not belong to the given product';
  end if;
  if not v_lot.is_active then
    raise exception 'lot is not active';
  end if;

  if length(v_serial) = 0 then
    raise exception 'serial must not be empty';
  end if;
  if v_barcode is not null and v_serial = v_barcode then
    raise exception 'serial and barcode must differ';
  end if;

  perform private.check_serial_collision(v_serial, v_barcode);

  insert into public.serials (product_id, lot_id, serial, barcode, status)
  values (p_product_id, p_lot_id, v_serial, v_barcode, 'AVAILABLE')
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_serial(uuid, uuid, text, text) from public;
revoke all on function public.create_serial(uuid, uuid, text, text) from anon;
grant execute on function public.create_serial(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_serial_barcode: única forma de completar el barcode de un serial que
-- se creó/importó sin uno. Solo mientras está AVAILABLE (una vez ACTIVATED
-- el barcode ya quedó fijado en el snapshot de warranties; BLOCKED/VOID no
-- es un estado donde tenga sentido seguir completando datos — hay que
-- desbloquear primero si hiciera falta). Reusa check_serial_collision con
-- p_exclude_id, parámetro que ya existía sin ningún llamador.
-- ---------------------------------------------------------------------------
create or replace function public.set_serial_barcode(p_serial_id uuid, p_barcode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_barcode text := nullif(private.normalize_code(p_barcode), '');
  v_serial public.serials%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can edit serials' using errcode = '42501';
  end if;
  if v_barcode is null then
    raise exception 'barcode must not be empty';
  end if;

  select * into v_serial from public.serials where id = p_serial_id for update;
  if v_serial.id is null then
    raise exception 'serial not found';
  end if;
  if v_serial.status <> 'AVAILABLE' then
    raise exception 'invalid state: serial must be AVAILABLE to set its barcode (current: %)', v_serial.status;
  end if;
  if v_serial.serial = v_barcode then
    raise exception 'serial and barcode must differ';
  end if;

  perform private.check_serial_collision(v_serial.serial, v_barcode, p_serial_id);

  update public.serials set barcode = v_barcode where id = p_serial_id;
end;
$$;

revoke all on function public.set_serial_barcode(uuid, text) from public;
revoke all on function public.set_serial_barcode(uuid, text) from anon;
grant execute on function public.set_serial_barcode(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- stage_import_rows: un barcode vacío deja de ser ERROR. Único cambio real:
-- la clasificación. Los joins de duplicados/existentes no se tocan (ya son
-- NULL-safe).
-- ---------------------------------------------------------------------------
create or replace function public.stage_import_rows(p_import_id uuid, p_rows jsonb)
returns table(staged integer, valid_count integer, duplicate_count integer, error_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can stage import rows' using errcode = '42501';
  end if;

  select status into v_status from public.serial_imports where id = p_import_id for update;
  if v_status is null then
    raise exception 'import not found';
  end if;
  if v_status <> 'STAGING' then
    raise exception 'import is not in STAGING (current: %)', v_status;
  end if;

  with input_rows as materialized (
    select
      (r ->> 'row_number')::integer as row_number,
      private.normalize_code(r ->> 'serial') as serial,
      nullif(private.normalize_code(r ->> 'barcode'), '') as barcode
    from jsonb_array_elements(p_rows) as r
  ),
  input_keys as materialized (
    select row_number, serial as key from input_rows
    union all
    select row_number, barcode as key from input_rows
  ),
  key_dup_in_batch as materialized (
    select key from input_keys group by key having count(distinct row_number) > 1
  ),
  staged_keys as materialized (
    select row_number as staged_row, serial as key from public.serial_import_rows where import_id = p_import_id
    union all
    select row_number as staged_row, barcode as key from public.serial_import_rows where import_id = p_import_id
  ),
  existing_keys as materialized (
    select serial as key from public.serials
    union
    select barcode as key from public.serials
  ),
  row_flags as (
    select
      ik.row_number,
      bool_or(kdb.key is not null) as dup_in_batch,
      bool_or(sk.key is not null and sk.staged_row <> ik.row_number) as dup_staged,
      bool_or(ek.key is not null) as dup_existing
    from input_keys ik
    left join key_dup_in_batch kdb on kdb.key = ik.key
    left join staged_keys sk on sk.key = ik.key
    left join existing_keys ek on ek.key = ik.key
    group by ik.row_number
  ),
  classified as (
    select
      t.row_number, t.serial, t.barcode,
      case
        when t.serial is null or length(t.serial) = 0
          then 'ERROR'
        when t.barcode is not null and t.serial = t.barcode
          then 'ERROR'
        when rf.dup_in_batch or rf.dup_staged then 'DUPLICATE_IN_FILE'
        when rf.dup_existing then 'DUPLICATE_EXISTING'
        else 'VALID'
      end as status,
      case
        when t.serial is null or length(t.serial) = 0 then 'SERIAL_MISSING'
        when t.barcode is not null and t.serial = t.barcode then 'SERIAL_EQUALS_BARCODE'
      end as error_code
    from input_rows t
    join row_flags rf on rf.row_number = t.row_number
  ),
  upserted as (
    insert into public.serial_import_rows (import_id, row_number, serial, barcode, status, error_code)
    select p_import_id, c.row_number, c.serial, c.barcode, c.status,
      coalesce(
        c.error_code,
        case
          when c.status = 'DUPLICATE_IN_FILE' then 'DUPLICATE_IN_FILE'
          when c.status = 'DUPLICATE_EXISTING' then 'SERIAL_OR_BARCODE_EXISTS'
        end
      )
    from classified c
    on conflict (import_id, row_number) do update
      set serial = excluded.serial,
          barcode = excluded.barcode,
          status = excluded.status,
          error_code = excluded.error_code
    returning status
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'VALID')::integer,
    count(*) filter (where status in ('DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING'))::integer,
    count(*) filter (where status = 'ERROR')::integer
  into staged, valid_count, duplicate_count, error_count
  from upserted;

  return next;
end;
$$;

revoke all on function public.stage_import_rows(uuid, jsonb) from public;
revoke all on function public.stage_import_rows(uuid, jsonb) from anon;
grant execute on function public.stage_import_rows(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- commit_import_batch: sin cambios en la lógica de joins (ya NULL-safe).
-- Único agregado: al completar el import, congela cuántos seriales
-- realmente creados por él quedaron sin barcode.
-- ---------------------------------------------------------------------------
create or replace function public.commit_import_batch(p_import_id uuid, p_batch_size integer default 2000)
returns table(committed_count integer, conflicted_count integer, remaining_count integer, done boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_lot_id uuid;
  v_product_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can commit imports' using errcode = '42501';
  end if;
  if p_batch_size is null or p_batch_size <= 0 or p_batch_size > 5000 then
    raise exception 'invalid batch size (1-5000)';
  end if;

  select status, lot_id into v_status, v_lot_id from public.serial_imports where id = p_import_id;
  if v_status is null then
    raise exception 'import not found';
  end if;
  if v_status = 'COMPLETED' then
    committed_count := 0;
    conflicted_count := 0;
    remaining_count := 0;
    done := true;
    return next;
    return;
  end if;
  if v_status not in ('COMMITTING', 'FAILED') then
    raise exception 'import is not in COMMITTING (current: %)', v_status;
  end if;
  update public.serial_imports set status = 'COMMITTING' where id = p_import_id and status = 'FAILED';

  select product_id into v_product_id from public.lots where id = v_lot_id;

  create temporary table if not exists pg_temp.claimed (id bigint, serial text, barcode text);
  truncate pg_temp.claimed;

  insert into pg_temp.claimed (id, serial, barcode)
  select id, serial, barcode
  from public.serial_import_rows
  where import_id = p_import_id and status = 'VALID'
  order by row_number
  limit p_batch_size
  for update skip locked;

  begin
    with pre_check as (
      select
        c.id,
        case
          when es.id is not null then 'SERIAL_EXISTS'
          when eb.id is not null then 'SERIAL_MATCHES_EXISTING_BARCODE'
          when bb.id is not null then 'BARCODE_EXISTS'
          when bs.id is not null then 'BARCODE_MATCHES_EXISTING_SERIAL'
        end as reason
      from pg_temp.claimed c
      left join public.serials es on es.serial = c.serial
      left join public.serials eb on eb.barcode = c.serial
      left join public.serials bb on bb.barcode = c.barcode
      left join public.serials bs on bs.serial = c.barcode
    )
    update public.serial_import_rows sir
    set status = 'CONFLICT', error_code = pre_check.reason
    from pre_check
    where sir.id = pre_check.id and pre_check.reason is not null;

    with attempt as (
      select c.id, c.serial, c.barcode
      from pg_temp.claimed c
      where not exists (
        select 1 from public.serial_import_rows sir where sir.id = c.id and sir.status = 'CONFLICT'
      )
    ),
    inserted as (
      insert into public.serials (product_id, lot_id, serial, barcode, status, import_id)
      select v_product_id, v_lot_id, a.serial, a.barcode, 'AVAILABLE', p_import_id
      from attempt a
      on conflict do nothing
      returning serial, barcode
    )
    -- Solo por "serial" (ya es globalmente único): comparar también
    -- "barcode" acá rompía con barcode NULL (NULL = NULL nunca es
    -- verdadero), así que una fila insertada sin barcode nunca quedaba
    -- COMMITTED y caía como falso "lost race" en el paso 3.
    update public.serial_import_rows sir
    set status = 'COMMITTED'
    from attempt a
    where sir.id = a.id
      and exists (select 1 from inserted i where i.serial = a.serial);

    with lost_race as (
      select c.id, c.serial, c.barcode
      from pg_temp.claimed c
      where not exists (
        select 1 from public.serial_import_rows sir
        where sir.id = c.id and sir.status in ('CONFLICT', 'COMMITTED')
      )
    ),
    reconciled as (
      select
        lr.id,
        coalesce(
          case
            when es.id is not null then 'SERIAL_EXISTS'
            when eb.id is not null then 'SERIAL_MATCHES_EXISTING_BARCODE'
            when bb.id is not null then 'BARCODE_EXISTS'
            when bs.id is not null then 'BARCODE_MATCHES_EXISTING_SERIAL'
          end,
          'UNIQUE_VIOLATION'
        ) as reason
      from lost_race lr
      left join public.serials es on es.serial = lr.serial
      left join public.serials eb on eb.barcode = lr.serial
      left join public.serials bb on bb.barcode = lr.barcode
      left join public.serials bs on bs.serial = lr.barcode
    )
    update public.serial_import_rows sir
    set status = 'CONFLICT', error_code = reconciled.reason
    from reconciled
    where sir.id = reconciled.id;
  exception when others then
    update public.serial_imports set status = 'FAILED' where id = p_import_id;
    raise;
  end;

  select
    count(*) filter (where sir.status = 'COMMITTED'),
    count(*) filter (where sir.status = 'CONFLICT')
  into committed_count, conflicted_count
  from pg_temp.claimed c
  join public.serial_import_rows sir on sir.id = c.id;

  update public.serial_imports
  set committed_rows = committed_rows + coalesce(committed_count, 0)
  where id = p_import_id;

  select count(*) into remaining_count
  from public.serial_import_rows
  where import_id = p_import_id and status = 'VALID';

  if remaining_count = 0 then
    update public.serial_imports si
    set status = 'COMPLETED',
        missing_barcode_rows = (
          select count(*) from public.serials s where s.import_id = p_import_id and s.barcode is null
        )
    where si.id = p_import_id;
    done := true;
  else
    done := false;
  end if;

  return next;
end;
$$;

revoke all on function public.commit_import_batch(uuid, integer) from public;
revoke all on function public.commit_import_batch(uuid, integer) from anon;
grant execute on function public.commit_import_batch(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- activate_warranty: si el serial no tiene barcode, exige una autorización
-- APPROVED en serial_barcode_waivers (arriba) en vez de bloquear siempre —
-- el vendedor puede activar sin barcode, pero solo con el visto bueno de un
-- admin. warranties.barcode queda null en ese caso (ya es nullable arriba).
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
  v_email_enabled boolean;
  v_recipient text;
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
  if v_serial.barcode is null and not exists (
    select 1 from public.serial_barcode_waivers
    where serial_id = v_serial.id and status = 'APPROVED'
  ) then
    raise exception 'serial has no barcode assigned; request admin authorization';
  end if;

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

  select email_enabled into v_email_enabled from public.notification_settings where id = true;
  if v_email_enabled then
    for v_recipient in
      select unnest(admin_notification_emails) from public.notification_settings where id = true
    loop
      insert into public.notifications (type, recipient, payload)
      values ('warranty_activated', v_recipient, jsonb_build_object('warranty_id', v_warranty_id));
    end loop;
  end if;

  return query
  select v_warranty_id, v_activated_at, v_expires_at, v_duration_days,
         v_product.name, v_serial.serial, v_serial.barcode, v_lot.code;
end;
$$;

comment on function public.activate_warranty(text, jsonb) is
  'Única vía para crear una garantía. p_customer: {"name","national_id","whatsapp"}. Transacción única: FOR UPDATE sobre el serial serializa activaciones concurrentes. Si el serial no tiene barcode, exige una autorización APPROVED en serial_barcode_waivers (2026-09-21: código de barras opcional al crear/importar; activar sin uno requiere visto bueno del admin, no está prohibido). Encola una notificación (outbox) por cada correo admin configurado, en la misma transacción; un fallo de Resend nunca revierte esto (Fase 6).';

revoke all on function public.activate_warranty(text, jsonb) from public;
revoke all on function public.activate_warranty(text, jsonb) from anon;
grant execute on function public.activate_warranty(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- lookup_serial: agrega el estado de la solicitud de autorización (si hay
-- una) para que la pantalla de activación pueda mostrar "solicitar
-- autorización" / "esperando al admin" / "rechazada: <motivo>" / dejar
-- activar, en vez de que el vendedor se entere recién al fallar
-- activate_warranty. Mismo cuerpo de la Fase 8 (throttle), sin cambios ahí.
-- create or replace no permite agregar columnas a un TABLE de retorno
-- existente ("cannot change return type of existing function") — hay que
-- dropearla primero.
-- ---------------------------------------------------------------------------
drop function if exists public.lookup_serial(text);

create function public.lookup_serial(p_code text)
returns table (
  serial_id uuid,
  serial text,
  barcode text,
  product_code text,
  product_name text,
  warranty_duration_days integer,
  status text,
  barcode_waiver_status text,
  barcode_waiver_note text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := private.normalize_code(p_code);
  v_user uuid := auth.uid();
  v_window constant interval := '1 minute';
  v_limit constant integer := 30;
  v_attempts integer;
begin
  if (select private.current_store_id()) is null then
    raise exception 'only an active seller can look up serials' using errcode = '42501';
  end if;

  insert into public.lookup_serial_attempts as t (user_id, window_start, attempts)
  values (v_user, now(), 1)
  on conflict (user_id) do update
    set attempts = case
          when t.window_start < now() - v_window then 1
          else t.attempts + 1
        end,
        window_start = case
          when t.window_start < now() - v_window then now()
          else t.window_start
        end
  returning t.attempts into v_attempts;

  if v_attempts > v_limit then
    raise exception 'too many lookups, try again in a minute';
  end if;

  return query
  select
    s.id, s.serial, s.barcode, p.code, p.name, l.warranty_days, s.status,
    w.status, w.decision_note
  from public.serials s
  join public.products p on p.id = s.product_id
  join public.lots l on l.id = s.lot_id
  left join lateral (
    select status, decision_note
    from public.serial_barcode_waivers
    where serial_id = s.id
    order by created_at desc
    limit 1
  ) w on true
  where s.serial = v_code or s.barcode = v_code;
end;
$$;

comment on function public.lookup_serial(text) is
  'Solo vendedor activo. Coincidencia exacta, columnas mínimas (nunca lot_id/import_id/status_reason). Throttle de 30 intentos/minuto por usuario (Fase 8) contra enumeración de seriales. Incluye el estado de la última solicitud de autorización de barcode, si existe (2026-09-21).';

revoke all on function public.lookup_serial(text) from public;
revoke all on function public.lookup_serial(text) from anon;
grant execute on function public.lookup_serial(text) to authenticated;
