-- Fase 9 — Auto-registro de vendedores + aprobación manual, para no depender
-- del cupo de correo de Supabase (2 correos/hora en el proveedor incluido,
-- ver docs/PROGRESS.md). El vendedor se registra solo desde un server action
-- público (lib/actions/registro.ts, auth.admin.createUser con
-- email_confirm: true — nunca dispara un correo de confirmación) y
-- private.handle_new_user() ya lo deja exactamente en el mismo estado "sin
-- aprovisionar" que el bootstrap manual histórico (role null, is_active
-- false, sin acceso a nada por RLS): no hace falta tocar esa función.
--
-- Falta una sola pieza nueva de esquema: dónde anotar que un vendedor YA
-- ACTIVO pidió restablecer su contraseña — no hay ningún estado natural en
-- profiles para eso (a diferencia del registro, que reusa role IS NULL).

create table public.seller_password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  requested_at timestamptz not null default now()
);

comment on table public.seller_password_reset_requests is
  'Un vendedor activo pidió restablecer su contraseña. Sin correo: admin confirma identidad por fuera del sistema (llamada/WhatsApp) y aplica la contraseña nueva a mano desde /admin/vendedores/pendientes — nunca se guarda en esta tabla ni en ninguna otra. unique(user_id): pedir de nuevo solo actualiza la fecha, no acumula filas (mitiga spam del correo público).';

alter table public.seller_password_reset_requests enable row level security;
revoke all on public.seller_password_reset_requests from anon, authenticated, public;

create policy seller_password_reset_requests_select_admin
  on public.seller_password_reset_requests for select
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- request_seller_password_reset: única función pensada para ser ejecutada
-- por "anon" (el vendedor todavía no tiene sesión — olvidó su contraseña).
-- Nunca revela si el correo existe ni si es de un vendedor (mismo criterio
-- que requestPasswordReset en lib/actions/auth.ts): sin match, no hace nada
-- y no falla — el llamador ve siempre el mismo mensaje genérico.
-- ---------------------------------------------------------------------------
create or replace function public.request_seller_password_reset(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id into v_user_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where u.email = p_email and p.role = 'seller' and p.is_active;

  if v_user_id is not null then
    insert into public.seller_password_reset_requests (user_id, requested_at)
    values (v_user_id, now())
    on conflict (user_id) do update set requested_at = excluded.requested_at;
  end if;
end;
$$;

comment on function public.request_seller_password_reset(text) is
  'Pública (anon): un vendedor que olvidó su contraseña deja constancia para que admin la resuelva a mano en /admin/vendedores/pendientes. Nunca revela si el correo existe.';

revoke all on function public.request_seller_password_reset(text) from public;
grant execute on function public.request_seller_password_reset(text) to anon, authenticated;

-- admin_resolve_password_reset_request: borra la solicitud una vez aplicada
-- la contraseña nueva. lib/actions/registro.ts llama primero
-- auth.admin.updateUserById con la contraseña (nunca persistida en la base)
-- y solo después esto, para limpiar la solicitud del módulo.
create or replace function public.admin_resolve_password_reset_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can resolve password reset requests' using errcode = '42501';
  end if;

  delete from public.seller_password_reset_requests where id = p_request_id;
end;
$$;

comment on function public.admin_resolve_password_reset_request(uuid) is
  'Borra una solicitud de restablecimiento ya resuelta a mano. Solo admin/superadmin.';

revoke all on function public.admin_resolve_password_reset_request(uuid) from public;
revoke all on function public.admin_resolve_password_reset_request(uuid) from anon;
grant execute on function public.admin_resolve_password_reset_request(uuid) to authenticated;
