-- Editar un vendedor ya activo (nombre, tienda) desde /admin/vendedores.
--
-- admin_finalize_seller_profile (Fase 4) solo sirve para el aprovisionamiento
-- inicial: falla a propósito con "already provisioned" si role ya no es
-- null. No hay ningún RPC que permita corregir el nombre de un vendedor con
-- un typo, o reasignarlo a otra tienda, sin pasar por Auth de nuevo — falta
-- real encontrada al pedir un ícono de editar en la lista de vendedores.
--
-- Mismo patrón que admin_finalize_seller_profile: SECURITY DEFINER,
-- search_path='', re-verifica is_admin() y el estado de la tienda destino,
-- y exige FOR UPDATE sobre el perfil para que dos ediciones concurrentes del
-- mismo vendedor no se pisen. A diferencia de esa función, exige que el
-- perfil YA sea role='seller' (lo opuesto: aquí "not provisioned" es el
-- error, no el caso feliz) y no toca is_active ni role — desactivar sigue
-- siendo admin_set_seller_active, no se mezclan los dos conceptos.
create or replace function public.admin_update_seller_profile(
  p_user_id uuid,
  p_full_name text,
  p_store_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_active boolean;
  v_current_role text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can update seller profiles' using errcode = '42501';
  end if;

  if p_full_name is null or length(trim(p_full_name)) = 0 then
    raise exception 'full name is required';
  end if;

  select is_active into v_store_active from public.stores where id = p_store_id;
  if not found then
    raise exception 'store not found';
  end if;
  if not v_store_active then
    raise exception 'store is not active';
  end if;

  select role into v_current_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found';
  end if;
  if v_current_role is distinct from 'seller' then
    raise exception 'target is not a seller';
  end if;

  update public.profiles
  set full_name = trim(p_full_name), store_id = p_store_id
  where id = p_user_id;
end;
$$;

comment on function public.admin_update_seller_profile(uuid, text, uuid) is
  'Actualiza nombre y tienda de un vendedor ya activo (role=seller). No cambia is_active ni el rol -- eso sigue siendo admin_set_seller_active. Falla si el perfil no es de un vendedor ya aprovisionado, o si la tienda destino no existe/está inactiva. Solo admin.';

revoke all on function public.admin_update_seller_profile(uuid, text, uuid) from public;
revoke all on function public.admin_update_seller_profile(uuid, text, uuid) from anon;
grant execute on function public.admin_update_seller_profile(uuid, text, uuid) to authenticated;
