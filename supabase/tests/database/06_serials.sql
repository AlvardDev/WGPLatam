-- Fase 2 — serials: máquina de estados, 100% RPC. Ver docs/PHASE-2-REVIEW.md.
--
-- Nota sobre concurrencia: las 3 RPC de transición (block/unblock/void)
-- usan "select ... for update" para bloquear la fila mientras deciden si la
-- transición es válida — ese es el mecanismo real contra condiciones de
-- carrera (dos admins intentando transicionar el mismo serial a la vez).
-- pgTAP corre en una sola conexión secuencial: no puede simular dos
-- transacciones concurrentes reales sin herramientas de isolation testing
-- dedicadas (fuera de alcance de esta fase). El mecanismo se verifica por
-- inspección del código de la función, no por un test automatizado aquí.
begin;
select plan(24);

insert into public.stores (id, code, name, country_code) values
  ('e3000000-0000-0000-0000-00000000000a', 'T-P2S', 'Tienda P2S', 'VE');
insert into auth.users (id, email, raw_app_meta_data) values
  ('e3000000-0000-0000-0000-0000000000a1', 'admin-s@test.local', '{"role":"admin"}'::jsonb),
  ('e3000000-0000-0000-0000-0000000000a2', 'seller-s@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'e3000000-0000-0000-0000-00000000000a'));

insert into public.products (id, code, name, default_warranty_days) values
  ('e3100000-0000-0000-0000-000000000001', 'S100', 'Producto S100', 365);
insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('e3200000-0000-0000-0000-000000000001', 'e3100000-0000-0000-0000-000000000001', 'LOTE-A', 365, true),
  ('e3200000-0000-0000-0000-000000000002', 'e3100000-0000-0000-0000-000000000001', 'LOTE-INACTIVO', 365, false);
insert into public.products (id, code, name, default_warranty_days) values
  ('e3100000-0000-0000-0000-000000000002', 'S200', 'Producto S200', 365);

set local role authenticated;
set local request.jwt.claims to '{"sub":"e3000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', '  abc-001  ', '750000001') $$,
  'admin puede crear un serial'
);
select is(
  (select status from public.serials where serial = 'ABC-001'), 'AVAILABLE',
  'el serial normalizado queda AVAILABLE'
);
select throws_like(
  $$ insert into public.serials (product_id, lot_id, serial, barcode)
     values ('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', 'DIRECTO-1', 'DIRECTO-BC') $$,
  '%permission denied%', 'ni el admin puede insertar directo en serials (sin GRANT de tabla)'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', 'ABC-001', '750000002') $$,
  '%collision%', 'serial duplicado exacto se rechaza'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', ' abc-001 ', '750000003') $$,
  '%collision%', 'serial duplicado por normalización (espacios/mayúsculas) se rechaza'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', '750000001', 'ABC-999') $$,
  '%collision%', 'un serial nuevo no puede coincidir con el barcode de otra unidad'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', 'ABC-999', 'ABC-001') $$,
  '%collision%', 'un barcode nuevo no puede coincidir con el serial de otra unidad'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', 'IGUAL-1', 'IGUAL-1') $$,
  '%must differ%', 'serial y barcode no pueden ser iguales en la misma unidad'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000002', 'e3200000-0000-0000-0000-000000000001', 'CRUZADO-1', 'CRUZADO-BC') $$,
  '%does not belong%', 'un lote de otro producto se rechaza'
);
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000002', 'INACTIVO-1', 'INACTIVO-BC') $$,
  '%not active%', 'no se puede crear un serial en un lote inactivo'
);
select is(
  (select imported_count from public.lots where id = 'e3200000-0000-0000-0000-000000000001')::int, 1,
  'lots.imported_count se actualiza automáticamente al crear un serial'
);
select throws_like(
  $$ select public.block_serial((select id from public.serials where serial='ABC-001'), '') $$,
  '%reason is required%', 'block_serial exige un motivo no vacío'
);
select lives_ok(
  $$ select public.block_serial((select id from public.serials where serial='ABC-001'), 'dañado en bodega') $$,
  'admin puede bloquear un serial AVAILABLE'
);
select is(
  (select status from public.serials where serial='ABC-001'), 'BLOCKED', 'el serial queda BLOCKED con su motivo'
);
select throws_like(
  $$ select public.block_serial((select id from public.serials where serial='ABC-001'), 'otra vez') $$,
  '%invalid transition%', 'no se puede bloquear un serial ya BLOCKED'
);
select lives_ok(
  $$ select public.unblock_serial((select id from public.serials where serial='ABC-001')) $$,
  'admin puede desbloquear un serial BLOCKED'
);
select is(
  (select status from public.serials where serial='ABC-001'), 'AVAILABLE', 'vuelve a AVAILABLE'
);
select throws_like(
  $$ select public.unblock_serial((select id from public.serials where serial='ABC-001')) $$,
  '%invalid transition%', 'no se puede desbloquear un serial que ya está AVAILABLE'
);
select lives_ok(
  $$ select public.void_serial((select id from public.serials where serial='ABC-001'), 'nunca se vendió') $$,
  'admin puede anular (VOID) un serial AVAILABLE'
);
select throws_like(
  $$ select public.unblock_serial((select id from public.serials where serial='ABC-001')) $$,
  '%invalid transition%', 'un serial VOID no puede reactivarse'
);
select throws_like(
  $$ select public.void_serial((select id from public.serials where serial='ABC-001'), 'otra vez') $$,
  '%invalid transition%', 'VOID es permanente: no se puede volver a anular'
);

reset role;
reset request.jwt.claims;

-- Vendedor: cero acceso, ni de lectura, ni a ninguna de las 4 RPC.
set local role authenticated;
set local request.jwt.claims to '{"sub":"e3000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.serials)::int, 0, 'seller no ve ningún serial (RLS lo filtra en silencio, tiene GRANT de tabla)');
select throws_like(
  $$ select public.create_serial('e3100000-0000-0000-0000-000000000001', 'e3200000-0000-0000-0000-000000000001', 'SELLER-1', 'SELLER-BC') $$,
  '%only admin%', 'un vendedor no puede invocar create_serial'
);
select throws_like(
  $$ select public.block_serial('e3100000-0000-0000-0000-000000000001'::uuid, 'x') $$,
  '%only admin%', 'un vendedor no puede invocar block_serial'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
