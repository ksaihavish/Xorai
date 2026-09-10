-- 0002_rls.sql — row level security, storage buckets, and the write bans.
--
-- Forward-only. RLS is enabled on every table BEFORE any data is written to it,
-- not after (rules.md 5).
--
-- Policy pattern is architecture.md 4.1 verbatim, with one change: auth.uid() is
-- wrapped as (select auth.uid()) so Postgres evaluates it once per query as an
-- InitPlan instead of once per row. Same semantics. At 60 days x 3 patients of
-- attempts rows the per-row form is the difference between a fast dashboard and
-- a slow one, and this is the table the whole product writes to.

-- ─── identity ────────────────────────────────────────────────

alter table public.caregivers enable row level security;

create policy "caregivers_self_all" on public.caregivers
  for all
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

alter table public.patients enable row level security;

create policy "patients_owner_all" on public.patients
  for all
  using      ( caregiver_id = (select auth.uid()) )
  with check ( caregiver_id = (select auth.uid()) );

-- ─── patient-scoped tables ───────────────────────────────────
--
-- One shape, applied to every table that carries patient_id. USING governs what
-- can be read, updated and deleted; WITH CHECK governs what can be written. Both
-- are required: USING alone would let a caregiver INSERT a row against someone
-- else's patient_id, which is precisely what tests/rls.test.ts asserts against.

alter table public.consents enable row level security;
create policy "consents_owner_all" on public.consents
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.family_members enable row level security;
create policy "family_members_owner_all" on public.family_members
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.music_tracks enable row level security;
create policy "music_tracks_owner_all" on public.music_tracks
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.sessions enable row level security;
create policy "sessions_owner_all" on public.sessions
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.attempts enable row level security;
create policy "attempts_owner_all" on public.attempts
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.strokes enable row level security;
create policy "strokes_owner_all" on public.strokes
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.rhythm_trials enable row level security;
create policy "rhythm_trials_owner_all" on public.rhythm_trials
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.care_events enable row level security;
create policy "care_events_owner_all" on public.care_events
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.reminders enable row level security;
create policy "reminders_owner_all" on public.reminders
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.reminder_logs enable row level security;
create policy "reminder_logs_owner_all" on public.reminder_logs
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.difficulty_state enable row level security;
create policy "difficulty_state_owner_all" on public.difficulty_state
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.retrieval_state enable row level security;
create policy "retrieval_state_owner_all" on public.retrieval_state
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.informant_checks enable row level security;
create policy "informant_checks_owner_all" on public.informant_checks
  for all
  using      ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) )
  with check ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

-- ─── consent is append-only, and RLS cannot say that ─────────
--
-- A policy is row-level; "you may set withdrawn_at but you may not rewrite
-- scopes" is column-level, so it is a grant, not a policy. Without this a client
-- can silently rewrite what it claims the family agreed to, and the audit trail
-- — which is the entire reason the table exists — becomes worthless.
--
-- DELETE is revoked for the same reason. Erasure still works: deleting the
-- patient cascades, and a cascade is not subject to the grantee's privileges.
-- That keeps "withdraw consent and delete all data" honest while making it
-- impossible to quietly drop one inconvenient consent row.

revoke update, delete on public.consents from authenticated;
grant  update (withdrawn_at) on public.consents to authenticated;

-- ─── global read-only content ────────────────────────────────

alter table public.media_assets enable row level security;

create policy "media_assets_read_all" on public.media_assets
  for select
  using ( true );

-- No insert/update/delete policy. The asset pack ships with the build.
revoke insert, update, delete on public.media_assets from authenticated, anon;

-- ─── derived tables: the client reads, and never writes ──────
--
-- SELECT policy only. There is deliberately no insert, update or delete policy
-- on these three, so every write is denied by default and only the service role
-- (which bypasses RLS) can produce them from an Edge Function.
--
-- A client that can write its own flags is a client that can write its own
-- conclusion about a person. The REVOKE below is belt-and-braces: it means a
-- future permissive policy added by mistake still cannot grant write access.

alter table public.session_summaries enable row level security;
create policy "session_summaries_owner_select" on public.session_summaries
  for select
  using ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.baselines enable row level security;
create policy "baselines_owner_select" on public.baselines
  for select
  using ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

alter table public.flags enable row level security;
create policy "flags_owner_select" on public.flags
  for select
  using ( patient_id in (select id from public.patients where caregiver_id = (select auth.uid())) );

-- Order matters. Supabase grants table-level privileges on public tables to
-- authenticated by default, so the blanket revoke has to come FIRST; a column
-- grant issued before it would be widened straight back by the table grant it
-- was meant to narrow.
revoke insert, update, delete
  on public.session_summaries, public.baselines, public.flags
  from authenticated, anon;

-- acknowledged_at is the one thing a caregiver changes on a flag: they dismiss
-- it. This single column keeps the dashboard usable without letting a client
-- author a flag or change its level.
grant update (acknowledged_at) on public.flags to authenticated;

-- ─── storage ─────────────────────────────────────────────────
--
-- All four buckets are private. Nothing is ever served from a public URL: a
-- family photograph behind a guessable URL is a data breach with extra steps.
-- Reads go through createSignedUrl, which is checked against these policies.
--
-- Path convention, enforced by the policies below: <patient_id>/<filename>.
-- The comparison is p.id::text rather than a cast of the path segment to uuid,
-- because a malformed path would make the cast raise instead of simply failing
-- to match.

insert into storage.buckets (id, name, public)
values
  ('patient-photos', 'patient-photos', false),
  ('family-photos',  'family-photos',  false),
  ('voice-notes',    'voice-notes',    false),
  ('music',          'music',          false)
on conflict (id) do nothing;

-- No ALTER TABLE here on purpose: storage.objects is owned by
-- supabase_storage_admin and already has RLS enabled. Trying to enable it again
-- raises "must be owner of table objects" and aborts the rest of this file.

create policy "patient_photos_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'patient-photos'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'patient-photos'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  );

create policy "family_photos_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'family-photos'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'family-photos'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  );

create policy "voice_notes_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'voice-notes'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'voice-notes'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  );

create policy "music_owner_all" on storage.objects
  for all
  using (
    bucket_id = 'music'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'music'
    and exists (
      select 1 from public.patients p
      where p.caregiver_id = (select auth.uid())
        and p.id::text = (storage.foldername(name))[1]
    )
  );
