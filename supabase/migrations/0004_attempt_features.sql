-- 0004_attempt_features.sql — derived per-attempt features.
--
-- Forward-only. A separate file from 0003 rather than an edit to 0001, because
-- 0001 has been committed and may have been applied (rules.md 5).
--
-- ─── Why a column at all, when this is derivable ───
--
-- Every feature stored here can be recomputed from the `strokes` rows: the
-- pauses ARE stroke_start_ms minus the previous stroke_end_ms. Storing them is
-- denormalisation, and it is justified twice over:
--
--  1. nightly-rollup would otherwise parse a jsonb array of several thousand
--     {x,y,t} points per drawing just to read eight numbers off it, on every
--     run, forever.
--  2. The caregiver dashboard renders offline from cached rows. Recomputation
--     needs the strokes, which are the largest thing in the schema and the
--     first thing pruned.
--
-- jsonb rather than eight columns because the set is game-specific and will
-- grow: Ghorir Chobi's features are not Xorai Milan's. A column per feature per
-- game is a migration every time a game learns something new about itself.
--
-- Nothing in here is a score. See the header of GhorirChobiGame.tsx — this
-- product does not score the clock, and a column named `score` must never
-- appear beside these.

alter table public.attempts
  add column if not exists features jsonb;

comment on column public.attempts.features is
  'Game-specific derived measures for this attempt. Latency features only; never a score or a shape judgement.';

-- Ghorir Chobi is the only writer today, and it writes one row per condition,
-- so this stays small. Indexed for the rollup, which reads it per patient.
create index if not exists attempts_features_present_idx
  on public.attempts (patient_id, created_at)
  where features is not null;
