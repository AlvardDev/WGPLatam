-- Auto-registro de vendedores + aprobación manual (2026-09-16) — decisión
-- explícita del usuario para no depender del cupo de correo del proveedor
-- incluido de Supabase. El registro y la aprobación en sí (auth.admin.
-- createUser / admin_finalize_seller_profile, ya cubierto en
-- 08_stores_and_sellers.sql) viven en lib/actions/registro.ts, fuera del
-- alcance de pgTAP. Lo que sí es lógica de Postgres y necesita cobertura:
-- request_seller_password_reset (pública, anon) y
-- admin_resolve_password_reset_request (solo admin), más la RLS de
-- seller_password_reset_requests. Ver
-- supabase/migrations/20260918020000_seller_self_registration.sql y
-- 20260918030000_fix_seller_password_reset_requests_grant.sql.
begin;
select plan(11);

insert into public.stores (id, code, name, country_code, is_active) values
  ('fa000000-0000-0000-0000-00000000000a', 'T-FAA', 'Tienda F14 A', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('fa000000-0000-0000-0000-0000000000a1', 'admin-f14@test.local', '{"role":"admin"}'::jsonb),
  ('fa000000-0000-0000-0000-0000000000a2', 'seller-f14@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'fa000000-0000-0000-0000-00000000000a')),
  ('fa000000-0000-0000-0000-0000000000a3', 'inactivo-f14@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'fa000000-0000-0000-0000-00000000000a'));
update public.profiles set is_active = false where id = 'fa000000-0000-0000-0000-0000000000a3';

-- ---------------------------------------------------------------------------
-- request_seller_password_reset: pública (anon), nunca revela si hay match.
-- ---------------------------------------------------------------------------
set local role anon;
select lives_ok(
  $$ select public.request_seller_password_reset('seller-f14@test.local') $$,
  'anon puede pedir restablecimiento para un vendedor activo real'
);
select lives_ok(
  $$ select public.request_seller_password_reset('no-existe-f14@test.local') $$,
  'anon puede llamarlo con un correo que no existe, sin error'
);
select lives_ok(
  $$ select public.request_seller_password_reset('inactivo-f14@test.local') $$,
  'anon puede llamarlo con un vendedor inactivo, sin error'
);
reset role;

select is(
  (select count(*)::int from public.seller_password_reset_requests),
  1, 'solo se creó constancia para el vendedor activo real, no para el inexistente ni el inactivo'
);

set local role anon;
select lives_ok(
  $$ select public.request_seller_password_reset('seller-f14@test.local') $$,
  'pedirlo dos veces no falla'
);
reset role;
select is(
  (select count(*)::int from public.seller_password_reset_requests),
  1, 'unique(user_id): la segunda solicitud actualiza la fila, no la duplica'
);

-- ---------------------------------------------------------------------------
-- RLS: solo admin ve las solicitudes.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"fa000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is(
  (select count(*)::int from public.seller_password_reset_requests),
  0, 'un vendedor no ve las solicitudes de restablecimiento (RLS admin-only)'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"fa000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select is(
  (select count(*)::int from public.seller_password_reset_requests),
  1, 'admin sí ve la solicitud pendiente'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- admin_resolve_password_reset_request: solo admin.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"fa000000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_like(
  $$ select public.admin_resolve_password_reset_request(
       (select id from public.seller_password_reset_requests limit 1)) $$,
  '%only admin%', 'un vendedor no puede resolver una solicitud'
);
reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"fa000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';
select lives_ok(
  $$ select public.admin_resolve_password_reset_request(
       (select id from public.seller_password_reset_requests limit 1)) $$,
  'admin resuelve la solicitud'
);
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.seller_password_reset_requests),
  0, 'la solicitud resuelta queda borrada'
);

select * from finish();
rollback;
