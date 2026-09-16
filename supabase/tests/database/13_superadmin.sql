-- Rol superadmin (2026-09-18) — decisión explícita del usuario: superadmin
-- hereda todo lo de admin (private.is_admin() acepta los dos roles) más
-- gestionar otras cuentas admin (admin_finalize_admin_profile,
-- admin_set_admin_active), exclusivo de private.is_superadmin(). Ver
-- supabase/migrations/20260918000000_superadmin_role.sql.
begin;
select plan(20);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f9000000-0000-0000-0000-00000000000a', 'T-F9A', 'Tienda F9 A', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f9000000-0000-0000-0000-0000000000e1', 'superadmin-f9@test.local', '{"role":"superadmin"}'::jsonb),
  ('f9000000-0000-0000-0000-0000000000a1', 'admin-f9@test.local', '{"role":"admin"}'::jsonb),
  ('f9000000-0000-0000-0000-0000000000a2', 'seller-f9@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f9000000-0000-0000-0000-00000000000a'));

-- Perfil "sin aprovisionar" a la espera de admin_finalize_admin_profile,
-- mismo patrón que 08_stores_and_sellers.sql para vendedores.
insert into auth.users (id, email, raw_app_meta_data) values
  ('f9000000-0000-0000-0000-0000000000a3', 'invitado-f9@test.local', '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- profiles: constraint de forma acepta superadmin sin store_id, rechaza
-- superadmin CON store_id (mismo molde que admin).
-- ---------------------------------------------------------------------------
select is(
  (select role from public.profiles where id = 'f9000000-0000-0000-0000-0000000000e1'),
  'superadmin', 'el trigger crea el perfil con role=superadmin desde app_metadata'
);
select throws_like(
  $$ update public.profiles set store_id = 'f9000000-0000-0000-0000-00000000000a'
     where id = 'f9000000-0000-0000-0000-0000000000e1' $$,
  '%profiles_role_store_shape%', 'un superadmin no puede tener store_id (constraint de forma)'
);

-- ---------------------------------------------------------------------------
-- private.is_admin() / private.is_superadmin(): superadmin hereda is_admin,
-- pero is_superadmin es exclusivo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}';
select ok((select private.is_admin()), 'superadmin con aal2 pasa is_admin() (hereda todo lo de admin)');
select ok((select private.is_superadmin()), 'superadmin con aal2 pasa is_superadmin()');
select is((select count(*)::int from public.stores), 1, 'superadmin ve las tiendas igual que un admin (RLS ya cubierta por is_admin())');
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select ok((select private.is_admin()), 'admin normal sigue pasando is_admin()');
select ok(not (select private.is_superadmin()), 'admin normal NO pasa is_superadmin()');
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- admin_finalize_admin_profile: solo superadmin.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select throws_like(
  $$ select public.admin_finalize_admin_profile('f9000000-0000-0000-0000-0000000000a3', 'Invitado F9') $$,
  '%only superadmin%', 'un admin normal no puede finalizar perfiles de admin'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}';
select throws_like(
  $$ select public.admin_finalize_admin_profile('f9000000-0000-0000-0000-0000000000a3', '') $$,
  '%full name is required%', 'exige un nombre no vacío'
);
select throws_like(
  $$ select public.admin_finalize_admin_profile('f0000000-0000-0000-0000-000000000000', 'Nadie') $$,
  '%profile not found%', 'rechaza un usuario que no existe'
);
select throws_like(
  $$ select public.admin_finalize_admin_profile('f9000000-0000-0000-0000-0000000000a2', 'Ya Vendedor') $$,
  '%already provisioned%', 'rechaza un perfil que ya tiene rol asignado'
);
select lives_ok(
  $$ select public.admin_finalize_admin_profile('f9000000-0000-0000-0000-0000000000a3', '  Invitado F9  ') $$,
  'superadmin completa el perfil de un admin recién invitado'
);
select ok(
  (select full_name = 'Invitado F9' and role = 'admin' and store_id is null and is_active = true
   from public.profiles where id = 'f9000000-0000-0000-0000-0000000000a3'),
  'el perfil queda con nombre recortado, rol admin, sin tienda, activo'
);
select throws_like(
  $$ select public.admin_finalize_admin_profile('f9000000-0000-0000-0000-0000000000a3', 'Otra vez') $$,
  '%already provisioned%', 'no se puede finalizar dos veces el mismo perfil'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- admin_set_admin_active: solo superadmin, solo sobre role='admin'.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select throws_like(
  $$ select public.admin_set_admin_active('f9000000-0000-0000-0000-0000000000a3', false) $$,
  '%only superadmin%', 'un admin normal no puede desactivar a otro admin'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f9000000-0000-0000-0000-0000000000e1","role":"authenticated","aal":"aal2"}';
select throws_like(
  $$ select public.admin_set_admin_active('f9000000-0000-0000-0000-0000000000a2', false) $$,
  '%target is not an admin%', 'no se puede usar esta función sobre un vendedor'
);
select throws_like(
  $$ select public.admin_set_admin_active('f9000000-0000-0000-0000-0000000000e1', false) $$,
  '%target is not an admin%', 'un superadmin no puede desactivar a otro superadmin (ni a sí mismo) por esta vía'
);
select lives_ok(
  $$ select public.admin_set_admin_active('f9000000-0000-0000-0000-0000000000a3', false) $$,
  'superadmin desactiva al admin recién finalizado'
);
select is(
  (select is_active from public.profiles where id = 'f9000000-0000-0000-0000-0000000000a3'),
  false, 'queda is_active = false'
);
select lives_ok(
  $$ select public.admin_set_admin_active('f9000000-0000-0000-0000-0000000000a3', true) $$,
  'superadmin reactiva al admin'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
