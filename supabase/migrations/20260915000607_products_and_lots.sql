-- Fase 2 — Productos y Lotes
-- Reutiliza private.set_updated_at() y private.audit_row_change() tal cual
-- (creadas en la Fase 1). Productos y lotes son catálogo de escritura
-- directa vía RLS admin (ver docs/ARCHITECTURE.md, Principios #2, y
-- docs/PHASE-2-REVIEW.md, §2/§5) — no necesitan RPC.

-- ---------------------------------------------------------------------------
-- Normalización de códigos, compartida por products.code, lots.code y (en la
-- siguiente migración) serials.serial/barcode. trim + mayúsculas: suficiente
-- para evitar duplicados por espacios o may/min — sin restricción de charset
-- todavía (eso es un caso de prueba de importación, Fase 3, no de Fase 2).
-- ---------------------------------------------------------------------------
create or replace function private.normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(trim(p_code));
$$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  how_it_works text,
  warranty_conditions text not null default '',
  warranty_exclusions text[] not null default '{}',
  default_warranty_days integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_code_not_blank check (length(code) > 0),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_warranty_days_positive check (default_warranty_days > 0)
);

comment on table public.products is 'Catálogo de productos. code inmutable tras crear (ver private.products_code_guard).';

-- Normaliza el código al crear y bloquea su edición posterior — es un
-- identificador operativo (importaciones, búsquedas, auditoría), no una
-- etiqueta editable. Decisión explícita del usuario (Fase 2).
create or replace function private.products_code_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code := private.normalize_code(new.code);
  if tg_op = 'UPDATE' and new.code is distinct from old.code then
    raise exception 'products.code es inmutable después de creado';
  end if;
  return new;
end;
$$;

create trigger products_code_guard
  before insert or update on public.products
  for each row execute function private.products_code_guard();

create trigger set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create trigger audit_products
  after insert or update or delete on public.products
  for each row execute function private.audit_row_change();

create index products_active_idx on public.products (code) where is_active;

-- ---------------------------------------------------------------------------
-- lots
-- ---------------------------------------------------------------------------
-- code único POR PRODUCTO, no globalmente (decisión explícita del usuario):
-- "IMPORT-001" del producto A y "IMPORT-001" del producto B son lotes
-- distintos y válidos. unique(id, product_id) sostiene la FK compuesta que
-- usa "serials" en la siguiente migración.
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete restrict,
  code text not null,
  warranty_days integer not null,
  received_on date,
  expected_count integer,
  imported_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lots_code_not_blank check (length(code) > 0),
  constraint lots_warranty_days_positive check (warranty_days > 0),
  constraint lots_expected_count_non_negative check (expected_count is null or expected_count >= 0),
  constraint lots_imported_count_non_negative check (imported_count >= 0),
  unique (id, product_id),
  unique (product_id, code)
);

comment on table public.lots is 'expected_count es informativo (no bloquea nada). imported_count lo mantiene private.sync_lot_imported_count() automáticamente.';

create or replace function private.lots_normalize_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.code := private.normalize_code(new.code);
  return new;
end;
$$;

create trigger lots_normalize_code
  before insert or update on public.lots
  for each row execute function private.lots_normalize_code();

create trigger set_updated_at
  before update on public.lots
  for each row execute function private.set_updated_at();

create trigger audit_lots
  after insert or update or delete on public.lots
  for each row execute function private.audit_row_change();

create index lots_active_idx on public.lots (product_id) where is_active;
