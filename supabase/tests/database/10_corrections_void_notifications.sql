-- Fase 6 — request_correction, decide_correction, void_warranty, outbox de
-- notificaciones (claim_notifications/complete_notification). Ver
-- docs/DATABASE.md y docs/PROJECT-PLAN.md, sección I.
--
-- Mismo criterio de concurrencia que 09_warranties.sql: pgTAP corre en una
-- sola conexión secuencial. claim_notifications/complete_notification se
-- llaman aquí SIN "set local role" (como el owner de la conexión, que tiene
-- privilegio de ejecución implícito sobre sus propias funciones aunque el
-- grant real sea solo para service_role) para probar el comportamiento
-- funcional real del reclamo/backoff; el aislamiento de rol (que
-- authenticated no puede llamarlas) se prueba aparte, explícitamente.
begin;
select plan(55);

insert into public.stores (id, code, name, country_code, is_active) values
  ('f6000000-0000-0000-0000-00000000000a', 'T-F6A', 'Tienda F6 A', 'VE', true),
  ('f6000000-0000-0000-0000-00000000000b', 'T-F6B', 'Tienda F6 B', 'VE', true);

insert into auth.users (id, email, raw_app_meta_data) values
  ('f6000000-0000-0000-0000-0000000000a1', 'admin-f6@test.local', '{"role":"admin"}'::jsonb),
  ('f6000000-0000-0000-0000-0000000000a2', 'seller-f6a@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f6000000-0000-0000-0000-00000000000a')),
  ('f6000000-0000-0000-0000-0000000000b1', 'seller-f6b@test.local',
    jsonb_build_object('role', 'seller', 'store_id', 'f6000000-0000-0000-0000-00000000000b'));

-- ---------------------------------------------------------------------------
-- Fixtures de catálogo + configuración de notificaciones (como admin).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

insert into public.products (id, code, name, default_warranty_days, warranty_conditions, warranty_exclusions) values
  ('f6100000-0000-0000-0000-000000000001', 'F6-P1', 'Producto F6', 365, 'Condiciones F6', array['Exclusión 1']);

insert into public.lots (id, product_id, code, warranty_days, is_active) values
  ('f6200000-0000-0000-0000-000000000001', 'f6100000-0000-0000-0000-000000000001', 'LOTE-F6-1', 365, true);

select public.create_serial('f6100000-0000-0000-0000-000000000001', 'f6200000-0000-0000-0000-000000000001', 'F6-SER-1', 'F6-SER-1-BC');
select public.create_serial('f6100000-0000-0000-0000-000000000001', 'f6200000-0000-0000-0000-000000000001', 'F6-SER-OLD1', 'F6-SER-OLD1-BC');
select public.create_serial('f6100000-0000-0000-0000-000000000001', 'f6200000-0000-0000-0000-000000000001', 'F6-SER-OLD2', 'F6-SER-OLD2-BC');

update public.notification_settings set admin_notification_emails = array['ops-f6@test.local'], email_enabled = true where id = true;

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Activación real (seller A) -> ejercita el INSERT al outbox dentro de
-- activate_warranty.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ select * from public.activate_warranty('F6-SER-1', '{"name":"Cliente Nuevo","national_id":"v-1","whatsapp":"+584121234567"}'::jsonb) $$,
  'el vendedor activa un serial disponible (F6)'
);

reset role;
reset request.jwt.claims;

create temp table t6_ids (label text primary key, id uuid);
grant select on t6_ids to authenticated;
insert into t6_ids values ('w1', (select id from public.warranties where serial = 'F6-SER-1'));

-- Fixtures "viejas" (>24h), insertadas directo como el owner (bypasea el
-- trigger de inmutabilidad, que solo aplica a UPDATE, no a INSERT) — mismo
-- patrón que 09_warranties.sql.
insert into public.warranties (
  id, serial_id, store_id, seller_id, activated_at, duration_days, expires_at, store_attention_days,
  product_id, product_code, product_name, serial, barcode, lot_code, conditions, exclusions,
  customer_name, customer_national_id, customer_whatsapp
) values (
  'f6300000-0000-0000-0000-000000000002',
  (select id from public.serials where serial = 'F6-SER-OLD1'),
  'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a2',
  now() - interval '2 days', 365, now() - interval '2 days' + interval '365 days', 30,
  'f6100000-0000-0000-0000-000000000001', 'F6-P1', 'Producto F6', 'F6-SER-OLD1', 'F6-SER-OLD1-BC', 'LOTE-F6-1', '', '{}',
  'Cliente Viejo', 'V-1', '+584120000000'
), (
  'f6300000-0000-0000-0000-000000000003',
  (select id from public.serials where serial = 'F6-SER-OLD2'),
  'f6000000-0000-0000-0000-00000000000a', 'f6000000-0000-0000-0000-0000000000a2',
  now() - interval '2 days', 365, now() - interval '2 days' + interval '365 days', 30,
  'f6100000-0000-0000-0000-000000000001', 'F6-P1', 'Producto F6', 'F6-SER-OLD2', 'F6-SER-OLD2-BC', 'LOTE-F6-1', '', '{}',
  'Cliente Viejo 2', 'V-2', '+584120000001'
);
insert into t6_ids values ('w2', 'f6300000-0000-0000-0000-000000000002'), ('w3', 'f6300000-0000-0000-0000-000000000003');

-- Estas garantías "viejas" se insertaron directo en warranties (bypaseando
-- activate_warranty, único camino real que activa un serial) para simular
-- una activación de hace >24h. Sin este UPDATE, F6-SER-OLD1/OLD2 quedarían
-- en 'AVAILABLE' (el default de create_serial) y la aserción de la línea
-- ~360 ("anular NO cambia el estado del serial") compararía contra un
-- estado que nunca representó una garantía activada de verdad.
update public.serials set status = 'ACTIVATED' where serial in ('F6-SER-OLD1', 'F6-SER-OLD2');

-- ---------------------------------------------------------------------------
-- Outbox: la activación encoló exactamente 1 notificación (1 admin configurado).
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.notifications where type = 'warranty_activated'
     and payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  1, 'activate_warranty encoló exactamente 1 notificación (1 correo admin configurado)'
);
select is(
  (select status from public.notifications where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'PENDING', 'la notificación de activación queda PENDING'
);
select is(
  (select recipient from public.notifications where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'ops-f6@test.local', 'el destinatario es el correo admin configurado'
);

-- ---------------------------------------------------------------------------
-- request_correction — validaciones
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select public.request_correction((select id from public.warranties limit 1), 'customer_name', 'X', 'motivo largo suficiente') $$,
  '%only an active seller%', 'admin no puede invocar request_correction'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'Nuevo Nombre', 'motivo válido') $$,
    (select id from t6_ids where label = 'w1')),
  '%edit window has not expired yet%', 'dentro de las 24h, request_correction se rechaza (usar update_warranty_customer)'
);

select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'serial', 'X', 'motivo válido') $$,
    (select id from t6_ids where label = 'w2')),
  '%not correctable%', 'campo no corregible (serial) rechazado'
);
select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'X', '') $$,
    (select id from t6_ids where label = 'w2')),
  '%reason is required%', 'motivo vacío rechazado'
);
select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_whatsapp', '04120000000', 'motivo válido') $$,
    (select id from t6_ids where label = 'w2')),
  '%E.164%', 'whatsapp corregido sin formato E.164 rechazado'
);

reset role;
reset request.jwt.claims;

-- Otra tienda no puede pedir corrección de la garantía de la tienda A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'X', 'motivo válido') $$,
    (select id from t6_ids where label = 'w2')),
  '%belongs to another store%', 'vendedor de otra tienda no puede pedir corrección'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- request_correction — éxito, duplicado pendiente, garantía anulada
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'Cliente Corregido', 'nombre mal escrito al activar') $$,
    (select id from t6_ids where label = 'w2')),
  'el vendedor pide corrección de customer_name pasadas las 24h'
);
select is(
  (select status from public.warranty_corrections
     where warranty_id = (select id from t6_ids where label = 'w2') and field = 'customer_name'),
  'PENDING', 'la corrección queda PENDING'
);
select is(
  (select old_value from public.warranty_corrections
     where warranty_id = (select id from t6_ids where label = 'w2') and field = 'customer_name'),
  'Cliente Viejo', 'old_value se congeló con el valor real vigente'
);

select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'Otro Más', 'segundo intento') $$,
    (select id from t6_ids where label = 'w2')),
  '%pending correction already exists%', 'no se puede pedir dos correcciones pendientes del mismo campo'
);

-- Segunda corrección, otro campo, para el flujo de aprobación.
select lives_ok(
  format($$ select public.request_correction('%s'::uuid, 'customer_national_id', 'V-9999', 'cédula mal transcrita') $$,
    (select id from t6_ids where label = 'w2')),
  'el vendedor pide corrección de customer_national_id (campo distinto, sí se permite)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- decide_correction — permisos, rechazo, aprobación, re-decisión
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_name'),
    'APPROVED', null) $$, (select id from t6_ids where label = 'w2')),
  '%only admin can decide%', 'vendedor no puede decidir correcciones'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select public.decide_correction(gen_random_uuid(), 'MAYBE', null) $$,
  '%invalid decision%', 'decisión inválida rechazada'
);
select throws_like(
  $$ select public.decide_correction(gen_random_uuid(), 'APPROVED', null) $$,
  '%correction not found%', 'corrección inexistente rechazada'
);

select lives_ok(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_name'),
    'REJECTED', 'no corresponde') $$, (select id from t6_ids where label = 'w2')),
  'el admin rechaza la corrección de customer_name'
);
select is(
  (select status from public.warranty_corrections
     where warranty_id = (select id from t6_ids where label = 'w2') and field = 'customer_name'),
  'REJECTED', 'queda REJECTED'
);
select is(
  (select customer_name from public.warranties where id = (select id from t6_ids where label = 'w2')),
  'Cliente Viejo', 'rechazar no cambia el dato de la garantía'
);
select throws_like(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_name'),
    'APPROVED', null) $$, (select id from t6_ids where label = 'w2')),
  '%is not pending%', 'no se puede volver a decidir una corrección ya decidida'
);

select lives_ok(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_national_id'),
    'APPROVED', 'verificado con cédula física') $$, (select id from t6_ids where label = 'w2')),
  'el admin aprueba la corrección de customer_national_id'
);
select is(
  (select customer_national_id from public.warranties where id = (select id from t6_ids where label = 'w2')),
  'V-9999', 'aprobar aplica el nuevo valor a la garantía'
);
select is(
  (select decided_by from public.warranty_corrections
     where warranty_id = (select id from t6_ids where label = 'w2') and field = 'customer_national_id'),
  'f6000000-0000-0000-0000-0000000000a1'::uuid, 'decided_by queda con el admin real'
);

reset role;
reset request.jwt.claims;

-- Concurrencia: el valor cambió entre pedir y decidir (otra corrección
-- aprobada, o edición directa) -> la aprobación se rechaza en vez de
-- sobrescribir un valor que el vendedor nunca vio.
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  format($$ select public.request_correction('%s'::uuid, 'customer_whatsapp', '+584127777777', 'cliente cambió de número') $$,
    (select id from t6_ids where label = 'w2')),
  'el vendedor pide corrección de customer_whatsapp'
);

reset role;
reset request.jwt.claims;

update public.warranties set customer_whatsapp = '+584128888888' where id = (select id from t6_ids where label = 'w2');

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_whatsapp'),
    'APPROVED', null) $$, (select id from t6_ids where label = 'w2')),
  '%changed since the correction was requested%', 'aprobar se rechaza si el valor cambió desde que se pidió'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- request_correction sobre garantía anulada + decide_correction sobre
-- garantía anulada.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  format($$ select public.request_correction('%s'::uuid, 'customer_name', 'Cambio Pendiente', 'antes de anular') $$,
    (select id from t6_ids where label = 'w3')),
  'el vendedor pide corrección sobre w3 (todavía no anulada)'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- void_warranty — permisos, validaciones, éxito, no-doble-anulación
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.void_warranty('%s'::uuid, 'motivo') $$, (select id from t6_ids where label = 'w3')),
  '%only admin can void%', 'vendedor no puede anular garantías'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  format($$ select public.void_warranty('%s'::uuid, '') $$, (select id from t6_ids where label = 'w3')),
  '%reason is required%', 'anular sin motivo se rechaza'
);
select throws_like(
  $$ select public.void_warranty(gen_random_uuid(), 'motivo') $$,
  '%warranty not found%', 'anular una garantía inexistente se rechaza'
);

select lives_ok(
  format($$ select public.void_warranty('%s'::uuid, 'serial equivocado en la activación') $$,
    (select id from t6_ids where label = 'w3')),
  'el admin anula la garantía w3'
);
select ok(
  (select voided_at is not null and voided_by = 'f6000000-0000-0000-0000-0000000000a1'::uuid
     and voided_reason = 'serial equivocado en la activación'
   from public.warranties where id = (select id from t6_ids where label = 'w3')),
  'voided_at/voided_by/voided_reason quedan correctos'
);
select is(
  (select count(*)::int from public.warranties where id = (select id from t6_ids where label = 'w3')),
  1, 'la garantía anulada NO se borra físicamente'
);
select is(
  (select status from public.serials where serial = 'F6-SER-OLD2'),
  'ACTIVATED', 'anular la garantía NO cambia el estado del serial (decisión Fase 6)'
);

select throws_like(
  format($$ select public.void_warranty('%s'::uuid, 'otra vez') $$, (select id from t6_ids where label = 'w3')),
  '%already voided%', 'no se puede anular dos veces la misma garantía'
);

-- La corrección pedida ANTES de anular sigue existiendo pero ya no se puede
-- aprobar (la garantía dejó de ser elegible).
select throws_like(
  format($$ select public.decide_correction(
    (select id from public.warranty_corrections where warranty_id = '%s'::uuid and field = 'customer_name'),
    'APPROVED', null) $$, (select id from t6_ids where label = 'w3')),
  '%not found or voided%', 'no se puede aprobar una corrección sobre una garantía ya anulada'
);

-- Y ya no se pueden pedir correcciones nuevas sobre una garantía anulada.
reset role;
reset request.jwt.claims;
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_like(
  format($$ select public.request_correction('%s'::uuid, 'customer_national_id', 'V-1', 'motivo válido') $$,
    (select id from t6_ids where label = 'w3')),
  '%warranty is voided%', 'no se puede pedir corrección sobre una garantía ya anulada'
);

reset role;
reset request.jwt.claims;

-- Auditoría: la anulación queda auditada con el admin real como actor,
-- reutilizando el trigger genérico (sin mecanismo nuevo).
select is(
  (select actor_id from public.audit_logs
     where entity_type = 'warranties' and action = 'update'
       and entity_id = (select id from t6_ids where label = 'w3')
     order by id desc limit 1),
  'f6000000-0000-0000-0000-0000000000a1'::uuid,
  'la anulación queda auditada con el admin real como actor'
);

-- ---------------------------------------------------------------------------
-- RLS: aislamiento por tienda de warranty_corrections
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.warranty_corrections),
  0, 'un vendedor de otra tienda no ve ninguna corrección de la tienda A'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select ok(
  (select count(*)::int from public.warranty_corrections) >= 4,
  'el admin ve todas las correcciones, de cualquier tienda'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Seguridad del outbox: ni admin ni vendedor pueden llamar
-- claim_notifications/complete_notification (solo service_role).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a1","role":"authenticated","aal":"aal2"}';

select throws_like(
  $$ select * from public.claim_notifications(10) $$,
  '%permission denied%', 'admin no puede invocar claim_notifications (solo service_role)'
);
select throws_like(
  $$ select public.complete_notification(1, true, null) $$,
  '%permission denied%', 'admin no puede invocar complete_notification (solo service_role)'
);

reset role;
reset request.jwt.claims;

set local role authenticated;
set local request.jwt.claims to '{"sub":"f6000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select is(
  (select count(*)::int from public.notifications),
  0, 'un vendedor no ve ninguna fila del outbox (RLS solo-admin)'
);

reset role;
reset request.jwt.claims;

-- Un vendedor no puede leer el outbox de otra forma ni con otra tienda: ya
-- verificado arriba (0 filas visibles, sin excepción — RLS filtra, no
-- bloquea la tabla).

-- ---------------------------------------------------------------------------
-- claim_notifications / complete_notification — comportamiento real (como
-- el owner de la conexión, dueño de las funciones: ver nota al inicio).
-- ---------------------------------------------------------------------------
select is(
  (select status from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'PENDING', 'sigue PENDING antes de reclamar'
);

select is(
  (select count(*)::int from public.claim_notifications(10)
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  1, 'claim_notifications reclama la notificación de activación'
);
select is(
  (select status from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'PROCESSING', 'queda PROCESSING tras reclamarla'
);
select is(
  (select attempts from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  1, 'attempts se incrementó al reclamar'
);

-- Reclamar de nuevo no debe volver a traer la misma fila (ya no está PENDING):
-- evita que dos invocaciones solapadas de la Edge Function envíen el mismo
-- correo dos veces.
select is(
  (select count(*)::int from public.claim_notifications(10)
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  0, 'una segunda reclamación no vuelve a traer la misma notificación (sin duplicar envío)'
);

-- Fallo de envío con reintentos disponibles: vuelve a PENDING con backoff,
-- no se pierde ni se marca SENT sin confirmación real del proveedor.
select public.complete_notification(
  (select id from public.notifications where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  false, 'Resend: 503');
select is(
  (select status from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'PENDING', 'un fallo con intentos disponibles vuelve a PENDING (reintentable)'
);
select ok(
  (select available_at > now() from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'el reintento queda programado con backoff (available_at en el futuro)'
);
select is(
  (select count(*)::int from public.claim_notifications(10)
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  0, 'no se reclama antes de tiempo (available_at todavía no llega)'
);

-- Agotar reintentos -> FAILED definitivo.
update public.notifications set attempts = 5, available_at = now()
  where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1');
select public.claim_notifications(10);
select public.complete_notification(
  (select id from public.notifications where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  false, 'Resend: 503 otra vez');
select is(
  (select status from public.notifications
     where payload ->> 'warranty_id' = (select id::text from t6_ids where label = 'w1')),
  'FAILED', 'al agotar los reintentos queda FAILED definitivo'
);

-- Camino de éxito: nunca SENT sin pasar por complete_notification(ok=true).
insert into public.notifications (type, recipient, payload) values ('test', 'x@test.local', '{}'::jsonb);
select public.claim_notifications(10);
select public.complete_notification(
  (select id from public.notifications where type = 'test' and recipient = 'x@test.local'), true, null);
select ok(
  (select status = 'SENT' and sent_at is not null from public.notifications
     where type = 'test' and recipient = 'x@test.local'),
  'complete_notification(ok=true) marca SENT con sent_at'
);

select throws_like(
  $$ select public.complete_notification(999999999, true, null) $$,
  '%notification not found%', 'completar una notificación inexistente se rechaza'
);

select * from finish();
rollback;
