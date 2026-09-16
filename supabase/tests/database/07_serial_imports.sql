-- Fase 3 — importación masiva de seriales (staging + commit).
--
-- Nota sobre concurrencia: commit_import_batch usa "for update skip locked"
-- al reclamar su lote de filas, para que dos llamadas concurrentes (dos
-- admins, o un reintento en vuelo) nunca procesen la misma fila. pgTAP corre
-- en una sola conexión secuencial y no puede simular dos transacciones
-- concurrentes reales; esta garantía se verifica aquí de forma secuencial
-- (reintentos idempotentes, ver abajo) y con un script Node aparte con dos
-- conexiones reales en paralelo (ver docs/PHASE-3-REVIEW.md, "Concurrencia").
begin;
select plan(46);

insert into public.stores (id, code, name, country_code) values
  ('e4000000-0000-0000-0000-00000000000a', 'T-P3S', 'Tienda P3S', 'VE');
insert into auth.users (id, email, raw_app_meta_data) values
  ('e4000000-0000-0000-0000-0000000000a1', 'admin-p3@test.local', '{"role":"admin"}'::jsonb),
  ('e4000000-0000-0000-0000-0000000000a2', 'seller-p3@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'e4000000-0000-0000-0000-00000000000a'));

insert into public.products (id, code, name, default_warranty_days) values
  ('e4100000-0000-0000-0000-000000000001', 'P300', 'Producto P300', 365);
insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('e4200000-0000-0000-0000-000000000001', 'e4100000-0000-0000-0000-000000000001', 'LOTE-A', 365, true),
  ('e4200000-0000-0000-0000-000000000002', 'e4100000-0000-0000-0000-000000000001', 'LOTE-INACTIVO', 365, false);

set local role authenticated;
set local request.jwt.claims to '{"sub":"e4000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

-- Un serial ya existente (vía la RPC normal de Fase 2), para forzar más
-- adelante un caso real de DUPLICATE_EXISTING/CONFLICT.
select lives_ok(
  $$ select public.create_serial('e4100000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001', 'EXIST-01', 'BCEXIST-01') $$,
  'seed: admin crea un serial existente vía create_serial'
);
select is(
  (select imported_count from public.lots where id = 'e4200000-0000-0000-0000-000000000001')::int, 1,
  'imported_count sube a 1 con el trigger por sentencia (alta individual, create_serial)'
);

-- ---------------------------------------------------------------------------
-- Creación del import (INSERT directo, RLS admin) y guarda de lote inactivo.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.serial_imports (id, lot_id, file_name)
     values ('e4300000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001', 'bulk.csv') $$,
  'admin crea un import (STAGING) contra un lote activo'
);
select throws_like(
  $$ insert into public.serial_imports (lot_id, file_name) values ('e4200000-0000-0000-0000-000000000002', 'x.csv') $$,
  '%not active%', 'no se puede crear un import sobre un lote inactivo'
);

-- ---------------------------------------------------------------------------
-- stage_import_rows: clasificación por conjuntos + idempotencia de reintento.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.stage_import_rows('e4300000-0000-0000-0000-000000000001', $j$[
       {"row_number":1,"serial":"NEW-01","barcode":"BCNEW-01"},
       {"row_number":2,"serial":"NEW-02","barcode":"BCNEW-02"},
       {"row_number":3,"serial":"DUPF-01","barcode":"BCDUPF-01"},
       {"row_number":4,"serial":"DUPF-01","barcode":"BCDUPF-02"},
       {"row_number":5,"serial":"EXIST-01","barcode":"BCNEWX-05"},
       {"row_number":6,"serial":"","barcode":"BCNEW-06"},
       {"row_number":7,"serial":"SAME-01","barcode":"SAME-01"}
     ]$j$::jsonb) $$,
  'admin puede subir un bloque de staging'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001' and status = 'VALID'),
  2, 'dos filas quedan VALID'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001' and status = 'DUPLICATE_IN_FILE'),
  2, 'dos filas quedan DUPLICATE_IN_FILE (mismo serial repetido en el archivo)'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001' and status = 'DUPLICATE_EXISTING'),
  1, 'una fila queda DUPLICATE_EXISTING (coincide con un serial ya creado)'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001' and status = 'ERROR'),
  2, 'dos filas quedan ERROR (serial vacío, serial=barcode)'
);
select lives_ok(
  $$ select public.stage_import_rows('e4300000-0000-0000-0000-000000000001', $j$[
       {"row_number":1,"serial":"NEW-01","barcode":"BCNEW-01"},
       {"row_number":2,"serial":"NEW-02","barcode":"BCNEW-02"},
       {"row_number":3,"serial":"DUPF-01","barcode":"BCDUPF-01"},
       {"row_number":4,"serial":"DUPF-01","barcode":"BCDUPF-02"},
       {"row_number":5,"serial":"EXIST-01","barcode":"BCNEWX-05"},
       {"row_number":6,"serial":"","barcode":"BCNEW-06"},
       {"row_number":7,"serial":"SAME-01","barcode":"SAME-01"}
     ]$j$::jsonb) $$,
  'reintentar EXACTAMENTE el mismo bloque no falla (idempotente por row_number)'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001'),
  7, 'el reintento no duplica filas de staging (siguen siendo 7, no 14)'
);

-- ---------------------------------------------------------------------------
-- start_import_commit: transición atómica + snapshot de conteos.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.start_import_commit('e4300000-0000-0000-0000-000000000001') $$,
  'admin confirma la importación (STAGING -> COMMITTING)'
);
select is(
  (select status from public.serial_imports where id = 'e4300000-0000-0000-0000-000000000001'), 'COMMITTING',
  'el import queda COMMITTING'
);
select is(
  (select valid_rows from public.serial_imports where id = 'e4300000-0000-0000-0000-000000000001')::int, 2,
  'el snapshot de valid_rows queda congelado en 2'
);
select throws_like(
  $$ select public.start_import_commit('e4300000-0000-0000-0000-000000000001') $$,
  '%cannot be committed%',
  'confirmar dos veces falla (prueba secuencial del guard atómico; la seguridad real ante dos admins a la vez es el UPDATE...WHERE status=''STAGING'', igual que en Fase 2)'
);

-- ---------------------------------------------------------------------------
-- commit_import_batch: compromete lo VALID, idempotencia tras COMPLETED.
-- ---------------------------------------------------------------------------
select is(
  (select committed_count from public.commit_import_batch('e4300000-0000-0000-0000-000000000001', 100)), 2,
  'commit_import_batch compromete las 2 filas VALID'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000001' and status = 'COMMITTED'),
  2, 'las 2 filas comprometidas quedan COMMITTED'
);
select is(
  (select status from public.serial_imports where id = 'e4300000-0000-0000-0000-000000000001'), 'COMPLETED',
  'el import pasa a COMPLETED al no quedar nada VALID'
);
select is(
  (select imported_count from public.lots where id = 'e4200000-0000-0000-0000-000000000001')::int, 3,
  'imported_count sube a 3 (1 del seed + 2 del commit) con el trigger por sentencia — una sola pasada, no una por fila'
);
select is(
  (select committed_count from public.commit_import_batch('e4300000-0000-0000-0000-000000000001', 100)), 0,
  'reintentar commit_import_batch sobre un import ya COMPLETED es un no-op (0 comprometidas, no un error)'
);
select is(
  (select done from public.commit_import_batch('e4300000-0000-0000-0000-000000000001', 100)), true,
  'ese reintento reporta done=true'
);

-- ---------------------------------------------------------------------------
-- Conflicto real: una fila queda VALID y, ANTES de comprometerla, otra vía
-- (create_serial) ya toma ese mismo serial. commit_import_batch debe
-- detectarlo, marcar CONFLICT con su razón, y aun así completar el import.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.serial_imports (id, lot_id, file_name)
     values ('e4300000-0000-0000-0000-000000000002', 'e4200000-0000-0000-0000-000000000001', 'race.csv') $$,
  'admin crea un segundo import para el caso de conflicto'
);
select lives_ok(
  $$ select public.stage_import_rows('e4300000-0000-0000-0000-000000000002', $j$[{"row_number":1,"serial":"RACE-01","barcode":"BCRACE-01"}]$j$::jsonb) $$,
  'sube una fila válida al segundo import'
);
select lives_ok(
  $$ select public.start_import_commit('e4300000-0000-0000-0000-000000000002') $$,
  'confirma el segundo import'
);
select lives_ok(
  $$ select public.create_serial('e4100000-0000-0000-0000-000000000001', 'e4200000-0000-0000-0000-000000000001', 'RACE-01', 'OTHER-BC-01') $$,
  'mientras tanto, otra vía crea un serial con el MISMO código (simula la carrera)'
);
select is(
  (select conflicted_count from public.commit_import_batch('e4300000-0000-0000-0000-000000000002', 100)), 1,
  'commit_import_batch detecta el conflicto real (1 fila)'
);
select is(
  (select status from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000002' and row_number = 1), 'CONFLICT',
  'la fila conflictiva queda CONFLICT, nunca COMMITTED ni perdida en silencio'
);
select is(
  (select error_code from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000002' and row_number = 1), 'SERIAL_EXISTS',
  'el error_code explica exactamente cuál columna colisionó'
);
select is(
  (select status from public.serial_imports where id = 'e4300000-0000-0000-0000-000000000002'), 'COMPLETED',
  'el import igual llega a COMPLETED (no queda nada VALID, aunque haya un CONFLICT)'
);

-- ---------------------------------------------------------------------------
-- cancel_import (solo antes de confirmar) y purge_import_staging (solo tras
-- COMPLETED/CANCELLED).
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.serial_imports (id, lot_id, file_name)
     values ('e4300000-0000-0000-0000-000000000003', 'e4200000-0000-0000-0000-000000000001', 'cancel.csv') $$,
  'admin crea un tercer import'
);
select lives_ok(
  $$ select public.stage_import_rows('e4300000-0000-0000-0000-000000000003', $j$[{"row_number":1,"serial":"CANC-01","barcode":"BCCANC-01"}]$j$::jsonb) $$,
  'sube una fila al tercer import'
);
select lives_ok(
  $$ select public.cancel_import('e4300000-0000-0000-0000-000000000003') $$,
  'admin cancela el import antes de confirmar'
);
select is(
  (select status from public.serial_imports where id = 'e4300000-0000-0000-0000-000000000003'), 'CANCELLED',
  'el import queda CANCELLED'
);
select throws_like(
  $$ select public.commit_import_batch('e4300000-0000-0000-0000-000000000003', 100) $$,
  '%not in COMMITTING%', 'no se puede comprometer un import CANCELLED'
);
select lives_ok(
  $$ insert into public.serial_imports (id, lot_id, file_name)
     values ('e4300000-0000-0000-0000-000000000004', 'e4200000-0000-0000-0000-000000000001', 'still-staging.csv') $$,
  'admin crea un cuarto import (se deja en STAGING a propósito)'
);
select throws_like(
  $$ select public.purge_import_staging('e4300000-0000-0000-0000-000000000004') $$,
  '%must be COMPLETED or CANCELLED%', 'no se puede purgar el staging de un import todavía en STAGING'
);
select lives_ok(
  $$ select public.purge_import_staging('e4300000-0000-0000-0000-000000000003') $$,
  'admin purga el staging de un import CANCELLED'
);
select is(
  (select count(*)::int from public.serial_import_rows where import_id = 'e4300000-0000-0000-0000-000000000003'), 0,
  'no queda ninguna fila de staging tras el purge'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Vendedor: cero acceso, ni de lectura, ni a ninguna de las 5 RPC.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"e4000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is((select count(*) from public.serial_imports)::int, 0, 'seller no ve ningún import (RLS lo filtra en silencio, tiene GRANT de tabla)');
select is((select count(*) from public.serial_import_rows)::int, 0, 'seller no ve ninguna fila de staging');
select throws_like(
  -- El trigger BEFORE INSERT (serial_imports_guard) corre antes que la
  -- política RLS: como RLS ya oculta "lots" a un vendedor, el guard no
  -- encuentra el lote y falla con "lot not found" en vez de un error de
  -- RLS — la fila igual nunca se crea, la garantía de seguridad se cumple
  -- por partida doble (RLS Y el guard), solo cambia cuál capa reporta primero.
  $$ insert into public.serial_imports (lot_id, file_name) values ('e4200000-0000-0000-0000-000000000001', 'seller.csv') $$,
  '%lot not found%', 'un vendedor no puede insertar un import directo (RLS oculta el lote antes de que el guard lo vea)'
);
select throws_like(
  $$ select public.stage_import_rows('e4300000-0000-0000-0000-000000000001', '[]'::jsonb) $$,
  '%only admin%', 'un vendedor no puede invocar stage_import_rows'
);
select throws_like(
  $$ select public.start_import_commit('e4300000-0000-0000-0000-000000000001') $$,
  '%only admin%', 'un vendedor no puede invocar start_import_commit'
);
select throws_like(
  $$ select public.commit_import_batch('e4300000-0000-0000-0000-000000000001', 100) $$,
  '%only admin%', 'un vendedor no puede invocar commit_import_batch'
);
select throws_like(
  $$ select public.cancel_import('e4300000-0000-0000-0000-000000000001') $$,
  '%only admin%', 'un vendedor no puede invocar cancel_import'
);
select throws_like(
  $$ select public.purge_import_staging('e4300000-0000-0000-0000-000000000001') $$,
  '%only admin%', 'un vendedor no puede invocar purge_import_staging'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
