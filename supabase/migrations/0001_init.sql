-- 0001_init.sql — Xorai schema.
--
-- Forward-only. Once this has been applied to any environment it is never
-- edited; a mistake becomes 0003_fix_whatever.sql (rules.md 5).
--
-- Source of truth: docs/architecture.md 4. Deviations from that section are
-- marked DEVIATION with the reason, and there are four of them.
--
-- Every patient-scoped table carries patient_id denormalised, even where it is
-- reachable through session_id, so the RLS policy in 0002 stays a single join.

-- ─── identity ────────────────────────────────────────────────

create table public.caregivers (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  phone         text,
  ui_language   text not null default 'en',
  created_at    timestamptz not null default now()
);

create table public.patients (
  id               uuid primary key default gen_random_uuid(),
  caregiver_id     uuid not null references public.caregivers(id) on delete cascade,
  display_name     text not null,
  birth_year       int,
  -- Education is a documented confounder in the digital clock-drawing
  -- literature, which is why every comparison in this product is within-person.
  education_level  text check (education_level in
                     ('none','primary','middle','secondary','higher')),
  -- DEVIATION: architecture.md 4 marks severity NOT NULL. Onboarding saves after
  -- every step and creates this row at step 1, but severity is collected at
  -- step 2 (buildbook amendment 5). A NOT NULL here makes a resumable flow
  -- impossible. The UI requires severity before onboarding can complete.
  severity         text check (severity in ('mild','moderate','severe')),
  language         text not null,          -- as, brx, mni, ne, hi, en, kha, lus
  photo_path       text,
  home_place       text,                   -- district/town. Orientation skips
                                           -- "where are you" without it.
  baseline_status  text not null default 'collecting'
                     check (baseline_status in ('collecting','established')),
  created_at       timestamptz not null default now()
);

create index patients_caregiver_idx on public.patients (caregiver_id);

-- ─── consent (DPDP) ──────────────────────────────────────────

create table public.consents (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients(id) on delete cascade,
  caregiver_id          uuid not null references public.caregivers(id),
  guardian_relationship text not null,
  attested              boolean not null default false,
  scopes                jsonb not null,   -- {gameplay:t, photos:t, audio:f, analytics:t}
  notice_version        text not null,
  notice_locale         text not null,
  granted_at            timestamptz not null default now(),
  withdrawn_at          timestamptz
);

-- Consent records are APPEND-ONLY. Withdrawal writes withdrawn_at; a new grant
-- inserts a new row. Never UPDATE scopes in place — the audit trail is the point,
-- and DPDP s.6 requires withdrawal to be as easy as granting.
create index consents_patient_granted_idx
  on public.consents (patient_id, granted_at desc);

-- ─── content owned by the family ─────────────────────────────

create table public.family_members (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  display_name      text not null,
  -- i18n key, e.g. 'kin.mother_brother'. Khasi is matrilineal, so the maternal
  -- uncle (kni) is structurally central; this is a real localisation, not a
  -- string swap, and the voice prompt speaks this term rather than "aunt".
  kinship_term_key  text,
  relationship_en   text,
  -- DEVIATION: architecture.md 4 marks photo_path NOT NULL. The consent screen
  -- offers photographs as a genuinely optional category, and declining it has to
  -- delete the photographs that were already added. NOT NULL would leave only
  -- two options at that moment: keep the photos anyway, or delete the family
  -- member. Both are wrong answers to a withdrawal of consent.
  photo_path        text,
  voice_note_path   text,
  phone             text,
  is_emergency      boolean not null default false,
  sort_order        int
);

create index family_members_patient_idx
  on public.family_members (patient_id, sort_order);

create table public.music_tracks (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients(id) on delete cascade,
  title       text not null,
  audio_path  text not null,
  source      text,
  created_at  timestamptz not null default now()
);

create index music_tracks_patient_idx on public.music_tracks (patient_id);

-- ─── content owned by us (global, not patient-scoped) ────────

create table public.media_assets (
  id             uuid primary key default gen_random_uuid(),
  category       text not null,
  item_name_key  text not null,
  image_path     text not null,
  alt_text_key   text not null,               -- design.md 10 requires alt text
  -- Required, always. "Where did the images come from" is a real question and
  -- these two columns answer it. No asset enters the repo without both.
  licence        text not null,
  source_url     text not null,
  region_tags    text[],                      -- {'assam','meghalaya',...}
  era            text check (era in ('vintage','contemporary'))
);

create index media_assets_category_idx on public.media_assets (category);

-- ─── session & telemetry (write-heavy, offline-originated) ───
--
-- No DEFAULT on any id below. These rows are created client-side while offline
-- and keep the identity they were born with (uuid v7). A server-side default
-- would mint a second identity for a row that already has one.

create table public.sessions (
  id                uuid primary key,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  started_at        timestamptz not null,   -- wall clock, session start ONLY.
                                            -- The one permitted Date.now().
  ended_at          timestamptz,
  completed         boolean not null default false,
  abandoned_at_game text,
  device_id         text not null,
  app_version       text not null,
  tz_offset_min     int not null,
  -- Measured once at session start; lets the analysis normalise across tablets.
  pointer_sample_interval_ms real
);

create index sessions_patient_started_idx
  on public.sessions (patient_id, started_at);

create table public.attempts (
  id                uuid primary key,
  -- The idempotency key for offline sync. Every write is
  -- upsert(..., { onConflict: 'client_event_id', ignoreDuplicates: true }).
  -- This UNIQUE is the entire idempotency story; do not add a second mechanism.
  client_event_id   uuid not null unique,
  session_id        uuid not null references public.sessions(id) on delete cascade,
  patient_id        uuid not null references public.patients(id) on delete cascade,
  game_type         text not null check (game_type in
                      ('aponjon','dhol_bator','xorai_milan','ghorir_chobi','orientation')),
  -- SINGULAR by decision: a game declares several domains, an attempt row carries
  -- its ONE primary telemetry domain, because baselines is keyed
  -- (patient, domain) and a secondary domain would never get a baseline.
  domain            text not null check (domain in
                      ('memory','attention','executive','perceptual_motor',
                       'language','orientation')),
  trial_index       int not null,
  difficulty_level  int not null,
  stimulus_id       text,
  -- ALL *_ms are monotonic offsets from one performance.now() captured at
  -- session start. Never wall clock. See architecture.md 6.
  presented_at_ms   double precision not null,
  first_touch_at_ms double precision,
  responded_at_ms   double precision,
  correct           boolean,
  error_type        text check (error_type in
                      ('none','omission','intrusion','perseveration',
                       'semantic_near','random')),
  hints_used        int not null default 0,
  -- aponjon only: the interval this face was tested at. Makes the longitudinal
  -- retrieval claim a real series rather than one current row.
  retrieval_interval_s int,
  hint_latency_ms   double precision,
  touch_x           real,   -- relative to target centre, px
  touch_y           real,
  target_radius_px  int,
  created_at        timestamptz not null default now()
);

-- derived: hesitation = first_touch_at_ms - presented_at_ms
--          latency    = responded_at_ms   - presented_at_ms

create index attempts_patient_created_idx on public.attempts (patient_id, created_at);
create index attempts_session_idx         on public.attempts (session_id);

create table public.strokes (                       -- ghorir_chobi only
  id                 uuid primary key,
  client_event_id    uuid not null unique,
  session_id         uuid not null references public.sessions(id) on delete cascade,
  patient_id         uuid not null references public.patients(id) on delete cascade,
  stroke_index       int not null,
  condition          text check (condition in ('command','copy','trace')),
  points             jsonb not null,   -- [{x,y,t}] t = ms from session start
  stroke_start_ms    double precision not null,
  stroke_end_ms      double precision not null,
  air_time_before_ms double precision not null
);

create index strokes_session_idx on public.strokes (session_id);

create table public.rhythm_trials (                 -- dhol_bator only
  id              uuid primary key,
  client_event_id uuid not null unique,
  session_id      uuid not null references public.sessions(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  trial_index     int not null,
  span            int not null,
  model_iois      jsonb not null,   -- inter-onset intervals presented, ms
  response_iois   jsonb not null,   -- inter-tap intervals produced, ms
  asynchronies    jsonb not null,   -- signed error per tap, ms, on the AUDIO clock
  completed       boolean not null
);

create index rhythm_trials_session_idx on public.rhythm_trials (session_id);

-- ─── derived (computed server-side; NEVER written by the client) ──
--
-- 0002 gives these three tables a SELECT policy and nothing else. Writes come
-- from Edge Functions holding the service role. A client that can write its own
-- flags is a client that can write its own conclusion about a person.

create table public.session_summaries (
  session_id             uuid primary key references public.sessions(id) on delete cascade,
  patient_id             uuid not null references public.patients(id) on delete cascade,
  mean_rt_ms             double precision,
  sd_rt_ms               double precision,
  cv_rt                  double precision,   -- sd/mean → the IIV measure.
                                             -- Computed PER game_type, then
                                             -- aggregated (buildbook amendment 7).
  accuracy_raw           double precision,
  accuracy_hint_adjusted double precision,
  hint_rate              double precision,
  domain_scores          jsonb,
  computed_at            timestamptz not null default now()
);

create index session_summaries_patient_idx on public.session_summaries (patient_id);

create table public.baselines (
  patient_id     uuid not null references public.patients(id) on delete cascade,
  domain         text not null check (domain in
                   ('memory','attention','executive','perceptual_motor',
                    'language','orientation')),
  baseline_mean  double precision,
  baseline_sd    double precision,
  n_sessions     int not null default 0,
  established_at timestamptz,
  primary key (patient_id, domain)
);

create table public.flags (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients(id) on delete cascade,
  domain            text not null check (domain in
                      ('memory','attention','executive','perceptual_motor',
                       'language','orientation')),
  level             text not null check (level in ('amber','red','effort')),
  z_value           double precision,
  window_start      date not null,
  window_end        date not null,
  created_at        timestamptz not null default now(),
  acknowledged_at   timestamptz,
  suppressed_reason text check (suppressed_reason in
                      ('insufficient_data','care_event','low_effort')),
  -- Load-bearing: nightly-rollup also runs on demand when the caregiver opens
  -- the dashboard, so without this three refreshes make three flags.
  unique (patient_id, domain, window_start, window_end)
);

create index flags_patient_created_idx on public.flags (patient_id, created_at desc);

-- caregiver-logged confounders → suppress flags
create table public.care_events (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  type       text not null check (type in
               ('illness','medication_change','hospital','travel','other')),
  note       text,
  started_on date not null,
  ended_on   date
);

create index care_events_patient_idx on public.care_events (patient_id, started_on);

-- ─── assistance layer ────────────────────────────────────────

create table public.reminders (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients(id) on delete cascade,
  kind         text not null check (kind in ('medication','meal','routine')),
  label        text not null,
  time_of_day  time not null,
  days_of_week int[],
  audio_path   text,
  active       boolean not null default true
);

create index reminders_patient_idx on public.reminders (patient_id, time_of_day);

create table public.reminder_logs (
  id              uuid primary key default gen_random_uuid(),
  reminder_id     uuid not null references public.reminders(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  due_at          timestamptz not null,
  acknowledged_at timestamptz
);

create index reminder_logs_patient_due_idx on public.reminder_logs (patient_id, due_at);

-- ─── adaptive state ──────────────────────────────────────────
--
-- These two are NOT telemetry. They are read-modify-write state with a
-- different conflict rule: last-write-wins on the SERVER updated_at below, and
-- a local row never overwrites a newer server row. Applying the telemetry
-- ignoreDuplicates rule here silently loses the newer value.

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  -- Server-side, deliberately. A client clock decides nothing here: the whole
  -- point of last-write-wins is that the server owns the timestamp.
  new.updated_at := now();
  return new;
end;
$fn$;

create table public.difficulty_state (
  patient_id uuid not null references public.patients(id) on delete cascade,
  game_type  text not null check (game_type in
               ('aponjon','dhol_bator','xorai_milan','ghorir_chobi','orientation')),
  level      int not null,
  "window"   jsonb not null,   -- quoted: WINDOW is a reserved word in SQL
  updated_at timestamptz not null default now(),
  primary key (patient_id, game_type)
);

create trigger difficulty_state_touch
  before update on public.difficulty_state
  for each row execute function public.set_updated_at();

create table public.retrieval_state (          -- spaced retrieval, per face
  patient_id          uuid not null references public.patients(id) on delete cascade,
  family_member_id    uuid not null references public.family_members(id) on delete cascade,
  current_interval_s  int not null,
  longest_interval_s  int not null default 0,
  consecutive_success int not null default 0,
  last_tested_at      timestamptz,
  -- DEVIATION: not listed in architecture.md 4, but 5.1 indexes this store on
  -- updated_at and amendment 3 makes it the last-write-wins key. Without it the
  -- conflict rule has nothing to compare.
  updated_at          timestamptz not null default now(),
  primary key (patient_id, family_member_id)
);

create trigger retrieval_state_touch
  before update on public.retrieval_state
  for each row execute function public.set_updated_at();

-- ─── informant instruments ───────────────────────────────────

create table public.informant_checks (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- Neither asserts a named instrument. mood_checkin is UNSCORED: two plain
  -- questions to the caregiver, output is "worth mentioning at the next visit".
  -- PHQ-2 is administered to the person, not to an informant about them, and
  -- prd.md 2 says we do not screen.
  instrument text not null check (instrument in ('informant_short','mood_checkin')),
  responses  jsonb,
  score      numeric,
  taken_at   timestamptz not null default now()
);

create index informant_checks_patient_idx on public.informant_checks (patient_id, taken_at);
