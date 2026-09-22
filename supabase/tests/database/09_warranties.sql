-- Fase 5 — Activación de garantías: lookup_serial, activate_warranty,
-- update_warranty_customer. Ver docs/DATABASE.md y docs/PROJECT-PLAN.md,
-- sección H.
--
-- Nota sobre concurrencia (mismo criterio que 06_serials.sql/
-- 07_serial_imports.sql): pgTAP corre en una sola conexión secuencial, no
-- puede abrir dos transacciones reales en paralelo. El mecanismo real
-- (SELECT ... FOR UPDATE sobre el serial) se verifica por inspección del
-- código de la función; lo que SÍ se prueba aquí, de forma real:
-- (a) el comportamiento observable de una segunda activación después de la
--     primera (secuencial, pero exactamente el resultado que produciría la
--     concurrencia real: la primera gana, la segunda ve ACTIVATED y falla),
--     y
-- (b) el "doble cinturón" real: el UNIQUE de warranties.serial_id, probado
--     con un INSERT directo que bypassea la RPC por completo.
begin;
select plan(53);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f5000000-0000-0000-0000-00000000000a', 'T-F5A', 'Tienda F5 A', 'VE', true),
  ('f5000000-0000-0000-0000-00000000000b', 'T-F5B', 'Tienda F5 B', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f5000000-0000-0000-0000-0000000000a1', 'admin-f5@test.local', '{"role":"admin"}'::jsonb),
  ('f5000000-0000-0000-0000-0000000000a2', 'seller-f5a@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f5000000-0000-0000-0000-00000000000a')),
  ('f5000000-0000-0000-0000-0000000000b1', 'seller-f5b@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f5000000-0000-0000-0000-00000000000b'));

-- ---------------------------------------------------------------------------
-- Fixtures de catálogo (como admin): 1 producto/lote activos con 3 seriales
-- (uno para activar con éxito, uno para bloquear, uno para anular), más un
-- lote inactivo y un producto inactivo, cada uno con su propio serial
-- AVAILABLE, para probar esas dos validaciones de activate_warranty.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

insert into public.products (id, code, name, default_warranty_days, warranty_conditions, warranty_exclusions) values
  ('f5100000-0000-0000-0000-000000000001', 'F5-P1', 'Producto F5', 365, 'Condiciones F5', array['Exclusión 1']),
  ('f5100000-0000-0000-0000-000000000002', 'F5-P2-INACTIVO', 'Producto F5 Inactivo', 200, '', '{}');

insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('f5200000-0000-0000-0000-000000000001', 'f5100000-0000-0000-0000-000000000001', 'LOTE-F5-1', 365, true),
  ('f5200000-0000-0000-0000-000000000002', 'f5100000-0000-0000-0000-000000000001', 'LOTE-F5-INACTIVO', 100, true),
  ('f5200000-0000-0000-0000-000000000003', 'f5100000-0000-0000-0000-000000000002', 'LOTE-F5-2', 200, true);

select public.create_serial('f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000001', 'F5-AVAIL-1', 'F5-AVAIL-1-BC');
select public.create_serial('f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000001', 'F5-BLOCK-1', 'F5-BLOCK-1-BC');
select public.create_serial('f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000001', 'F5-VOID-1', 'F5-VOID-1-BC');
select public.create_serial('f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000002', 'F5-LOTINACT-1', 'F5-LOTINACT-1-BC');
select public.create_serial('f5100000-0000-0000-0000-000000000002', 'f5200000-0000-0000-0000-000000000003', 'F5-PRODINACT-1', 'F5-PRODINACT-1-BC');

select public.block_serial((select id from public.serials where serial = 'F5-BLOCK-1'), 'dañado');
select public.void_serial((select id from public.serials where serial = 'F5-VOID-1'), 'nunca se vendió');

-- Ahora que los seriales existen, se desactivan el lote y el producto
-- correspondientes (create_serial exige lote activo AL CREAR, no impide
-- desactivarlo después).
update public.lots set is_active = false where id = 'f5200000-0000-0000-0000-000000000002';
update public.products set is_active = false where id = 'f5100000-0000-0000-0000-000000000002';

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- lookup_serial
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select * from public.lookup_serial('F5-AVAIL-1') $$,
  '%only an active seller%', 'admin no puede invocar lookup_serial (no es vendedor)'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select count(*)::int from public.lookup_serial('NO-EXISTE-123')),
  0, 'serial inexistente: 0 filas, no una excepción'
);
select is(
  (select status from public.lookup_serial('F5-AVAIL-1')),
  'AVAILABLE', 'lookup de un serial disponible devuelve status AVAILABLE'
);
select is(
  (select warranty_duration_days from public.lookup_serial('F5-AVAIL-1')),
  365, 'lookup devuelve la duración del lote'
);
select is(
  (select product_name from public.lookup_serial('F5-AVAIL-1')),
  'Producto F5', 'lookup devuelve el nombre del producto'
);
select is(
  (select status from public.lookup_serial('F5-BLOCK-1')),
  'BLOCKED', 'lookup de un serial bloqueado devuelve status BLOCKED (no lo oculta)'
);
select is(
  (select status from public.lookup_serial('F5-VOID-1')),
  'VOID', 'lookup de un serial anulado devuelve status VOID'
);
select is(
  (select status from public.lookup_serial('f5-avail-1')),
  'AVAILABLE', 'lookup normaliza el código (minúsculas/espacios)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- activate_warranty — rechazos
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%only an active seller%', 'admin no puede invocar activate_warranty'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%customer name is required%', 'exige nombre de cliente'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana","national_id":"","whatsapp":"+584121234567"}'::jsonb) $$,
  '%customer national id is required%', 'exige identificación de cliente'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana","national_id":"V1","whatsapp":""}'::jsonb) $$,
  '%customer whatsapp is required%', 'exige whatsapp de cliente'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana","national_id":"V1","whatsapp":"04121234567"}'::jsonb) $$,
  '%E.164%', 'rechaza whatsapp sin formato E.164'
);
select throws_like(
  $$ select * from public.activate_warranty('NO-EXISTE-123', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%serial not found%', 'rechaza un serial que no existe'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-BLOCK-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%serial is blocked%', 'rechaza un serial bloqueado'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-VOID-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%serial is void%', 'rechaza un serial anulado'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-LOTINACT-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%lot is not active%', 'rechaza un serial cuyo lote está inactivo'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-PRODINACT-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%product is not active%', 'rechaza un serial cuyo producto está inactivo'
);

-- ---------------------------------------------------------------------------
-- activate_warranty — éxito, snapshot, reintento, doble cinturón, auditoría
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana Cliente","national_id":"v-12345678","whatsapp":"+584121234567"}'::jsonb) $$,
  'el vendedor activa un serial disponible'
);
select is(
  (select status from public.lookup_serial('F5-AVAIL-1')),
  'ACTIVATED', 'el serial queda ACTIVATED tras activar'
);
select ok(
  (select w.duration_days = 365 and w.product_code = 'F5-P1' and w.lot_code = 'LOTE-F5-1'
     and w.customer_national_id = 'V-12345678' and w.expires_at = w.activated_at + interval '365 days'
   from public.warranties w where w.serial = 'F5-AVAIL-1'),
  'la garantía queda con el snapshot correcto (producto/lote/duración/vencimiento/cliente normalizado)'
);

-- Reintento (doble click, retry de red): el mismo vendedor vuelve a
-- intentar activar el MISMO serial, ya ACTIVATED. Nunca debe crear una
-- segunda garantía.
select throws_like(
  $$ select * from public.activate_warranty('F5-AVAIL-1', '{"name":"Ana Cliente","national_id":"V-12345678","whatsapp":"+584121234567"}'::jsonb) $$,
  '%serial already activated%', 'reintentar activar el mismo serial ya activado se rechaza, no crea una segunda garantía'
);
select is(
  (select count(*)::int from public.warranties where serial = 'F5-AVAIL-1'),
  1, 'sigue existiendo exactamente 1 garantía para ese serial tras el reintento'
);
select is(
  (select status from public.lookup_serial('F5-AVAIL-1')),
  'ACTIVATED', 'lookup del serial ya activado devuelve status ACTIVATED'
);

reset role;
reset request.jwt.claims;

-- Doble cinturón: warranties.serial_id es UNIQUE. Probado con un INSERT
-- directo que bypassea la RPC por completo (como el rol de conexión, que
-- es el owner de la tabla y no está sujeto a los GRANT revocados).
select throws_like(
  $$ insert into public.warranties (
       serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
       product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
       customer_name, customer_national_id, customer_whatsapp
     )
     select serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
       product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
       customer_name, customer_national_id, customer_whatsapp
     from public.warranties where serial = 'F5-AVAIL-1' $$,
  '%duplicate key%', 'el UNIQUE de warranties.serial_id impide una segunda garantía aunque se bypasee la RPC'
);

-- Inmutabilidad: ni siquiera el owner de la tabla puede cambiar un campo
-- congelado por UPDATE directo (bypasea RLS pero no el trigger).
select throws_like(
  $$ update public.warranties set duration_days = 999 where serial = 'F5-AVAIL-1' $$,
  '%solo los campos de cliente o de anulación%', 'el trigger de inmutabilidad rechaza cambiar duration_days incluso por UPDATE directo'
);

-- Snapshot histórico: cambiar el producto/lote DESPUÉS de activar no debe
-- alterar retroactivamente la garantía ya creada.
update public.products set name = 'Nombre Cambiado Después' where id = 'f5100000-0000-0000-0000-000000000001';
update public.lots set warranty_days = 9999 where id = 'f5200000-0000-0000-0000-000000000001';
select is(
  (select product_name from public.warranties where serial = 'F5-AVAIL-1'),
  'Producto F5', 'el snapshot de product_name no cambia aunque se edite el producto real después'
);
select is(
  (select duration_days from public.warranties where serial = 'F5-AVAIL-1'),
  365, 'el snapshot de duration_days no cambia aunque se edite lots.warranty_days después'
);

-- Auditoría: la activación queda auditada con el vendedor real como actor,
-- reutilizando el trigger genérico ya existente (sin mecanismo nuevo).
select is(
  (select actor_id from public.audit_logs
     where entity_type = 'warranties' and action = 'insert'
       and entity_id = (select id from public.warranties where serial = 'F5-AVAIL-1')),
  'f5000000-0000-0000-0000-0000000000a2'::uuid,
  'la creación de la garantía queda auditada con el vendedor real como actor'
);
select is(
  (select actor_id from public.audit_logs
     where entity_type = 'serials' and action = 'update'
       and entity_id = (select id from public.serials where serial = 'F5-AVAIL-1')
     order by id desc limit 1),
  'f5000000-0000-0000-0000-0000000000a2'::uuid,
  'la transición del serial a ACTIVATED queda auditada con el vendedor real como actor'
);

-- ---------------------------------------------------------------------------
-- update_warranty_customer — ventana de 24h y aislamiento por tienda
-- ---------------------------------------------------------------------------

-- El id se captura como owner (bypasea RLS): el vendedor B, cuyo aislamiento
-- estamos probando, no puede ver esta garantía por SELECT directo (RLS), así
-- que no puede resolverlo por su cuenta. Igual podría llegarle por URL/API.
create temp table t5_warranty_ids (serial text primary key, id uuid);
grant select on t5_warranty_ids to authenticated;
insert into t5_warranty_ids values ('F5-AVAIL-1', (select id from public.warranties where serial = 'F5-AVAIL-1'));

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_like(
  $$ select public.update_warranty_customer(
       (select id from t5_warranty_ids where serial = 'F5-AVAIL-1'),
       '{"name":"Otro","national_id":"X","whatsapp":"+584121111111"}'::jsonb) $$,
  '%belongs to another store%', 'un vendedor de otra tienda no puede editar el cliente de esta garantía'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ select public.update_warranty_customer(
       (select id from public.warranties where serial = 'F5-AVAIL-1'),
       '{"name":"Ana Actualizada","national_id":"V-12345678","whatsapp":"+584129999999"}'::jsonb) $$,
  'el vendedor de la tienda dueña puede editar el cliente dentro de las 24h'
);
select is(
  (select customer_name from public.warranties where serial = 'F5-AVAIL-1'),
  'Ana Actualizada', 'el nombre del cliente quedó actualizado'
);

reset role;
reset request.jwt.claims;

-- Fixture para probar el rechazo pasadas las 24h: una garantía activada
-- "hace 2 días" (insert directo, como el owner de la tabla — el trigger de
-- inmutabilidad no aplica a INSERT, solo a UPDATE).
insert into public.warranties (
  id, serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
  product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
  customer_name, customer_national_id, customer_whatsapp
) values (
  'f5300000-0000-0000-0000-000000000001',
  (select id from public.serials where serial = 'F5-BLOCK-1'),
  'f5000000-0000-0000-0000-00000000000a', 'f5000000-0000-0000-0000-0000000000a2',
  now() - interval '2 days', 365, now() - interval '2 days' + interval '365 days', 30,
  'f5100000-0000-0000-0000-000000000001', 'F5-P1', 'Producto F5', 'F5-BLOCK-1', 'F5-BLOCK-1-BC', 'LOTE-F5-1', '', '{}',
  'Cliente Viejo', 'V-1', '+584120000000'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  $$ select public.update_warranty_customer(
       'f5300000-0000-0000-0000-000000000001'::uuid,
       '{"name":"Tarde","national_id":"X","whatsapp":"+584121111111"}'::jsonb) $$,
  '%edit window has expired%', 'pasadas las 24h, update_warranty_customer se rechaza'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- RLS: aislamiento por tienda + acceso admin
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.warranties),
  0, 'un vendedor de otra tienda no ve ninguna garantía de la tienda A'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select is(
  (select count(*)::int from public.warranties),
  2, 'el admin ve todas las garantías, de cualquier tienda'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Código de barras opcional (2026-09-21): activar sin barcode no está
-- prohibido, pero exige una autorización APPROVED de un admin
-- (serial_barcode_waivers) — el vendedor no puede simplemente saltárselo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select public.create_serial('f5100000-0000-0000-0000-000000000001', 'f5200000-0000-0000-0000-000000000001', 'F5-NOBC-1', null);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select barcode_waiver_status from public.lookup_serial('F5-NOBC-1')), null,
  'sin solicitud todavía, barcode_waiver_status es null'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-NOBC-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%no barcode assigned%', 'no se puede activar un serial sin barcode sin autorización'
);
select lives_ok(
  $$ select public.request_barcode_waiver((select id from public.serials where serial = 'F5-NOBC-1')) $$,
  'el vendedor puede solicitar autorización para activar sin barcode'
);
select throws_like(
  $$ select public.request_barcode_waiver((select id from public.serials where serial = 'F5-NOBC-1')) $$,
  '%pending barcode waiver%', 'no se puede pedir dos veces mientras hay una solicitud pendiente'
);
select is(
  (select barcode_waiver_status from public.lookup_serial('F5-NOBC-1')), 'PENDING',
  'lookup_serial refleja la solicitud pendiente'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-NOBC-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%no barcode assigned%', 'seguir sin poder activar mientras está solo PENDING (no APPROVED)'
);

reset role;
reset request.jwt.claims;

-- Aislamiento: el vendedor de la tienda B no ve la solicitud de la tienda A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.serial_barcode_waivers), 0,
  'un vendedor de otra tienda no ve la solicitud de autorización de la tienda A'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select public.request_barcode_waiver((select id from public.serials where serial = 'F5-NOBC-1')) $$,
  '%only an active seller%', 'un admin no puede solicitar una autorización (esa acción es del vendedor)'
);
select lives_ok(
  $$ select public.decide_barcode_waiver(
       (select id from public.serial_barcode_waivers where serial_id = (select id from public.serials where serial = 'F5-NOBC-1') and status = 'PENDING'),
       'REJECTED', 'Falta evidencia de la unidad') $$,
  'el admin rechaza la solicitud, con motivo'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select barcode_waiver_status from public.lookup_serial('F5-NOBC-1')), 'REJECTED',
  'lookup_serial refleja el rechazo'
);
select is(
  (select barcode_waiver_note from public.lookup_serial('F5-NOBC-1')), 'Falta evidencia de la unidad',
  'lookup_serial expone el motivo del rechazo'
);
select throws_like(
  $$ select * from public.activate_warranty('F5-NOBC-1', '{"name":"Ana","national_id":"V1","whatsapp":"+584121234567"}'::jsonb) $$,
  '%no barcode assigned%', 'rechazada la solicitud, sigue sin poder activar'
);
select lives_ok(
  $$ select public.request_barcode_waiver((select id from public.serials where serial = 'F5-NOBC-1')) $$,
  'el vendedor puede volver a solicitar después de un rechazo'
);
select throws_like(
  $$ select public.decide_barcode_waiver(
       (select id from public.serial_barcode_waivers where serial_id = (select id from public.serials where serial = 'F5-NOBC-1') and status = 'PENDING'),
       'APPROVED', null) $$,
  '%only admin%', 'un vendedor no puede decidir su propia solicitud'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$ select public.decide_barcode_waiver(
       (select id from public.serial_barcode_waivers where serial_id = (select id from public.serials where serial = 'F5-NOBC-1') and status = 'PENDING'),
       'APPROVED', null) $$,
  'el admin autoriza la segunda solicitud'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f5000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ select * from public.activate_warranty('F5-NOBC-1', '{"name":"Ana Sin Barcode","national_id":"V-9","whatsapp":"+584121234567"}'::jsonb) $$,
  'autorizado, el vendedor ya puede activar el serial sin barcode'
);
select is(
  (select barcode from public.warranties where serial = 'F5-NOBC-1'), null,
  'la garantía queda con barcode null, a propósito'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
