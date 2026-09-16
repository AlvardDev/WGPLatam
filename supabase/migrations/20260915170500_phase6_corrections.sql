-- Fase 6 — Correcciones de garantías
--
-- Esquema ya especificado desde la Fase 0 (docs/DATABASE.md, "Tablas") —
-- warranty_id/store_id/requested_by/field/old_value/new_value/reason/status/
-- decided_by/decided_at/decision_note, unique parcial (warranty_id, field)
-- where status='PENDING'. Se implementa tal cual.
--
-- Campos corregibles: SOLO customer_name/customer_national_id/
-- customer_whatsapp. No es una lista arbitraria — es la misma lista que
-- private.warranties_guard_immutable() (Fase 5) ya permite cambiar por
-- UPDATE; cualquier otro campo lo rechazaría el trigger igual, así que el
-- CHECK aquí es defensa en profundidad explícita, no la única barrera real.
--
-- <24h: update_warranty_customer (Fase 5). >=24h: request_correction (aquí),
-- con aprobación de admin vía decide_correction. Ver docs/PROJECT-PLAN.md,
-- sección H.

create table public.warranty_corrections (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.warranties (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  requested_by uuid not null references auth.users (id) on delete restrict,
  field text not null check (field in ('customer_name', 'customer_national_id', 'customer_whatsapp')),
  old_value text not null,
  new_value text not null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  constraint warranty_corrections_reason_not_blank check (length(trim(reason)) > 0),
  constraint warranty_corrections_new_value_not_blank check (length(trim(new_value)) > 0)
);

comment on table public.warranty_corrections is
  'Solicitud de corrección de un campo de cliente pasadas las 24h de la activación. Aprobar (decide_correction) aplica el cambio en la misma transacción si old_value sigue vigente; nunca sobrescribe warranties en silencio.';

-- Como máximo una corrección PENDING por (garantía, campo): evita que dos
-- solicitudes del mismo campo se pisen entre sí antes de que el admin decida.
create unique index warranty_corrections_pending_unique
  on public.warranty_corrections (warranty_id, field)
  where status = 'PENDING';

create index warranty_corrections_store_idx on public.warranty_corrections (store_id, created_at desc);
create index warranty_corrections_warranty_idx on public.warranty_corrections (warranty_id);

create trigger audit_warranty_corrections
  after insert or update or delete on public.warranty_corrections
  for each row execute function private.audit_row_change();

alter table public.warranty_corrections enable row level security;

revoke all on public.warranty_corrections from authenticated;
grant select on public.warranty_corrections to authenticated;

create policy warranty_corrections_admin_select
  on public.warranty_corrections for select
  to authenticated
  using ((select private.is_admin()));

create policy warranty_corrections_seller_select
  on public.warranty_corrections for select
  to authenticated
  using (store_id = (select private.current_store_id()));

-- ---------------------------------------------------------------------------
-- request_correction: solo vendedor de la tienda dueña, solo pasadas las
-- 24h (antes de eso, la vía es update_warranty_customer), solo sobre una
-- garantía no anulada, un campo permitido a la vez, motivo obligatorio.
-- old_value se congela con el valor real vigente en warranties en este
-- instante (no lo que el cliente diga que es), para que decide_correction
-- pueda detectar si cambió entretanto.
-- ---------------------------------------------------------------------------
create or replace function public.request_correction(
  p_warranty_id uuid,
  p_field text,
  p_new_value text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
  v_warranty public.warranties%rowtype;
  v_old_value text;
  v_new_value text := trim(p_new_value);
  v_reason text := trim(p_reason);
  v_correction_id uuid;
begin
  if v_store_id is null then
    raise exception 'only an active seller can request corrections' using errcode = '42501';
  end if;

  if p_field not in ('customer_name', 'customer_national_id', 'customer_whatsapp') then
    raise exception 'field is not correctable: %', p_field;
  end if;
  if v_new_value is null or length(v_new_value) = 0 then
    raise exception 'new value is required';
  end if;
  if v_reason is null or length(v_reason) = 0 then
    raise exception 'reason is required';
  end if;

  select * into v_warranty from public.warranties where id = p_warranty_id;
  if v_warranty.id is null then
    raise exception 'warranty not found';
  end if;
  if v_warranty.store_id <> v_store_id then
    raise exception 'warranty belongs to another store' using errcode = '42501';
  end if;
  if v_warranty.voided_at is not null then
    raise exception 'warranty is voided';
  end if;
  if now() < v_warranty.activated_at + interval '24 hours' then
    raise exception 'edit window has not expired yet, use direct edit instead';
  end if;

  v_old_value := case p_field
    when 'customer_name' then v_warranty.customer_name
    when 'customer_national_id' then v_warranty.customer_national_id
    when 'customer_whatsapp' then v_warranty.customer_whatsapp
  end;

  if p_field = 'customer_whatsapp' and v_new_value !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'new value must be in E.164 format';
  end if;
  if p_field = 'customer_national_id' then
    v_new_value := private.normalize_code(v_new_value);
  end if;

  insert into public.warranty_corrections (warranty_id, store_id, requested_by, field, old_value, new_value, reason)
  values (p_warranty_id, v_store_id, auth.uid(), p_field, v_old_value, v_new_value, v_reason)
  returning id into v_correction_id;

  return v_correction_id;
exception
  when unique_violation then
    raise exception 'a pending correction already exists for this field';
end;
$$;

revoke all on function public.request_correction(uuid, text, text, text) from public;
revoke all on function public.request_correction(uuid, text, text, text) from anon;
grant execute on function public.request_correction(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- decide_correction: solo admin. Aplica el cambio en la misma transacción
-- si old_value sigue vigente (si otra corrección ya lo cambió entretanto,
-- rechaza en vez de aplicar sobre un valor que el vendedor nunca vio).
-- El UPDATE sobre warranties sigue sujeto a warranties_guard_immutable
-- (Fase 5): si el campo no fuera uno de los 3 permitidos, el trigger lo
-- rechazaría igual, aunque el CHECK de la tabla ya lo impide antes.
-- ---------------------------------------------------------------------------
create or replace function public.decide_correction(
  p_correction_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_correction public.warranty_corrections%rowtype;
  v_current_value text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can decide corrections' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'invalid decision: %', p_decision;
  end if;

  select * into v_correction from public.warranty_corrections where id = p_correction_id for update;
  if v_correction.id is null then
    raise exception 'correction not found';
  end if;
  if v_correction.status <> 'PENDING' then
    raise exception 'correction is not pending';
  end if;

  if p_decision = 'APPROVED' then
    select case v_correction.field
      when 'customer_name' then customer_name
      when 'customer_national_id' then customer_national_id
      when 'customer_whatsapp' then customer_whatsapp
    end
    into v_current_value
    from public.warranties where id = v_correction.warranty_id and voided_at is null
    for update;

    if v_current_value is null then
      raise exception 'warranty not found or voided';
    end if;
    if v_current_value <> v_correction.old_value then
      raise exception 'the field changed since the correction was requested';
    end if;

    update public.warranties
    set customer_name = case when v_correction.field = 'customer_name' then v_correction.new_value else customer_name end,
        customer_national_id = case when v_correction.field = 'customer_national_id' then v_correction.new_value else customer_national_id end,
        customer_whatsapp = case when v_correction.field = 'customer_whatsapp' then v_correction.new_value else customer_whatsapp end
    where id = v_correction.warranty_id;
  end if;

  update public.warranty_corrections
  set status = p_decision, decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note)
  where id = p_correction_id;
end;
$$;

revoke all on function public.decide_correction(uuid, text, text) from public;
revoke all on function public.decide_correction(uuid, text, text) from anon;
grant execute on function public.decide_correction(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- update_warranty_customer (Fase 5): se reemplaza para rechazar la edición
-- directa sobre una garantía ya anulada (un admin podría anular justo en
-- medio de la ventana de 24h de un vendedor editando). Sin cambios en el
-- resto de la lógica.
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
  if v_warranty.voided_at is not null then
    raise exception 'warranty is voided';
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

revoke all on function public.update_warranty_customer(uuid, jsonb) from public;
revoke all on function public.update_warranty_customer(uuid, jsonb) from anon;
grant execute on function public.update_warranty_customer(uuid, jsonb) to authenticated;
