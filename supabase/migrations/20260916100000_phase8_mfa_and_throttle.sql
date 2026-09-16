-- Fase 8 — MFA obligatorio para admin + throttle de lookup_serial
-- Ver docs/PROJECT-PLAN.md (fila F8) y docs/SECURITY.md, "MFA" y "Riesgos y
-- mitigaciones" (fila "Enumeración de seriales"). El visor de auditoría y
-- los eventos de login/logout ya existen desde la Fase 1
-- (audit_logs_select_admin, log_audit_event) — esta migración es solo lo
-- que faltaba de la fila F8: aal2 y el throttle.

-- ---------------------------------------------------------------------------
-- private.is_admin() ahora exige aal2 (sesión con segundo factor
-- verificado), además del rol admin activo. Es el único punto de cambio: el
-- comentario dejado en la Fase 1 ya avisaba de esto. Todo lo que dependía de
-- is_admin() (RLS y RPC de F2 a F7) queda protegido sin tocar esos archivos.
-- auth.jwt() es el helper estándar de Supabase (esquema auth, ya presente en
-- cualquier proyecto) que expone los claims del JWT validado, incluido
-- "aal"; se referencia calificado por esquema porque search_path = ''.
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  )
  and coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

comment on function private.is_admin() is
  'Admin activo Y sesión en aal2 (segundo factor verificado, Fase 8). Sin aal2 un admin no puede operar ni llamando la API directamente.';

-- ---------------------------------------------------------------------------
-- Throttle de lookup_serial: limita cuántas búsquedas puede hacer el mismo
-- vendedor por minuto, mitigación documentada desde la Fase 0 contra
-- enumeración de seriales (docs/SECURITY.md, fila "Enumeración de
-- seriales"). Contador de ventana fija por usuario en su propia tabla, sin
-- RLS con políticas ni GRANT directo: solo lookup_serial (SECURITY DEFINER)
-- la toca, igual de inalcanzable desde la API que audit_logs para UPDATE.
-- ponytail: ventana fija, no sliding window/token bucket — puede dejar
-- pasar una ráfaga doble justo en el borde de la ventana; sube a token
-- bucket si hace falta más precisión.
-- ---------------------------------------------------------------------------
create table public.lookup_serial_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);

comment on table public.lookup_serial_attempts is
  'Throttle de lookup_serial (Fase 8): ventana fija de 1 minuto por vendedor. Solo la toca la propia función SECURITY DEFINER.';

alter table public.lookup_serial_attempts enable row level security;
revoke all on public.lookup_serial_attempts from authenticated, anon, public;

create or replace function public.lookup_serial(p_code text)
returns table (
  serial_id uuid,
  serial text,
  barcode text,
  product_code text,
  product_name text,
  warranty_duration_days integer,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := private.normalize_code(p_code);
  v_user uuid := auth.uid();
  v_window constant interval := '1 minute';
  v_limit constant integer := 30;
  v_attempts integer;
begin
  if (select private.current_store_id()) is null then
    raise exception 'only an active seller can look up serials' using errcode = '42501';
  end if;

  insert into public.lookup_serial_attempts as t (user_id, window_start, attempts)
  values (v_user, now(), 1)
  on conflict (user_id) do update
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
    raise exception 'too many lookups, try again in a minute';
  end if;

  return query
  select s.id, s.serial, s.barcode, p.code, p.name, l.warranty_days, s.status
  from public.serials s
  join public.products p on p.id = s.product_id
  join public.lots l on l.id = s.lot_id
  where s.serial = v_code or s.barcode = v_code;
end;
$$;

comment on function public.lookup_serial(text) is
  'Solo vendedor activo. Coincidencia exacta, columnas mínimas (nunca lot_id/import_id/status_reason). Throttle de 30 intentos/minuto por usuario (Fase 8) contra enumeración de seriales.';

revoke all on function public.lookup_serial(text) from public;
revoke all on function public.lookup_serial(text) from anon;
grant execute on function public.lookup_serial(text) to authenticated;
