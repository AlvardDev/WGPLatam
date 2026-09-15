-- Fase 3 — Staging de importación masiva de seriales
-- serial_imports es la cabecera (catálogo operativo, RLS admin-directo para
-- SELECT/INSERT; los cambios de "status" solo ocurren dentro de las RPC de
-- la siguiente migración). serial_import_rows es el staging por fila: sin
-- ningún grant de escritura directa (ver phase3_rls.sql), solo lo escriben
-- las RPC. Ver docs/DATABASE.md, "Importación masiva", y docs/PHASE-2-REVIEW.md, §9.

create table public.serial_imports (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots (id) on delete restrict,
  file_name text not null,
  status text not null default 'STAGING'
    check (status in ('STAGING', 'COMMITTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  committed_rows integer not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint serial_imports_file_name_not_blank check (length(trim(file_name)) > 0),
  constraint serial_imports_counts_non_negative check (
    total_rows >= 0 and valid_rows >= 0 and duplicate_rows >= 0
    and error_rows >= 0 and committed_rows >= 0
  )
);

comment on table public.serial_imports is 'Cabecera de una importación masiva. Solo status cambia por RPC (stage_import_rows/start_import_commit/commit_import_batch/cancel_import); el resto se escribe directo (RLS admin), igual que products/lots.';

create trigger set_updated_at
  before update on public.serial_imports
  for each row execute function private.set_updated_at();

create trigger audit_serial_imports
  after insert or update or delete on public.serial_imports
  for each row execute function private.audit_row_change();

-- Mismo requisito que create_serial (Fase 2): no se puede agregar inventario
-- nuevo a un lote inactivo, sin importar si es uno a la vez o en lote.
create or replace function private.serial_imports_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_active boolean;
begin
  select is_active into v_active from public.lots where id = new.lot_id;
  if v_active is null then
    raise exception 'lot not found';
  end if;
  if not v_active then
    raise exception 'lot is not active';
  end if;
  return new;
end;
$$;

create trigger serial_imports_guard
  before insert on public.serial_imports
  for each row execute function private.serial_imports_guard();

create index serial_imports_lot_id_idx on public.serial_imports (lot_id);
create index serial_imports_status_idx on public.serial_imports (status) where status in ('STAGING', 'COMMITTING');

-- ---------------------------------------------------------------------------
-- serial_import_rows: staging por fila. bigint identity (no uuid): se espera
-- volumen (100k-300k+ filas por import) y pagina por keyset con el mismo
-- patrón que serials/page.tsx — un bigint autoincremental es más barato de
-- indexar y ordenar que un uuid aquí. Decisión explícita del usuario (Fase 3).
-- Sin auditoría fila por fila (audit_row_change no se engancha aquí): la
-- auditoría de una importación es la de su cabecera (serial_imports), no una
-- entrada por fila del archivo — así lo pide docs/DATABASE.md.
-- ---------------------------------------------------------------------------
create table public.serial_import_rows (
  id bigint generated always as identity primary key,
  import_id uuid not null references public.serial_imports (id) on delete cascade,
  row_number integer not null,
  serial text not null,
  barcode text not null,
  status text not null
    check (status in ('VALID', 'DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING', 'ERROR', 'COMMITTED', 'CONFLICT')),
  error_code text,
  created_at timestamptz not null default now(),
  unique (import_id, row_number)
);

comment on table public.serial_import_rows is 'Staging por fila de una importación. Sin políticas de escritura directa: solo lo escriben stage_import_rows/commit_import_batch. Se purga con purge_import_staging tras COMPLETED/CANCELLED.';

-- Búsqueda del siguiente lote pendiente (status='VALID') en orden de fila,
-- y filtrado de la vista previa por estado — los dos accesos reales de la
-- Fase 3 a esta tabla.
create index serial_import_rows_pending_idx
  on public.serial_import_rows (import_id, row_number)
  where status = 'VALID';
create index serial_import_rows_status_idx on public.serial_import_rows (import_id, status);
-- Soportan la clasificación por conjuntos de stage_import_rows: sin estos,
-- comparar el bloque nuevo contra lo ya staged de este import obliga a un
-- escaneo secuencial completo en cada llamada.
create index serial_import_rows_serial_idx on public.serial_import_rows (import_id, serial);
create index serial_import_rows_barcode_idx on public.serial_import_rows (import_id, barcode);

-- ---------------------------------------------------------------------------
-- Completa la FK que Fase 2 dejó preparada sin restricción (serials.import_id
-- ya existía como columna suelta desde 20260915000617_serials.sql). Añadir la
-- FK ahora es instantáneo: la columna es NULL en todos los seriales
-- existentes (creados por create_serial, que nunca la usa).
-- ---------------------------------------------------------------------------
alter table public.serials
  add constraint serials_import_id_fkey foreign key (import_id) references public.serial_imports (id) on delete restrict;
