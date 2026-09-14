# E2E (Playwright)

`login.spec.ts` corre de verdad contra un `next build && next start` local
con un `.env.local` de placeholder (URL con forma válida, sin proyecto
Supabase real detrás) — solo verifica que las páginas públicas renderizan.

Los flujos que necesitan autenticar de verdad (login con credenciales,
proteger /admin y /tienda, RLS desde el navegador) están **BLOQUEADOS**:
necesitan un proyecto Supabase real con datos de prueba, que no existe
todavía en esta cuenta/sesión. Ver docs/PROGRESS.md.
