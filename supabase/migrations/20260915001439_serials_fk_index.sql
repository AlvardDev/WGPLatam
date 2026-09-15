-- Corrige un hallazgo real de Supabase Advisors (performance) detectado al
-- verificar la Fase 2 contra el proyecto real: la FK compuesta
-- serials_lot_id_product_id_fkey (lot_id, product_id) no tenía un índice
-- que la cubra por completo — serials_lot_status_idx es (lot_id, status),
-- cubre lot_id pero no product_id junto a él. Sin este índice, verificar
-- esa FK al actualizar/borrar una fila de "lots" es más lento de lo
-- necesario a medida que "serials" crezca.
create index serials_lot_product_idx on public.serials (lot_id, product_id);
