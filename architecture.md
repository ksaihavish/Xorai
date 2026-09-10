# Architecture — Xorai

---

## 1. Tech stack

| Layer | Choice | Version | Why this and not the obvious alternative |
|---|---|---|---|
| Build | **Vite** | 6.x | Next.js was rejected: Server Components + a service worker means caching RSC flight payloads, and offline-first breaks in ways that are miserable to debug. This is a single-user installed tablet app — zero use for SSR, SEO, or streaming. |
| UI | **React** | 19 | — |
| Language | **TypeScript** | 5.x, `strict: true` | Non-negotiable. The telemetry schema is the product; untyped events will silently rot. |
| Styling | **Tailwind CSS** | **3.4 — NOT 4.x** | v4 moved config into CSS and coding agents get it wrong constantly. v3.4 has vastly more training data. Do not upgrade. |
| Components | **shadcn/ui** | latest CLI | Copy-in primitives, fully re-tokenized by `design.md`. We own the code, so we can enforce 16 mm targets. |
| Server state | **TanStack Query** | v5 | Cache, retry, and offline-aware refetch for caregiver views. |
| Client state | **Zustand** | v5 | Session runner state only. No Redux. |
| Local DB | **Dexie** | v4 | IndexedDB wrapper. Holds the outbox and the cached asset manifest. |
| PWA | **vite-plugin-pwa** | latest | Chosen over Serwist purely for documentation density — fewer agent errors. `injectManifest` strategy so we own the service worker. |
| Backend | **Supabase** | — | Postgres + RLS + Auth + Storage + Edge Functions in one vendor. See §1.1. |
| Charts | **Recharts** | v2 | — |
| i18n | **react-i18next** | latest | — |
| Audio | **Web Audio API**, raw | — | No Tone.js. Rhythm timing is a *measurement*, and we need direct `AudioContext.currentTime` scheduling. A library between us and the clock is a liability. |
| Dates | **date-fns** | v4 | No moment. No dayjs. |
| IDs | **uuid** v7 | — | Time-ordered, so the outbox flushes in causal order. |
| Deploy | **Vercel** (static) + Supabase (managed) | — | — |

### 1.1 Why Supabase, stated so it survives a judge

- **RLS is the isolation story.** "How is one family's data isolated from another's?" is answered by four lines of Postgres policy that can be read aloud. Any hand-rolled middleware answer is unverifiable.
- **Window functions are the analysis half of the product.** Rolling z-scores, 14-day sustained deviation, EWMA, and `generate_series` for gap-filling the compliance calendar are one SQL view each.
- **One processor, one region.** The DPDP slide says "data stored in-country, one sub-processor." Set the project region to **Mumbai (ap-south-1)** at creation — this cannot be changed later.

### 1.2 Explicitly rejected

Next.js · Hono · Drizzle · Turso/SQLite · Clerk · Cloudflare R2 · Firebase/Firestore (relational time-series queries are the core workload and Firestore is bad at them) · Prisma · Redux · Tone.js · Framer Motion in patient mode · any runtime translation API call.

---

## 2. System flow

```
                    ┌───────────────────────────────────────────┐
                    │        TABLET (PWA, installed)            │
                    │                                           │
   caregiver ──────▶│  Caregiver mode        Patient mode       │
   signs in         │  ├ onboarding          ├ orientation      │
                    │  ├ dashboard           ├ music cue        │
                    │  ├ reminders setup     ├ 2 of 4 games     │
                    │  └ consent             └ close + reminders│
                    │                              │            │
                    │                        telemetry SDK      │
                    │                              │            │
                    │                     ┌────────▼────────┐   │
                    │                     │ Dexie outbox    │   │
                    │                     │ (IndexedDB)     │   │
                    │                     └────────┬────────┘   │
                    │  service worker              │            │
                    │  ├ app shell                 │ on         │
                    │  ├ i18n JSON                 │ reconnect  │
                    │  ├ pre-generated audio       │            │
                    │  └ cultural asset pack       │            │
                    └──────────────────────────────┼────────────┘
                                                   │
                                       upsert on client_event_id
                                                   │
                    ┌──────────────────────────────▼────────────┐
                    │      SUPABASE (ap-south-1, Mumbai)        │
                    │                                           │
                    │  Auth ──▶ caregivers                      │
                    │  Postgres + RLS                           │
                    │    raw:     sessions, attempts, strokes,  │
                    │             rhythm_trials                 │
                    │    derived: session_summaries, baselines, │
                    │             flags                         │
                    │  Storage:   photos, music, asset pack     │
                    │  Edge Fn:   nightly-rollup, export-pdf    │
                    └───────────────────────────────────────────┘

BUILD TIME (never at runtime):
  i18n/*.json ──▶ Bhashini TTS ──▶ public/audio/{lang}/*.mp3 ──▶ precached by SW
```

**The rule this diagram encodes:** nothing the patient touches requires a network round trip. Ever. The only runtime network calls are the outbox flush and caregiver dashboard reads, and both are allowed to fail.

---

## 3. Auth model

Three distinct things, deliberately not conflated:

| Actor | Mechanism |
|---|---|
| **Caregiver** | Supabase Auth, email + password. Phone OTP exists behind `VITE_ENABLE_PHONE_OTP` (default `false`) because it needs a paid SMS provider; the pitch says "phone OTP is the production path, email is the demo path" and that is honest. |
| **Patient** | **No authentication.** After caregiver sign-in the device is bound. Entering patient mode = tapping a large photo of the patient. |
| **Exiting patient mode** | A **press-and-hold for 3 seconds** in a fixed corner. **No PIN in v1** — nothing collects one at onboarding and `caregivers` has no `pin_hash`; a 3-second hold on an unmarked corner is not discoverable by a patient who taps everything. If a PIN is added later it needs a schema column and an onboarding step. Not a tap (patients tap everything), not a gesture (gestures are banned in patient mode — this control is deliberately outside the patient UI contract and is the single exception). |

Patient mode also sets `screen.orientation.lock('landscape')` where supported, keeps a wake lock, and disables text selection, context menu, and pull-to-refresh.

---

## 4. Data model

All tables live in `public`. Every patient-scoped table carries `patient_id` **denormalised** (even where it is reachable via `session_id`) so RLS policies stay single-join and cheap.

```sql
-- ─── identity ────────────────────────────────────────────────
caregivers (
  id            uuid PK REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text NOT NULL,
  phone         text,
  ui_language   text NOT NULL DEFAULT 'en',
  created_at    timestamptz NOT NULL DEFAULT now()
)

patients (
  id               uuid PK DEFAULT gen_random_uuid(),
  caregiver_id     uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  display_name     text NOT NULL,
  birth_year       int,
  education_level  text CHECK (education_level IN
                     ('none','primary','middle','secondary','higher')),  -- confounder
  severity         text NOT NULL CHECK (severity IN ('mild','moderate','severe')),
  language         text NOT NULL,          -- as, brx, mni, ne, hi, en, kha, lus
  photo_path       text,
  home_place       text,                    -- district/town. Orientation skips
                                            -- "where are you" without it.
  baseline_status  text NOT NULL DEFAULT 'collecting'
                     CHECK (baseline_status IN ('collecting','established')),
  created_at       timestamptz NOT NULL DEFAULT now()
)

-- ─── consent (DPDP) ──────────────────────────────────────────
consents (
  id                    uuid PK DEFAULT gen_random_uuid(),
  patient_id            uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  caregiver_id          uuid NOT NULL REFERENCES caregivers(id),
  guardian_relationship text NOT NULL,
  attested              boolean NOT NULL DEFAULT false,
  scopes                jsonb NOT NULL,      -- {gameplay:t, photos:t, audio:f, analytics:t}
  notice_version        text NOT NULL,
  notice_locale         text NOT NULL,
  granted_at            timestamptz NOT NULL DEFAULT now(),
  withdrawn_at          timestamptz
)
-- Consent records are APPEND-ONLY. Withdrawal writes withdrawn_at; a new grant
-- inserts a new row. Never UPDATE scopes in place — the audit trail is the point.

-- ─── content owned by the family ─────────────────────────────
family_members (
  id, patient_id, display_name,
  kinship_term_key  text,     -- i18n key, e.g. 'kin.mother_brother' (Khasi: kni)
  relationship_en   text,
  photo_path        text NOT NULL,
  voice_note_path   text,
  phone             text,
  is_emergency      boolean NOT NULL DEFAULT false,
  sort_order        int
)

music_tracks (id, patient_id, title, audio_path, source, created_at)

-- ─── content owned by us (global, not patient-scoped) ────────
media_assets (
  id, category, item_name_key, image_path,
  alt_text_key text NOT NULL,                        -- design.md 10 requires alt text
  licence text NOT NULL, source_url text NOT NULL,   -- required, always
  region_tags text[],       -- {'assam','meghalaya',...}
  era text                  -- 'vintage' | 'contemporary'
)

-- ─── session & telemetry (write-heavy, offline-originated) ───
sessions (
  id                uuid PK,          -- generated CLIENT-side (uuid v7)
  patient_id        uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL,   -- wall clock, session start only
  ended_at          timestamptz,
  completed         boolean NOT NULL DEFAULT false,
  abandoned_at_game text,
  device_id         text NOT NULL,
  app_version       text NOT NULL,
  tz_offset_min     int NOT NULL,
  pointer_sample_interval_ms real          -- measured once at session start;
                                           -- normalises analysis across tablets
)

attempts (
  id                uuid PK,
  client_event_id   uuid NOT NULL UNIQUE,   -- ← idempotency key for offline sync
  session_id        uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL,
  game_type         text NOT NULL CHECK (game_type IN
                      ('aponjon','dhol_bator','xorai_milan','ghorir_chobi','orientation')),
  domain            text NOT NULL CHECK (domain IN
                      ('memory','attention','executive','perceptual_motor',
                       'language','orientation')),
  -- domain is SINGULAR by decision: a Game declares several domains, the
  -- attempt row carries its ONE primary telemetry domain. baselines is keyed
  -- (patient, domain), so a secondary domain would never get a baseline.
  trial_index       int NOT NULL,
  difficulty_level  int NOT NULL,
  stimulus_id       text,
  presented_at_ms   double precision NOT NULL,  -- ALL *_ms are monotonic offsets
  first_touch_at_ms double precision,           -- from session start. See §6.
  responded_at_ms   double precision,
  correct           boolean,
  error_type        text CHECK (error_type IN
                      ('none','omission','intrusion','perseveration',
                       'semantic_near','random')),
  hints_used        int NOT NULL DEFAULT 0,
  retrieval_interval_s int,        -- aponjon only: the interval this face was tested
                                   -- at. Makes the longitudinal retrieval claim a
                                   -- real series rather than one current row.
  hint_latency_ms   double precision,
  touch_x           real,   -- relative to target centre, px
  touch_y           real,
  target_radius_px  int,
  created_at        timestamptz NOT NULL DEFAULT now()
)
-- derived: hesitation = first_touch_at_ms - presented_at_ms
--          latency    = responded_at_ms   - presented_at_ms

strokes (                                  -- ghorir_chobi only
  id, client_event_id uuid UNIQUE, session_id, patient_id,
  stroke_index      int NOT NULL,
  condition         text CHECK (condition IN ('command','copy','trace')),
  points            jsonb NOT NULL,        -- [{x,y,t}] t = ms from session start
  stroke_start_ms   double precision NOT NULL,
  stroke_end_ms     double precision NOT NULL,
  air_time_before_ms double precision NOT NULL
)

rhythm_trials (                            -- dhol_bator only
  id, client_event_id uuid UNIQUE, session_id, patient_id,
  trial_index int, span int,
  model_iois     jsonb NOT NULL,   -- inter-onset intervals presented, ms
  response_iois  jsonb NOT NULL,   -- inter-tap intervals produced, ms
  asynchronies   jsonb NOT NULL,   -- signed error per tap, ms
  completed boolean NOT NULL
)

-- ─── derived (computed server-side; NEVER written by the client) ──
session_summaries (
  session_id PK, patient_id,
  mean_rt_ms, sd_rt_ms, cv_rt,          -- cv_rt = sd/mean → the IIV measure
  accuracy_raw, accuracy_hint_adjusted, hint_rate,
  domain_scores jsonb, computed_at
)

baselines (
  patient_id, domain PK(patient_id,domain),
  baseline_mean, baseline_sd, n_sessions, established_at
)

flags (
  id, patient_id, domain,
  level text CHECK (level IN ('amber','red','effort')),
  z_value, window_start, window_end,
  created_at, acknowledged_at,
  suppressed_reason text,    -- 'insufficient_data' | 'care_event' | 'low_effort'
  unique (patient_id, domain, window_start, window_end)
)
-- The unique key is load-bearing: nightly-rollup also runs on demand when the
-- caregiver opens the dashboard, so without it three refreshes make three flags.

care_events (                 -- caregiver-logged confounders → suppress flags
  id, patient_id,
  type text CHECK (type IN ('illness','medication_change','hospital','travel','other')),
  note, started_on date, ended_on date
)

-- ─── assistance layer ────────────────────────────────────────
reminders (
  id, patient_id,
  kind text CHECK (kind IN ('medication','meal','routine')),
  label, time_of_day time, days_of_week int[], audio_path, active boolean
)
reminder_logs (id, reminder_id, patient_id, due_at, acknowledged_at)

-- ─── adaptive state ──────────────────────────────────────────
difficulty_state (
  patient_id, game_type PK(patient_id,game_type),
  level int NOT NULL, window jsonb NOT NULL, updated_at
)
retrieval_state (             -- spaced retrieval, per face
  patient_id, family_member_id PK(patient_id,family_member_id),
  current_interval_s int, longest_interval_s int,
  consecutive_success int, last_tested_at
)

-- ─── informant instruments ───────────────────────────────────
informant_checks (
  id, patient_id,
  instrument text CHECK (instrument IN ('informant_short','mood_checkin')),
  -- Neither asserts a named instrument. mood_checkin is UNSCORED: two plain
  -- questions to the caregiver, output is 'worth mentioning at the next visit'.
  -- PHQ-2 is administered to the person, not to an informant about them, and
  -- prd.md section 2 says we do not screen.
  responses jsonb, score numeric, taken_at
)
```

### 4.1 RLS — the pattern, applied to every patient-scoped table

```sql
alter table <t> enable row level security;

create policy "<t>_owner_all" on <t>
  for all
  using      ( patient_id in (select id from patients where caregiver_id = auth.uid()) )
  with check ( patient_id in (select id from patients where caregiver_id = auth.uid()) );
```

`patients` itself uses `caregiver_id = auth.uid()`. `caregivers` uses `id = auth.uid()`.
`media_assets` is the only readable-by-all table: `for select using (true)`.

Derived tables (`session_summaries`, `baselines`, `flags`) get **select-only** policies for the caregiver; writes come from Edge Functions using the service role. A client that can write its own flags is a client that can write its own diagnosis.

**Verification step, never skipped:** create two caregivers, two patients, and assert from caregiver A's session that `select * from attempts` returns zero of B's rows. This test lives in the repo.

---

## 5. Offline architecture

### 5.1 Dexie schema

```ts
db.version(1).stores({
  outbox_sessions:  'id, flushed_at',
  outbox_attempts:  'client_event_id, session_id, flushed_at',
  outbox_strokes:   'client_event_id, session_id, flushed_at',
  outbox_rhythm:    'client_event_id, session_id, flushed_at',
  local_profile:    'patient_id',        // cached patient + family + reminders
  asset_manifest:   'id',
  sync_meta:        'key',               // last_synced_at, device_id

  // --- STATE, not telemetry. Different conflict rule. See 5.2. ---
  difficulty_state: '[patient_id+game_type], updated_at',
  retrieval_state:  '[patient_id+family_member_id], updated_at',
  cached_summaries: 'session_id, patient_id'   // so the dashboard renders offline
})
```

### 5.2 Sync engine contract

- Every event is written to Dexie **first**, synchronously with the interaction. The network is never in the interaction path.
- Flush triggers: `online` event, app foreground, session end, and a 60-second timer while online.
- Flush order is strictly `sessions → attempts → strokes → rhythm → reminder_logs → care_events → informant_checks → difficulty_state → retrieval_state`. FK dependencies first, state last.
- **Two kinds of row, two conflict rules.** Telemetry is append-only: `upsert` on `client_event_id` with `ignoreDuplicates` is the complete story. `difficulty_state` and `retrieval_state` are read-modify-write: last-write-wins on a server-side `updated_at`, and a local row **never** overwrites a newer server row. Reusing the idempotency mechanism here silently clobbers.
- Writes use `upsert(rows, { onConflict: 'client_event_id', ignoreDuplicates: true })`. **This is the entire idempotency story** — a partially-flushed batch retried is a no-op for the rows that landed.
- Batch size 200. On any error: leave `flushed_at` null, exponential backoff, retry. Never delete an unflushed row.
- Rows are deleted from Dexie only after the server confirms, and only if older than 7 days — recent rows are kept so the caregiver dashboard works offline.
- `sync_meta.last_synced_at` drives the visible "last synced 2 days ago" indicator.

### 5.3 Service worker (`injectManifest`)

Precache: app shell, all `i18n/*.json`, **all pre-generated audio**, the fonts, and the base cultural asset pack.
Runtime cache: Supabase Storage images → cache-first with 30-day expiry (family photos must survive offline).
Never cache: Supabase REST/auth endpoints.

Asset pack budget: **≤ 120 KB per image** (square WebP at 512 px is comfortably under 100 KB), ~150 images → about 15 MB. Precache audio for the **selected language only**; runtime-cache the rest. 200 KB × 150 was already 30 MB before audio, fonts and the shell, and precaching seven languages of audio is several times that. Add a build-time assertion that fails above 25 MB — a precache over device quota fails silently and is a demo-killer.

---

## 6. Timing — read this twice, it is the most bug-prone part of the system

The product's headline claim is reaction-time *variability*. If the clock is wrong, the claim is wrong.

| Rule | Reason |
|---|---|
| **Never `Date.now()` for any `*_ms` field.** Use `performance.now()`. | `Date.now()` is wall-clock and gets NTP-corrected mid-session. A single correction poisons the variability metric. |
| All `*_ms` values are **offsets from `sessionStartPerfNow`**, a single `performance.now()` captured at session start. | Gives one monotonic timeline per session. `sessions.started_at` is the only wall-clock value stored. |
| Capture `first_touch_at_ms` in **`pointerdown`**, never `click`. | `click` fires after a delay and after the browser resolves gestures. |
| Use **`{ passive: false }`** pointer listeners and `touch-action: none` on game surfaces. | Prevents scroll/zoom from stealing or delaying the event. |
| For rhythm audio, schedule with **`AudioContext.currentTime + lookahead`**, and record tap times as `audioCtx.currentTime`. | The audio clock and the DOM clock drift. Comparing a tap on one clock to a beat on the other produces garbage asynchrony. Both must be on the audio clock. |
| Stroke sampling, in this exact ladder: **`pointerrawupdate` alone** where available (Chromium, secure context) — it is already the un-coalesced stream; **otherwise `pointermove` with `getCoalescedEvents()`**. De-duplicate by timestamp. | Browsers batch pointer events to the frame rate. But `getCoalescedEvents()` on a `pointerrawupdate` event returns only that event, so doing both can yield *fewer* points than plain `pointermove` + coalesced — and the failure is silent, because the trace still looks fine. |
| Record the device's actual sample interval once at session start and store it on `sessions.pointer_sample_interval_ms`. | Lets the analysis normalise across tablets. |
| **Capture one audio↔performance anchor at session start** and convert with it. | Dhol Bator needs both clocks: asynchronies live on the audio clock, but its `attempts` rows need `first_touch_at_ms` on the `performance.now()` timeline. Capture `{perfOrigin, audioOrigin}` once (ideally via `audioCtx.getOutputTimestamp()`), expose `clock.fromAudio(t)` on `SessionClock`, and let **no game do this arithmetic itself**. Without it, either the attempt rows or the asynchronies are wrong — and both look plausible. |

---

## 7. Games — implementation specs

Every game implements one interface, so the session runner never special-cases:

```ts
interface Game {
  id: GameType
  domains: Domain[]
  minSeverity: Severity              // gate — some games hide at 'severe'
  mount(ctx: GameContext): void
  unmount(): void
}
interface GameContext {
  patient: LocalPatient
  level: number                      // from difficulty_state
  emit: (e: AttemptEvent) => void    // writes to Dexie synchronously
  speak: (key: string) => Promise<void>   // plays pre-generated audio
  onComplete: (summary: GameSummary) => void
  clock: SessionClock                // { now(): ms offset }
}
```

### 7.1 Aponjon — "Our Own People" (face–name, spaced retrieval)

**Domains:** memory, language. **Severity:** all.

Study phase: photo + name + kinship term + optional family voice note, spoken.
Test phase: photo + 2–4 name options. Correct → interval advances `30s → 1m → 2m → 4m → 8m`. Incorrect → errorless correction, drop back one interval, `consecutive_success = 0`.

Difficulty ladder: 2 options with strong hint → 2 options → 3 → 4 → free recall with initial-letter cue → cross-session delayed recall.

**The NER-specific part:** the prompt speaks the **local kinship term**, not "aunt". Assamese, Khasi and Mizo encode relationships far more specifically than English does — paternal vs maternal, elder vs younger. Khasi is matrilineal, so the maternal uncle (*kni*) is structurally central. `family_members.kinship_term_key` maps into the i18n kinship table per language. This is a real localisation, not a string swap, and no competing team will have it.

Telemetry: latency, latency variability, hint count, sustained interval per face, **error type** — choosing a sibling's name for a spouse (`semantic_near`) is a different signal from a random pick.

Cross-session: `retrieval_state` persists intervals, so "holds Priya's name for 8 minutes, was 2 in July" is a real longitudinal metric a family understands without explanation.

### 7.2 Dhol Bator — "Rhythm Echo"

**Domains:** attention, memory, perceptual_motor. **Severity:** all — this is the game that stays playable deepest into progression.

A dhol plays a short rhythm; the patient taps it back on a large on-screen drum head. Span 2 → 7. Bihu patterns; gogona and pepa as timbre variants at higher levels.

**Why this game is strategically the most important one to build:**
- Musical memory is preserved differently in dementia — people who can no longer follow a conversation still recognise and reproduce music.
- It is a Corsi-block / digit-span task wearing cultural clothing. Validated construct, but it does not feel like a test.
- **It is the cleanest IIV measurement in the app.** Every other game measures reaction time with a cognitive task layered on top, confounding it. Inter-tap interval variability here is close to a pure timing-variability measure. When a judge asks "how do you separate the biomarker from the task", this is the answer.
- Zero literacy, zero language, zero visual acuity requirement. Works for a near-blind user.
- Cheapest of the four to build.

Implementation notes: pre-decode drum samples into `AudioBuffer` at app start. Schedule playback with a 100 ms lookahead scheduler. Record taps as `audioCtx.currentTime`. Compute `asynchronies[i] = tap[i] - expectedOnset[i]`, `response_iois[i] = tap[i] - tap[i-1]`. **Never** compare an audio-clock beat to a `performance.now()` tap.

Errorless: if the tap-back is wrong, the dhol simply replays the pattern with the tap points glowing. No failure state.

### 7.3 Xorai Milan — "Regional Memory Match"

**Domains:** attention, memory, perceptual_motor. **Severity:** all (grid capped by severity).

Card grid 2×2 → 2×3 → 3×4 → 4×4, card-visible duration shrinking with level. Each successful match speaks a one-line caption in the patient's language — "Kaziranga, the one-horned rhino" — converting a memory task into a reminiscence prompt.

**Asset weighting:** bias the deck toward **1950s–70s everyday objects** (hurricane lantern, transistor radio, brass utensils, treadle sewing machine, japi, xorai) over landmarks. Remote memory outlives recent memory: a rhino is recognition, a hurricane lantern is *their* memory. Landmarks, festivals, fauna, produce fill the rest.

Telemetry: **revisit rate** (flips of an already-seen card / total flips — a direct working-memory index), perseveration, first-flip-to-second-flip latency, grid-position bias, tap offset from card centre.

Asset licensing: Wikimedia Commons (CC-BY / CC-BY-SA), GoI tourism assets, or team-photographed originals. `licence` and `source_url` are `NOT NULL` in the schema for exactly one reason: "where did the images come from" is a real question and one column answers it.

### 7.4 Ghorir Chobi — "Clock & Trace"

**Domains:** perceptual_motor, executive. **Severity:** mild/moderate get clock; severe gets trace.

Two conditions mirroring the digital Clock Drawing Test: **command** ("draw a clock, put in all the numbers, set the hands to ten past eleven") and **copy** (reproduce a shown clock). For severe, a **trace-the-shape** variant using NER forms — japi outline, living-root-bridge arch, Naga shawl border. Same graphomotor signal, culturally warm, failure impossible.

**Do NOT attempt automated clock scoring.** Store the trace, compute the timing features, and render it as a replayable animation on the caregiver dashboard. Two clocks drawn a month apart, replaying side by side, is a more powerful demo than any number and it is entirely honest.

Telemetry: pre-first-stroke latency (hesitation before starting), post-clock-face latency, pre-first-hand latency, time-in-air (total finger-lifted time), longest single latency, latency variability across strokes, total completion time, stroke count, stroke order, drawn clock-face area.

Grounding for the pitch: the digital CDT captures 100+ latency and graphomotor features from a ~2-minute task; longitudinal work found the associations with amyloid and tau burden were driven specifically by **latency** features — hesitation, not the finished drawing. It has been piloted in India (CARRS cohort, n=303, adults 50+): under four minutes to administer, **99.3% of tests produced analysable data**. Education was a strong confounder, which is exactly why `patients.education_level` exists and why every comparison is within-person.

### 7.5 Session runner

```
orientation (1 min)  →  music cue (30 s)  →  game A (4–5 min)
  →  game B (4–5 min)  →  close: family photo + message + today's reminders
```

Game selection: pick 2 of 4, weighted by (a) longest time since last played, (b) severity gate, (c) never the same pair twice running. Orientation runs every session — it is the reality-orientation board, digitised, and it yields a clean daily orientation score for almost no build cost.

Hard limit: 15 minutes. Better to end while they are still willing. Any "session complete" state is a growing bamboo grove, never a number.

---

## 8. Analysis pipeline

Runs in a Supabase Edge Function (`nightly-rollup`) on a cron schedule, plus on demand when the caregiver opens the dashboard.

```
1. session_summaries   cv_rt is computed PER game_type, then aggregated as a
                       weighted mean. NEVER pool raw RTs across games: Aponjon
                       latencies are seconds and cognitive, Dhol Bator taps are
                       tens of ms and motor, so a pooled CV measures which games
                       were played that day, not the person. This is the metric
                       the entire pitch rests on.
                       accuracy_raw           = correct / trials
                       accuracy_hint_adjusted = (correct AND hints_used = 0)
                                                / trials -- a hinted trial counts
                                                as incorrect. This is what turns
                                                "accuracy is inflated by design"
                                                into a number.
                       plus hint_rate and per-domain scores.

2. baselines           Baseline window is sessions 4-13. The first three are
                       excluded: the patient is learning the interface, not
                       being measured, and including them bakes the practice
                       effect into the reference. Until session 13,
                       baseline_status stays 'collecting' and NOTHING is
                       analysed.

                       KNOWN LIMITATION, stated openly: a fixed personal
                       baseline drifts as practice effects saturate, which can
                       produce a cohort-wide false decline. v1.1 moves to a
                       rolling reference with an explicit anchor comparison.

3. flags               For each domain:
                         current = mean of last 7 days (min 4 sessions)
                         z = (current - baseline_mean) / baseline_sd
                         z < -1.5 sustained 14 days  → AMBER
                         z < -2.0 sustained 14 days  → RED
                       EWMA (alpha = 0.3) is applied to the RAW daily domain
                       score and z is computed from the EWMA value. Do NOT also
                       run a 7-day rolling mean underneath it: alpha = 0.3 on a
                       daily series is already a ~6-day window, and double-
                       smoothing makes the 14-day sustain rule meaningless.

4. suppression         Suppress the flag if ANY of:
                         - fewer than 4 sessions in the window
                             → 'insufficient_data'
                         - an overlapping care_event (illness, med change,
                           hospital, travel)   → 'care_event'
                         - the low-effort signature   → 'low_effort',
                           and raise the unscored mood check-in instead
                           of a decline flag
```

### 8.1 The low-effort discriminator

Depressed patients give poor effort; dementia patients try hard and get it wrong. That difference is visible in telemetry:

| Signature | Reading |
|---|---|
| high omission rate + long latency + early abandonment + **low hint usage** | poor effort → unscored mood check-in for the caregiver, no decline flag |
| high engagement + **full hint usage** + wrong answers | genuine difficulty → normal flag path |

This is the most clinically sophisticated feature in the product and it costs almost nothing to implement. It is worth a slide.

### 8.2 Flag copy — this exact wording, not a paraphrase

> Memory scores have been lower than usual for the past two weeks. This can happen for many reasons — illness, poor sleep, a change in medication, or low mood. It may be worth mentioning at the next doctor's visit.

Banned strings anywhere in the product: "decline detected", "condition worsening", "stage", "diagnosis", "screening result", "risk score".

---

## 9. Adaptive difficulty

Rule-based weighted staircase targeting **~85% success** — high, because errorless learning wants the failure rate low, not optimal-challenge-high.

```
per (patient, game):
  level starts from severity gate  (mild=3, moderate=2, severe=1)
  rolling window = last 10 trials
  if window_accuracy >= 0.90 and hint_rate <= 0.10 :  level += 1
  if window_accuracy <= 0.60
     or (hint_rate >= 0.40 and window_accuracy < 0.85) :  level -= 1
  # the accuracy guard on the hint condition is required. Hints fire
  # automatically on hesitation, so without it a slow-but-perfect patient is
  # demoted at 100% accuracy, which shortens latency, which promotes them
  # again. The staircase oscillates forever.
  clamp to [1, severity_ceiling]
  never move more than one level per session, in either direction
```

Persisted in `difficulty_state`, mirrored in Dexie so it works offline.

**Call it what it is.** In the deck: *"rule-based adaptive difficulty with ML-ready telemetry."* Do not call it AI. Then say the schema is deliberately designed so a model could be trained on it later, and that the data volume to train one does not exist yet. Judges reward teams who know what they have not built. Elo, IRT and Bayesian Knowledge Tracing were all evaluated and rejected on cold-start grounds — have that answer ready.

---

## 10. Language pipeline

**No Bhashini call ever happens at runtime.**

```
Build time:
  i18n/en.json  (source of truth, flat keys)
    → translate → i18n/{as,brx,mni,ne,hi,kha,lus}.json
    → Bhashini TTS → public/audio/{lang}/{key}.mp3
    → precached by the service worker

Runtime:
  speak(key) → play public/audio/{lang}/{key}.mp3    // zero network
```

Dynamic caregiver-entered content (family names, custom reminder labels) is voiced by a **caregiver-recorded voice note** rather than TTS. A grandchild's actual voice saying "Aita, time for your medicine" beats synthesised speech clinically and emotionally, and it removes the last runtime TTS dependency.

Language coverage: Bhashini TTS covers Assamese, Bodo, Manipuri (both Bengali and Meitei Mayek scripts), Nepali, Bengali, Hindi, English. Khasi and Mizo appear in Bhashini's broader service set — ship their strings, verify TTS separately, and fall back to caregiver voice notes if unavailable. AI4Bharat's Indic-TTS open-sources models for Assamese, Bodo and Manipuri, so offline pre-generation is possible without API quota.

Citing Bhashini by name is worth real points: it is MeitY's National Language Translation Mission, and building on Digital India public infrastructure for a Government of India problem statement is exactly what MDoNER wants to see.

Font: **Noto Sans** family. This is not an aesthetic choice — it is the only family with coherent coverage of Latin, Bengali-Assamese, Devanagari and Meetei Mayek. Load only the scripts for the selected language; do not ship all four to every device.

---

## 11. Folder structure

```
xorai/
├─ .claude/
│  └─ rules/                    → copies of rules.md, design.md
├─ CLAUDE.md                    → master context, updated after every phase
├─ memory.md                    → progress tracker
├─ docs/                        → prd.md, architecture.md, phases.md, buildbook.md
├─ public/
│  ├─ audio/{lang}/*.mp3        → pre-generated, precached
│  ├─ assets/cultural/*.webp    → the memory-match deck
│  ├─ audio/drums/*.wav         → dhol samples
│  └─ fonts/
├─ supabase/
│  ├─ migrations/               → numbered .sql, forward-only
│  ├─ seed.sql
│  └─ functions/
│     ├─ nightly-rollup/
│     └─ export-pdf/
├─ scripts/
│  ├─ generate-audio.ts         → i18n JSON → Bhashini → mp3
│  ├─ build-asset-pack.ts       → crop, WebP, manifest, licence CSV
│  └─ seed-telemetry.ts         → 60 days × 3 synthetic patients
├─ src/
│  ├─ main.tsx
│  ├─ app/
│  │  ├─ router.tsx
│  │  └─ providers.tsx
│  ├─ patient/                  ← PATIENT MODE. design.md rules are law here.
│  │  ├─ shell/                 → PatientShell, ExitGuard, WakeLock
│  │  ├─ session/               → SessionRunner, SessionClock, GameHost
│  │  ├─ games/
│  │  │  ├─ aponjon/
│  │  │  ├─ dhol-bator/
│  │  │  ├─ xorai-milan/
│  │  │  └─ ghorir-chobi/
│  │  ├─ orientation/
│  │  └─ assist/                → reminders, contacts, SOS, music, orientation card
│  ├─ caregiver/                ← CAREGIVER MODE. different design system.
│  │  ├─ onboarding/            → profile, family, music, routine, consent
│  │  ├─ dashboard/             → trends, calendar, flags, clock replay, export
│  │  └─ settings/
│  ├─ core/
│  │  ├─ db/                    → dexie.ts, outbox.ts, sync-engine.ts
│  │  ├─ supabase/              → client.ts, generated types.ts, queries/
│  │  ├─ telemetry/             → emit.ts, schema.ts, clock.ts
│  │  ├─ audio/                 → context.ts, scheduler.ts, speak.ts
│  │  ├─ i18n/
│  │  └─ difficulty/            → staircase.ts, spaced-retrieval.ts
│  ├─ ui/                       → shadcn primitives, re-tokenized
│  └─ styles/tokens.css
└─ tests/
   ├─ rls.test.ts               → cross-caregiver isolation. Never delete this.
   ├─ sync.test.ts              → idempotent replay of a partial flush
   └─ clock.test.ts             → monotonic offsets, no Date.now leakage
```

**The one structural rule:** `src/patient/` may not import from `src/caregiver/`, and vice versa. They share only `src/core/` and `src/ui/`. Two design systems, two audiences, one codebase — enforced by an ESLint boundary rule, not by discipline.
