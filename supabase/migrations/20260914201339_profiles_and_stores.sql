-- Fase 1 — Fundación
-- Esquema `private`: helpers y funciones internas, nunca expuestas por PostgREST
-- (Supabase solo expone el esquema `public` por defecto). `stores` y `profiles`
-- son la base del aislamiento por tienda que sostiene toda la RLS del sistema.

create schema if not exists private;

-- Nadie puede usar el esquema por defecto; se concede explícitamente más abajo
-- (migración de RLS) solo lo estrictamente necesario para evaluar políticas.
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- stores
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  address text,
  phone text,
  country_code text not null,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.stores is 'Tiendas físicas. Una empresa por instalación de Supabase; sin tenant_id.';

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- El "id" es siempre el mismo que auth.users.id (relación 1:1). "role" y
-- "store_id" nunca los edita el propio usuario: los fija el trigger que crea
-- el perfil a partir de auth.users.raw_app_meta_data (ver migración
-- auth_user_provisioning) o el admin mediante el cliente de servicio
-- (service role, que salta RLS). No hay política UPDATE para "authenticated".
--
-- role = null representa un usuario recién creado sin metadata de aplicación
-- todavía asignada (p. ej. un usuario creado a mano desde el dashboard de
-- Supabase durante el bootstrap del primer admin). Sin rol no hay acceso:
-- private.is_admin() y private.current_store_id() lo tratan como "sin
-- privilegios". Ver docs/ARCHITECTURE.md, "Auth y roles" (Primer admin).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text,
  store_id uuid references public.stores (id) on delete restrict,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_valid check (role is null or role in ('admin', 'seller')),
  constraint profiles_role_store_shape check (
    (role = 'seller' and store_id is not null)
    or (role = 'admin' and store_id is null)
    or (role is null and store_id is null)
  )
);

comment on table public.profiles is 'Perfil de aplicación 1:1 con auth.users. role/store_id nunca los edita el usuario.';
comment on column public.profiles.role is 'admin | seller | null (sin aprovisionar). Nunca se confía en user_metadata para esto.';

create index profiles_store_id_idx on public.profiles (store_id) where store_id is not null;

-- ---------------------------------------------------------------------------
-- updated_at genérico
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on public.stores
  for each row execute function private.set_updated_at();

create trigger set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
