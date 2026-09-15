# Resumen técnico — Fase 5: Activación de garantías

> Documento de cierre (no de planificación): describe lo que efectivamente se implementó y verificó, no un plan. El detalle completo de esquema/RLS/RPC vive en `docs/DATABASE.md` y `docs/SECURITY.md`; este documento resume y referencia, no duplica. Fecha: 2026-09-15.

## 1. Arquitectura

Mismo principio que las fases anteriores: RLS para lectura de catálogo/histórico, RPC `SECURITY DEFINER` para toda escritura crítica. La activación es la primera vez que el sistema crea una fila que **nunca debe volver a cambiar en su núcleo** (fecha, duración, snapshot de producto/lote, identidad), así que a la fórmula habitual se le agrega un tercer mecanismo: un trigger de inmutabilidad. Sin servicios externos nuevos — PDF/email quedan fuera de esta fase por diseño (ver `CLAUDE.md`/prompt de F5).

Flujo: vendedor escribe o escanea un código → `lookup_serial` (solo lectura, datos mínimos) → confirmación en pantalla con los datos reales del producto/lote → `activate_warranty` (una sola llamada, todo-o-nada) → resultado.

## 2. Lookup (`lookup_serial`)

Solo vendedor activo (`private.current_store_id()` no nulo). Busca por `serial` o `barcode` normalizados, sin distinguir cuál escribió el usuario. Devuelve únicamente lo que la pantalla necesita para mostrar una confirmación con sentido — no expone `serials`/`lots` completos (regla de mínimo dato de `CLAUDE.md`): `serial_id`, `serial`, `barcode`, `product_code`, `product_name`, `warranty_duration_days`, `status`. Un serial inexistente devuelve 0 filas, nunca una excepción — el frontend distingue "no encontrado" de un error real de red/servidor por eso.

## 3. Activación (`activate_warranty`)

Una función, todo dentro de la misma transacción implícita de la llamada RPC:

1. Verifica vendedor activo (`current_store_id()`), nunca un `store_id` que llegue como parámetro.
2. Valida el cliente completo (nombre, identificación, WhatsApp en formato E.164 `^\+[1-9]\d{6,14}$`) — antes de tocar el serial, para no bloquear una fila si la petición va a fallar igual por datos incompletos.
3. `SELECT ... FOR UPDATE` sobre el serial (por `serial` o `barcode`) — bloquea la fila hasta que la transacción termine. Aquí es donde vivía el bug real (§8).
4. Estado del serial: solo `AVAILABLE` continúa. `ACTIVATED`/`BLOCKED`/`VOID` se rechazan con un mensaje específico por estado (nunca un genérico "no se puede").
5. Lote y producto deben estar `is_active`.
6. Snapshot: copia `product_id/code/name`, `serial`, `barcode`, `lot_code`, `conditions`, `exclusions`, calcula `duration_days`/`expires_at` desde el lote, y `store_attention_days` desde `app_settings`.
7. `INSERT` en `warranties`, `UPDATE` del serial a `ACTIVATED` — en ese orden, dentro de la misma función: si el INSERT falla (por ejemplo el `UNIQUE` de `serial_id`, §5), el UPDATE nunca ocurre.

## 4. Snapshot histórico

`warranties` copia todo lo que un cambio posterior en `products`/`lots`/`app_settings` podría alterar: nombre de producto, código de lote, condiciones/exclusiones, duración, días de atención de la tienda. Verificado con pgTAP editando el producto y el lote reales **después** de activar y confirmando que el snapshot no se movió. El trigger `private.warranties_guard_immutable()` (BEFORE UPDATE) es la garantía de que esto sigue siendo cierto incluso si alguien intenta un UPDATE directo bypaseando la RPC — probado igual con un UPDATE directo real, no solo a través de la RPC.

## 5. Concurrencia — "doble cinturón"

La garantía real contra dos vendedores activando el mismo serial a la vez es el `SELECT ... FOR UPDATE` del paso 3: la segunda transacción espera a que la primera termine (commit o rollback) antes de poder leer el estado del serial, así que siempre ve `ACTIVATED` si la primera tuvo éxito. No se simuló con un benchmark de conexiones paralelas reales (la base está limitada en cuota y el prompt de esta fase pidió explícitamente no correr benchmarks grandes) — la prueba real hecha es **secuencial-equivalente**: activar, luego reintentar el mismo serial ya `ACTIVATED` (mismo resultado que vería una segunda transacción concurrente que llega después de que la primera libera el lock), y confirmar que sigue existiendo exactamente 1 garantía. El respaldo estructural, para el caso de que el lock se bypaseara por algún error de la función, es `warranties.serial_id UNIQUE` — probado con un `INSERT` directo que salta la RPC por completo y choca contra la restricción.

## 6. Idempotencia / reintento

Sin tabla ni clave de idempotencia dedicada: la propia máquina de estados del serial ya lo resuelve. Un reintento de red o doble clic vuelve a llamar `activate_warranty` con el mismo código; el serial ya está `ACTIVATED`, así que se rechaza con "serial already activated" y no se crea una segunda fila. Verificado con pgTAP llamando dos veces seguidas y confirmando el conteo final.

## 7. Fechas

`activated_at`/`expires_at` se calculan con `now()` de Postgres dentro de la función — nunca reciben una fecha como parámetro. El reloj del navegador nunca participa (`CLAUDE.md`, "No hacer").

## 8. Bugs reales encontrados por pgTAP y corregidos

1. **Ambigüedad de columna real, encontrada corriendo pgTAP contra el proyecto real** (no en revisión de código): `activate_warranty` declara `RETURNS TABLE (..., serial text, barcode text, ...)`, y Postgres convierte esos nombres en variables OUT visibles en **todo** el cuerpo de la función — no solo en el `RETURN QUERY` final. El `SELECT ... FOR UPDATE` del paso 3 comparaba `serial = v_code or barcode = v_code` sin calificar con un alias, así que Postgres no podía saber si se refería a la variable de salida o a la columna de la tabla: `column reference "serial" is ambiguous` (42702). 6 de los 36 tests fallaron con este error exacto. Corregido calificando con un alias de tabla (`s.serial`, `s.barcode`, `select s.*`). `lookup_serial` no tenía el bug (ya usaba alias `s`); `update_warranty_customer` no puede tenerlo (no usa `RETURNS TABLE`).
2. **2 fallos que no eran del producto, sino de las pruebas mismas**: una prueba leía `status` de `serials` con un `SELECT` directo corriendo como el vendedor que activó — pero ese vendedor no tiene SELECT directo sobre `serials` por diseño (RLS, `docs/DATABASE.md`), así que la lectura devolvía `NULL`, no porque la activación fallara. Otra prueba intentaba que el vendedor de la tienda B resolviera el id de una garantía de la tienda A con un `SELECT` directo — RLS tampoco lo permite, así que el id llegaba `NULL` a `update_warranty_customer` y el mensaje real era "warranty not found" en vez de "belongs to another store" (la RPC nunca llegó a comparar tiendas porque no encontró ninguna fila con id `NULL`). Ambas corregidas: la primera usa `lookup_serial` (accesible al vendedor); la segunda resuelve el id como el owner de la tabla (antes de cambiar de rol al vendedor bajo prueba), tal como le llegaría por URL/API en un caso real, y sí ejercita el mensaje real de la RPC.

## 9. Seguridad

Checklist de `docs/SECURITY.md` aplicado a las 3 RPC: `SECURITY DEFINER`, `set search_path = ''`, `REVOKE ALL` explícito de `public`/`anon`, `GRANT EXECUTE` solo a `authenticated`, y verificación interna de identidad (`current_store_id()`/`auth.uid()`) en vez de confiar en cualquier parámetro que el cliente pudiera enviar. `warranties` sin política de escritura para nadie (ni admin) — todo pasa por las RPC. Ver `docs/DATABASE.md`, Fase 5, para la tabla completa de RLS.

## 10. Frontend

`/tienda/activar`: entrada manual (siempre disponible) + escaneo de cámara con la Web API nativa `BarcodeDetector`, detectada por *feature detection* (`'BarcodeDetector' in window`) — mejora progresiva real, no un requisito. Deliberadamente **sin** agregar el ponyfill/`zxing-wasm` que menciona `docs/ARCHITECTURE.md` en su tabla de stack: es una dependencia grande para lo que pide esta fase (cámara "cuando sea razonable", con la entrada manual como camino garantizado) — decisión de minimizar dependencias, documentada en el propio código, no un olvido. Flujo con confirmación explícita antes de activar (no hay activación de un solo paso) y estados de resultado distintos para éxito, ya-activado, bloqueado, anulado, no-encontrado y error de red — cada uno con su propio mensaje, mapeado desde el mensaje real de la RPC (`friendlyWarrantyError`, `lib/actions/warranties.ts`).

`/tienda` pasó de un placeholder a un listado real de garantías de la tienda (RLS filtra automáticamente); `/tienda/garantias/[id]` permite editar los datos de cliente dentro de la ventana de 24h, con el resto de la garantía en solo lectura. `/admin/garantias` y su detalle son deliberadamente mínimos (listado/lectura de todas las tiendas, sin edición) — un dashboard con KPIs y filtros avanzados es la Fase 9, no esta; RLS ya le da al admin la visibilidad completa sin necesitar código nuevo de autorización.

## 11. Mobile

Layout mobile-first: formulario de una columna, botones de tamaño táctil, cámara a pantalla casi completa cuando está activa. No se verificó en un dispositivo físico ni con una webcam real (ver §13) — el diseño responsive se verificó por código (mismo patrón de `sidebar`/`hamburguesa` con media queries reales que las fases anteriores), no visualmente en vivo.

## 12. Resultados de pruebas

- pgTAP real: **36/36** (`supabase/tests/database/09_warranties.sql`, corrido vía SQL Editor del dashboard — el CLI de Supabase sigue sin poder conectarse desde esta red, ver Fase 4 §PROBLEMAS). 0 fallos tras los 2 fixes de §8.
- Vitest: **54/54** (47 de Fases 1-4 + 7 nuevos de `lib/validation/warranties.test.ts`).
- Lint, typecheck, build: **PASS** (1 error real de lint corregido en el camino — `setState` síncrono dentro de un `useEffect` en `barcode-scanner.tsx`, ver `docs/PROGRESS.md`).
- E2E de navegador: **NO se hizo**. Mismo motivo documentado en la Fase 4 — probar la activación real requiere iniciar sesión como un vendedor real, y este proyecto no usa/pide contraseñas reales de usuarios del cliente (`docs/PROGRESS.md`, Fase 4, PROBLEMAS). No se fabricó un "PASS": queda documentado como pendiente honesto, no como hecho.

## 13. Riesgos / límites conocidos

- Sin verificación E2E de navegador autenticado (mismo riesgo que Fase 4, mitigado por pgTAP real cubriendo toda la lógica de negocio y seguridad a nivel de base, que es la autoridad).
- `BarcodeDetector` no se probó con una cámara física real (Chrome de escritorio no expone cámara trasera en este entorno) — la entrada manual, que sí quedó ejercitada indirectamente por las mismas RPC que usa pgTAP, es el camino garantizado.
- La concurrencia real (dos conexiones simultáneas de verdad) no se sometió a un benchmark de carga — deliberado, por la cuota limitada de la base y la instrucción explícita de esta fase de no correr benchmarks grandes. La garantía verificada es estructural (lock de fila + UNIQUE), no medida bajo carga.

## 14. Decisiones

- Seguir sobre la base Supabase actual en vez de crear una nueva, tras una duda del usuario sobre si el benchmark de 1M de la Fase 3 la había dejado "corrupta" — no lo está; confirmado con el usuario ("continua entonces"). El error real de este checkpoint fue un bug de código de esta misma fase (§8.1), sin relación con el incidente de disco de la Fase 3.
- Sin PDF, email/Resend, `warranty_corrections`/`warranty_claims`/`technical_reports`, `void_warranty`, MFA, throttling avanzado ni el dashboard de analítica de la Fase 9 — alcance fijado por el prompt de esta fase, no un recorte improvisado.
- Idempotencia vía la propia máquina de estados del serial, sin una tabla/clave de idempotencia aparte — menos superficie, mismo resultado, decisión explícita del prompt de esta fase.

## 15. Veredicto

**FASE 5 COMPLETA a nivel de base de datos y código.** Esquema, RLS, RPC y snapshot inmutable verificados con 36 pgTAP reales contra el proyecto Supabase real, incluyendo un bug real de ambigüedad de columnas encontrado y corregido antes de reportar (no una prueba débil que pasara por casualidad). Frontend completo para el flujo de activación y el listado/detalle de tienda y admin, con lint/typecheck/build/Vitest en verde. Única deuda abierta: verificación E2E de navegador autenticado, documentada como pendiente honesto por la misma razón de la Fase 4 — no bloquea la funcionalidad ni la seguridad, que están verificadas donde vive la autoridad real (la base de datos).
