-- Fase 3 — RLS de serial_imports/serial_import_rows
-- Mismo molde que serials (phase2_rls.sql): reutiliza private.is_admin() sin
-- cambios. Sin ningún acceso para seller (ni de lectura): la importación es
-- administrativa, igual que lots.

-- ---------------------------------------------------------------------------
-- serial_imports: cabecera. SELECT+INSERT directo para admin (crear el
-- import es un alta simple, como products/lots); SIN UPDATE/DELETE de grant
-- — los cambios de "status" y los contadores solo los tocan las RPC
-- (SECURITY DEFINER, dueñas de la tabla, no necesitan el grant).
-- ---------------------------------------------------------------------------
alter table public.serial_imports enable row level security;

revoke all on public.serial_imports from authenticated;
grant select, insert on public.serial_imports to authenticated;

create policy serial_imports_admin_select
  on public.serial_imports for select
  to authenticated
  using ((select private.is_admin()));

create policy serial_imports_admin_insert
  on public.serial_imports for insert
  to authenticated
  with check ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- serial_import_rows: staging. Solo SELECT directo para admin (para la vista
-- previa paginada); ningún grant de escritura — toda fila la escriben
-- stage_import_rows/commit_import_batch.
-- ---------------------------------------------------------------------------
alter table public.serial_import_rows enable row level security;

revoke all on public.serial_import_rows from authenticated;
grant select on public.serial_import_rows to authenticated;

create policy serial_import_rows_admin_select
  on public.serial_import_rows for select
  to authenticated
  using ((select private.is_admin()));
