-- Fase 2 — products y lots: catálogo de escritura directa vía RLS admin.
-- Mismo patrón que 02_rls_isolation.sql: para roles con GRANT de tabla
-- (authenticated tiene insert/update/delete en products/lots), un UPDATE sin
-- política aplicable no lanza excepción, solo no afecta filas — se verifica
-- el efecto, no una excepción (lección de la Fase 1, repetida aquí).
begin;
select plan(19);

insert into public.stores (id, code, name, country_code) values
  ('e2000000-0000-0000-0000-00000000000a', 'T-P2', 'Tienda P2', 'VE');
insert into auth.users (id, email, raw_app_meta_data) values
  ('e2000000-0000-0000-0000-0000000000a1', 'admin-p2@test.local', '{"role":"admin"}'::jsonb),
  ('e2000000-0000-0000-0000-0000000000a2', 'seller-p2@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'e2000000-0000-0000-0000-00000000000a'));

set local role authenticated;
set local request.jwt.claims to '{"sub":"e2000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$ insert into public.products (code, name, default_warranty_days) values ('  x100  ', 'Producto X100', 365) $$,
  'admin puede crear un producto'
);
select is(
  (select code from public.products where name = 'Producto X100'), 'X100',
  'el código se normaliza (trim + mayúsculas) al crear'
);
select throws_like(
  $$ insert into public.products (code, name, default_warranty_days) values ('X100', 'Otro', 100) $$,
  '%duplicate key%', 'código de producto duplicado se rechaza'
);
select throws_like(
  $$ insert into public.products (code, name, default_warranty_days) values ('X200', 'Malo', -5) $$,
  '%products_warranty_days_positive%', 'duración de garantía negativa se rechaza'
);
select throws_like(
  $$ update public.products set code = 'X999' where code = 'X100' $$,
  '%inmutable%', 'products.code es inmutable después de creado'
);
select lives_ok(
  $$ update public.products set is_active = false where code = 'X100' $$, 'admin puede desactivar un producto'
);
select lives_ok(
  $$ update public.products set is_active = true where code = 'X100' $$, 'admin puede reactivar un producto'
);
select lives_ok(
  $$ insert into public.lots (id, product_id, code, warranty_days)
     values ('e2100000-0000-0000-0000-000000000012', (select id from public.products where code='X100'), ' import-001 ', 365) $$,
  'admin puede crear un lote'
);
select is(
  (select code from public.lots where id = 'e2100000-0000-0000-0000-000000000012'), 'IMPORT-001',
  'el código de lote también se normaliza'
);
select lives_ok(
  $$ insert into public.products (code, name, default_warranty_days) values ('Y200', 'Producto Y200', 180) $$,
  'admin crea un segundo producto'
);
select lives_ok(
  $$ insert into public.lots (product_id, code, warranty_days)
     values ((select id from public.products where code='Y200'), 'IMPORT-001', 180) $$,
  'el mismo código de lote "IMPORT-001" es válido en un producto distinto (unique por producto, no global)'
);
select throws_like(
  $$ insert into public.lots (product_id, code, warranty_days)
     values ((select id from public.products where code='X100'), 'IMPORT-001', 365) $$,
  '%duplicate key%', 'el mismo código repetido en el MISMO producto sí se rechaza'
);
select throws_like(
  $$ insert into public.lots (product_id, code, warranty_days) values (gen_random_uuid(), 'Z1', 100) $$,
  '%violates foreign key%', 'un lote no puede apuntar a un producto inexistente'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"e2000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.products)::int, 2, 'seller ve los 2 productos activos');
select is((select count(*) from public.lots)::int, 0, 'seller no ve ningún lote');

update public.products set name = 'hackeado' where code = 'X100';
select is(
  (select name from public.products where code = 'X100'), 'Producto X100',
  'el UPDATE del seller sobre products no tuvo ningún efecto (RLS lo filtró en silencio)'
);

reset role;
reset request.jwt.claims;

update public.products set is_active = false where code = 'X100';

set local role authenticated;
set local request.jwt.claims to '{"sub":"e2000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is((select count(*) from public.products)::int, 1, 'seller ya no ve un producto desactivado');
reset role;
reset request.jwt.claims;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_like($$ select count(*) from public.products $$, '%permission denied%', 'anon no puede consultar products');
select throws_like($$ select count(*) from public.lots $$, '%permission denied%', 'anon no puede consultar lots');
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
