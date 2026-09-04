-- Clair Matin -> Clair Transversal, step 1: read-only task contract.
-- PostgreSQL 15+ is required. Fail instead of falling back to owner privileges.
create view public.clair_matin_tasks_v1
with (security_invoker = true, security_barrier = true)
as
select
  'clair-matin'::text as app_id,
  'tasks'::text as data_key,
  1::integer as schema_version,
  d.revision,
  d.updated_at,
  jsonb_build_object(
    'appId', 'clair-matin',
    'dataKey', 'tasks',
    'contractVersion', 1,
    'schemaVersion', 1,
    'capabilities', jsonb_build_array('taskList', 'taskSearch'),
    'tasks',
      case
        when jsonb_typeof(d.payload #> '{value,tasks}') = 'array' then
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', item.task -> 'id',
                  'title', item.task -> 'title',
                  'date', item.task -> 'date',
                  'time', item.task -> 'time',
                  'done', item.task -> 'done',
                  'category', item.task -> 'category'
                )
                order by item.ordinality
              )
              from jsonb_array_elements(d.payload #> '{value,tasks}')
                with ordinality as item(task, ordinality)
            ),
            '[]'::jsonb
          )
        else 'null'::jsonb
      end
  ) as payload
from public.clair_data as d
where d.app_id = 'clair-matin'
  and d.data_key = 'clair-matin.state'
  and d.schema_version = 1
  and d.deleted_at is null
  and (select auth.uid()) is not null
  and (select auth.uid()) = d.user_id
  and coalesce((select auth.jwt() ->> 'is_anonymous'), 'false') <> 'true'
-- OFFSET 0 preserves every snapshot and disables automatic view writes.
offset 0;

revoke all privileges on table public.clair_matin_tasks_v1
from public, anon, authenticated, service_role;

grant select on table public.clair_matin_tasks_v1 to authenticated;

comment on view public.clair_matin_tasks_v1 is
  'Clair Matin task contract v1 / schema v1: caller RLS, non-anonymous authenticated readers, read-only projection of clair-matin.state without duplication.';

-- Targeted rollback: DROP VIEW public.clair_matin_tasks_v1;
-- The source snapshot, policies and real tasks must remain unchanged.
