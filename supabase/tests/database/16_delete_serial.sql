-- delete_serial (2026-09-29): solo admin, solo AVAILABLE, nunca con historial.
begin;
select plan(6);

insert into public.stores (id, code, name, country_code) values
  ('e9000000-0000-0000-0000-00000000000a', 'T-DEL', 'Tienda DEL', 'VE');
insert into auth.users (id, email, raw_app_meta_data) values
  ('e9000000-0000-0000-0000-0000000000a1', 'admin-del@test.local', '{"role":"admin"}'::jsonb),
  ('e9000000-0000-0000-0000-0000000000a2', 'seller-del@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'e9000000-0000-0000-0000-00000000000a'));
insert into public.products (id, code, name, default_warranty_days) values
  ('e9100000-0000-0000-0000-000000000001', 'DEL1', 'Producto DEL', 365);
insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('e9200000-0000-0000-0000-000000000001', 'e9100000-0000-0000-0000-000000000001', 'LOTE-DEL', 365, true);
insert into public.serials (id, product_id, lot_id, serial, barcode, status, status_reason) values
  ('e9300000-0000-0000-0000-000000000001', 'e9100000-0000-0000-0000-000000000001', 'e9200000-0000-0000-0000-000000000001', 'DEL-OK', null, 'AVAILABLE', null),
  ('e9300000-0000-0000-0000-000000000002', 'e9100000-0000-0000-0000-000000000001', 'e9200000-0000-0000-0000-000000000001', 'DEL-BLOCKED', null, 'BLOCKED', 'prueba'),
  ('e9300000-0000-0000-0000-000000000003', 'e9100000-0000-0000-0000-000000000001', 'e9200000-0000-0000-0000-000000000001', 'DEL-WAIVER', null, 'AVAILABLE', null);
insert into public.serial_barcode_waivers (serial_id, store_id, requested_by) values
  ('e9300000-0000-0000-0000-000000000003', 'e9000000-0000-0000-0000-00000000000a', 'e9000000-0000-0000-0000-0000000000a2');

set local role authenticated;

set local request.jwt.claims to '{"sub":"e9000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal1"}';
select throws_like(
  $$ select public.delete_serial('e9300000-0000-0000-0000-000000000001') $$,
  '%only admin%', 'un vendedor no puede borrar seriales'
);

set local request.jwt.claims to '{"sub":"e9000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select throws_like(
  $$ select public.delete_serial('e9300000-0000-0000-0000-000000000002') $$,
  '%only AVAILABLE%', 'no se borra un serial BLOCKED'
);
select throws_like(
  $$ select public.delete_serial('e9300000-0000-0000-0000-000000000003') $$,
  '%violates foreign key%', 'no se borra un serial con historial (solicitud de autorización)'
);
select lives_ok(
  $$ select public.delete_serial('e9300000-0000-0000-0000-000000000001') $$,
  'el admin borra un serial AVAILABLE sin historial'
);
select is(
  (select count(*)::int from public.serials where id = 'e9300000-0000-0000-0000-000000000001'), 0,
  'el serial ya no existe'
);
select throws_like(
  $$ delete from public.lots where id = 'e9200000-0000-0000-0000-000000000001' $$,
  '%violates foreign key%', 'un lote con seriales no se puede borrar (FK RESTRICT)'
);

select * from finish();
rollback;
