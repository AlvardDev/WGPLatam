-- Fase 7 — Reclamos + reportes técnicos
--
-- Esquema ya especificado desde la Fase 0 (docs/DATABASE.md, "Tablas") —
-- warranty_claims (warranty_id/store_id/opened_by/reason/description/status/
-- responsible_party/decision/decision_justification/assigned_to/closed_at) y
-- technical_reports (claim_id/warranty_id/diagnosis/tests_performed/
-- observations/result/decision/justification/technician_id/reported_at).
-- Se implementa tal cual.
--
-- Máquina de estados de warranty_claims:
--   OPEN --assign_claim--> UNDER_REVIEW --decide_claim--> APPROVED|REJECTED --close_claim--> CLOSED
-- `status` (workflow) y `decision` (texto libre de la resolución, p.ej. "se
-- reemplaza el producto") son campos distintos, igual que
-- warranty_corrections separa `status` de `decision_note`.
--
-- `responsible_party` se congela al abrir el reclamo comparando `now()`
-- contra `warranties.activated_at + warranties.store_attention_days` (ya
-- congelado en la garantía al activar, Fase 5) — política comercial, no
-- se recalcula después (docs/PROJECT-PLAN.md, sección D).
--
-- Mínimo dato necesario (docs/ARCHITECTURE.md): el vendedor ve sus propios
-- reclamos completos (misma tienda), pero NUNCA los reportes técnicos —
-- diagnóstico/pruebas/observaciones son trabajo interno de soporte, no
-- información operativa de tienda.

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  warranty_id uuid not null references public.warranties (id) on delete restrict,
  store_id uuid not null references public.stores (id) on delete restrict,
  opened_by uuid not null references auth.users (id) on delete restrict,
  reason text not null,
  description text,
  status text not null default 'OPEN' check (status in ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CLOSED')),
  responsible_party text not null check (responsible_party in ('STORE', 'MANUFACTURER')),
  decision text,
  decision_justification text,
  assigned_to uuid references auth.users (id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint warranty_claims_reason_not_blank check (length(trim(reason)) > 0)
);

comment on table public.warranty_claims is
  'Reclamo abierto por un vendedor sobre una garantía de su tienda. Transiciones vía RPC (open_claim, assign_claim, decide_claim, close_claim); responsible_party se congela al abrir, no se recalcula.';

-- Como máximo un reclamo abierto (no decidido/cerrado) por garantía a la
-- vez: evita reclamos duplicados simultáneos sobre el mismo caso, mismo
-- criterio que warranty_corrections_pending_unique (Fase 6).
create unique index warranty_claims_open_unique
  on public.warranty_claims (warranty_id)
  where status in ('OPEN', 'UNDER_REVIEW');

create index warranty_claims_store_idx on public.warranty_claims (store_id, created_at desc);
create index warranty_claims_warranty_idx on public.warranty_claims (warranty_id);

create trigger audit_warranty_claims
  after insert or update or delete on public.warranty_claims
  for each row execute function private.audit_row_change();

alter table public.warranty_claims enable row level security;

revoke all on public.warranty_claims from authenticated;
grant select on public.warranty_claims to authenticated;

create policy warranty_claims_admin_select
  on public.warranty_claims for select
  to authenticated
  using ((select private.is_admin()));

create policy warranty_claims_seller_select
  on public.warranty_claims for select
  to authenticated
  using (store_id = (select private.current_store_id()));

create table public.technical_reports (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.warranty_claims (id) on delete restrict,
  warranty_id uuid not null references public.warranties (id) on delete restrict,
  diagnosis text not null,
  tests_performed text,
  observations text,
  result text not null,
  decision text not null,
  justification text,
  technician_id uuid not null references auth.users (id) on delete restrict,
  reported_at timestamptz not null default now(),
  constraint technical_reports_diagnosis_not_blank check (length(trim(diagnosis)) > 0),
  constraint technical_reports_result_not_blank check (length(trim(result)) > 0),
  constraint technical_reports_decision_not_blank check (length(trim(decision)) > 0)
);

comment on table public.technical_reports is
  'Diagnóstico técnico de soporte sobre un reclamo. 1 reclamo -> N reportes. Sin acceso directo para vendedor (docs/ARCHITECTURE.md, "Mínimo dato necesario") — solo el admin lee el contenido completo.';

create index technical_reports_claim_idx on public.technical_reports (claim_id, reported_at desc);

create trigger audit_technical_reports
  after insert or update or delete on public.technical_reports
  for each row execute function private.audit_row_change();

alter table public.technical_reports enable row level security;

revoke all on public.technical_reports from authenticated;
grant select on public.technical_reports to authenticated;

create policy technical_reports_admin_select
  on public.technical_reports for select
  to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------------------
-- open_claim: solo vendedor de la tienda dueña, garantía no anulada, motivo
-- obligatorio. responsible_party se calcula aquí y queda congelado.
-- ---------------------------------------------------------------------------
create or replace function public.open_claim(
  p_warranty_id uuid,
  p_reason text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id uuid := (select private.current_store_id());
  v_warranty public.warranties%rowtype;
  v_reason text := trim(p_reason);
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_responsible_party text;
  v_claim_id uuid;
begin
  if v_store_id is null then
    raise exception 'only an active seller can open claims' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) = 0 then
    raise exception 'reason is required';
  end if;

  select * into v_warranty from public.warranties where id = p_warranty_id;
  if v_warranty.id is null then
    raise exception 'warranty not found';
  end if;
  if v_warranty.store_id <> v_store_id then
    raise exception 'warranty belongs to another store' using errcode = '42501';
  end if;
  if v_warranty.voided_at is not null then
    raise exception 'warranty is voided';
  end if;

  v_responsible_party := case
    when now() <= v_warranty.activated_at + (v_warranty.store_attention_days || ' days')::interval then 'STORE'
    else 'MANUFACTURER'
  end;

  insert into public.warranty_claims (warranty_id, store_id, opened_by, reason, description, responsible_party)
  values (p_warranty_id, v_store_id, auth.uid(), v_reason, v_description, v_responsible_party)
  returning id into v_claim_id;

  return v_claim_id;
exception
  when unique_violation then
    raise exception 'a claim is already open for this warranty';
end;
$$;

comment on function public.open_claim(uuid, text, text) is
  'Abre un reclamo OPEN sobre una garantía de la tienda del vendedor. responsible_party = STORE si todavía está dentro de store_attention_days desde la activación, si no MANUFACTURER (congelado, no se recalcula).';

revoke all on function public.open_claim(uuid, text, text) from public;
revoke all on function public.open_claim(uuid, text, text) from anon;
grant execute on function public.open_claim(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- assign_claim: solo admin, OPEN -> UNDER_REVIEW, se autoasigna (único rol
-- que puede tramitar reclamos en el MVP, ver docs/ARCHITECTURE.md).
-- ---------------------------------------------------------------------------
create or replace function public.assign_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can assign claims' using errcode = '42501';
  end if;

  select * into v_claim from public.warranty_claims where id = p_claim_id for update;
  if v_claim.id is null then
    raise exception 'claim not found';
  end if;
  if v_claim.status <> 'OPEN' then
    raise exception 'claim is not open';
  end if;

  update public.warranty_claims
  set status = 'UNDER_REVIEW', assigned_to = auth.uid()
  where id = p_claim_id;
end;
$$;

revoke all on function public.assign_claim(uuid) from public;
revoke all on function public.assign_claim(uuid) from anon;
grant execute on function public.assign_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- decide_claim: solo admin, UNDER_REVIEW -> APPROVED|REJECTED. decision es
-- la resolución (p.ej. "reemplazo"), decision_justification el porqué.
-- ---------------------------------------------------------------------------
create or replace function public.decide_claim(
  p_claim_id uuid,
  p_status text,
  p_decision text,
  p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
  v_decision text := trim(p_decision);
  v_justification text := trim(p_justification);
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can decide claims' using errcode = '42501';
  end if;
  if p_status not in ('APPROVED', 'REJECTED') then
    raise exception 'invalid decision status: %', p_status;
  end if;
  if v_decision is null or length(v_decision) = 0 then
    raise exception 'decision is required';
  end if;
  if v_justification is null or length(v_justification) = 0 then
    raise exception 'justification is required';
  end if;

  select * into v_claim from public.warranty_claims where id = p_claim_id for update;
  if v_claim.id is null then
    raise exception 'claim not found';
  end if;
  if v_claim.status <> 'UNDER_REVIEW' then
    raise exception 'claim is not under review';
  end if;

  update public.warranty_claims
  set status = p_status, decision = v_decision, decision_justification = v_justification
  where id = p_claim_id;
end;
$$;

revoke all on function public.decide_claim(uuid, text, text, text) from public;
revoke all on function public.decide_claim(uuid, text, text, text) from anon;
grant execute on function public.decide_claim(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- close_claim: solo admin, APPROVED|REJECTED -> CLOSED.
-- ---------------------------------------------------------------------------
create or replace function public.close_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can close claims' using errcode = '42501';
  end if;

  select * into v_claim from public.warranty_claims where id = p_claim_id for update;
  if v_claim.id is null then
    raise exception 'claim not found';
  end if;
  if v_claim.status not in ('APPROVED', 'REJECTED') then
    raise exception 'claim must be decided before closing';
  end if;

  update public.warranty_claims
  set status = 'CLOSED', closed_at = now()
  where id = p_claim_id;
end;
$$;

revoke all on function public.close_claim(uuid) from public;
revoke all on function public.close_claim(uuid) from anon;
grant execute on function public.close_claim(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- create_technical_report: solo admin, mientras el reclamo siga OPEN o
-- UNDER_REVIEW (no se documentan diagnósticos nuevos sobre un caso ya
-- decidido/cerrado). technician_id = auth.uid() (único rol que hoy puede
-- diagnosticar, igual criterio que assign_claim).
-- ---------------------------------------------------------------------------
create or replace function public.create_technical_report(
  p_claim_id uuid,
  p_diagnosis text,
  p_result text,
  p_decision text,
  p_tests_performed text default null,
  p_observations text default null,
  p_justification text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim public.warranty_claims%rowtype;
  v_diagnosis text := trim(p_diagnosis);
  v_result text := trim(p_result);
  v_decision text := trim(p_decision);
  v_report_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'only admin can create technical reports' using errcode = '42501';
  end if;
  if v_diagnosis is null or length(v_diagnosis) = 0 then
    raise exception 'diagnosis is required';
  end if;
  if v_result is null or length(v_result) = 0 then
    raise exception 'result is required';
  end if;
  if v_decision is null or length(v_decision) = 0 then
    raise exception 'decision is required';
  end if;

  select * into v_claim from public.warranty_claims where id = p_claim_id;
  if v_claim.id is null then
    raise exception 'claim not found';
  end if;
  if v_claim.status not in ('OPEN', 'UNDER_REVIEW') then
    raise exception 'claim is already decided';
  end if;

  insert into public.technical_reports (
    claim_id, warranty_id, diagnosis, tests_performed, observations, result, decision, justification, technician_id
  )
  values (
    p_claim_id, v_claim.warranty_id, v_diagnosis, nullif(trim(coalesce(p_tests_performed, '')), ''),
    nullif(trim(coalesce(p_observations, '')), ''), v_result, v_decision,
    nullif(trim(coalesce(p_justification, '')), ''), auth.uid()
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

revoke all on function public.create_technical_report(uuid, text, text, text, text, text, text) from public;
revoke all on function public.create_technical_report(uuid, text, text, text, text, text, text) from anon;
grant execute on function public.create_technical_report(uuid, text, text, text, text, text, text) to authenticated;
