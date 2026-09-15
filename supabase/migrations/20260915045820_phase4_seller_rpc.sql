-- Fase 4 — UI de tiendas y vendedores
--
-- "stores" y "profiles" ya existen desde la Fase 1 (incluida su RLS: admin
-- CRUD directo sobre "stores", ver 20260914201455_rls.sql). Lo único que
-- falta a nivel de base es escribir sobre "profiles" para dar de alta y
-- desactivar/reactivar vendedores — y "profiles" no tiene ninguna política
-- de UPDATE para "authenticated" (ni siquiera para admin, ver la misma
-- migración de RLS): el diseño original ya deja esto para "acciones de
-- servidor" (comentario en profiles_and_stores.sql).
--
-- Se resuelve con 2 RPC SECURITY DEFINER (mismo patrón que create_serial/
-- block_serial de la Fase 2), NO con el cliente de service role directo
-- sobre la tabla: así auth.uid() se resuelve al admin real dentro de la
-- función (se llama con la sesión normal del admin, no con la service key),
-- y el trigger genérico audit_profiles (Fase 1) audita automáticamente con
-- el actor_id correcto — sin necesitar un segundo mecanismo de auditoría.
--
-- El cliente de service role (lib/supabase/admin.ts) se usa exclusivamente
-- para lo que Postgres no puede hacer: crear el usuario en Supabase Auth y
-- enviar el email de invitación (auth.admin.inviteUserByEmail), y banear/
-- desbanear en Auth para matar el refresh token (auth.admin.updateUserById
-- con ban_duration) — ver docs/PROJECT-PLAN.md línea sobre "banear al
-- desactivar". Esas dos llamadas viven en lib/actions/sellers.ts.

-- ---------------------------------------------------------------------------
-- admin_finalize_seller_profile: completa el perfil creado por el trigger
-- handle_new_user tras auth.admin.inviteUserByEmail.
--
-- Por qué existe: inviteUserByEmail(email, { data }) escribe "data" en
-- auth.users.raw_user_meta_data, NUNCA en raw_app_meta_data (verificado en
-- @supabase/auth-js: GoTrueAdminApi.inviteUserByEmail, el campo "data" está
-- documentado como "This maps to the user_metadata column"). Como
-- private.handle_new_user() lee el rol/tienda exclusivamente de
-- raw_app_meta_data (a propósito, para que el propio usuario no pueda
-- escalar su rol), el perfil se crea con role = null, is_active = false
-- — "sin aprovisionar", exactamente como el bootstrap manual del primer
-- admin. Esta función lo completa una vez que el admin ya llamó también a
-- auth.admin.updateUserById(user_id, { app_metadata: {...} }) desde el
-- server action (necesario además para que proxy.ts pueda enrutar al
-- vendedor a /tienda leyendo el claim del JWT en logins futuros).
create or replace function public.admin_finalize_seller_profile(
  p_user_id uuid,
  p_full_name text,
  p_store_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_active boolean;
  v_current_role text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can finalize seller profiles' using errcode = '42501';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full name is required';
  end if;

  select is_active into v_store_active from public.stores where id = p_store_id;
  if not found then
    raise exception 'store not found';
  end if;
  if not v_store_active then
    raise exception 'store is not active';
  end if;

  -- FOR UPDATE: si dos llamadas se solapan para el mismo usuario (no debería
  -- pasar en el flujo normal, un solo invite por usuario), la segunda espera
  -- y luego falla por "already provisioned" en vez de pisar a la primera.
  select role into v_current_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_current_role is not null then
    raise exception 'profile already provisioned';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), role = 'seller', store_id = p_store_id, is_active = true
  where id = p_user_id;
end;
$$;

comment on function public.admin_finalize_seller_profile(uuid, text, uuid) is
  'Completa un perfil sin aprovisionar (role is null) como vendedor activo de una tienda. Solo admin. Falla si el perfil ya tiene rol.';

revoke all on function public.admin_finalize_seller_profile(uuid, text, uuid) from public;
revoke all on function public.admin_finalize_seller_profile(uuid, text, uuid) from anon;
grant execute on function public.admin_finalize_seller_profile(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_seller_active: desactivar/reactivar un vendedor.
--
-- Solo actúa sobre perfiles role = 'seller' a propósito: desactivar/
-- reactivar administradores no está en el alcance pedido para esta fase
-- (ARCHITECTURE.md solo documenta "invitar y desactivar vendedores" como
-- capacidad de admin) — no se generaliza a "cualquier usuario" para no
-- construir una función de administración de cuentas admin que nadie pidió.
create or replace function public.admin_set_seller_active(
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
  if not (select private.is_admin()) then
    raise exception 'only admin can change seller status' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_role <> 'seller' then
    raise exception 'target is not a seller';
  end if;

  update public.profiles set is_active = p_is_active where id = p_user_id;
end;
$$;

comment on function public.admin_set_seller_active(uuid, boolean) is
  'Activa/desactiva a un vendedor (RLS ya bloquea su acceso a datos de inmediato; el ban/unban en Supabase Auth para matar el refresh token se hace aparte, vía lib/actions/sellers.ts con el cliente de service role). Solo admin, solo sobre perfiles role=seller.';

revoke all on function public.admin_set_seller_active(uuid, boolean) from public;
revoke all on function public.admin_set_seller_active(uuid, boolean) from anon;
grant execute on function public.admin_set_seller_active(uuid, boolean) to authenticated;
