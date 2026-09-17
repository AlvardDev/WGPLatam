-- Throttle de fuerza bruta en /login (2026-09-17). Ver
-- supabase/migrations/20260918060000_login_throttle.sql.
begin;
select plan(10);

set local role anon;

-- 5 fallos permitidos, el 6to bloquea.
select lives_ok($$ select public.record_failed_login('brute-f15@test.local') $$, 'fallo 1 registrado');
select lives_ok($$ select public.record_failed_login('brute-f15@test.local') $$, 'fallo 2 registrado');
select lives_ok($$ select public.record_failed_login('brute-f15@test.local') $$, 'fallo 3 registrado');
select lives_ok($$ select public.record_failed_login('brute-f15@test.local') $$, 'fallo 4 registrado');
select lives_ok($$ select public.record_failed_login('brute-f15@test.local') $$, 'fallo 5 registrado');
select throws_like(
  $$ select public.check_login_throttle('brute-f15@test.local') $$,
  '%too many failed login attempts%',
  'al 6to intento, check_login_throttle bloquea'
);

-- Normalización: mismo correo con mayúsculas/espacios comparte el contador.
select throws_like(
  $$ select public.check_login_throttle('  Brute-F15@Test.Local  ') $$,
  '%too many failed login attempts%',
  'el bloqueo aplica sin importar mayúsculas o espacios en el correo'
);

-- Otro correo no comparte el contador.
select lives_ok(
  $$ select public.check_login_throttle('otro-f15@test.local') $$,
  'un correo distinto no está bloqueado'
);

-- Un login exitoso limpia el contador: el correo vuelve a pasar el check.
select lives_ok($$ select public.clear_login_attempts('brute-f15@test.local') $$, 'clear_login_attempts no falla');
select lives_ok(
  $$ select public.check_login_throttle('brute-f15@test.local') $$,
  'tras clear_login_attempts, el correo ya no está bloqueado'
);

reset role;

select * from finish();
rollback;
