# Tests de base de datos (pgTAP)

Cómo correrlos (requiere Docker Desktop — ver docs/PROGRESS.md, "BLOQUEADO"):

```
npx supabase start
npx supabase test db
```

## Cómo están escritos

No usan una librería externa de test helpers: simulan un usuario autenticado
fijando directamente las variables de sesión que `auth.uid()` lee en
cualquier proyecto Supabase:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid del usuario>","role":"authenticated"}';
```

Esto es exactamente lo que hace PostgREST en cada request real, así que
ejercita las mismas políticas RLS y las mismas funciones `SECURITY DEFINER`
que usa la aplicación — no es un atajo que se salte nada.

Cada archivo:

1. Crea usuarios de prueba insertando directamente en `auth.users` (dispara
   `private.handle_new_user()`, igual que en producción).
2. Cambia de "identidad" con `set local role/request.jwt.claims` para
   simular admin, vendedor de tienda A, vendedor de tienda B, o anónimo.
3. Verifica con `pgtap` (`is`, `ok`, `throws_ok`, `results_eq`, etc.) que
   cada uno solo puede hacer lo que le corresponde.
4. Corre dentro de `begin; ... rollback;` — no deja datos de prueba.

## Estado

Escritos pero **no ejecutados todavía** — esta máquina de desarrollo no
tiene Docker instalado (ver docs/PROGRESS.md, riesgos abiertos). Marcarlos
como PASS antes de correrlos sería falso.
