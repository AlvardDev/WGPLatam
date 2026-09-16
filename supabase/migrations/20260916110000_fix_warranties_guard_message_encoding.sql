-- Fix: el texto vigente de private.warranties_guard_immutable() en el
-- proyecto real perdió sus tildes ("anulacion"/"despues" en vez de
-- "anulación"/"después") — divergencia entre esta migración fuente
-- (20260915162417_phase5_warranties.sql, siempre tuvo el texto correcto) y
-- lo desplegado, hallada por pgTAP (09_warranties.sql, caso "el trigger de
-- inmutabilidad rechaza cambiar duration_days incluso por UPDATE directo")
-- al re-verificar Fase 8. Sin cambio de comportamiento: create or replace
-- solo corrige el mensaje de la excepción.
create or replace function private.warranties_guard_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.serial_id is distinct from old.serial_id
    or new.store_id is distinct from old.store_id
    or new.seller_id is distinct from old.seller_id
    or new.activated_at is distinct from old.activated_at
    or new.duration_days is distinct from old.duration_days
    or new.expires_at is distinct from old.expires_at
    or new.store_attention_days is distinct from old.store_attention_days
    or new.product_id is distinct from old.product_id
    or new.product_code is distinct from old.product_code
    or new.product_name is distinct from old.product_name
    or new.serial is distinct from old.serial
    or new.barcode is distinct from old.barcode
    or new.lot_code is distinct from old.lot_code
    or new.conditions is distinct from old.conditions
    or new.exclusions is distinct from old.exclusions
    or new.created_at is distinct from old.created_at
  then
    raise exception 'warranties: solo los campos de cliente o de anulación pueden modificarse después de activar';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
