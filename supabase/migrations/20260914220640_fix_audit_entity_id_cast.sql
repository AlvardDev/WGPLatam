-- Corrige un bug real encontrado al verificar la Fase 1 contra el proyecto
-- real (ver docs/PROGRESS.md, checkpoint de verificación): private.
-- audit_row_change() (creada en 20260914201420_audit_logs.sql) asumía que
-- la columna "id" de cualquier tabla auditada es uuid. app_settings y
-- notification_settings usan el patrón singleton "id boolean primary key
-- default true" (ver 20260914201402_app_settings.sql) — el cast
-- (... ->> 'id')::uuid fallaba con "invalid input syntax for type uuid:
-- true" en CUALQUIER UPDATE sobre esas dos tablas. En la práctica: el admin
-- no podía guardar Ajustes.
--
-- Corrección: si el id no es un uuid válido, se audita igual (entity_type
-- ya identifica la fila única en las tablas singleton) pero con
-- entity_id = NULL, en vez de que falle todo el UPDATE.
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_entity_id uuid;
begin
  select role into v_actor_role from public.profiles where id = v_actor;

  begin
    v_entity_id := case
      when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid
      else (to_jsonb(new) ->> 'id')::uuid
    end;
  exception
    when invalid_text_representation then
      v_entity_id := null;
  end;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (
    v_actor,
    v_actor_role,
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;
