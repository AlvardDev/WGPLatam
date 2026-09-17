-- Onboarding guiado para admin/superadmin nuevos: un tour client-side
-- (components/admin/onboarding/) que se muestra solo una vez, automático en
-- el primer login, y que se puede repetir después desde Ajustes ("Repetir
-- tutorial"). El tour en sí no tiene nada que autorizar (es UX pura, igual
-- que el resto de AdminShell) — esta migración solo guarda cuándo se marcó
-- como visto, para que AdminLayout decida si mostrarlo sin depender de
-- estado local del navegador (que se pierde al cambiar de dispositivo).

alter table public.profiles
  add column onboarding_completed_at timestamptz;

-- Backfill: el tour es para admins/superadmins nuevos de ahora en adelante,
-- no para las cuentas que ya existían antes de esta migración — se marcan
-- como ya vistas para que no les aparezca de sorpresa en su próximo login.
update public.profiles
set onboarding_completed_at = now()
where role in ('admin', 'superadmin');

-- Sin parámetros a propósito: siempre auth.uid(), nunca un id ajeno — ni
-- siquiera un superadmin puede marcar el onboarding de otra cuenta.
create or replace function public.complete_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can complete onboarding' using errcode = '42501';
  end if;

  update public.profiles
  set onboarding_completed_at = now()
  where id = auth.uid();
end;
$$;

comment on function public.complete_onboarding() is
  'Marca (o remarca, en un "repetir tutorial") el onboarding guiado como visto para el admin/superadmin actual.';

revoke all on function public.complete_onboarding() from public;
revoke all on function public.complete_onboarding() from anon;
grant execute on function public.complete_onboarding() to authenticated;
