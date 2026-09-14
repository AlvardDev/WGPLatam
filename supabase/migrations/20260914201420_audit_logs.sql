-- Fase 1 — Fundación
-- audit_logs es append-only: nadie puede editarla ni borrarla, ni siquiera
-- service_role (defensa en profundidad — ver docs/SECURITY.md, "Reglas no
-- negociables"). private.audit_row_change() es el trigger genérico que audita
-- automáticamente cualquier INSERT/UPDATE/DELETE en las tablas de catálogo
-- (stores, profiles, app_settings, notification_settings). Eventos que no son
-- cambios de fila (login, logout) se registran explícitamente vía la función
-- pública log_audit_event.

create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.audit_logs is 'Append-only. Ver private.block_audit_mutation(): ni UPDATE ni DELETE están permitidos, para ningún rol.';

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
create index audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);

-- ---------------------------------------------------------------------------
-- Bloqueo append-only
-- ---------------------------------------------------------------------------
create or replace function private.block_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs es append-only: % no está permitido', tg_op;
end;
$$;

create trigger audit_logs_no_update
  before update on public.audit_logs
  for each row execute function private.block_audit_mutation();

create trigger audit_logs_no_delete
  before delete on public.audit_logs
  for each row execute function private.block_audit_mutation();

-- Defensa en profundidad: ningún rol de la API recibe el permiso de SQL
-- para intentar UPDATE/DELETE, además de que el trigger lo bloquearía.
revoke update, delete on public.audit_logs from authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- Trigger de auditoría genérico para tablas de catálogo
-- ---------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_entity_id uuid;
begin
  select role into v_actor_role from public.profiles where id = v_actor;

  v_entity_id := case
    when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
    else (to_jsonb(new) ->> 'id')::uuid
  end;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (
    v_actor,
    v_actor_role,
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- Nota: cuando el perfil se crea vía Admin API (auth.admin.inviteUserByEmail,
-- Fase 4) o durante el bootstrap manual del primer admin, auth.uid() es NULL
-- en el contexto del trigger (no hay una sesión de PostgREST detrás). El
-- registro queda igual (actor_id = null), y la acción de invitar/crear queda
-- auditada explícitamente por quien la ejecuta cuando esa función exista.
create trigger audit_stores
  after insert or update or delete on public.stores
  for each row execute function private.audit_row_change();

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function private.audit_row_change();

create trigger audit_app_settings
  after update on public.app_settings
  for each row execute function private.audit_row_change();

create trigger audit_notification_settings
  after update on public.notification_settings
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- log_audit_event: para eventos que no son cambios de fila (login/logout).
-- Alcance deliberadamente limitado a eventos de auth por ahora.
-- ponytail: allow-list de 2 acciones; ampliar cuando una fase futura
-- necesite que el cliente registre otros eventos explícitos.
-- ---------------------------------------------------------------------------
create or replace function public.log_audit_event(
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  if p_action not in ('login', 'logout') then
    raise exception 'unsupported action: %', p_action;
  end if;

  select role into v_actor_role from public.profiles where id = v_actor;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (v_actor, v_actor_role, p_action, 'auth', v_actor, p_metadata);
end;
$$;

revoke all on function public.log_audit_event(text, jsonb) from public;
grant execute on function public.log_audit_event(text, jsonb) to authenticated;
