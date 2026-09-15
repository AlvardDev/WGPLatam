-- Fase 3 — corrige el trigger de conteo de Fase 2 para que la importación
-- masiva no sea O(n²).
--
-- Diagnóstico (encontrado durante la planificación de Fase 3, reportado y
-- aprobado antes de corregirlo): private.sync_lot_imported_count(), creada
-- en 20260915000617_serials.sql, era un trigger POR FILA que recalculaba
-- imported_count con un COUNT(*) completo sobre las filas ya insertadas del
-- lote en cada INSERT/DELETE. Para una importación de 100k-300k filas en un
-- mismo lote, cada fila paga un COUNT(*) cada vez más caro: cuadrático.
--
-- Esta migración NO edita el archivo de Fase 2 ya aplicado (commit
-- 7588e55918675584a54b465e74b4b98e878fe814, inmutable) — reemplaza el
-- trigger en una migración nueva, como cualquier evolución de esquema.
--
-- Corrección: dos triggers POR SENTENCIA (FOR EACH STATEMENT) con tablas de
-- transición (REFERENCING NEW/OLD TABLE), que hacen UNA sola actualización
-- agregada por sentencia — sin importar si esa sentencia insertó 1 fila
-- (alta manual, create_serial) o hasta 20.000 (un lote de
-- commit_import_batch). Separados en INSERT/DELETE en vez de un único
-- trigger combinado: evita cualquier ambigüedad sobre qué tabla de
-- transición aplica en cada evento.

drop trigger serials_sync_lot_count on public.serials;

create or replace function private.sync_lot_imported_count_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lots l
  set imported_count = l.imported_count + counts.n
  from (select lot_id, count(*) as n from new_table group by lot_id) counts
  where l.id = counts.lot_id;
  return null;
end;
$$;

create trigger serials_sync_lot_count_insert
  after insert on public.serials
  referencing new table as new_table
  for each statement execute function private.sync_lot_imported_count_insert();

create or replace function private.sync_lot_imported_count_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lots l
  set imported_count = l.imported_count - counts.n
  from (select lot_id, count(*) as n from old_table group by lot_id) counts
  where l.id = counts.lot_id;
  return null;
end;
$$;

create trigger serials_sync_lot_count_delete
  after delete on public.serials
  referencing old table as old_table
  for each statement execute function private.sync_lot_imported_count_delete();

-- private.sync_lot_imported_count() (la función original de Fase 2) queda
-- sin trigger que la use; se deja de llamar en vivo. No se DROPea (no
-- necesario, y algunas versiones de pg_dump/Advisors prefieren no eliminar
-- funciones con historial de auditoría de esquema) — documentado aquí como
-- obsoleta.
comment on function private.sync_lot_imported_count() is 'Obsoleta desde Fase 3 (20260915013520): reemplazada por triggers por sentencia (serials_sync_lot_count_insert/delete) por ser O(n²) en cargas masivas. Sin trigger activo que la invoque.';
