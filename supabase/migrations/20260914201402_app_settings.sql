-- Fase 1 — Fundación
-- app_settings (pública para usuarios autenticados) y notification_settings
-- (solo admin) son tablas "singleton": el patrón `id boolean primary key
-- default true` + `check (id)` garantiza a nivel de esquema que solo puede
-- existir una fila, sin necesitar un trigger aparte. Ver docs/DATABASE.md,
-- sección "app_settings" / "notification_settings", para la justificación de
-- por qué están separadas (mínimo dato necesario para el vendedor).

create table public.app_settings (
  id boolean primary key default true,
  -- Empresa
  company_name text not null default '',
  company_legal_name text not null default '',
  company_legal_id text not null default '',
  logo_path text,
  address text,
  phone text,
  email text,
  whatsapp text,
  -- Garantías (valores de partida; cada producto puede tener los suyos)
  default_warranty_days integer not null default 365,
  store_attention_days integer not null default 30,
  expiring_soon_days integer not null default 30,
  default_warranty_conditions text,
  default_warranty_exclusions text[] not null default '{}',
  -- Sistema
  country_code text,
  default_timezone text not null default 'UTC',
  locale text not null default 'es',
  national_id_label text,
  -- Soporte
  support_email text,
  support_phone text,
  support_whatsapp text,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id),
  constraint app_settings_positive_days check (
    default_warranty_days > 0 and store_attention_days >= 0 and expiring_soon_days >= 0
  )
);

comment on table public.app_settings is 'Configuración pública del negocio (una fila). Legible por admin y seller; solo admin escribe.';

insert into public.app_settings (id) values (true);

create trigger set_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- notification_settings: separada de app_settings porque un vendedor no debe
-- poder leer la lista de correos internos de aviso (mínimo dato necesario).
-- ---------------------------------------------------------------------------
create table public.notification_settings (
  id boolean primary key default true,
  admin_notification_emails text[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint notification_settings_singleton check (id)
);

comment on table public.notification_settings is 'Configuración operativa interna (una fila). Solo admin la lee y la escribe.';

insert into public.notification_settings (id) values (true);

create trigger set_updated_at
  before update on public.notification_settings
  for each row execute function private.set_updated_at();
