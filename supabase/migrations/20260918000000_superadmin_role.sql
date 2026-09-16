-- Rol nuevo: superadmin. Decisión explícita del usuario tras la migración a
-- un proyecto Supabase limpio: van a existir 2 niveles de admin dentro de la
-- app — superadmin (el usuario/desarrollador) y admin (el cliente dueño del
-- negocio). La única diferencia de permisos pedida: superadmin puede
-- gestionar (invitar/desactivar/reactivar) otras cuentas admin; un admin
-- normal no puede tocar otras cuentas admin. Para todo lo demás (productos,
-- tiendas, garantías, reclamos, etc.), superadmin hereda exactamente lo
-- mismo que admin — por eso private.is_admin() se extiende para aceptar los
-- dos roles, en vez de tocar cada política/RPC de F2-F9 una por una (mismo
-- patrón ya usado para aal2 en la Fase 8).
--
-- No confundir con la propiedad de infraestructura (GitHub/Supabase/Vercel,
-- ver docs/ARCHITECTURE.md, "Administración de la aplicación vs. propiedad
-- de infraestructura") — esto es un rol DENTRO de la app, aparte de quién es
-- dueño de las cuentas de los proveedores.

alter table public.profiles drop constraint profiles_role_valid;
alter table public.profiles add constraint profiles_role_valid
  check (role is null or role in ('admin', 'seller', 'superadmin'));

-- private.handle_new_user() (Fase 1) tiene su propia allow-list de roles
-- válidos en app_metadata, independiente del CHECK de arriba — hay que
-- extenderla igual, si no cualquier alta de un superadmin (incluido el
-- bootstrap manual del primer admin, docs/ARCHITECTURE.md) falla en el
-- INSERT de auth.users con "invalid role in app_metadata: superadmin".
-- Encontrado en vivo por el pgTAP de este rol (13_superadmin.sql).
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_store_id uuid := nullif(new.raw_app_meta_data ->> 'store_id', '')::uuid;
  v_full_name text := coalesce(new.raw_app_meta_data ->> 'full_name', new.email);
begin
  if v_role is not null and v_role not in ('admin', 'seller', 'superadmin') then
    raise exception 'invalid role in app_metadata: %', v_role;
  end if;

  insert into public.profiles (id, full_name, role, store_id, is_active)
  values (
    new.id,
    v_full_name,
    v_role,
    case when v_role = 'seller' then v_store_id else null end,
    v_role is not null
  );

  return new;
end;
$$;

alter table public.profiles drop constraint profiles_role_store_shape;
alter table public.profiles add constraint profiles_role_store_shape
  check (
    (role = 'seller' and store_id is not null)
    or (role in ('admin', 'superadmin') and store_id is null)
    or (role is null and store_id is null)
  );

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
      and p.role in ('admin', 'superadmin')
      and p.is_active
  )
  and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

comment on function private.is_admin() is
  'Admin o superadmin activo con MFA aal2. superadmin hereda todo lo de admin (ver private.is_superadmin() para lo exclusivo de superadmin).';

create or replace function private.is_superadmin()
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
      and p.role = 'superadmin'
      and p.is_active
  )
  and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

comment on function private.is_superadmin() is
  'Solo superadmin (no admin) activo con aal2. Usada exclusivamente por admin_finalize_admin_profile/admin_set_admin_active — el resto de la app usa is_admin(), que ya incluye a superadmin.';

grant execute on function private.is_superadmin() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- admin_finalize_admin_profile: mismo patrón que admin_finalize_seller_profile
-- (Fase 4), sin store_id (un admin/superadmin nunca tiene tienda).
-- ---------------------------------------------------------------------------
create or replace function public.admin_finalize_admin_profile(
  p_user_id uuid,
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_role text;
begin
  if not (select private.is_superadmin()) then
    raise exception 'only superadmin can finalize admin profiles' using errcode = '42501';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full name is required';
  end if;

  select role into v_current_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_current_role is not null then
    raise exception 'profile already provisioned';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), role = 'admin', store_id = null, is_active = true
  where id = p_user_id;
end;
$$;

comment on function public.admin_finalize_admin_profile(uuid, text) is
  'Completa un perfil sin aprovisionar como admin activo. Solo superadmin. Falla si el perfil ya tiene rol.';

revoke all on function public.admin_finalize_admin_profile(uuid, text) from public;
revoke all on function public.admin_finalize_admin_profile(uuid, text) from anon;
grant execute on function public.admin_finalize_admin_profile(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_admin_active: mismo patrón que admin_set_seller_active (Fase 4),
-- pero solo sobre role='admin' — un superadmin no puede desactivar a otro
-- superadmin ni a sí mismo por esta vía (evita bloquearse el único acceso
-- sin pasar por el bootstrap manual de docs/ARCHITECTURE.md).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_admin_active(
  p_user_id uuid,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not (select private.is_superadmin()) then
    raise exception 'only superadmin can change admin status' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_role <> 'admin' then
    raise exception 'target is not an admin';
  end if;

  update public.profiles set is_active = p_is_active where id = p_user_id;
end;
$$;

comment on function public.admin_set_admin_active(uuid, boolean) is
  'Activa/desactiva una cuenta admin (nunca otra superadmin ni a sí mismo). Solo superadmin.';

revoke all on function public.admin_set_admin_active(uuid, boolean) from public;
revoke all on function public.admin_set_admin_active(uuid, boolean) from anon;
grant execute on function public.admin_set_admin_active(uuid, boolean) to authenticated;
