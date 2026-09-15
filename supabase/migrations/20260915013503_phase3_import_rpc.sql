-- Fase 3 — RPC de importación masiva (única vía de escritura crítica sobre
-- serial_import_rows y de creación de serials en lote). Checklist de
-- docs/SECURITY.md aplicado a las 5: search_path='', revoke execute de
-- public Y anon explícitamente, re-verificación de is_admin() dentro de cada
-- función, sin parámetros de fecha ni de tienda.

-- ---------------------------------------------------------------------------
-- stage_import_rows: valida un bloque por conjuntos (no fila por fila) y
-- deja cada fila en un status final de staging. Idempotente por
-- (import_id, row_number): reintentar el mismo bloque recalcula el mismo
-- resultado y sobrescribe, nunca duplica filas de staging.
-- ---------------------------------------------------------------------------
create or replace function public.stage_import_rows(p_import_id uuid, p_rows jsonb)
returns table(staged integer, valid_count integer, duplicate_count integer, error_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can stage import rows' using errcode = '42501';
  end if;

  select status into v_status from public.serial_imports where id = p_import_id for update;
  if v_status is null then
    raise exception 'import not found';
  end if;
  if v_status <> 'STAGING' then
    raise exception 'import is not in STAGING (current: %)', v_status;
  end if;

  -- Clasificación por JOINS de igualdad simple (hash join), no por EXISTS
  -- correlacionados con OR entre columnas: un EXISTS con "a=x or b=x or a=y
  -- or b=y" evaluado por fila obliga a un nested loop — O(n²) real (un
  -- bloque de 5.000 filas llegó a colgarse en el benchmark de esta fase).
  -- La técnica: "achatar" serial/barcode en pares (fila, clave) y hacer UN
  -- join de igualdad contra cada fuente (el propio bloque, lo ya staged de
  -- este import, y serials existentes) — cada join es O(n) con hash join.
  with input_rows as materialized (
    select
      (r ->> 'row_number')::integer as row_number,
      private.normalize_code(r ->> 'serial') as serial,
      private.normalize_code(r ->> 'barcode') as barcode
    from jsonb_array_elements(p_rows) as r
  ),
  input_keys as materialized (
    select row_number, serial as key from input_rows
    union all
    select row_number, barcode as key from input_rows
  ),
  key_dup_in_batch as materialized (
    select key from input_keys group by key having count(distinct row_number) > 1
  ),
  staged_keys as materialized (
    select row_number as staged_row, serial as key from public.serial_import_rows where import_id = p_import_id
    union all
    select row_number as staged_row, barcode as key from public.serial_import_rows where import_id = p_import_id
  ),
  existing_keys as materialized (
    select serial as key from public.serials
    union
    select barcode as key from public.serials
  ),
  row_flags as (
    select
      ik.row_number,
      bool_or(kdb.key is not null) as dup_in_batch,
      bool_or(sk.key is not null and sk.staged_row <> ik.row_number) as dup_staged,
      bool_or(ek.key is not null) as dup_existing
    from input_keys ik
    left join key_dup_in_batch kdb on kdb.key = ik.key
    left join staged_keys sk on sk.key = ik.key
    left join existing_keys ek on ek.key = ik.key
    group by ik.row_number
  ),
  classified as (
    select
      t.row_number, t.serial, t.barcode,
      case
        when t.serial is null or length(t.serial) = 0 or t.barcode is null or length(t.barcode) = 0
          then 'ERROR'
        when t.serial = t.barcode
          then 'ERROR'
        when rf.dup_in_batch or rf.dup_staged then 'DUPLICATE_IN_FILE'
        when rf.dup_existing then 'DUPLICATE_EXISTING'
        else 'VALID'
      end as status,
      case
        when t.serial is null or length(t.serial) = 0 then 'SERIAL_MISSING'
        when t.barcode is null or length(t.barcode) = 0 then 'BARCODE_MISSING'
        when t.serial = t.barcode then 'SERIAL_EQUALS_BARCODE'
      end as error_code
    from input_rows t
    join row_flags rf on rf.row_number = t.row_number
  ),
  upserted as (
    insert into public.serial_import_rows (import_id, row_number, serial, barcode, status, error_code)
    select p_import_id, c.row_number, c.serial, c.barcode, c.status,
      coalesce(
        c.error_code,
        case
          when c.status = 'DUPLICATE_IN_FILE' then 'DUPLICATE_IN_FILE'
          when c.status = 'DUPLICATE_EXISTING' then 'SERIAL_OR_BARCODE_EXISTS'
        end
      )
    from classified c
    on conflict (import_id, row_number) do update
      set serial = excluded.serial,
          barcode = excluded.barcode,
          status = excluded.status,
          error_code = excluded.error_code
    returning status
  )
  select
    count(*)::integer,
    count(*) filter (where status = 'VALID')::integer,
    count(*) filter (where status in ('DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING'))::integer,
    count(*) filter (where status = 'ERROR')::integer
  into staged, valid_count, duplicate_count, error_count
  from upserted;

  return next;
end;
$$;

revoke all on function public.stage_import_rows(uuid, jsonb) from public;
revoke all on function public.stage_import_rows(uuid, jsonb) from anon;
grant execute on function public.stage_import_rows(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- start_import_commit: transición atómica STAGING -> COMMITTING ("Confirmar
-- importación"). Si dos admins la invocan a la vez, el UPDATE condicionado
-- por WHERE status='STAGING' garantiza que solo uno gane (mismo patrón ya
-- documentado en docs/DATABASE.md). Además congela el conteo final de
-- staging una sola vez (no en cada commit_import_batch).
-- ---------------------------------------------------------------------------
create or replace function public.start_import_commit(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can commit imports' using errcode = '42501';
  end if;

  update public.serial_imports
  set status = 'COMMITTING'
  where id = p_import_id and status = 'STAGING'
  returning id into v_id;

  if v_id is null then
    raise exception 'import cannot be committed (not found or not in STAGING)';
  end if;

  update public.serial_imports si
  set total_rows = counts.total,
      valid_rows = counts.valid,
      duplicate_rows = counts.duplicate,
      error_rows = counts.error
  from (
    select
      count(*) as total,
      count(*) filter (where status = 'VALID') as valid,
      count(*) filter (where status in ('DUPLICATE_IN_FILE', 'DUPLICATE_EXISTING')) as duplicate,
      count(*) filter (where status = 'ERROR') as error
    from public.serial_import_rows
    where import_id = p_import_id
  ) counts
  where si.id = p_import_id;
end;
$$;

revoke all on function public.start_import_commit(uuid) from public;
revoke all on function public.start_import_commit(uuid) from anon;
grant execute on function public.start_import_commit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- commit_import_batch: procesa hasta p_batch_size filas VALID pendientes.
--
-- Garantías exigidas explícitamente (no negociables):
--   1. FOR UPDATE SKIP LOCKED al reclamar el lote: dos llamadas concurrentes
--      (dos admins, o un reintento en vuelo) nunca procesan la misma fila.
--   2. Toda fila reclamada termina en COMMITTED o CONFLICT — nunca queda en
--      VALID ni desaparece. Se reconcilia explícitamente contra el resultado
--      real de RETURNING, nunca se asume qué hizo ON CONFLICT.
--   3. Cada CONFLICT lleva un error_code que explica cuál columna colisionó.
--   4. Idempotente: una fila ya COMMITTED/CONFLICT no vuelve a reclamarse
--      (excluida por el filtro status='VALID'), así que reintentar la misma
--      llamada aporta cero cambios nuevos — seguro ante timeout/retry.
--   5. committed_rows se incrementa con el conteo de ESTA llamada, que es
--      seguro de sumar precisamente por la garantía 4 (un reintento puro
--      aporta 0).
-- ---------------------------------------------------------------------------
create or replace function public.commit_import_batch(p_import_id uuid, p_batch_size integer default 2000)
returns table(committed_count integer, conflicted_count integer, remaining_count integer, done boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_lot_id uuid;
  v_product_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can commit imports' using errcode = '42501';
  end if;
  if p_batch_size is null or p_batch_size <= 0 or p_batch_size > 5000 then
    raise exception 'invalid batch size (1-5000)';
  end if;

  select status, lot_id into v_status, v_lot_id from public.serial_imports where id = p_import_id;
  if v_status is null then
    raise exception 'import not found';
  end if;
  -- COMPLETED es un no-op idempotente, no un error: un cliente que reintenta
  -- tras un timeout no puede saber si la llamada anterior ya terminó el
  -- import, así que "ya está completo" debe ser una respuesta tranquila, no
  -- una excepción — de lo contrario un reintento normal rompería un flujo
  -- que en realidad ya tuvo éxito.
  if v_status = 'COMPLETED' then
    committed_count := 0;
    conflicted_count := 0;
    remaining_count := 0;
    done := true;
    return next;
    return;
  end if;
  -- FAILED es retomable: un fallo inesperado en una llamada anterior no deja
  -- el import varado, "reintentar" es simplemente volver a llamar esta RPC.
  if v_status not in ('COMMITTING', 'FAILED') then
    raise exception 'import is not in COMMITTING (current: %)', v_status;
  end if;
  update public.serial_imports set status = 'COMMITTING' where id = p_import_id and status = 'FAILED';

  select product_id into v_product_id from public.lots where id = v_lot_id;

  create temporary table if not exists pg_temp.claimed (id bigint, serial text, barcode text);
  truncate pg_temp.claimed;

  insert into pg_temp.claimed (id, serial, barcode)
  select id, serial, barcode
  from public.serial_import_rows
  where import_id = p_import_id and status = 'VALID'
  order by row_number
  limit p_batch_size
  for update skip locked;

  begin
    -- Paso 1: pre-chequeo por conjuntos contra serials existentes. 4 LEFT
    -- JOIN de igualdad simple (cada uno usa el índice único correspondiente,
    -- serials(serial)/serials(barcode)) en vez de un EXISTS correlacionado
    -- con OR entre columnas — ese patrón resultó ser O(n²) real en el
    -- benchmark de esta fase (con 50k+ serials existentes, un solo bloque de
    -- 2.000 filas nunca terminaba). Un LEFT JOIN por combinación deja que el
    -- planificador use el índice único como un lookup normal.
    with pre_check as (
      select
        c.id,
        case
          when es.id is not null then 'SERIAL_EXISTS'
          when eb.id is not null then 'SERIAL_MATCHES_EXISTING_BARCODE'
          when bb.id is not null then 'BARCODE_EXISTS'
          when bs.id is not null then 'BARCODE_MATCHES_EXISTING_SERIAL'
        end as reason
      from pg_temp.claimed c
      left join public.serials es on es.serial = c.serial
      left join public.serials eb on eb.barcode = c.serial
      left join public.serials bb on bb.barcode = c.barcode
      left join public.serials bs on bs.serial = c.barcode
    )
    update public.serial_import_rows sir
    set status = 'CONFLICT', error_code = pre_check.reason
    from pre_check
    where sir.id = pre_check.id and pre_check.reason is not null;

    -- Paso 2: intenta insertar lo que sobrevivió al pre-chequeo. ON CONFLICT
    -- DO NOTHING es solo una red de seguridad ante una carrera genuina entre
    -- el paso 1 y este INSERT (otra importación insertando el mismo serial
    -- al mismo tiempo) — su resultado nunca se asume, se reconcilia abajo
    -- contra RETURNING.
    with attempt as (
      select c.id, c.serial, c.barcode
      from pg_temp.claimed c
      where not exists (
        select 1 from public.serial_import_rows sir where sir.id = c.id and sir.status = 'CONFLICT'
      )
    ),
    inserted as (
      insert into public.serials (product_id, lot_id, serial, barcode, status, import_id)
      select v_product_id, v_lot_id, a.serial, a.barcode, 'AVAILABLE', p_import_id
      from attempt a
      on conflict do nothing
      returning serial, barcode
    )
    update public.serial_import_rows sir
    set status = 'COMMITTED'
    from attempt a
    where sir.id = a.id
      and exists (select 1 from inserted i where i.serial = a.serial and i.barcode = a.barcode);

    -- Paso 3: reconciliación. Cualquier fila reclamada que no haya quedado
    -- CONFLICT (paso 1) ni COMMITTED (paso 2) perdió una carrera genuina
    -- justo en el paso 2 — se marca CONFLICT con su razón exacta. Ninguna
    -- fila reclamada puede salir de este bloque sin un estado final.
    with lost_race as (
      select c.id, c.serial, c.barcode
      from pg_temp.claimed c
      where not exists (
        select 1 from public.serial_import_rows sir
        where sir.id = c.id and sir.status in ('CONFLICT', 'COMMITTED')
      )
    ),
    reconciled as (
      select
        lr.id,
        coalesce(
          case
            when es.id is not null then 'SERIAL_EXISTS'
            when eb.id is not null then 'SERIAL_MATCHES_EXISTING_BARCODE'
            when bb.id is not null then 'BARCODE_EXISTS'
            when bs.id is not null then 'BARCODE_MATCHES_EXISTING_SERIAL'
          end,
          'UNIQUE_VIOLATION'
        ) as reason
      from lost_race lr
      left join public.serials es on es.serial = lr.serial
      left join public.serials eb on eb.barcode = lr.serial
      left join public.serials bb on bb.barcode = lr.barcode
      left join public.serials bs on bs.serial = lr.barcode
    )
    update public.serial_import_rows sir
    set status = 'CONFLICT', error_code = reconciled.reason
    from reconciled
    where sir.id = reconciled.id;
  exception when others then
    update public.serial_imports set status = 'FAILED' where id = p_import_id;
    raise;
  end;

  select
    count(*) filter (where sir.status = 'COMMITTED'),
    count(*) filter (where sir.status = 'CONFLICT')
  into committed_count, conflicted_count
  from pg_temp.claimed c
  join public.serial_import_rows sir on sir.id = c.id;

  -- Seguro de sumar: un reintento de esta misma llamada reclamaría cero
  -- filas nuevas (ya no están en VALID), así que committed_count sería 0.
  update public.serial_imports
  set committed_rows = committed_rows + coalesce(committed_count, 0)
  where id = p_import_id;

  select count(*) into remaining_count
  from public.serial_import_rows
  where import_id = p_import_id and status = 'VALID';

  if remaining_count = 0 then
    update public.serial_imports set status = 'COMPLETED' where id = p_import_id;
    done := true;
  else
    done := false;
  end if;

  return next;
end;
$$;

revoke all on function public.commit_import_batch(uuid, integer) from public;
revoke all on function public.commit_import_batch(uuid, integer) from anon;
grant execute on function public.commit_import_batch(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- cancel_import: solo antes de confirmar (STAGING -> CANCELLED). No se
-- inserta ningún serial. Ver docs/DATABASE.md, "por qué cancelar solo antes
-- de confirmar".
-- ---------------------------------------------------------------------------
create or replace function public.cancel_import(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can cancel imports' using errcode = '42501';
  end if;

  update public.serial_imports
  set status = 'CANCELLED'
  where id = p_import_id and status = 'STAGING'
  returning id into v_id;

  if v_id is null then
    raise exception 'import cannot be cancelled (not found or not in STAGING)';
  end if;
end;
$$;

revoke all on function public.cancel_import(uuid) from public;
revoke all on function public.cancel_import(uuid) from anon;
grant execute on function public.cancel_import(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- purge_import_staging: borra el detalle (serial_import_rows) una vez que ya
-- no hace falta revisarlo fila por fila. Conserva serial_imports (conteos
-- finales) para historial/auditoría.
-- ---------------------------------------------------------------------------
create or replace function public.purge_import_staging(p_import_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can purge import staging' using errcode = '42501';
  end if;

  select status into v_status from public.serial_imports where id = p_import_id;
  if v_status is null then
    raise exception 'import not found';
  end if;
  if v_status not in ('COMPLETED', 'CANCELLED') then
    raise exception 'import must be COMPLETED or CANCELLED to purge staging (current: %)', v_status;
  end if;

  delete from public.serial_import_rows where import_id = p_import_id;
end;
$$;

revoke all on function public.purge_import_staging(uuid) from public;
revoke all on function public.purge_import_staging(uuid) from anon;
grant execute on function public.purge_import_staging(uuid) to authenticated;
