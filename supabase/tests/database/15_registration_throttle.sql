-- Throttle de /registro por IP (2026-09-16) — mitigación del riesgo
-- "registro público de vendedor scriptable" (docs/SECURITY.md). Ver
-- supabase/migrations/20260918040000_registration_throttle.sql.
begin;
select plan(7);

set local role anon;
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.1') $$, 'primer intento permitido'
);
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.1') $$, 'segundo intento permitido'
);
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.1') $$, 'tercer intento permitido'
);
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.1') $$, 'cuarto intento permitido'
);
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.1') $$, 'quinto intento permitido (límite)'
);
select throws_like(
  $$ select public.check_registration_throttle('10.0.0.1') $$,
  '%too many registration attempts%', 'sexto intento en la misma hora queda bloqueado'
);
reset role;

set local role anon;
select lives_ok(
  $$ select public.check_registration_throttle('10.0.0.2') $$, 'otra IP no comparte el contador'
);
reset role;

select * from finish();
rollback;
