-- Fase 9 — Performance
--
-- Medido con EXPLAIN ANALYZE contra el proyecto real (audit_logs ya tiene
-- ~980k filas reales, resto del benchmark de 1M de la Fase 3 — no fue
-- necesario insertar datos sintéticos nuevos para esta medición).
--
-- app/admin/auditoria/page.tsx pagina por keyset con
-- `order by occurred_at desc, id desc` (Fase 8). El índice
-- audit_logs_occurred_at_idx (solo occurred_at) no cubre el desempate por
-- id: Postgres hacía Index Scan + Incremental Sort, 358 ms para la primera
-- página de 51 filas. Un índice compuesto que coincide exactamente con el
-- ORDER BY deja el plan en un Index Scan puro (sin paso de sort aparte).
-- Sustituye al índice de una sola columna (lo cubre igual para
-- `where occurred_at >= X` simple, y evita mantener dos índices por lo
-- mismo).
drop index if exists public.audit_logs_occurred_at_idx;
create index audit_logs_occurred_at_id_idx on public.audit_logs (occurred_at desc, id desc);

-- app/admin/page.tsx (dashboard de KPIs, esta misma fase) filtra warranties
-- por expires_at (activas/por vencer/vencidas) — el índice ya estaba
-- previsto desde el diseño original (docs/DATABASE.md, "Índices
-- previstos") pero no se había creado porque ninguna pantalla lo necesitaba
-- todavía.
create index warranties_expires_at_idx on public.warranties (expires_at);
