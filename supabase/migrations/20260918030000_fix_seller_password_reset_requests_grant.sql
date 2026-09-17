-- Fix: la migración anterior (20260918020000) revocó todos los privilegios
-- de "authenticated" sobre seller_password_reset_requests y solo agregó una
-- política de RLS para admin — pero RLS filtra FILAS, no reemplaza el GRANT
-- base de la tabla. Sin el GRANT, "permission denied" incluso para un admin
-- que sí cumple la política. Mismo problema que profiles/stores ya resuelven
-- con su propio GRANT SELECT a "authenticated" (rls.sql).
grant select on public.seller_password_reset_requests to authenticated;
