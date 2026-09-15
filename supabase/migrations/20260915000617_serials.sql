-- Fase 2 — Seriales
-- serials es una máquina de estados: sin políticas de escritura para nadie
-- (ni admin) — toda escritura pasa por las RPC de la siguiente migración.
-- Ver docs/ARCHITECTURE.md, Principios #2, y docs/PHASE-2-REVIEW.md, §5/§8.

create table public.serials (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  lot_id uuid not null references public.lots (id) on delete restrict,
  serial text not null unique,
  barcode text not null unique,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ACTIVATED', 'BLOCKED', 'VOID')),
  status_reason text,
  -- Sin FK todavía: serial_imports no existe hasta la Fase 3. La Fase 3
  -- agrega la restricción cuando esa tabla exista (ver docs/PHASE-2-REVIEW.md, §9).
  import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- El producto de un serial nunca puede divergir del producto real de su
  -- lote: garantizado por la base, no por el frontend.
  foreign key (lot_id, product_id) references public.lots (id, product_id),
  constraint serials_serial_not_blank check (length(serial) > 0),
  constraint serials_barcode_not_blank check (length(barcode) > 0),
  constraint serials_serial_ne_barcode check (serial <> barcode),
  constraint serials_reason_required_when_blocked_or_void
    check (status_reason is not null or status not in ('BLOCKED', 'VOID'))
);

comment on table public.serials is 'Sin políticas RLS de escritura ni para admin: toda mutación pasa por las RPC create/block/unblock/void_serial.';

-- ---------------------------------------------------------------------------
-- Normalización (mismo private.normalize_code de products/lots)
-- ---------------------------------------------------------------------------
create or replace function private.serials_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.serial := private.normalize_code(new.serial);
  new.barcode := private.normalize_code(new.barcode);
  return new;
end;
$$;

create trigger serials_normalize
  before insert or update on public.serials
  for each row execute function private.serials_normalize();

create trigger set_updated_at
  before update on public.serials
  for each row execute function private.set_updated_at();

create trigger audit_serials
  after insert or update or delete on public.serials
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- lots.imported_count siempre correcto, sin importar el camino de escritura
-- (alta manual ahora, importación masiva en la Fase 3): se recalcula solo.
-- ---------------------------------------------------------------------------
create or replace function private.sync_lot_imported_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_id uuid := coalesce(new.lot_id, old.lot_id);
begin
  update public.lots
  set imported_count = (select count(*) from public.serials where lot_id = v_lot_id)
  where id = v_lot_id;
  return null;
end;
$$;

create trigger serials_sync_lot_count
  after insert or delete on public.serials
  for each row execute function private.sync_lot_imported_count();

-- ---------------------------------------------------------------------------
-- Colisión serial↔barcode: no es expresable como UNIQUE de columna (son dos
-- columnas de la misma fila). La usan create_serial ahora y stage_import_rows
-- en la Fase 3 — misma regla en un solo lugar. errcode 23505
-- (unique_violation): semánticamente es exactamente eso.
-- ---------------------------------------------------------------------------
create or replace function private.check_serial_collision(
  p_serial text,
  p_barcode text,
  p_exclude_id uuid default null
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.serials
    where (serial = p_serial or barcode = p_serial or serial = p_barcode or barcode = p_barcode)
      and (p_exclude_id is null or id <> p_exclude_id)
  ) then
    raise exception 'serial or barcode collision: % / %', p_serial, p_barcode
      using errcode = '23505';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Índices — cada uno con una razón concreta (ver docs/PHASE-2-REVIEW.md, §8)
-- ---------------------------------------------------------------------------
-- serial/barcode: unicidad ya cubre la búsqueda exacta (Fase 5, lookup_serial).
create index serials_lot_status_idx on public.serials (lot_id, status); -- listado de seriales por lote y su estado
create index serials_available_idx on public.serials (status) where status = 'AVAILABLE'; -- dashboard + lookup; no crece con el histórico ACTIVATED
create index serials_product_id_idx on public.serials (product_id); -- seriales de un producto a través de varios lotes
create index serials_import_id_idx on public.serials (import_id) where import_id is not null; -- vacío hasta la Fase 3; evita crear el índice sobre una tabla ya grande más adelante
