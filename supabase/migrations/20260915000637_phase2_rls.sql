-- Fase 2 — RLS de products/lots/serials
-- Reutiliza private.is_admin()/private.current_store_id() (Fase 1) sin
-- cambios. Mismo molde que stores_admin_all / app_settings_select de
-- supabase/migrations/20260914201455_rls.sql.

-- ---------------------------------------------------------------------------
-- products: catálogo, admin CRUD, seller SELECT de activos únicamente
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;

revoke all on public.products from authenticated;
grant select, insert, update, delete on public.products to authenticated;

create policy products_admin_all
  on public.products for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Mismo patrón de "instantáneo ante desactivación" que app_settings_select:
-- un vendedor desactivado o de una tienda inactiva pierde el acceso de
-- inmediato, sin esperar a que expire su token.
create policy products_seller_select
  on public.products for select
  to authenticated
  using (
    is_active
    and ((select private.is_admin()) or (select private.current_store_id()) is not null)
  );

-- ---------------------------------------------------------------------------
-- lots: catálogo, admin CRUD, sin ningún acceso para seller
-- ---------------------------------------------------------------------------
alter table public.lots enable row level security;

revoke all on public.lots from authenticated;
grant select, insert, update, delete on public.lots to authenticated;

create policy lots_admin_all
  on public.lots for all
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- serials: máquina de estados. Ni admin tiene política de escritura — todo
-- pasa por las RPC de 20260915000627_serials_rpc.sql. Sin ningún acceso
-- directo para seller (ni de lectura): solo lookup_serial (Fase 5).
-- ---------------------------------------------------------------------------
alter table public.serials enable row level security;

revoke all on public.serials from authenticated;
grant select on public.serials to authenticated;

create policy serials_admin_select
  on public.serials for select
  to authenticated
  using ((select private.is_admin()));
