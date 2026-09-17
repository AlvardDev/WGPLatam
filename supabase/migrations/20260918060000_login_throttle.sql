-- Throttle de fuerza bruta en /login (2026-09-17), decisión explícita del
-- usuario: mismo patrón de ventana fija que lookup_serial_attempts (Fase 8)
-- y el ya retirado registration_attempts, pero por correo (normalizado) en
-- vez de auth.uid()/ip — el intento de login ocurre sin sesión todavía y el
-- correo puede no corresponder a ninguna cuenta real (nunca se revela).
--
-- 3 funciones en vez de 1 (a diferencia de check_registration_throttle)
-- porque acá el resultado del intento se conoce recién después de llamar a
-- signInWithPassword: check antes de intentar, record_failed_login solo si
-- falla, clear_login_attempts si tuvo éxito (para que un typo aislado no
-- cuente contra un login legítimo posterior).
create table public.login_attempts (
  email text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

comment on table public.login_attempts is
  'Throttle de /login (Fase 9): ventana fija de 15 minutos por correo (normalizado), 5 intentos fallidos. Solo la tocan check_login_throttle/record_failed_login/clear_login_attempts.';

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated, public;

create or replace function public.check_login_throttle(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := '15 minutes';
  v_limit constant integer := 5;
  v_email text := lower(trim(p_email));
  v_attempts integer;
  v_window_start timestamptz;
begin
  select attempts, window_start into v_attempts, v_window_start
  from public.login_attempts where email = v_email;

  if v_attempts is not null and v_attempts >= v_limit and v_window_start >= now() - v_window then
    raise exception 'too many failed login attempts, try again later';
  end if;
end;
$$;

comment on function public.check_login_throttle(text) is
  'Pública (anon): rechaza el intento de login si ya hubo 5+ fallos en los últimos 15 minutos para ese correo. Solo lee, no muta — lib/actions/auth.ts la llama antes de signInWithPassword.';

revoke all on function public.check_login_throttle(text) from public;
grant execute on function public.check_login_throttle(text) to anon, authenticated;

create or replace function public.record_failed_login(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := '15 minutes';
  v_email text := lower(trim(p_email));
begin
  insert into public.login_attempts as t (email, window_start, attempts)
  values (v_email, now(), 1)
  on conflict (email) do update
    set attempts = case
          when t.window_start < now() - v_window then 1
          else t.attempts + 1
        end,
        window_start = case
          when t.window_start < now() - v_window then now()
          else t.window_start
        end;
end;
$$;

comment on function public.record_failed_login(text) is
  'Pública (anon): suma un intento fallido de login para ese correo. lib/actions/auth.ts la llama solo cuando signInWithPassword devuelve error.';

revoke all on function public.record_failed_login(text) from public;
grant execute on function public.record_failed_login(text) to anon, authenticated;

create or replace function public.clear_login_attempts(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.login_attempts where email = lower(trim(p_email));
end;
$$;

comment on function public.clear_login_attempts(text) is
  'Borra el contador de intentos fallidos de un correo tras un login exitoso. lib/actions/auth.ts la llama después de un signInWithPassword exitoso.';

revoke all on function public.clear_login_attempts(text) from public;
grant execute on function public.clear_login_attempts(text) to anon, authenticated;
