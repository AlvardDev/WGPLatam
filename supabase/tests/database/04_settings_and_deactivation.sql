-- app_settings es pública para cualquier usuario activo; notification_settings
-- es exclusiva de admin; desactivar a un vendedor le quita el acceso de
-- inmediato (no espera a que expire el token). Ver docs/DATABASE.md,
-- "app_settings" / "notification_settings", y docs/SECURITY.md.
begin;
select plan(8);

insert into public.stores (id, code, name, country_code)
values ('d0000000-0000-0000-0000-00000000000d', 'T-D', 'Tienda D', 'VE');

insert into auth.users (id, email, raw_app_meta_data) values
  ('d0000000-0000-0000-0000-0000000000d1', 'admin@test.local', '{"role":"admin"}'::jsonb),
  ('d0000000-0000-0000-0000-0000000000d2', 'seller@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'd0000000-0000-0000-0000-00000000000d'));

-- Admin puede leer y actualizar ambas.
set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2"}';

select is((select count(*) from public.app_settings)::int, 1, 'admin ve app_settings');
select is((select count(*) from public.notification_settings)::int, 1, 'admin ve notification_settings');
select lives_ok(
  $$ update public.app_settings set company_name = 'Demo' where id = true $$,
  'admin puede editar app_settings'
);

reset role;
reset request.jwt.claims;

-- Un vendedor activo ve app_settings (lo necesita para el comprobante) pero
-- nunca notification_settings. Ambas tablas dan GRANT de SELECT a
-- "authenticated" (documentado en DATABASE.md): la restricción real es
-- puramente RLS, así que filtra a 0 filas sin lanzar excepción — no es
-- "permission denied" como con anon (verificado contra el proyecto real).
set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

select is((select count(*) from public.app_settings)::int, 1, 'un vendedor activo ve app_settings');
select is(
  (select count(*) from public.notification_settings)::int,
  0,
  'un vendedor nunca ve notification_settings (correos internos de aviso)'
);
-- app_settings_admin_update es solo para admin: sin una política de UPDATE
-- aplicable, RLS no lanza excepción, simplemente no actualiza ninguna fila
-- (mismo comportamiento que en 02_rls_isolation.sql con "stores"). Se
-- verifica que el valor sigue siendo el que dejó el admin ('Demo'), no que
-- falle con un error.
update public.app_settings set company_name = 'hackeado' where id = true;
select is(
  (select company_name from public.app_settings where id = true),
  'Demo',
  'el UPDATE del vendedor sobre app_settings no tuvo ningún efecto'
);

reset role;
reset request.jwt.claims;

-- Desactivar al vendedor (lo hace el admin, vía service role en la app real;
-- aquí se simula el UPDATE directo) le quita el acceso a app_settings de
-- inmediato, sin esperar a que expire su sesión.
update public.profiles set is_active = false where id = 'd0000000-0000-0000-0000-0000000000d2';

set local role authenticated;
set local request.jwt.claims to '{"sub":"d0000000-0000-0000-0000-0000000000d2","role":"authenticated"}';

select is(
  (select count(*) from public.app_settings)::int,
  0,
  'un vendedor desactivado pierde el acceso a app_settings de inmediato'
);
select is(
  (select private.current_store_id()),
  null,
  'private.current_store_id() es null en cuanto is_active pasa a false'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
