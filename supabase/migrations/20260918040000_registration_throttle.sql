-- Throttle de /registro (auto-registro público de vendedor, Fase 9): mismo
-- riesgo de abuso que lookup_serial (docs/SECURITY.md, "Riesgos y
-- mitigaciones") pero sin auth.uid() para identificar al llamador — el
-- registrante todavía no tiene sesión. Se limita por IP en vez de por
-- usuario, mismo patrón de ventana fija que lookup_serial_attempts (Fase 8).
-- ponytail: ventana fija, no sliding window/token bucket — igual que
-- lookup_serial_attempts, puede dejar pasar una ráfaga doble justo en el
-- borde de la ventana; sube a token bucket si hace falta más precisión.
create table public.registration_attempts (
  ip text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

comment on table public.registration_attempts is
  'Throttle de registerSeller (Fase 9): ventana fija de 1 hora por IP. Solo la toca check_registration_throttle.';

alter table public.registration_attempts enable row level security;
revoke all on public.registration_attempts from anon, authenticated, public;

create or replace function public.check_registration_throttle(p_ip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window constant interval := '1 hour';
  v_limit constant integer := 5;
  v_attempts integer;
begin
  insert into public.registration_attempts as t (ip, window_start, attempts)
  values (p_ip, now(), 1)
  on conflict (ip) do update
    set attempts = case
          when t.window_start < now() - v_window then 1
          else t.attempts + 1
        end,
        window_start = case
          when t.window_start < now() - v_window then now()
          else t.window_start
        end
  returning t.attempts into v_attempts;

  if v_attempts > v_limit then
    raise exception 'too many registration attempts, try again later';
  end if;
end;
$$;

comment on function public.check_registration_throttle(text) is
  'Pública (anon): límite de 5 registros/hora por IP contra /registro. Levanta excepción si se supera.';

revoke all on function public.check_registration_throttle(text) from public;
grant execute on function public.check_registration_throttle(text) to anon, authenticated;
