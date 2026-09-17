-- Reversión explícita del usuario (2026-09-16): se elimina el auto-registro
-- público de vendedores (Fase 9, 20260918020000_seller_self_registration.sql
-- + 20260918040000_registration_throttle.sql). Solo queda alta por
-- invitación de admin (lib/actions/sellers.ts, sin cambios) — un correo que
-- el admin no dio de alta simplemente no tiene fila en auth.users y no
-- puede iniciar sesión.
--
-- Se retira únicamente lo que era exclusivo del auto-registro
-- (registration_attempts + check_registration_throttle, sin más usos).
-- seller_password_reset_requests y sus 2 RPC quedan intactos: son la
-- recuperación de contraseña de un vendedor YA activo (dado de alta por
-- invitación), no una forma de registro.

drop function if exists public.check_registration_throttle(text);
drop table if exists public.registration_attempts;
