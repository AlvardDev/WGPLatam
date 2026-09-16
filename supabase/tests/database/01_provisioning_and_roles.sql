-- Verifica que private.handle_new_user() crea el perfil correcto según
-- app_metadata, y que el CHECK de forma role/store_id se cumple.
begin;
select plan(7);

-- Admin: sin store_id.
insert into auth.users (id, email, raw_app_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'admin1@test.local', '{"role":"admin"}'::jsonb);

select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'admin',
  'el trigger crea el perfil con role=admin desde app_metadata'
);
select is(
  (select store_id from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'un admin nunca tiene store_id'
);
select ok(
  (select is_active from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'un perfil con rol asignado en la invitación queda activo'
);

-- Vendedor: requiere store_id.
insert into public.stores (id, code, name, country_code)
values ('22222222-2222-2222-2222-222222222222', 'T-01', 'Tienda 1', 'VE');

insert into auth.users (id, email, raw_app_meta_data)
values (
  '33333333-3333-3333-3333-333333333333',
  'seller1@test.local',
  jsonb_build_object('role', 'seller', 'store_id', '22222222-2222-2222-2222-222222222222')
);

select is(
  (select store_id from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'un vendedor queda vinculado a la tienda de su invitación'
);

-- Bootstrap sin metadata (p. ej. creado a mano desde el dashboard): sin rol,
-- inactivo. No debe romper la transacción de creación del usuario.
insert into auth.users (id, email, raw_app_meta_data)
values ('44444444-4444-4444-4444-444444444444', 'sinrol@test.local', '{}'::jsonb);

select is(
  (select role from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  null,
  'un usuario sin metadata queda sin rol (sin privilegios), no falla la creación'
);
select ok(
  not (select is_active from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
  'un perfil sin rol queda inactivo por defecto'
);

-- Un rol inválido en app_metadata debe rechazar la creación del usuario.
-- throws_ok compara contra un SQLSTATE, no un mensaje — para el texto del
-- error se usa throws_like (comparación por patrón LIKE).
-- "gerente": rol genuinamente inválido. No usar "superadmin" aquí — desde
-- 2026-09-18 es un rol real (ver 20260918000000_superadmin_role.sql y
-- 13_superadmin.sql), dejó de servir como ejemplo de rol rechazado.
select throws_like(
  $$ insert into auth.users (id, email, raw_app_meta_data)
     values ('55555555-5555-5555-5555-555555555555', 'malo@test.local', '{"role":"gerente"}'::jsonb) $$,
  '%invalid role in app_metadata: gerente%'
);

select * from finish();
rollback;
