-- Estado de invitación por vendedor: la tabla "Vendedores" solo mostraba
-- is_active (baneado o no), sin distinguir a un vendedor recién invitado
-- que todavía no aceptó (no hizo login) de uno que ya aceptó. La respuesta
-- vive en auth.users (last_sign_in_at / invited_at), no en public.profiles,
-- así que hace falta un RPC SECURITY DEFINER (mismo patrón que
-- admin_finalize_seller_profile) en vez de exponer auth.users por RLS.
create or replace function public.admin_list_seller_invite_status()
returns table (id uuid, invite_status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can view invite status' using errcode = '42501';
  end if;

  return query
    select p.id,
      case
        when u.last_sign_in_at is not null then 'accepted'
        when u.invited_at is not null then 'pending'
        else 'unknown'
      end
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'seller';
end;
$$;

comment on function public.admin_list_seller_invite_status() is
  'Por vendedor: "accepted" si ya inició sesión (aceptó la invitación), "pending" si fue invitado y no ha entrado, "unknown" si no aplica. Solo admin/superadmin.';

revoke all on function public.admin_list_seller_invite_status() from public;
revoke all on function public.admin_list_seller_invite_status() from anon;
grant execute on function public.admin_list_seller_invite_status() to authenticated;
