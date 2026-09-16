-- Fase 6 — Outbox de notificaciones (email)
--
-- Esquema ya especificado desde la Fase 0 (docs/PROJECT-PLAN.md, sección I;
-- docs/DATABASE.md, "Tablas") — se implementa tal cual estaba documentado,
-- con una sola adición necesaria no cubierta por el diseño original:
-- `available_at` (para el backoff de reintentos) y el estado `PROCESSING`
-- (para que el "claim" de un lote sea seguro entre dos invocaciones de la
-- Edge Function que se solapen — el worker no corre dentro de la misma
-- transacción que el envío HTTP a Resend, así que SKIP LOCKED por sí solo no
-- alcanza: hace falta un estado intermedio que sobreviva al fin de la
-- transacción de "reclamar" el lote).
--
-- notification_settings (Fase 1) se extiende con la configuración funcional
-- de email (habilitado/remitente) — la clave de Resend NUNCA vive aquí, solo
-- como secreto de la Edge Function (ver supabase/functions/dispatch-notifications).

create table public.notifications (
  id bigint generated always as identity primary key,
  type text not null,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED')),
  attempts integer not null default 0,
  last_error text,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_not_blank check (length(trim(recipient)) > 0)
);

comment on table public.notifications is
  'Outbox de email. Una activación de garantía inserta aquí en la misma transacción (nunca hay activación sin notificación pendiente). Procesada por la Edge Function dispatch-notifications vía claim_notifications/complete_notification, nunca por escritura directa del cliente.';

-- El worker reclama por (status, available_at); el admin consulta por tipo/entidad.
create index notifications_pending_idx on public.notifications (available_at) where status = 'PENDING';
create index notifications_type_idx on public.notifications (type, created_at desc);

alter table public.notifications enable row level security;

-- Igual que audit_logs: solo lectura para admin (observabilidad de fallos de
-- envío, ver docs/ARCHITECTURE.md "Observabilidad"). Ninguna escritura vía
-- API para nadie — el owner de la tabla (las 2 RPC de abajo, SECURITY
-- DEFINER) es el único camino de escritura.
revoke all on public.notifications from authenticated;
grant select on public.notifications to authenticated;

create policy notifications_select_admin
  on public.notifications for select
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- notification_settings: configuración funcional de email (no secretos).
-- ---------------------------------------------------------------------------
alter table public.notification_settings
  add column email_enabled boolean not null default true,
  add column from_email text,
  add column from_name text;

comment on column public.notification_settings.email_enabled is
  'Interruptor funcional: si es false, activate_warranty no encola notificaciones nuevas. No afecta si Resend está configurado o no (eso es RESEND_API_KEY, secreto de la Edge Function).';

-- ---------------------------------------------------------------------------
-- claim_notifications: reclama un lote de PENDING como PROCESSING de forma
-- atómica (FOR UPDATE SKIP LOCKED). Solo lo llama la Edge Function con la
-- clave de servicio — nunca authenticated/anon: el contenido de "payload"
-- puede incluir datos de cliente, y el envío de email es responsabilidad
-- exclusiva del worker, no de un usuario de la app.
-- ---------------------------------------------------------------------------
create or replace function public.claim_notifications(p_batch_size integer default 20)
returns setof public.notifications
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  update public.notifications
  set status = 'PROCESSING', attempts = attempts + 1
  where id in (
    select n.id from public.notifications n
    where n.status = 'PENDING' and n.available_at <= now()
    order by n.id
    limit greatest(p_batch_size, 1)
    for update skip locked
  )
  returning *;
end;
$$;

comment on function public.claim_notifications(integer) is
  'Solo service_role (Edge Function dispatch-notifications). Marca PROCESSING antes de devolver el lote para que dos invocaciones solapadas nunca reclamen la misma fila (SKIP LOCKED protege la transacción de este UPDATE, no el envío HTTP posterior, que ocurre en otra transacción — por eso hace falta el estado intermedio).';

revoke all on function public.claim_notifications(integer) from public;
revoke all on function public.claim_notifications(integer) from anon;
revoke all on function public.claim_notifications(integer) from authenticated;
grant execute on function public.claim_notifications(integer) to service_role;

-- ---------------------------------------------------------------------------
-- complete_notification: cierra el resultado de un intento de envío.
-- Éxito -> SENT. Fallo -> vuelve a PENDING con backoff si quedan intentos,
-- o FAILED definitivo al agotar el límite (5). Nunca marca SENT sin
-- confirmación real del proveedor (la llama la Edge Function después de la
-- respuesta de Resend, nunca antes).
-- ---------------------------------------------------------------------------
create or replace function public.complete_notification(
  p_id bigint,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_max_attempts constant integer := 5;
begin
  select attempts into v_attempts from public.notifications where id = p_id for update;
  if v_attempts is null then
    raise exception 'notification not found';
  end if;

  if p_ok then
    update public.notifications set status = 'SENT', sent_at = now(), last_error = null where id = p_id;
  elsif v_attempts >= v_max_attempts then
    update public.notifications set status = 'FAILED', last_error = p_error where id = p_id;
  else
    -- backoff exponencial simple: 1, 2, 4, 8, 16 minutos.
    update public.notifications
    set status = 'PENDING',
        last_error = p_error,
        available_at = now() + (power(2, v_attempts - 1) || ' minutes')::interval
    where id = p_id;
  end if;
end;
$$;

comment on function public.complete_notification(bigint, boolean, text) is
  'Solo service_role. attempts ya fue incrementado por claim_notifications; aquí solo se decide el estado final de este intento.';

revoke all on function public.complete_notification(bigint, boolean, text) from public;
revoke all on function public.complete_notification(bigint, boolean, text) from anon;
revoke all on function public.complete_notification(bigint, boolean, text) from authenticated;
grant execute on function public.complete_notification(bigint, boolean, text) to service_role;
