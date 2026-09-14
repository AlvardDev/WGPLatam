-- El test central de la Fase 1: aislamiento por tienda y mínimo privilegio
-- a nivel de Postgres. Ver docs/DATABASE.md "RLS" y los casos de
-- docs/SECURITY.md "Tests de seguridad por fase" (Fase 1).
begin;
select plan(14);

insert into public.stores (id, code, name, country_code) values
  ('a0000000-0000-0000-0000-00000000000a', 'T-A', 'Tienda A', 'VE'),
  ('b0000000-0000-0000-0000-00000000000b', 'T-B', 'Tienda B', 'VE');

insert into auth.users (id, email, raw_app_meta_data) values
  ('a0000000-0000-0000-0000-0000000000a1', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('a0000000-0000-0000-0000-0000000000a2', 'sellerA@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'a0000000-0000-0000-0000-00000000000a')),
  ('a0000000-0000-0000-0000-0000000000a3', 'sellerB@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'b0000000-0000-0000-0000-00000000000b'));

-- ---------------------------------------------------------------------------
-- anon: cero acceso
-- ---------------------------------------------------------------------------
-- JSON válido sin "sub": auth.uid() debe resolver a NULL, no fallar el
-- cast a json (una cadena vacía sí lo haría fallar).
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- anon no tiene GRANT sobre estas tablas (revocado en la migración rls):
-- la consulta falla en la capa de privilegios, ni siquiera llega a
-- evaluar RLS. No es "ve 0 filas", es "no puede consultar" — verificado
-- contra el proyecto real (ver docs/PROGRESS.md, checkpoint de verificación).
select throws_like($$ select count(*) from public.stores $$, '%permission denied%', 'anon no puede ni siquiera consultar tiendas');
select throws_like($$ select count(*) from public.profiles $$, '%permission denied%', 'anon no puede ni siquiera consultar perfiles');
select throws_like($$ select count(*) from public.app_settings $$, '%permission denied%', 'anon no puede ni siquiera consultar app_settings');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- admin: acceso global
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is((select count(*) from public.stores)::int, 2, 'admin ve todas las tiendas');
select is((select count(*) from public.profiles)::int, 3, 'admin ve todos los perfiles');
select ok((select private.is_admin()), 'private.is_admin() true para el admin');
select is((select private.current_store_id()), null, 'private.current_store_id() es null para un admin');

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- vendedor de la tienda A: solo su tienda, nunca la B
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select private.current_store_id()),
  'a0000000-0000-0000-0000-00000000000a'::uuid,
  'private.current_store_id() devuelve la tienda del perfil'
);
select is((select count(*) from public.stores)::int, 1, 'el vendedor de A ve exactamente 1 tienda');
select is(
  (select id from public.stores limit 1),
  'a0000000-0000-0000-0000-00000000000a'::uuid,
  'esa tienda es la A, no la B'
);
select is((select count(*) from public.profiles)::int, 1, 'el vendedor solo ve su propio perfil, no los de otros');
select ok(not (select private.is_admin()), 'private.is_admin() false para un vendedor');

-- stores_seller_select_own es de solo SELECT: no habilita el UPDATE. Sin
-- una política de UPDATE/ALL que le aplique, RLS no ve ninguna fila que
-- actualizar — el UPDATE no lanza excepción, simplemente afecta 0 filas
-- (comportamiento estándar de Postgres con RLS, no un error). Por eso se
-- verifica el efecto, no una excepción.
update public.stores set name = 'hackeado' where id = 'a0000000-0000-0000-0000-00000000000a';

reset role;
reset request.jwt.claims;

select is(
  (select name from public.stores where id = 'a0000000-0000-0000-0000-00000000000a'),
  'Tienda A',
  'el UPDATE del vendedor no tuvo ningún efecto: RLS lo filtró en silencio'
);

-- ---------------------------------------------------------------------------
-- vendedor de la tienda B: nunca ve nada de la A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"a0000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select is(
  (select id from public.stores limit 1),
  'b0000000-0000-0000-0000-00000000000b'::uuid,
  'el vendedor de B solo ve la tienda B'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
