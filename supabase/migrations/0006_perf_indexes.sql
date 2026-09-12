-- 0006_perf_indexes.sql
--
-- Indexes for the dashboard's read path, found by reading every query in
-- src/caregiver/dashboard/queries.ts against the indexes declared in 0001.
--
-- ─── What was measured, and what was not ───
--
-- The analysis arithmetic was measured directly over the seeded volume (134
-- sessions, 6,300 attempts, 888 stroke points): computeSummary across every
-- session is 1.3 ms, a baseline is 0.01 ms, and replaying sixty nights of flag
-- evaluation for three patients across five domains is 1.8 ms. None of that is
-- a bottleneck and no amount of seeding will make it one.
--
-- The database side could not be measured here — there is no Supabase project
-- connected to this checkout, so there is no EXPLAIN output and none is claimed.
-- What follows is from reading the query shapes against the declared indexes,
-- which is enough to find a missing one but not enough to quote a millisecond
-- figure. Anyone with the project connected should run EXPLAIN (ANALYZE) on
-- fetchClockDrawings before and after this migration.

-- ─── 1. strokes, filtered by patient_id with no supporting index ───
--
-- fetchClockDrawings does:
--     select ... from strokes where patient_id = $1 order by stroke_index
--
-- 0001 declares exactly one index on strokes, on session_id. There is nothing
-- for patient_id, so this is a sequential scan of the whole table — across every
-- patient, not just this one.
--
-- That matters more here than anywhere else in the schema because strokes is by
-- far the widest table: each row carries a `points` jsonb array, and a single
-- clock drawing is fifteen strokes of up to forty-eight points. The seeded data
-- is 888 points across three drawings per patient; a patient drawing monthly for
-- two years is eight times that, and the scan reads every other patient's
-- drawings to find them.
create index if not exists strokes_patient_idx
  on public.strokes (patient_id, stroke_index);

-- ─── 2. attempts, narrowed by domain ───
--
-- v_daily_domain_score groups attempts by (patient_id, domain, day). 0001 has
-- attempts (patient_id, created_at), which serves the patient filter but leaves
-- the planner to sort or hash every one of that patient's attempts to group by
-- domain.
--
-- The dashboard asks for one domain's series at a time when a caregiver opens a
-- chart, and attempts is the highest-row-count table in the product — twelve per
-- game, four games a session, five sessions a week, indefinitely.
create index if not exists attempts_patient_domain_idx
  on public.attempts (patient_id, domain, created_at);

-- ─── 3. flags, already covered ───
--
-- fetchFlags orders by created_at desc and limits to 20, which
-- flags_patient_created_idx (patient_id, created_at desc) already serves
-- exactly. Recorded here so the next person reading this file does not add a
-- duplicate.

-- ─── A note on a query no index can fix ───
--
-- fetchClockDrawings selects every stroke a patient has ever produced, `points`
-- payload included, with no date bound. The index above stops it scanning other
-- patients, but the result set still grows without limit over the life of the
-- account. The dashboard only ever renders two drawings side by side, so this
-- wants a bound — the two most recent sessions that contain strokes — rather
-- than a bigger index. Left alone here because it is a change to the query
-- rather than to the schema, and this migration is the schema half.
