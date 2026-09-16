-- Fase 4 — UI de tiendas y vendedores.
--
-- "stores" y "profiles" ya existen desde la Fase 1, con su RLS (CRUD directo
-- de admin sobre "stores", aislamiento de "profiles") ya cubierta en
-- 02_rls_isolation.sql y 04_settings_and_deactivation.sql — no se repite
-- aquí. Este archivo cubre lo nuevo de esta fase: las 2 RPC que dan de alta
-- y desactivan/reactivan vendedores (admin_finalize_seller_profile,
-- admin_set_seller_active), y que el camino completo (RPC, no un UPDATE
-- directo simulado) efectivamente le quita/devuelve el acceso a un
-- vendedor. Ver docs/DATABASE.md y docs/SECURITY.md.
begin;
select plan(21);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f4000000-0000-0000-0000-00000000000a', 'T-F4A', 'Tienda F4 Activa', 'VE', true),
  ('f4000000-0000-0000-0000-00000000000b', 'T-F4B', 'Tienda F4 Inactiva', 'VE', false);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f4000000-0000-0000-0000-0000000000a1', 'admin-f4@test.local', '{"role":"admin"}'::jsonb),
  ('f4000000-0000-0000-0000-0000000000a2', 'seller-f4@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f4000000-0000-0000-0000-00000000000a'));

-- Simula el estado exacto que deja auth.admin.inviteUserByEmail + el
-- trigger handle_new_user cuando raw_app_meta_data todavía no tiene rol:
-- perfil "sin aprovisionar" (role null, is_active false), a la espera de
-- admin_finalize_seller_profile.
insert into auth.users (id, email, raw_app_meta_data) values
  ('f4000000-0000-0000-0000-0000000000a3', 'invitado-f4@test.local', '{}'::jsonb);

-- ---------------------------------------------------------------------------
-- admin_finalize_seller_profile
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', 'Invitado F4', 'f4000000-0000-0000-0000-00000000000a') $$,
  '%only admin%', 'un vendedor no puede invocar admin_finalize_seller_profile'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', '', 'f4000000-0000-0000-0000-00000000000a') $$,
  '%full name is required%', 'exige un nombre no vacío'
);
select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', 'Invitado F4', 'f0000000-0000-0000-0000-000000000000') $$,
  '%store not found%', 'rechaza una tienda que no existe'
);
select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', 'Invitado F4', 'f4000000-0000-0000-0000-00000000000b') $$,
  '%store is not active%', 'rechaza una tienda inactiva'
);
select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f0000000-0000-0000-0000-000000000000', 'Nadie', 'f4000000-0000-0000-0000-00000000000a') $$,
  '%profile not found%', 'rechaza un usuario que no existe'
);
select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a2', 'Ya Vendedor', 'f4000000-0000-0000-0000-00000000000a') $$,
  '%already provisioned%', 'rechaza un perfil que ya tiene rol asignado'
);

select lives_ok(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', '  Invitado F4  ', 'f4000000-0000-0000-0000-00000000000a') $$,
  'admin completa el perfil de un vendedor recién invitado'
);
select ok(
  (select full_name = 'Invitado F4' and role = 'seller'
     and store_id = 'f4000000-0000-0000-0000-00000000000a'::uuid and is_active = true
   from public.profiles where id = 'f4000000-0000-0000-0000-0000000000a3'),
  'el perfil queda con el nombre recortado, rol seller, tienda e is_active correctos'
);
select throws_like(
  $$ select public.admin_finalize_seller_profile(
       'f4000000-0000-0000-0000-0000000000a3', 'Otra vez', 'f4000000-0000-0000-0000-00000000000a') $$,
  '%already provisioned%', 'no se puede finalizar dos veces el mismo perfil'
);
select is(
  (select action from public.audit_logs
     where entity_type = 'profiles' and entity_id = 'f4000000-0000-0000-0000-0000000000a3'
     order by id desc limit 1),
  'update',
  'la finalización queda auditada por el trigger genérico de profiles'
);
select is(
  (select actor_id from public.audit_logs
     where entity_type = 'profiles' and entity_id = 'f4000000-0000-0000-0000-0000000000a3'
     order by id desc limit 1),
  'f4000000-0000-0000-0000-0000000000a1'::uuid,
  'el actor auditado es el admin real que llamó al RPC (auth.uid() correcto, no NULL como con service role)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- admin_set_seller_active
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  $$ select public.admin_set_seller_active('f4000000-0000-0000-0000-0000000000a3', false) $$,
  '%only admin%', 'un vendedor no puede invocar admin_set_seller_active'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select public.admin_set_seller_active('f0000000-0000-0000-0000-000000000000', false) $$,
  '%profile not found%', 'rechaza un usuario que no existe'
);
select throws_like(
  $$ select public.admin_set_seller_active('f4000000-0000-0000-0000-0000000000a1', false) $$,
  '%target is not a seller%', 'no se puede usar esta función sobre un admin'
);

select lives_ok(
  $$ select public.admin_set_seller_active('f4000000-0000-0000-0000-0000000000a3', false) $$,
  'admin desactiva al vendedor recién finalizado'
);
select is(
  (select is_active from public.profiles where id = 'f4000000-0000-0000-0000-0000000000a3'),
  false, 'queda is_active = false'
);

reset role;
reset request.jwt.claims;

-- El camino real (RPC), no un UPDATE simulado: verifica que el vendedor
-- desactivado pierde el acceso de inmediato, igual que en
-- 04_settings_and_deactivation.sql.
set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (select private.current_store_id()), null,
  'private.current_store_id() es null en cuanto admin_set_seller_active lo desactiva'
);
select is((select count(*) from public.stores)::int, 0, 'el vendedor desactivado no ve ninguna tienda');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$ select public.admin_set_seller_active('f4000000-0000-0000-0000-0000000000a3', true) $$,
  'admin reactiva al vendedor'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f4000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (select private.current_store_id()), 'f4000000-0000-0000-0000-00000000000a'::uuid,
  'al reactivarlo, private.current_store_id() vuelve a devolver su tienda'
);

reset role;
reset request.jwt.claims;

-- Ambas transiciones (desactivar y reactivar) quedan auditadas con el
-- admin real como actor, no con NULL.
select is(
  (select count(*)::int from public.audit_logs
     where entity_type = 'profiles' and entity_id = 'f4000000-0000-0000-0000-0000000000a3'
       and actor_id = 'f4000000-0000-0000-0000-0000000000a1' and action = 'update'),
  3, -- finalize + desactivar + reactivar
  'las 3 transiciones del vendedor quedan auditadas con el admin real como actor'
);

select * from finish();
rollback;
