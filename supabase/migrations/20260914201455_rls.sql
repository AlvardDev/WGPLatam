-- Fase 1 — Fundación
-- Helpers de autorización + RLS. Esta es la migración que hace cumplir el
-- aislamiento por tienda y el mínimo privilegio a nivel de PostgreSQL, no
-- del frontend. Ver docs/DATABASE.md "RLS" y docs/SECURITY.md "Checklist de
-- funciones SECURITY DEFINER".
--
-- Los helpers viven en "private" y se llaman siempre como (select
-- private.fn()) dentro de las políticas, para que Postgres los evalúe una
-- sola vez por consulta en vez de una vez por fila (recomendación oficial de
-- Supabase para RLS con funciones).
--
-- Se consultan en tabla, no en claims del JWT: desactivar a un vendedor o una
-- tienda surte efecto de inmediato, sin esperar a que caduque el token.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  );
$$;

comment on function private.is_admin() is
  'Admin activo con MFA aal2 se exige a partir de la Fase 8 (un solo punto de cambio).';

create or replace function private.current_store_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.store_id
  from public.profiles p
  join public.stores s on s.id = p.store_id
  where p.id = auth.uid()
    and p.role = 'seller'
    and p.is_active
    and s.is_active;
$$;

comment on function private.current_store_id() is
  'NULL si no es un vendedor activo de una tienda activa. Nunca confiar en un store_id que venga como parámetro del cliente.';

-- Los helpers deben poder evaluarse dentro de políticas RLS para anon y
-- authenticated. Esto NO los expone como RPC: PostgREST solo expone el
-- esquema "public" (ver supabase/config.toml), así que private.* nunca es
-- alcanzable desde el cliente, solo desde políticas y funciones SQL.
grant usage on schema private to authenticated, anon;
grant execute on function private.is_admin() to authenticated, anon;
grant execute on function private.current_store_id() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Endurecimiento general: anon no tiene ningún acceso a datos de negocio.
-- No hay registro público ni páginas anónimas que necesiten leer la base.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Grants de tabla explícitos (no se asume nada del setup por defecto del
-- proyecto): solo SELECT. Los perfiles se crean por el trigger
-- handle_new_user (SECURITY DEFINER, no necesita grant) o por Server Actions
-- con el cliente de service role (que ignora RLS y los grants de
-- "authenticated"), nunca por el propio usuario.
revoke all on public.profiles from authenticated;
grant select on public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_admin
  on public.profiles for select
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
alter table public.stores enable row level security;

revoke all on public.stores from authenticated;
grant select, insert, update, delete on public.stores to authenticated;

create policy stores_admin_all
  on public.stores for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy stores_seller_select_own
  on public.stores for select
  to authenticated
  using (id = (select private.current_store_id()));

-- ---------------------------------------------------------------------------
-- app_settings (pública para autenticados activos; solo admin escribe)
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;

revoke all on public.app_settings from authenticated;
grant select, update on public.app_settings to authenticated;

-- Instantáneo ante desactivación: si el perfil deja de ser admin activo o
-- vendedor activo de una tienda activa, pierde el SELECT de inmediato.
create policy app_settings_select
  on public.app_settings for select
  to authenticated
  using ((select private.is_admin()) or (select private.current_store_id()) is not null);

create policy app_settings_admin_update
  on public.app_settings for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- notification_settings (exclusivamente admin)
-- ---------------------------------------------------------------------------
alter table public.notification_settings enable row level security;

revoke all on public.notification_settings from authenticated;
grant select, update on public.notification_settings to authenticated;

create policy notification_settings_admin_all
  on public.notification_settings for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- audit_logs (exclusivamente lectura de admin; sin escritura para nadie vía
-- API — solo INSERT a través de las funciones SECURITY DEFINER, que corren
-- como el owner de la tabla y no necesitan grant de "authenticated")
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

revoke all on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

create policy audit_logs_select_admin
  on public.audit_logs for select
  to authenticated
  using ((select private.is_admin()));
