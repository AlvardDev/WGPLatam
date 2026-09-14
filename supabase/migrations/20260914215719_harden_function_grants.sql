-- Corrige un hallazgo real de Supabase Advisors detectado al verificar la
-- Fase 1 contra el proyecto real: public.log_audit_event() (creada en
-- 20260914201420_audit_logs.sql) quedó ejecutable por "anon" además de
-- "authenticated".
--
-- Causa: Supabase configura, a nivel de proyecto, "alter default privileges
-- in schema public grant execute on functions to anon, authenticated,
-- service_role" — esto concede EXECUTE directamente a esos roles por
-- nombre, no a través del pseudo-rol PUBLIC. La migración original hacía
-- "revoke all ... from public", que es el patrón correcto en Postgres puro,
-- pero en un proyecto Supabase eso NO alcanza a "anon"/"authenticated"
-- porque su acceso no pasa por PUBLIC.
--
-- Las funciones del esquema "private" no tienen este problema: ese default
-- de Supabase solo aplica al esquema "public" (verificado: ninguna de ellas
-- tiene grants a anon/authenticated salvo private.is_admin()/
-- current_store_id(), que SÍ los tienen a propósito).
--
-- Corrección puntual + cierre del default hacia adelante, para que ninguna
-- función nueva en "public" (las RPC de las próximas fases: activate_
-- warranty, lookup_serial, etc.) quede expuesta a "anon" por accidente.
-- Ver docs/SECURITY.md, checklist de funciones SECURITY DEFINER (actualizado
-- para dejar esto explícito).

revoke execute on function public.log_audit_event(text, jsonb) from anon;

alter default privileges in schema public revoke execute on functions from anon;
