-- audit_logs es append-only y log_audit_event está restringido a eventos
-- de auth y a usuarios autenticados. Ver docs/SECURITY.md, "Reglas no
-- negociables".
--
-- Nota sobre las aserciones de UPDATE/DELETE/EXECUTE: revocamos el permiso
-- de SQL (GRANT) de UPDATE/DELETE a authenticated/anon/service_role y de
-- EXECUTE a anon, así que para esos roles el error real es "permission
-- denied" — nunca llegan a disparar el trigger ni la lógica interna de la
-- función. Se compara por mensaje (throws_like), no por SQLSTATE: el
-- throws_ok(sql, sqlstate, description) de 3 argumentos de esta versión de
-- pgTAP no resuelve el segundo argumento como código de error (se comprobó
-- contra el proyecto real: compara "wanted" contra el propio texto de la
-- descripción, no contra el SQLSTATE) — throws_like es inequívoco.
-- El trigger private.block_audit_mutation() es la segunda capa: se prueba
-- directamente con el rol dueño de la tabla (el contexto por defecto de
-- este archivo), que sí tiene el permiso de SQL pero de todas formas queda
-- bloqueado por el trigger.
begin;
select plan(9);

insert into auth.users (id, email, raw_app_meta_data)
values ('c0000000-0000-0000-0000-00000000000c', 'admin@test.local', '{"role":"admin"}'::jsonb);

-- El INSERT del usuario ya debió generar auditoría (trigger sobre profiles).
select ok(
  (select count(*) from public.audit_logs where entity_type = 'profiles') > 0,
  'crear un perfil queda auditado automáticamente'
);

-- anon no puede invocar log_audit_event.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_like(
  $$ select public.log_audit_event('login') $$,
  '%permission denied%',
  'anon no tiene EXECUTE sobre log_audit_event'
);
reset role;
reset request.jwt.claims;

-- Un usuario autenticado sí puede, pero solo con acciones de la allow-list.
set local role authenticated;
set local request.jwt.claims to '{"sub":"c0000000-0000-0000-0000-00000000000c","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$ select public.log_audit_event('login') $$,
  'login es una acción permitida'
);
select throws_like(
  $$ select public.log_audit_event('delete_everything') $$,
  '%unsupported action%',
  'una acción fuera de la allow-list se rechaza'
);
select is(
  (select actor_id from public.audit_logs where action = 'login' order by id desc limit 1),
  'c0000000-0000-0000-0000-00000000000c'::uuid,
  'log_audit_event usa auth.uid(), no un actor_id que envíe el cliente'
);

-- Ni siquiera un admin autenticado por la API tiene el GRANT para tocar
-- audit_logs (primera capa: privilegios de SQL, ni llega al trigger).
select throws_like(
  $$ update public.audit_logs set action = 'manipulado' where true $$,
  '%permission denied%',
  'un admin autenticado no tiene GRANT de UPDATE sobre audit_logs'
);
select throws_like(
  $$ delete from public.audit_logs $$,
  '%permission denied%',
  'un admin autenticado no tiene GRANT de DELETE sobre audit_logs'
);

reset role;
reset request.jwt.claims;

-- Tampoco el rol de servicio (mismo motivo: sin GRANT).
set local role service_role;
select throws_like(
  $$ update public.audit_logs set action = 'x' where true $$,
  '%permission denied%',
  'service_role tampoco tiene GRANT de UPDATE sobre audit_logs'
);
reset role;

-- Segunda capa: el dueño de la tabla SÍ tiene privilegio de SQL (los
-- dueños siempre lo tienen), y aun así el trigger lo bloquea. Esto es lo
-- que realmente prueba que "append-only" no depende solo de los GRANT.
select throws_like(
  $$ update public.audit_logs set action = 'manipulado' where true $$,
  '%append-only%',
  'ni el dueño de la tabla puede saltarse el trigger append-only'
);

select * from finish();
rollback;
