-- Fase 6 — Anulación de garantías + outbox de activación
--
-- void_warranty: transición explícita e histórica (voided_at/by/reason, ya
-- reservados en la tabla desde la Fase 5), nunca DELETE. Por decisión
-- explícita para esta fase (ver docs/PROJECT-PLAN.md, sección H, "qué pasa
-- con el serial liberado... se decide en la Fase 6"): el serial NO cambia de
-- estado. El caso de uso documentado ("serial equivocado") es anular esa
-- garantía y activar un serial DISTINTO, no reactivar el mismo — liberar el
-- serial para reutilizarlo es una decisión de negocio aparte, fuera de esta
-- fase (ver docs/PHASE-6-REVIEW.md, DEFERRED).
--
-- activate_warranty se reemplaza para encolar, en la misma transacción, una
-- notificación por cada correo de notification_settings.admin_notification_emails
-- (si email_enabled). Un fallo de Resend nunca revierte la activación —
-- el outbox es de solo-lectura para todos salvo el worker (claim_notifications/
-- complete_notification, migración anterior).

create or replace function public.void_warranty(p_warranty_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := trim(p_reason);
  v_warranty public.warranties%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can void warranties' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) = 0 then
    raise exception 'reason is required';
  end if;

  select * into v_warranty from public.warranties where id = p_warranty_id for update;
  if v_warranty.id is null then
    raise exception 'warranty not found';
  end if;
  if v_warranty.voided_at is not null then
    raise exception 'warranty is already voided';
  end if;

  update public.warranties
  set voided_at = now(), voided_by = auth.uid(), voided_reason = v_reason
  where id = p_warranty_id;
end;
$$;

comment on function public.void_warranty(uuid, text) is
  'Anula sin borrar. No toca el estado del serial (decisión Fase 6: liberarlo para reactivación es un paso manual aparte, no automático — ver docs/PHASE-6-REVIEW.md). Auditado por el trigger genérico (audit_warranties, Fase 5), sin mecanismo nuevo.';

revoke all on function public.void_warranty(uuid, text) from public;
revoke all on function public.void_warranty(uuid, text) from anon;
grant execute on function public.void_warranty(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- activate_warranty: mismo cuerpo de la Fase 5, con el INSERT al outbox
-- agregado al final, dentro de la misma transacción. El payload solo lleva
-- el id: el worker relee warranties (inmutable) con el cliente de servicio
-- al momento de enviar, en vez de duplicar el snapshot en dos lugares.
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
  'Única vía para crear una garantía. p_customer: {"name","national_id","whatsapp"}. Transacción única: FOR UPDATE sobre el serial serializa activaciones concurrentes. Encola una notificación (outbox) por cada correo admin configurado, en la misma transacción; un fallo de Resend nunca revierte esto (Fase 6).';

revoke all on function public.activate_warranty(text, jsonb) from public;
revoke all on function public.activate_warranty(text, jsonb) from anon;
grant execute on function public.activate_warranty(text, jsonb) to authenticated;
