-- Fase 8 — private.is_admin() exige aal2 + throttle de lookup_serial. Ver
-- docs/PROJECT-PLAN.md (fila F8) y docs/SECURITY.md, "MFA" y "Riesgos y
-- mitigaciones" (fila "Enumeración de seriales").
--
-- private.is_admin() es el único punto de cambio: no hace falta repetir
-- aquí los ~70 casos ya cubiertos en 02-11 (todos pasan aal2 ahora, ver el
-- sed aplicado a sus fixtures) — este archivo prueba el choke point en sí
-- mismo (is_admin() directo + una integración real vía RLS de audit_logs)
-- y el throttle nuevo.
begin;
select plan(8);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f8000000-0000-0000-0000-00000000000a', 'T-F8A', 'Tienda F8 A', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f8000000-0000-0000-0000-0000000000a1', 'admin-f8@test.local', '{"role":"admin"}'::jsonb),
  ('f8000000-0000-0000-0000-0000000000a2', 'seller-f8a@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f8000000-0000-0000-0000-00000000000a')),
  ('f8000000-0000-0000-0000-0000000000a3', 'seller-f8b@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f8000000-0000-0000-0000-00000000000a'));

-- ---------------------------------------------------------------------------
-- private.is_admin(): rol admin activo por sí solo ya no basta.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select private.is_admin()),
  false,
  'admin sin claim aal (equivale a aal1) no pasa is_admin()'
);
reset request.jwt.claims;

set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select is(
  (select private.is_admin()),
  true,
  'admin con aal2 pasa is_admin()'
);
reset request.jwt.claims;

set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a2","role":"authenticated","aal":"aal2"}';
select is(
  (select private.is_admin()),
  false,
  'vendedor con aal2 sigue sin ser admin (el rol también se re-verifica)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Integración real vía RLS: audit_logs_select_admin llama a is_admin(). Ya
-- hay filas (el INSERT de auth.users de arriba disparó auditoría sobre
-- profiles).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select count(*)::int from public.audit_logs),
  0,
  'admin en aal1 no ve ninguna fila de audit_logs (RLS lo bloquea, no solo la RPC)'
);
reset request.jwt.claims;

set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select ok(
  (select count(*)::int from public.audit_logs) > 0,
  'el mismo admin en aal2 sí ve la auditoría'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Throttle de lookup_serial: 30/min por usuario.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

insert into public.products (id, code, name, default_warranty_days) values
  ('f8100000-0000-0000-0000-000000000001', 'F8-P1', 'Producto F8', 365);
insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('f8200000-0000-0000-0000-000000000001', 'f8100000-0000-0000-0000-000000000001', 'LOTE-F8-1', 365, true);
select public.create_serial('f8100000-0000-0000-0000-000000000001', 'f8200000-0000-0000-0000-000000000001', 'F8-SER-1', 'F8-SER-1-BC');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ do $loop$
       begin
         for i in 1..30 loop
           perform public.lookup_serial('F8-SER-1');
         end loop;
       end
     $loop$ $$,
  '30 búsquedas del mismo vendedor en el minuto quedan dentro del límite'
);
select throws_like(
  $$ select * from public.lookup_serial('F8-SER-1') $$,
  '%too many lookups%',
  'la búsqueda 31 en el mismo minuto es rechazada'
);
reset request.jwt.claims;

set local request.jwt.claims to '{"sub":"f8000000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select lives_ok(
  $$ select * from public.lookup_serial('F8-SER-1') $$,
  'otro vendedor tiene su propio contador y no hereda el throttle ajeno'
);
reset role;
reset request.jwt.claims;

select * from finish();
rollback;
