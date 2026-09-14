-- Fase 1 — Fundación
-- Crea automáticamente el perfil de aplicación cuando se crea un usuario en
-- auth.users. Lee el rol y la tienda exclusivamente de raw_app_meta_data
-- (solo escribible con la clave de servicio / Admin API) — nunca de
-- raw_user_meta_data, que el propio usuario puede modificar desde el cliente.
--
-- Si no hay "role" en app_metadata (p. ej. un usuario creado a mano desde el
-- dashboard de Supabase durante el bootstrap), el perfil se crea sin rol e
-- inactivo: sin acceso a nada hasta que se le asigne explícitamente. Ver el
-- procedimiento de "Primer admin" en docs/ARCHITECTURE.md.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_store_id uuid := nullif(new.raw_app_meta_data ->> 'store_id', '')::uuid;
  v_full_name text := coalesce(new.raw_app_meta_data ->> 'full_name', new.email);
begin
  if v_role is not null and v_role not in ('admin', 'seller') then
    raise exception 'invalid role in app_metadata: %', v_role;
  end if;

  insert into public.profiles (id, full_name, role, store_id, is_active)
  values (
    new.id,
    v_full_name,
    v_role,
    case when v_role = 'seller' then v_store_id else null end,
    v_role is not null
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
