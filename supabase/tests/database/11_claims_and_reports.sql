-- Fase 7 — open_claim, assign_claim, decide_claim, close_claim,
-- create_technical_report. Ver docs/DATABASE.md y docs/PROJECT-PLAN.md,
-- sección D/K (Fase 7: "responsible_party (día 30 vs 31), aislamiento por
-- tienda").
begin;
select plan(55);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f7000000-0000-0000-0000-00000000000a', 'T-F7A', 'Tienda F7 A', 'VE', true),
  ('f7000000-0000-0000-0000-00000000000b', 'T-F7B', 'Tienda F7 B', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f7000000-0000-0000-0000-0000000000a1', 'admin-f7@test.local', '{"role":"admin"}'::jsonb),
  ('f7000000-0000-0000-0000-0000000000a2', 'seller-f7a@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f7000000-0000-0000-0000-00000000000a')),
  ('f7000000-0000-0000-0000-0000000000b1', 'seller-f7b@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f7000000-0000-0000-0000-00000000000b'));

-- ---------------------------------------------------------------------------
-- Fixtures de catálogo (como admin) + activación real (día 0, dentro de la
-- ventana de atención de tienda -> responsible_party = STORE).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

insert into public.products (id, code, name, default_warranty_days, warranty_conditions, warranty_exclusions) values
  ('f7100000-0000-0000-0000-000000000001', 'F7-P1', 'Producto F7', 365, 'Condiciones F7', array['Exclusión 1']);

insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('f7200000-0000-0000-0000-000000000001', 'f7100000-0000-0000-0000-000000000001', 'LOTE-F7-1', 365, true);

select public.create_serial('f7100000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001', 'F7-SER-1', 'F7-SER-1-BC');
select public.create_serial('f7100000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001', 'F7-SER-DAY30', 'F7-SER-DAY30-BC');
select public.create_serial('f7100000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001', 'F7-SER-DAY31', 'F7-SER-DAY31-BC');
select public.create_serial('f7100000-0000-0000-0000-000000000001', 'f7200000-0000-0000-0000-000000000001', 'F7-SER-VOID', 'F7-SER-VOID-BC');

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ select * from public.activate_warranty('F7-SER-1', '{"name":"Cliente F7","national_id":"v-1","whatsapp":"+584121234567"}'::jsonb) $$,
  'el vendedor activa un serial disponible (F7)'
);
select lives_ok(
  $$ select * from public.activate_warranty('F7-SER-VOID', '{"name":"Cliente Anulado","national_id":"v-2","whatsapp":"+584121234568"}'::jsonb) $$,
  'el vendedor activa el serial que luego se anula'
);

reset role;
reset request.jwt.claims;

create temp table t7_ids (label text primary key, id uuid);
grant select, insert on t7_ids to authenticated;
insert into t7_ids values
  ('w1', (select id from public.warranties where serial = 'F7-SER-1')),
  ('wvoid', (select id from public.warranties where serial = 'F7-SER-VOID'));

-- Fixtures "límite" insertadas directo (bypasea activate_warranty, mismo
-- patrón que 10_corrections_void_notifications.sql): store_attention_days=30,
-- una activada hace exactamente 30 días (día 30, dentro) y otra hace 31
-- días (día 31, fuera) — ver docs/PROJECT-PLAN.md, "responsible_party".
insert into public.warranties (
  id, serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
  product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
  customer_name, customer_national_id, customer_whatsapp
) values (
  'f7300000-0000-0000-0000-000000000002',
  (select id from public.serials where serial = 'F7-SER-DAY30'),
  'f7000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-0000000000a2',
  now() - interval '30 days', 365, now() - interval '30 days' + interval '365 days', 30,
  'f7100000-0000-0000-0000-000000000001', 'F7-P1', 'Producto F7', 'F7-SER-DAY30', 'F7-SER-DAY30-BC', 'LOTE-F7-1', '', '{}',
  'Cliente Día 30', 'V-30', '+584120000030'
), (
  'f7300000-0000-0000-0000-000000000003',
  (select id from public.serials where serial = 'F7-SER-DAY31'),
  'f7000000-0000-0000-0000-00000000000a', 'f7000000-0000-0000-0000-0000000000a2',
  now() - interval '31 days', 365, now() - interval '31 days' + interval '365 days', 30,
  'f7100000-0000-0000-0000-000000000001', 'F7-P1', 'Producto F7', 'F7-SER-DAY31', 'F7-SER-DAY31-BC', 'LOTE-F7-1', '', '{}',
  'Cliente Día 31', 'V-31', '+584120000031'
);
insert into t7_ids values ('wday30', 'f7300000-0000-0000-0000-000000000002'), ('wday31', 'f7300000-0000-0000-0000-000000000003');
update public.serials set status = 'ACTIVATED' where serial in ('F7-SER-DAY30', 'F7-SER-DAY31');

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select public.void_warranty((select id from t7_ids where label = 'wvoid'), 'serial equivocado');
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- open_claim — permisos y validaciones
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_like(
  $$ select public.open_claim((select id from public.warranties limit 1), 'motivo válido') $$,
  '%only an active seller%', 'admin no puede abrir reclamos'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.open_claim('%s'::uuid, '') $$, (select id from t7_ids where label = 'w1')),
  '%reason is required%', 'motivo vacío rechazado'
);
select throws_like(
  $$ select public.open_claim(gen_random_uuid(), 'motivo válido') $$,
  '%warranty not found%', 'garantía inexistente rechazada'
);
select throws_like(
  format($$ select public.open_claim('%s'::uuid, 'motivo válido') $$, (select id from t7_ids where label = 'wvoid')),
  '%warranty is voided%', 'no se puede abrir reclamo sobre garantía anulada'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_like(
  format($$ select public.open_claim('%s'::uuid, 'motivo válido') $$, (select id from t7_ids where label = 'w1')),
  '%belongs to another store%', 'vendedor de otra tienda no puede abrir reclamo'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- open_claim — éxito, responsible_party (día 0/30/31), duplicado
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  format($$ select public.open_claim('%s'::uuid, 'producto no enciende', 'descripción del problema') $$,
    (select id from t7_ids where label = 'w1')),
  'el vendedor abre un reclamo sobre su garantía recién activada'
);
select is(
  (select responsible_party from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'w1')),
  'STORE', 'garantía activada hoy -> responsible_party = STORE'
);
select is(
  (select status from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'w1')),
  'OPEN', 'el reclamo nuevo queda OPEN'
);

select throws_like(
  format($$ select public.open_claim('%s'::uuid, 'segundo reclamo') $$, (select id from t7_ids where label = 'w1')),
  '%already open%', 'no se puede abrir un segundo reclamo mientras el primero sigue OPEN/UNDER_REVIEW'
);

select lives_ok(
  format($$ select public.open_claim('%s'::uuid, 'reclamo día 30') $$, (select id from t7_ids where label = 'wday30')),
  'reclamo sobre garantía activada hace exactamente 30 días'
);
select is(
  (select responsible_party from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'wday30')),
  'STORE', 'día 30 (límite, dentro de la ventana) -> responsible_party = STORE'
);

select lives_ok(
  format($$ select public.open_claim('%s'::uuid, 'reclamo día 31') $$, (select id from t7_ids where label = 'wday31')),
  'reclamo sobre garantía activada hace 31 días'
);
select is(
  (select responsible_party from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'wday31')),
  'MANUFACTURER', 'día 31 (fuera de la ventana) -> responsible_party = MANUFACTURER'
);

reset role;
reset request.jwt.claims;

insert into t7_ids values
  ('claim_w1', (select id from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'w1'))),
  ('claim_wday31', (select id from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'wday31')));

-- ---------------------------------------------------------------------------
-- RLS: aislamiento por tienda de warranty_claims
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.warranty_claims),
  0, 'un vendedor de otra tienda no ve ningún reclamo de la tienda A'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select ok(
  (select count(*)::int from public.warranty_claims) >= 3,
  'el admin ve todos los reclamos, de cualquier tienda'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- assign_claim — permisos, transición OPEN -> UNDER_REVIEW, no doble asignación
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.assign_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  '%only admin can assign%', 'vendedor no puede asignarse reclamos'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_like(
  $$ select public.assign_claim(gen_random_uuid()) $$,
  '%claim not found%', 'reclamo inexistente rechazado'
);

select lives_ok(
  format($$ select public.assign_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  'el admin toma el reclamo (OPEN -> UNDER_REVIEW)'
);
select is(
  (select status from public.warranty_claims where id = (select id from t7_ids where label = 'claim_w1')),
  'UNDER_REVIEW', 'queda UNDER_REVIEW'
);
select is(
  (select assigned_to from public.warranty_claims where id = (select id from t7_ids where label = 'claim_w1')),
  'f7000000-0000-0000-0000-0000000000a1'::uuid, 'assigned_to queda con el admin real'
);
select throws_like(
  format($$ select public.assign_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  '%claim is not open%', 'no se puede volver a asignar un reclamo ya en revisión'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- decide_claim — permisos, validaciones, transición UNDER_REVIEW -> APPROVED
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', 'se repara', 'defecto de fábrica') $$,
    (select id from t7_ids where label = 'claim_w1')),
  '%only admin can decide%', 'vendedor no puede decidir reclamos'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'MAYBE', 'x', 'x') $$, (select id from t7_ids where label = 'claim_w1')),
  '%invalid decision status%', 'status de decisión inválido rechazado'
);
select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', '', 'x') $$, (select id from t7_ids where label = 'claim_w1')),
  '%decision is required%', 'decisión vacía rechazada'
);
select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', 'se repara', '') $$, (select id from t7_ids where label = 'claim_w1')),
  '%justification is required%', 'justificación vacía rechazada'
);

-- Todavía OPEN (no asignado): decide_claim exige UNDER_REVIEW primero.
select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', 'se repara', 'defecto') $$,
    (select id from t7_ids where label = 'claim_wday31')),
  '%claim is not under review%', 'no se puede decidir un reclamo todavía OPEN (falta assign_claim)'
);

select lives_ok(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', 'se repara el producto', 'defecto de fábrica confirmado') $$,
    (select id from t7_ids where label = 'claim_w1')),
  'el admin aprueba el reclamo en revisión'
);
select is(
  (select status from public.warranty_claims where id = (select id from t7_ids where label = 'claim_w1')),
  'APPROVED', 'queda APPROVED'
);
select is(
  (select decision from public.warranty_claims where id = (select id from t7_ids where label = 'claim_w1')),
  'se repara el producto', 'decision queda guardada'
);
select throws_like(
  format($$ select public.decide_claim('%s'::uuid, 'APPROVED', 'x', 'x') $$, (select id from t7_ids where label = 'claim_w1')),
  '%claim is not under review%', 'no se puede volver a decidir un reclamo ya decidido'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- close_claim — permisos, exige decisión previa, transición final
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.close_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  '%only admin can close%', 'vendedor no puede cerrar reclamos'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_like(
  format($$ select public.close_claim('%s'::uuid) $$, (select id from t7_ids where label = 'wday30')),
  '%claim not found%', 'close_claim con un id que no es un reclamo (es una garantía) se rechaza'
);

insert into t7_ids values ('claim_wday30', (select id from public.warranty_claims where warranty_id = (select id from t7_ids where label = 'wday30')));
select throws_like(
  format($$ select public.close_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_wday30')),
  '%must be decided before closing%', 'no se puede cerrar un reclamo todavía OPEN'
);

select lives_ok(
  format($$ select public.close_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  'el admin cierra el reclamo ya aprobado'
);
select ok(
  (select status = 'CLOSED' and closed_at is not null from public.warranty_claims
     where id = (select id from t7_ids where label = 'claim_w1')),
  'queda CLOSED con closed_at'
);
select throws_like(
  format($$ select public.close_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_w1')),
  '%must be decided before closing%', 'no se puede cerrar dos veces (ya no está APPROVED/REJECTED)'
);

reset role;
reset request.jwt.claims;

-- Con el reclamo original ya CLOSED, la garantía puede tener un reclamo
-- nuevo (el índice único solo bloquea OPEN/UNDER_REVIEW simultáneos). Vuelve
-- a ser el vendedor (open_claim es solo suyo, no del admin que cerró el anterior).
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  format($$ select public.open_claim('%s'::uuid, 'segundo reclamo tras cerrar el primero') $$,
    (select id from t7_ids where label = 'w1')),
  'se puede abrir un reclamo nuevo sobre la misma garantía una vez cerrado el anterior'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- create_technical_report — permisos, validaciones, ciclo de vida del reclamo
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.create_technical_report('%s'::uuid, 'diagnóstico', 'resultado', 'decisión') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  '%only admin can create technical reports%', 'vendedor no puede crear reportes técnicos'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_like(
  $$ select public.create_technical_report(gen_random_uuid(), 'diagnóstico', 'resultado', 'decisión') $$,
  '%claim not found%', 'reporte sobre reclamo inexistente rechazado'
);
select throws_like(
  format($$ select public.create_technical_report('%s'::uuid, '', 'resultado', 'decisión') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  '%diagnosis is required%', 'diagnóstico vacío rechazado'
);
select throws_like(
  format($$ select public.create_technical_report('%s'::uuid, 'diagnóstico', '', 'decisión') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  '%result is required%', 'resultado vacío rechazado'
);
select throws_like(
  format($$ select public.create_technical_report('%s'::uuid, 'diagnóstico', 'resultado', '') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  '%decision is required%', 'decisión vacía rechazada'
);

select lives_ok(
  format($$ select public.create_technical_report('%s'::uuid, 'batería no carga', 'falla confirmada', 'reemplazo',
    'prueba de carga 2h', 'sin daño físico visible', 'cumple garantía') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  'el admin crea un reporte técnico sobre un reclamo OPEN'
);
select is(
  (select count(*)::int from public.technical_reports where claim_id = (select id from t7_ids where label = 'claim_wday30')),
  1, 'el reporte técnico queda guardado'
);
select is(
  (select warranty_id from public.technical_reports where claim_id = (select id from t7_ids where label = 'claim_wday30')),
  (select id from t7_ids where label = 'wday30'), 'warranty_id se deriva del reclamo, no del parámetro'
);

select lives_ok(
  format($$ select public.assign_claim('%s'::uuid) $$, (select id from t7_ids where label = 'claim_wday30')),
  'el admin toma el segundo reclamo para poder probar create_technical_report en UNDER_REVIEW'
);
select lives_ok(
  format($$ select public.create_technical_report('%s'::uuid, 'segundo diagnóstico', 'resultado 2', 'decisión 2') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  'se pueden crear varios reportes técnicos para el mismo reclamo (1 reclamo -> N reportes)'
);
select is(
  (select count(*)::int from public.technical_reports where claim_id = (select id from t7_ids where label = 'claim_wday30')),
  2, 'quedan 2 reportes técnicos para el mismo reclamo'
);

select lives_ok(
  format($$ select public.decide_claim('%s'::uuid, 'REJECTED', 'no cubierto', 'uso indebido confirmado') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  'el admin rechaza el reclamo tras los reportes técnicos'
);
select throws_like(
  format($$ select public.create_technical_report('%s'::uuid, 'diagnóstico tardío', 'x', 'x') $$,
    (select id from t7_ids where label = 'claim_wday30')),
  '%claim is already decided%', 'no se pueden agregar reportes sobre un reclamo ya decidido'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- RLS: technical_reports es admin-only, sin excepción por tienda propia.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select count(*)::int from public.technical_reports),
  0, 'un vendedor no ve ningún reporte técnico, ni siquiera de su propia tienda'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f7000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select ok(
  (select count(*)::int from public.technical_reports) >= 2,
  'el admin ve los reportes técnicos'
);

-- Auditoría: assign/decide/close quedan auditados con el admin real como
-- actor, reutilizando el trigger genérico (sin mecanismo nuevo).
select is(
  (select actor_id from public.audit_logs
     where entity_type = 'warranty_claims' and action = 'update'
       and entity_id = (select id from t7_ids where label = 'claim_wday30')
     order by id desc limit 1),
  'f7000000-0000-0000-0000-0000000000a1'::uuid,
  'la decisión del reclamo queda auditada con el admin real como actor'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
