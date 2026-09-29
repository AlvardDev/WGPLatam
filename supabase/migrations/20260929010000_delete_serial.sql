-- Borrar un serial cargado por error (typo, duplicado de otro lote...).
--
-- serials no tiene GRANT de DELETE (todas las escrituras son por RPC, Fase
-- 2), así que borrar necesita su propia función. Solo admin y solo un serial
-- AVAILABLE: uno ACTIVATED tiene una garantía (historia del cliente) y uno
-- BLOCKED/VOID quedó así por una decisión que debe seguir visible. Las FK
-- de warranties y serial_barcode_waivers hacia serials son RESTRICT: si
-- alguna fila depende del serial, el DELETE falla solo, sin romper
-- historial. El trigger de auditoría registra el borrado con la fila
-- completa en old_data.
--
-- Tiendas, productos y lotes no necesitan función: el admin ya tiene DELETE
-- por RLS (stores/products/lots_admin_all) y sus FK entrantes también son
-- RESTRICT — la base rechaza borrar cualquiera con historial.
create or replace function public.delete_serial(p_serial_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can delete serials' using errcode = '42501';
  end if;

  select status into v_status from public.serials where id = p_serial_id for update;
  if v_status is null then
    raise exception 'serial not found';
  end if;
  if v_status <> 'AVAILABLE' then
    raise exception 'invalid state: only AVAILABLE serials can be deleted (current: %)', v_status;
  end if;

  delete from public.serials where id = p_serial_id;
end;
$$;

comment on function public.delete_serial(uuid) is
  'Solo admin. Borra un serial AVAILABLE sin historial; las FK RESTRICT (warranties, serial_barcode_waivers) impiden borrar uno con historial. Queda en audit_logs.';

revoke all on function public.delete_serial(uuid) from public;
revoke all on function public.delete_serial(uuid) from anon;
grant execute on function public.delete_serial(uuid) to authenticated;
