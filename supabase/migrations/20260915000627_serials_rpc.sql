-- Fase 2 — RPC de seriales (única vía de escritura sobre "serials")
-- Checklist de docs/SECURITY.md aplicado a las 4: search_path='', revoke
-- execute de public Y anon explícitamente (no alcanza con "from public" —
-- lección real de la Fase 1), re-verificación de is_admin() dentro de la
-- función, SELECT ... FOR UPDATE para concurrencia segura, sin parámetros de
-- fecha ni de tienda.

-- ---------------------------------------------------------------------------
-- create_serial: única forma de que exista un serial (AVAILABLE).
-- ---------------------------------------------------------------------------
create or replace function public.create_serial(
  p_product_id uuid,
  p_lot_id uuid,
  p_serial text,
  p_barcode text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serial text := private.normalize_code(p_serial);
  v_barcode text := private.normalize_code(p_barcode);
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

  if length(v_serial) = 0 or length(v_barcode) = 0 then
    raise exception 'serial and barcode must not be empty';
  end if;
  if v_serial = v_barcode then
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
-- block_serial: AVAILABLE -> BLOCKED (motivo obligatorio)
-- ---------------------------------------------------------------------------
create or replace function public.block_serial(p_serial_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can block serials' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select status into v_status from public.serials where id = p_serial_id for update;
  if v_status is null then
    raise exception 'serial not found';
  end if;
  if v_status <> 'AVAILABLE' then
    raise exception 'invalid transition: % -> BLOCKED', v_status;
  end if;

  update public.serials set status = 'BLOCKED', status_reason = p_reason where id = p_serial_id;
end;
$$;

revoke all on function public.block_serial(uuid, text) from public;
revoke all on function public.block_serial(uuid, text) from anon;
grant execute on function public.block_serial(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unblock_serial: BLOCKED -> AVAILABLE
-- ---------------------------------------------------------------------------
create or replace function public.unblock_serial(p_serial_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can unblock serials' using errcode = '42501';
  end if;

  select status into v_status from public.serials where id = p_serial_id for update;
  if v_status is null then
    raise exception 'serial not found';
  end if;
  if v_status <> 'BLOCKED' then
    raise exception 'invalid transition: % -> AVAILABLE', v_status;
  end if;

  update public.serials set status = 'AVAILABLE', status_reason = null where id = p_serial_id;
end;
$$;

revoke all on function public.unblock_serial(uuid) from public;
revoke all on function public.unblock_serial(uuid) from anon;
grant execute on function public.unblock_serial(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- void_serial: AVAILABLE|BLOCKED -> VOID (permanente; sin unvoid_serial)
-- ---------------------------------------------------------------------------
create or replace function public.void_serial(p_serial_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can void serials' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason is required';
  end if;

  select status into v_status from public.serials where id = p_serial_id for update;
  if v_status is null then
    raise exception 'serial not found';
  end if;
  if v_status not in ('AVAILABLE', 'BLOCKED') then
    raise exception 'invalid transition: % -> VOID', v_status;
  end if;

  update public.serials set status = 'VOID', status_reason = p_reason where id = p_serial_id;
end;
$$;

revoke all on function public.void_serial(uuid, text) from public;
revoke all on function public.void_serial(uuid, text) from anon;
grant execute on function public.void_serial(uuid, text) to authenticated;
