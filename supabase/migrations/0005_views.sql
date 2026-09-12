-- 0005_views.sql — read models for the caregiver dashboard.
--
-- Numbered 0005, not 0004: 0004_attempt_features.sql already exists. Migrations
-- are forward-only and numbers are never reused (rules.md 5).
--
-- Views rather than client-side aggregation, for one reason that matters: gaps.
-- A calendar built by grouping the sessions a patient actually played can only
-- ever show days they played. The missed days — the thing a caregiver most
-- needs to see — are absences in that data and would simply not render.
-- generate_series produces the days first and left-joins the sessions onto them,
-- so a gap is a row.

-- ─── compliance calendar ──────────────────────────────────────
--
-- Every day in the range, played or not. security_invoker so the caller's RLS
-- applies: without it a view owned by the definer would hand one caregiver
-- another caregiver's rows, silently bypassing 0002 entirely.

create or replace view public.v_session_calendar
with (security_invoker = true)
as
select
  p.id as patient_id,
  d.day::date as day,
  count(s.id) as sessions_played,
  count(s.id) filter (where s.completed) as sessions_completed,
  coalesce(bool_or(s.completed), false) as played
from public.patients p
cross join lateral generate_series(
  greatest(p.created_at::date, current_date - interval '180 days'),
  current_date,
  interval '1 day'
) as d(day)
left join public.sessions s
  on s.patient_id = p.id
 and s.started_at::date = d.day::date
group by p.id, d.day;

comment on view public.v_session_calendar is
  'One row per patient per day, including days with no session. Gaps are real rows, not absent ones.';

-- ─── daily domain score ───────────────────────────────────────
--
-- The series the EWMA runs over. One value per patient per domain per DAY:
-- architecture.md 8 applies the EWMA to the raw DAILY score, so the daily
-- aggregation has to happen before smoothing, not after.

create or replace view public.v_daily_domain_score
with (security_invoker = true)
as
select
  a.patient_id,
  a.domain,
  s.started_at::date as day,
  count(distinct s.id) as sessions,
  -- Accuracy over the day, omissions included as incorrect.
  avg(case when a.correct then 1.0 else 0.0 end) as accuracy,
  avg(case when a.correct and a.hints_used = 0 then 1.0 else 0.0 end) as accuracy_hint_adjusted,
  avg(case when a.hints_used > 0 then 1.0 else 0.0 end) as hint_rate,
  -- RT stats exclude omissions; an unanswered trial has no latency, and
  -- treating a missing response as a slow one invents data.
  avg(a.responded_at_ms - a.presented_at_ms)
    filter (where a.responded_at_ms is not null and a.correct is not null) as mean_rt_ms,
  stddev_samp(a.responded_at_ms - a.presented_at_ms)
    filter (where a.responded_at_ms is not null and a.correct is not null) as sd_rt_ms
from public.attempts a
join public.sessions s on s.id = a.session_id
group by a.patient_id, a.domain, s.started_at::date;

comment on view public.v_daily_domain_score is
  'Daily per-domain aggregate. The input series for the EWMA in nightly-rollup.';

-- ─── retrieval intervals, phrased for a human ─────────────────
--
-- "Holds Priya's name for 8 minutes, was 2 minutes in July." The view supplies
-- the two numbers and the name; the dashboard writes the sentence.

create or replace view public.v_retrieval_progress
with (security_invoker = true)
as
select
  r.patient_id,
  r.family_member_id,
  f.display_name,
  f.kinship_term_key,
  r.current_interval_s,
  r.longest_interval_s,
  r.consecutive_success,
  r.last_tested_at
from public.retrieval_state r
join public.family_members f on f.id = r.family_member_id;

comment on view public.v_retrieval_progress is
  'Sustained retrieval interval per face, joined to the person it belongs to.';

-- Views inherit RLS from their base tables under security_invoker, so no
-- separate policies are needed. Grants still are.
grant select on public.v_session_calendar to authenticated;
grant select on public.v_daily_domain_score to authenticated;
grant select on public.v_retrieval_progress to authenticated;
