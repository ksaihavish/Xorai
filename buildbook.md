# Buildbook — Xorai

Phase-by-phase build plan with copy-paste prompts for a coding agent. Work in order. Each phase assumes the previous one is done **and verified**.

---

## How to use this

1. Open the **full project folder** in your agent (never a subfolder).
2. Read the *Goal* and *Before you start* yourself.
3. Copy the **Prompt** block verbatim.
4. Run the **Verify** checklist before moving on. If it fails, fix it now — every later phase assumes it passed.
5. Commit and push. Each phase is a restore point.

**The token rule:** every prompt below names the exact files the agent may touch and tells it not to scan the rest. Never loosen this. A vague prompt is what burns your limits.

**The secrets rule:** never paste an API key, password, or connection string into a prompt. The standing rule in Phase 0 tells the agent to stop and ask for any credential, which you then put in `.env.local` yourself.

**After every phase, run this:**

```
Update memory.md: mark this phase complete, list the files you created or changed,
note anything you deferred or that surprised you, and state which phase is next.
Then update CLAUDE.md if the file tree or any core contract changed.
Do not touch any other file.
```

Then:

```
Stage all changes, commit with a message describing this phase, and push.
```

---

## READ THIS FIRST — the run order changed

The prompt blocks below are unchanged and still correct. **The order you run them in is not the order they appear in.** Four things were being built too late, and one block was doing two jobs at once.

| Phase | Prompt block | Which part |
|---|---|---|
| 0 | A | all |
| 1 | B | all, plus amendment 1 (i18n scaffold) |
| 2 | C | all |
| 3 | D | all, plus amendment 3 (Dexie state stores) |
| 4 | E | all, plus amendment 2 (audio anchor) |
| 5 | **F** | all — the language and audio pipeline, **before any game exists** |
| 6 | **G** | the assistance layer only. Skip the difficulty staircase. |
| 7 | H | Dhol Bator only |
| 8 | H | Aponjon only |
| 9 | I | Ghorir Chobi only |
| 10 | G | the difficulty staircase only |
| 11 | K | `scripts/seed-telemetry.ts` only |
| 12 | J | the `nightly-rollup` Edge Function only |
| 13 | J | the dashboard, clock replay and PDF only |
| 14 | I | Xorai Milan only |
| 15 | K | harden, remaining languages, demo video, final deploy |

**Why F moved to 5.** Every game is voice-led. Building four games against a stubbed `speak()` and wiring real audio afterwards means retrofitting i18n keys, audio latency and the precache budget into four finished games. Audio is a cross-cutting concern, exactly like offline and the clock — and the ordering argument this buildbook already makes for those two applies here identically.

**Why G's assistance half moved to 6.** It is half the problem statement's title, it is the cheapest half to build, and sitting behind all four games made it the first thing to be cut when time ran out.

**Why K's seed moved before J.** You cannot verify a flag, a suppression rule or a trend line against an empty table.

**When a block is split**, run the prompt twice, and in each pass delete the deliverables belonging to the other half before you paste it. The blocks are written as numbered lists precisely so this is a deletion, not a rewrite.

---

## Standing amendments — apply these wherever the block touches them

These correct real defects. They are listed once here rather than edited into eleven prompts.

**1. No hardcoded user-facing string, from Block B onward.** Create `i18n/en.json` in Block B and route every user-facing string through `t()` from that moment. This is what turns Phase 5 into a wiring job instead of a rewrite, and it is the cheapest insurance in the plan.

**2. One audio↔performance anchor.** In Block E's `clock.ts`, capture `{perfOrigin, audioOrigin}` once at session start (ideally via `audioCtx.getOutputTimestamp()`) and expose `clock.fromAudio(t)`. Dhol Bator needs both clocks — asynchronies on the audio clock, `attempts` offsets on the performance clock — and no game should do that arithmetic itself.

**3. Dexie needs state stores, and they sync differently.** Block D's schema must also include `difficulty_state`, `retrieval_state` and `cached_summaries`. Telemetry is append-only and `ignoreDuplicates` covers it; these three are read-modify-write and need last-write-wins on a server `updated_at`. Without them, adaptive difficulty and spaced retrieval do not survive a reload and the dashboard cannot render offline.

**4. Schema additions in Block C's `0001_init.sql`** — migrations are forward-only, so these must be there from the start: `patients.home_place`, `sessions.pointer_sample_interval_ms`, `attempts.retrieval_interval_s`, `media_assets.alt_text_key`, `unique(patient_id, domain, window_start, window_end)` on `flags`, and `informant_checks.instrument in ('informant_short','mood_checkin')`.

**5. `severity` cannot be `NOT NULL`** while onboarding saves after each step — it is collected at step 2 and the patient row is created at step 1.

**6. Stroke capture ladder.** `pointerrawupdate` **alone** where available, otherwise `pointermove` **with** `getCoalescedEvents()`. Never both on the same event.

**7. `cv_rt` is computed per `game_type`, then aggregated.** Pooling raw reaction times across games makes the headline variability metric measure which games were played, not the person.

**8. Reminders do not fire on a locked screen.** Decide the deployment posture before Block G: kiosk mode (tablet awake and foregrounded) is the v1 answer. Change the verify step to match — do not demonstrate a claim that cannot hold.

**9. Deploy in Block A, not Block K.** Get a live Vercel URL on day one so the idea slide's four links are never a scramble, and add a daily ping so the Supabase free project never pauses before judging.

**10. The banned-string grep is scoped to `src/**` and `i18n/**`,** on word boundaries, excluding `docs/` and `.claude/`. The spec files themselves contain every banned word.

## One-time setup (before Phase 0)

```
Help me set up version control before we build.
1. Initialize a git repository here if one doesn't exist.
2. Create a .gitignore excluding: .env, .env.local, .env*.local, node_modules/,
   dist/, .vercel/, supabase/.temp/, *.local, coverage/
3. Ask me for my GitHub repo URL and tell me exactly what to run to link this
   folder to it.
4. Do NOT commit anything yet.
Ask me for any detail you need rather than guessing.
```

### Accounts to create first

**Supabase** — supabase.com, new project, **region: Mumbai (ap-south-1)**. This cannot be changed later and it is your DPDP data-residency claim. Note the Project URL, anon key, and service_role key.

**Vercel** — connect the GitHub repo. Nothing else needed yet.

**Bhashini** — bhashini.gov.in, register for API access (needed in Phase 9, apply early, approval takes time).

**Cost:** all free tiers. Supabase free gives 500 MB database and 1 GB storage, which comfortably covers 60 days of seeded telemetry for three patients plus the asset pack.

---

# Block A — Foundation & scaffolding

> run as **Phase 0**

### Goal
Repo structure, tooling, rule files, empty interfaces. No business logic, no UI.

### Before you start
- Create an empty GitHub repo and clone it.
- Put `prd.md`, `architecture.md`, `design.md`, `rules.md`, `phases.md` in `docs/`.

### Prompt

```
You are scaffolding a new project from scratch. Create ONLY the folder structure,
config, master context file, and empty interfaces described below. Do NOT write
business logic, components, or routes. Do NOT install packages beyond what's listed.

PROJECT: Xorai — an offline-first, voice-first PWA for elderly people living with
dementia in India's North Eastern Region. Two modes in one app: a locked, simplified
PATIENT mode (cognitive games + memory assistance, tablet, landscape) and a
CAREGIVER mode (onboarding + a longitudinal dashboard). Read docs/prd.md and
docs/architecture.md before you start — they are the source of truth.

STACK (do not substitute anything):
- Vite 6 + React 19 + TypeScript strict
- Tailwind CSS 3.4 (NOT v4 — do not upgrade, v4's CSS-based config breaks things)
- shadcn/ui (copy-in, we own the code)
- TanStack Query v5, Zustand v5
- Dexie 4 (IndexedDB)
- vite-plugin-pwa (injectManifest strategy)
- @supabase/supabase-js v2
- Recharts, react-i18next, date-fns, uuid (v7), zod, clsx, tailwind-merge
- vitest + @testing-library/react
- lucide-react (CAREGIVER MODE ONLY — never in src/patient)

DO THIS:

1. Initialise Vite + React + TS. Set "strict": true and
   "noUncheckedIndexedAccess": true in tsconfig. Add the path alias @/* -> src/*.

2. Install Tailwind 3.4 exactly (tailwindcss@3.4.x). Pin it in package.json —
   do not use ^ on tailwind.

3. Create this exact tree. Create folders and .gitkeep where a folder would
   otherwise be empty. Only the files marked (CONTENT) get real code.

   .claude/rules/           -> copy docs/rules.md and docs/design.md here
   CLAUDE.md                (CONTENT)
   memory.md                (CONTENT)
   docs/                    -> already populated, leave alone
   public/audio/{drums,}/   -> .gitkeep
   public/assets/cultural/  -> .gitkeep
   public/fonts/            -> .gitkeep
   supabase/migrations/     -> .gitkeep
   supabase/functions/      -> .gitkeep
   scripts/                 -> .gitkeep
   src/main.tsx             (CONTENT — minimal)
   src/app/router.tsx       (CONTENT — two routes: /p patient stub, / caregiver stub)
   src/app/providers.tsx    (CONTENT — QueryClientProvider only for now)
   src/patient/{shell,session,games,orientation,assist}/  -> .gitkeep
   src/caregiver/{onboarding,dashboard,settings}/         -> .gitkeep
   src/core/db/             -> .gitkeep
   src/core/supabase/       -> .gitkeep
   src/core/telemetry/types.ts   (CONTENT — types only, no implementation)
   src/core/audio/          -> .gitkeep
   src/core/i18n/           -> .gitkeep
   src/core/difficulty/     -> .gitkeep
   src/ui/                  -> .gitkeep
   src/styles/tokens.css    -> empty file, Phase 1 fills it
   tests/                   -> .gitkeep
   .env.example             (CONTENT)

4. src/core/telemetry/types.ts — write ONLY these types, no functions:
   GameType, Domain, Severity, ErrorType (as string union types matching the
   CHECK constraints in docs/architecture.md §4), and the interfaces
   AttemptEvent, StrokeEvent, RhythmTrialEvent, SessionRecord, GameSummary,
   GameContext, SessionClock — copying the field names from
   docs/architecture.md §4 and §7 EXACTLY. Field names are a contract; a typo
   here propagates everywhere.

5. ESLint flat config with typescript-eslint, plus a no-restricted-imports rule
   enforcing the module boundary:
     - files in src/patient/** may not import from @/caregiver/* or ../caregiver/*
     - files in src/caregiver/** may not import from @/patient/* or ../patient/*
   Both directions. Error, not warning.

6. .env.example listing (with empty values):
   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_ENABLE_PHONE_OTP,
   VITE_APP_VERSION
   Do NOT create .env.local. Tell me what to put in it and I'll do it.

7. CLAUDE.md — the master index. Include: what the project is (3 sentences),
   the stack table, the folder tree with one line per folder explaining what
   lives there, a "standing rules" section that reproduces docs/rules.md §1 and
   §2 verbatim, and a "current phase" line. This file exists so you never have
   to scan the repo. Keep it accurate.

8. memory.md — a progress tracker with a table of the 11 phases (from
   docs/phases.md), a status column all set to "not started", a
   "last file worked on" line, and a "notes / gotchas" section.

STANDING RULES for this and every future task:
- Touch only files listed in the prompt. Do not scan the rest of the repo.
- Any credential, key, URL, or config value: STOP and ask me. Never invent a
  placeholder secret.
- Any library not listed above: STOP and ask before installing.
- No `any`, no @ts-ignore, no non-null assertions outside tests.
- Comments explain WHY, never WHAT.
- If something in this prompt contradicts docs/rules.md, docs/rules.md wins —
  tell me and stop.
```

### Verify
- `npm run dev` serves a blank shell at `/` and `/p`.
- `npm run lint` passes.
- **Break the boundary on purpose:** add `import x from '@/caregiver/foo'` to a file in `src/patient/`. Lint must error. Remove it.
- `package.json` shows `"tailwindcss": "3.4.x"` with no caret.
- `CLAUDE.md` folder tree matches reality. Read it — fix anything wrong now.

### Why this matters
`CLAUDE.md` is what stops the agent scanning the repo on every task. The boundary lint rule is what stops patient mode and caregiver mode fusing into one mushy design system by Phase 6.

---

# Block B — Design system & patient shell

> run as **Phase 1** — and add the i18n scaffold, see amendment 1

### Goal
Make the design rules executable before anything is built on them.

### Before you start
Read `docs/design.md` yourself, end to end. You will be judging the output by eye and you need to know what you are looking for.

### Prompt

```
Implement the design system from docs/design.md. Read that file completely first —
it is the source of truth, including the clinical reasoning. Then read
docs/rules.md §2 "Errorless UI".

Touch only:
  src/styles/tokens.css
  tailwind.config.ts
  index.html
  public/fonts/
  src/ui/  (new files)
  src/patient/shell/  (new files)
  src/caregiver/AppShell.tsx  (new)
  src/app/router.tsx  (add a /demo route)

1. src/styles/tokens.css — every CSS variable from docs/design.md §2, including
   the [data-mode="caregiver"] block. Nothing else.

2. tailwind.config.ts — extend theme.colors to map the tokens (paper, paperSunk,
   madder, madderDeep, brass, brassSoft, tea, teaSoft, ink, clay, rule, signal).
   Extend fontSize with the patient scale from §3 as named sizes:
   prompt(40px/1.35), promptLg(56px/1.25), body(24px/1.55), name(32px/1.3),
   btn(28px/1.2). Extend spacing with touch: 60px and touchLg: 72px.
   Do NOT delete Tailwind's defaults — extend only.

3. Fonts. Self-host Noto Sans from public/fonts (Latin + Bengali + Devanagari
   subsets for now; Meetei Mayek comes in Phase 9). Load subsets separately with
   font-display: swap. Inter for caregiver mode only. NO italic faces at all.
   Add font-variant-numeric: tabular-nums to a .tabular utility class.

4. src/ui/ — patient primitives. These are NOT shadcn defaults; write them to
   docs/design.md §5 exactly:
     PatientButton   72px min-height, 3px solid ink border, radius 16px,
                     32px padding-x, 28px/600 text. Pressed: brassSoft fill,
                     madderDeep border, translateY(2px). Focus: 4px brass
                     outline offset 2px. NO scale transform on press.
     PatientCard     photo 1:1 or 4:3, 2px clay border, radius 20px, min-width
                     240px, 32px/600 caption below. Pressed: 3px brass border.
     Prompt          40px/600, centred, max 900px, ink on paper.
     ReplayAudioButton  fixed top-right, 72x72, icon + the word for "listen"
                     (hardcode English for now).
   Every one of these needs a visible border AND a fill at rest. No ghost
   buttons. No icon-only buttons.

5. src/patient/shell/PatientShell.tsx:
   - Full-viewport, landscape. If viewport width < 1024px, render a full-screen
     message asking to rotate/use a larger screen.
   - The WOVEN SESSION BORDER from docs/design.md §1: a 16px frame around the
     viewport. Implement as a repeating CSS gradient stripe motif in madder.
     It accepts a `progress` prop 0..1; the fraction from the top-left going
     clockwise renders in brass instead of madder. No percentage, no number,
     no bar — the frame IS the indicator.
   - Wake lock via navigator.wakeLock (guard for unsupported).
   - screen.orientation.lock('landscape') where supported, in a try/catch.
   - Disable text selection, context menu, and overscroll (overscroll-behavior:
     none, touch-action: manipulation on the shell, none on game surfaces).
   - ExitGuard: an unlabelled 60x60 hit area in the BOTTOM-LEFT corner requiring
     pointerdown held for 3000ms before it opens a 4-digit PIN dialog. A tap,
     a double-tap, or a 2.9s hold must do nothing at all — no visual feedback
     that anything exists there until 800ms into the hold, then a subtle brass
     ring fills.

6. src/caregiver/AppShell.tsx — a DIFFERENT system: data-mode="caregiver" on the
   root, 12-column grid, 24px gutter, max-width 1280px, sections divided by 1px
   --rule hairlines NOT cards, Inter for UI, 16px base. It should not look like
   patient mode with a different colour.

7. Add a /demo route rendering, side by side in an iframe pair or two stacked
   sections: one representative patient screen (Prompt + two PatientCards + a
   PatientButton + ReplayAudioButton, inside PatientShell at progress=0.4) and
   one representative caregiver screen (a header, a hairline-divided section, a
   placeholder chart area, a flag card).

Do not build any game, any route logic, or any data layer.
```

### Verify
- Open `/demo` on an actual tablet or at tablet dimensions. **Measure the button** — 60 px minimum, and it should feel oversized to you. If it looks normal, it is too small.
- Run ink-on-paper and clay-on-paper through a contrast checker: both ≥ 7:1.
- Tap the bottom-left corner ten times, double-tap it, hold it 2.9 s. Nothing happens. Hold 3 s — PIN dialog.
- Set `progress` to 0.25, 0.5, 0.75 — the border fill visibly changes.
- **Screenshot both modes side by side.** If they read as the same product with a palette swap, tell the agent the caregiver system is not distinct enough and iterate. This is the phase where that gets fixed cheaply.

### Why this matters
Every screen for the next nine phases inherits these primitives. A 48 px button fixed now is one file; fixed in Phase 8 it is forty.

---

# Block C — Supabase, schema, RLS, auth, consent

> run as **Phase 2**

### Goal
The layer that cannot be retrofitted.

### Before you start
Create the Supabase project in **ap-south-1 (Mumbai)**. Have the Project URL, anon key, and service_role key ready — the agent will ask; you put them in `.env.local` yourself.

### Prompt

```
Set up the database, security, auth, and caregiver onboarding.
Read docs/architecture.md §4 (data model), §4.1 (RLS) and §3 (auth model), and
docs/prd.md §9 (legal) before writing anything.

Touch only:
  supabase/migrations/0001_init.sql   (new)
  supabase/migrations/0002_rls.sql    (new)
  src/core/supabase/client.ts         (new)
  src/core/supabase/types.ts          (generated — do not hand-edit)
  src/caregiver/onboarding/           (new files)
  src/caregiver/auth/                 (new files)
  src/app/router.tsx                  (add routes)
  tests/rls.test.ts                   (new)

1. 0001_init.sql — every table in docs/architecture.md §4, with the exact column
   names, types, CHECK constraints, and foreign keys given there. Plus:
   - UNIQUE on attempts.client_event_id, strokes.client_event_id,
     rhythm_trials.client_event_id  (this is the offline idempotency key)
   - Indexes: attempts(patient_id, created_at), attempts(session_id),
     sessions(patient_id, started_at), strokes(session_id),
     rhythm_trials(session_id)
   - sessions.id, attempts.id etc. have NO default — IDs are generated
     client-side (uuid v7) so offline rows keep their identity.
   Migrations are forward-only. Never edit this file after it's applied.

2. 0002_rls.sql — enable RLS on EVERY table. Apply the policy pattern from
   docs/architecture.md §4.1:
   - caregivers: id = auth.uid()
   - patients: caregiver_id = auth.uid()
   - every patient-scoped table: patient_id in (select id from patients
     where caregiver_id = auth.uid()), for both USING and WITH CHECK
   - media_assets: for select using (true) — global read, no write policy
   - session_summaries, baselines, flags: SELECT ONLY for the caregiver.
     No insert/update/delete policy at all. These are written by Edge Functions
     with the service role. A client that can write its own flags can write its
     own diagnosis.
   Ask me to run both files in the Supabase SQL editor; do not try to apply them
   yourself.

3. src/core/supabase/client.ts — a single browser client from
   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Ask me for these values;
   I will put them in .env.local. Session persistence on, autoRefresh on.
   Export one instance. Never construct a second client anywhere.

4. Generate src/core/supabase/types.ts from the schema and tell me the command
   so I can re-run it after every future migration.

5. Caregiver auth: sign up, sign in, sign out, password reset. Email + password.
   Read VITE_ENABLE_PHONE_OTP — if 'true', also offer phone OTP; default false.
   A protected-route wrapper that redirects unauthenticated users to sign-in.
   The PATIENT never authenticates — do not build any patient login.

6. Onboarding flow, one step per screen, resumable, saving after each step:
   1. Patient profile: display name, birth year, education level
      (none/primary/middle/secondary/higher — this is a documented confounder,
      it is required, and the copy should explain why in one sentence),
      language, photo upload
   2. Severity: mild/moderate/severe, labelled "as told to you by a doctor".
      The copy must make clear this is something we're being told, not
      something we determine.
   3. Family members: photo + name + kinship term key + relationship + phone +
      is_emergency. At least one required. Optional voice note recording
      (MediaRecorder, store in Supabase Storage).
   4. Music: upload or record tracks. Optional but strongly encouraged in copy.
   5. Routine: medication times, meal times, sleep window -> reminders rows.
   6. CONSENT — see step 7.
   Use Supabase Storage buckets: 'patient-photos', 'family-photos',
   'voice-notes', 'music'. All private, RLS-protected, signed URLs only.

7. Consent screen (DPDP Act 2023). This is graded, build it properly:
   - Plain-language purpose statement per data category, in the selected
     language (English fallback for now, i18n keys throughout)
   - FOUR SEPARATE TOGGLES: gameplay data / photos / audio / analytics.
     Gameplay is required; the other three are genuinely optional and the app
     must work with them off.
   - Guardian relationship free-text field + an explicit attestation checkbox
     reading that they are the patient's lawful guardian or acting with their
     authority
   - Store notice_version (hardcode 'v1') and notice_locale
   - Records are APPEND-ONLY: withdrawal writes withdrawn_at and inserts a new
     row on re-grant. NEVER update scopes in place — the audit trail is the point.
   - A "Withdraw consent and delete all data" button in settings that actually
     cascades and deletes, with a confirmation step.

8. tests/rls.test.ts — using two real test accounts:
   - Caregiver A creates patient A1; caregiver B creates patient B1
   - As A: select from patients, sessions, attempts, strokes, family_members
     returns ZERO of B's rows
   - As A: insert into attempts with patient_id = B1 is REJECTED
   - As A: insert into flags is REJECTED (no write policy exists)
   This test must never be deleted or skipped. It is the artifact behind the
   answer to "how is patient data isolated".
```

### Verify
- Run `tests/rls.test.ts`. All assertions pass. **Actually read the test** — confirm it asserts what you think it does.
- Sign up two caregivers in two browsers. Confirm neither sees the other's patient.
- Complete onboarding. Check the `consents` row: scopes JSON is right, `notice_version` set, `attested` true.
- Toggle photos off in consent, then confirm the app still runs.
- Hit "withdraw consent and delete" on a throwaway account — data is actually gone.

### Why this matters
RLS is the one layer you cannot add later, and it is a Q&A answer you can read aloud in four lines. The consent flow is 30 minutes of work that almost no competing team will have done.

---

# Block D — Offline layer

> run as **Phase 3**

### Goal
Everything after this line works with the network off.

### Prompt

```
Build the offline layer. Read docs/architecture.md §5 (offline architecture) and
docs/rules.md §2 (Telemetry invariants) first.

Touch only:
  src/core/db/dexie.ts        (new)
  src/core/db/outbox.ts       (new)
  src/core/db/sync-engine.ts  (new)
  src/core/db/schemas.ts      (new — zod)
  vite.config.ts
  src/sw.ts                   (new — custom service worker)
  src/caregiver/dashboard/SyncStatus.tsx  (new)
  tests/sync.test.ts          (new)

1. dexie.ts — the schema from docs/architecture.md §5.1 exactly:
     outbox_sessions:  'id, flushed_at'
     outbox_attempts:  'client_event_id, session_id, flushed_at'
     outbox_strokes:   'client_event_id, session_id, flushed_at'
     outbox_rhythm:    'client_event_id, session_id, flushed_at'
     local_profile:    'patient_id'
     asset_manifest:   'id'
     sync_meta:        'key'
   Version 1. Include an upgrade path stub for future versions.

2. schemas.ts — zod schemas for every event type, matching
   src/core/telemetry/types.ts. Every read OUT of Dexie is parsed. Dexie data
   can be stale from a previous schema version; unparsed reads are how you get
   a crash mid-demo.

3. outbox.ts — write functions: queueSession, queueAttempt, queueStroke,
   queueRhythmTrial. Each generates a uuid v7 client_event_id if absent and
   writes SYNCHRONOUSLY. These functions must NEVER touch the network and must
   NEVER await a fetch. Return void, do not return a promise the caller awaits
   in an interaction handler.

4. sync-engine.ts:
   - Flush order is strictly sessions -> attempts -> strokes -> rhythm (FK deps)
   - Batches of 200
   - supabase.from(t).upsert(rows, { onConflict: 'client_event_id',
     ignoreDuplicates: true }) — for sessions, onConflict is 'id'
   - Triggers: window 'online' event, visibilitychange to visible, session end,
     and a 60s interval while online
   - On success: set flushed_at. On error: leave flushed_at null, exponential
     backoff 1s/2s/4s/... capped at 5 min, retry. NEVER delete an unflushed row.
   - Prune flushed rows older than 7 days only. Recent rows stay so the
     caregiver dashboard works offline.
   - Update sync_meta.last_synced_at on every successful flush
   - The engine never throws into the UI. Every error is caught and logged.

5. vite.config.ts — vite-plugin-pwa with strategies: 'injectManifest',
   srcDir: 'src', filename: 'sw.ts'. Manifest: name 'Xorai', display
   'fullscreen', orientation 'landscape', theme_color from --madder,
   background_color from --paper, 192/512 icons.

6. src/sw.ts — precache the injected manifest (app shell, fonts, i18n JSON,
   ALL audio under /audio/, cultural assets). Runtime CacheFirst for Supabase
   Storage image URLs with 30-day expiry and a 300-entry cap — family photos
   must survive offline. NEVER cache Supabase REST or auth endpoints
   (NetworkOnly for /rest/v1/ and /auth/v1/).

7. SyncStatus.tsx — reads sync_meta via dexie-react-hooks, shows
   "Last synced <relative time>" using date-fns, plus a count of unflushed rows.
   Caregiver mode only. This component is never rendered in patient mode.

8. tests/sync.test.ts — the critical test:
   - Queue 250 attempts offline
   - Simulate a flush that succeeds for the first 200 then fails
   - Reconnect and flush again
   - Assert: the server has exactly 250 rows, ZERO duplicates, and all 250 have
     flushed_at set locally
   Use a fake/stubbed supabase client for this test.
```

### Verify
This is the phase your demo video is built on. Do it by hand, on the tablet.

1. Install to home screen.
2. Airplane mode on.
3. Queue events via a temporary dev button.
4. **Force-quit the app.** Reopen. Data still in Dexie.
5. Airplane mode off. Watch it sync.
6. Run the flush twice deliberately — row count in Supabase is unchanged the second time.
7. Open DevTools → Application → Cache Storage. Confirm the precache exists and check its size.

### Why this matters
Offline is a scored requirement for a hill-district problem statement, and the airplane-mode toggle mid-session is the most convincing 15 seconds of your demo video. Building it now means every game inherits it for free.

---

# Block E — Telemetry SDK, session clock, orientation

> run as **Phase 4**

### Goal
One clock, one emit path, proven on the cheapest possible game.

### Prompt

```
Build the telemetry SDK, the session runner, and the orientation warm-up.
Read docs/architecture.md §6 (TIMING — read it twice, it is the most bug-prone
part of the system) and §7.5, plus docs/rules.md §2.

Touch only:
  src/core/telemetry/clock.ts     (new)
  src/core/telemetry/emit.ts      (new)
  src/patient/session/SessionRunner.tsx  (new)
  src/patient/session/GameHost.tsx       (new)
  src/patient/session/store.ts           (new — zustand)
  src/patient/orientation/               (new files)
  src/patient/session/CloseScreen.tsx    (new — bamboo grove)
  tests/clock.test.ts             (new)

1. clock.ts — SessionClock:
   - createSessionClock() captures ONE performance.now() as the origin and one
     Date.now() as sessions.started_at
   - now() returns performance.now() - origin, a monotonic ms offset
   - Date.now() IS BANNED everywhere else in this file and in emit.ts. It is
     wall-clock, it gets NTP-corrected mid-session, and one correction poisons
     the reaction-time variability metric the entire pitch rests on.
   - Also expose the device's pointer sample interval, measured once at session
     start over ~500ms of synthetic sampling, stored on the session record.

2. emit.ts — emitAttempt / emitStroke / emitRhythmTrial. Each:
   - takes the clock, fills presented_at_ms / first_touch_at_ms /
     responded_at_ms as offsets
   - generates client_event_id (uuid v7)
   - calls the outbox writer SYNCHRONOUSLY
   - returns void
   No network. No await in the caller's interaction handler.

3. store.ts — zustand: current session, current game index, progress 0..1,
   current patient. Nothing else. No server state here (that's TanStack Query).

4. SessionRunner — the structure from docs/architecture.md §7.5:
     orientation (1min) -> music cue (30s) -> game A (4-5min)
       -> game B (4-5min) -> close
   - Game selection: pick 2 of 4 by (a) longest since last played,
     (b) severity gate, (c) never the same pair twice consecutively.
     For now only 'orientation' exists — stub the game slots.
   - Feeds `progress` into PatientShell's woven border.
   - HARD 15-minute cap: if exceeded, go straight to close. Better to end while
     they're still willing.
   - Writes the session record to the outbox at start AND at end.

5. GameHost — mounts a Game (the interface in src/core/telemetry/types.ts),
   provides GameContext (patient, level, emit, speak, onComplete, clock).
   Games get the network, Dexie, and Supabase ONLY through this context.
   A game that imports supabase directly is wrong.

6. Orientation warm-up — the reality-orientation board, digitised:
   - Four questions: what day is it / what is today's date / which season /
     where are you. Big cards, 2-4 options, tap only.
   - Voice-led: speak() is called on entry (stub it for now to play a silent
     file and log the key — Phase 9 wires real audio).
   - ERRORLESS: after 8000ms of no first touch, dim the distractors so the
     answer is obvious and increment hints_used. On a wrong tap: fade the
     chosen option to 30% over 400ms, glow the correct one in brassSoft, speak
     the correct answer, advance. NO red, NO sound, NO message, NO score.
   - Emits one attempt row per question with game_type 'orientation',
     domain 'orientation'.
   - "Where are you" options come from the patient profile's location; if
     absent, skip that question rather than guessing.

7. CloseScreen — the bamboo grove. One culm per completed session, read from a
   local count. It grows and never shrinks. No number, no percentage, no streak.
   A missed day adds nothing and removes nothing.

8. tests/clock.test.ts:
   - offsets from now() are monotonically non-decreasing across 1000 calls
   - a grep assertion: no file under src/core/telemetry/ or src/patient/
     contains the string "Date.now()" except in an allowlist you print for me
     to review
```

### Verify
- Play orientation. Query `attempts` in Supabase. Confirm `presented_at_ms` < `first_touch_at_ms` < `responded_at_ms`, all plausible, all offsets from zero not epoch timestamps.
- Deliberately wait 10 s on a question — `hints_used` becomes 1 and the distractors dim.
- Tap a wrong answer. **Watch the screen carefully.** No red. No sound. No message. The correct one glows and it moves on.
- Run `tests/clock.test.ts`. Read the `Date.now()` allowlist it prints.

### Why this matters
Orientation is the cheapest possible game and it proves the entire telemetry pipeline before you spend two days on the expensive ones. If hesitation is computable from these rows, everything downstream works.

---

# Block H — Aponjon & Dhol Bator

> **SPLIT** — Dhol Bator = Phase 7, Aponjon = Phase 8

### Goal
The two highest-value games. Build Dhol Bator first — it is the cheapest and it validates the audio clock, which is the hardest thing to debug later.

### Before you start
Source 6–8 dhol/gogona/pepa samples as short WAVs into `public/audio/drums/`. Freesound CC0 or team-recorded. Note the licence.

### Prompt

```
Build two games. Read docs/architecture.md §7.1, §7.2 and §6 (timing) first.
Build DHOL BATOR FIRST and get it verified before starting Aponjon.

Touch only:
  src/core/audio/context.ts    (new)
  src/core/audio/scheduler.ts  (new)
  src/patient/games/dhol-bator/   (new files)
  src/patient/games/aponjon/      (new files)
  src/core/difficulty/spaced-retrieval.ts  (new)
  src/patient/session/SessionRunner.tsx    (register the two games)

=== PART A: AUDIO CORE ===

context.ts — one AudioContext, created on first user gesture (browsers block
it otherwise). Pre-decode every file in public/audio/drums into AudioBuffers at
app start and cache them. Expose now() returning audioCtx.currentTime.

scheduler.ts — a lookahead scheduler: a 25ms setInterval that schedules any
note due within the next 100ms via source.start(audioCtx.currentTime + delta).
Return the exact scheduled onset time for every note so we can compare taps
against it.

=== PART B: DHOL BATOR ("Rhythm Echo") ===

Mechanic: the dhol plays a short rhythm; the patient taps it back on one large
on-screen drum head. Span 2 -> 7 notes. Higher levels swap timbre (gogona, pepa).

CRITICAL TIMING RULE, from docs/rules.md §2:
  Beats are scheduled on audioCtx.currentTime.
  Taps are recorded as audioCtx.currentTime, in pointerdown.
  NEVER compare an audio-clock beat to a performance.now() tap. The clocks
  drift and the asynchrony numbers become meaningless.

- The drum head is one target, minimum 400x400px, centred. Tap only.
- On tap: a brass ripple from the touch point, and the drum sound. That's the
  only feedback.
- ERRORLESS: if the tap-back is wrong, the dhol simply replays the pattern with
  the tap points glowing in sequence, then offers it again. No failure state
  exists. There is no "wrong" sound in the bundle.
- Emit one rhythm_trials row per trial:
    model_iois     = inter-onset intervals presented (ms)
    response_iois  = inter-tap intervals produced (ms)
    asynchronies   = signed error per tap vs the scheduled onset (ms)
    span, trial_index, completed
- Also emit one attempts row per trial (game_type 'dhol_bator', domain
  'attention') so it flows through the standard summary pipeline.

=== PART C: APONJON ("Our Own People") ===

Face-name recall using spaced retrieval and errorless learning.

spaced-retrieval.ts:
- Intervals: [30, 60, 120, 240, 480] seconds
- On correct: advance one interval, consecutive_success++
- On incorrect: drop back ONE interval, consecutive_success = 0
- Persist to retrieval_state (patient_id, family_member_id): current_interval_s,
  longest_interval_s, consecutive_success, last_tested_at
- Mirror to Dexie local_profile so it works offline
- Schedule the next test for a face at now + current_interval_s, within session

Game:
- Study phase: photo (large, min 400px) + name + KINSHIP TERM + optional family
  voice note. speak() the kinship term, not an English relationship word.
  family_members.kinship_term_key maps into the i18n kinship table. Assamese,
  Khasi and Mizo encode relationships far more specifically than English
  (paternal vs maternal, elder vs younger); Khasi is matrilineal so the maternal
  uncle is structurally central. This is a real localisation, not a string swap.
- Test phase: photo + 2-4 name options as PatientCards.
- Difficulty ladder by level: 1 = 2 options with the correct one pre-glowing,
  2 = 2 options, 3 = 3 options, 4 = 4 options, 5 = free recall with an
  initial-letter cue, 6 = cross-session delayed recall.
- ERRORLESS: >5000ms hesitation -> dim distractors, hints_used++. Wrong tap ->
  fade to 30%, glow correct, speak the correct name and kinship term, advance.
- ERROR TYPING is required — classify and store error_type:
    semantic_near  = the chosen name is another family member in a
                     related role (spouse chosen for sibling, etc.)
    intrusion      = a name from an earlier trial in this session
    perseveration  = the same wrong name chosen on consecutive trials
    omission       = no response before the trial ends
    random         = anything else
  Choosing a sibling's name for a spouse is a different clinical signal from a
  random pick. Store the distinction.
- Emit attempts rows with game_type 'aponjon', domain 'memory'.
```

### Verify

**Dhol Bator (do this before starting Aponjon):**
- Play a 3-note pattern and tap it back deliberately, roughly in time. Query the `rhythm_trials` row. **`asynchronies` should be tens of milliseconds.** If they are hundreds or thousands, the audio clock and the DOM clock are being mixed — stop and fix it before going further. This is the single most likely bug in the whole build.
- Tap deliberately wrong. The pattern replays. No failure sound, no red, no message.

**Aponjon:**
- Complete a session. Query `retrieval_state`: `current_interval_s` advanced for the faces you got right and dropped exactly one step for the ones you got wrong.
- Choose a sibling's name for a spouse on purpose. Check `error_type` = `semantic_near`, not `random`.
- Confirm the spoken prompt uses the kinship term.

### Why this matters
Dhol Bator is your cleanest measurement of reaction-time variability, because every other game confounds timing with a cognitive task. Aponjon is simultaneously an intervention, a measurement, and a daily memory aid — and "holds Priya's name for 8 minutes, was 2 in July" is a metric a family understands without any explanation.

---

# Block I — Xorai Milan & Ghorir Chobi

> **SPLIT** — Ghorir Chobi = Phase 9, Xorai Milan = Phase 14

### Before you start
Your content teammate should have delivered `assets.csv` and the cropped WebP images by now. If not, build against 20 placeholder images and swap later — do not block on assets.

### Prompt

```
Build the last two games. Read docs/architecture.md §7.3, §7.4 and §6 (timing).

Touch only:
  src/patient/games/xorai-milan/   (new files)
  src/patient/games/ghorir-chobi/  (new files)
  src/core/trace/                  (new — capture + replay, shared with Phase 8)
  scripts/build-asset-pack.ts      (new)
  supabase/migrations/0003_seed_assets.sql  (new)
  src/patient/session/SessionRunner.tsx     (register both)

=== PART A: XORAI MILAN ("Regional Memory Match") ===

Card-matching grid using NER cultural imagery.
- Grids by level: 2x2 -> 2x3 -> 3x4 -> 4x4, with card-visible duration
  shrinking as level rises. Cap the grid by severity (severe never exceeds 2x3).
- On a successful match: speak a one-line caption in the patient's language
  ("Kaziranga, the one-horned rhino"). This converts a memory task into a
  reminiscence prompt and it is why this game exists.
- DECK WEIGHTING — this matters clinically: bias the deck toward 1950s-70s
  everyday objects (hurricane lantern, transistor radio, brass utensils,
  treadle sewing machine, japi, xorai) over landmarks. Remote memory outlives
  recent memory: a rhino is recognition, a hurricane lantern is THEIR memory.
  Landmarks, festivals, fauna and produce fill the remainder. Implement as a
  weight on media_assets.era: vintage 0.6, contemporary 0.4.
- ERRORLESS: a non-match simply flips both back with no sound and no marking.
  After 3 non-matches in a row, briefly re-reveal one already-seen card as a
  hint and increment hints_used.
- Telemetry (attempts rows, game_type 'xorai_milan', domain 'attention'):
    revisit_rate      flips of an already-seen card / total flips  <- store as
                      a per-trial derived value in the summary, and store the
                      raw flip sequence as stimulus_id per attempt
    perseveration     the same non-matching pair flipped repeatedly
    first-flip to second-flip latency
    grid-position bias (touch_x, touch_y relative to card centre)

scripts/build-asset-pack.ts — takes a folder of source images plus assets.csv
(id, category, item_name_key, source_file, licence, source_url, region_tags,
era), square-crops, converts to WebP at <=200KB each, writes to
public/assets/cultural/, and emits 0003_seed_assets.sql inserting into
media_assets. licence and source_url are NOT NULL — refuse to process a row
missing either. "Where did the images come from" is a real judging question and
one column answers it.

=== PART B: GHORIR CHOBI ("Clock & Trace") ===

Finger-drawn clock with full stroke capture. This is the highest-value single
feature in the product.

src/core/trace/capture.ts:
- Canvas, touch-action: none, listeners with { passive: false }
- Use pointerrawupdate where available, pointermove as fallback
- On every event call getCoalescedEvents() and store EVERY point:
    { x, y, t }  where t = clock.now(), the session-relative monotonic offset
  Browsers batch pointer events to the frame rate. Without coalesced events you
  lose most of the trace and all of the fine timing.
- A stroke = pointerdown -> pointerup. Record stroke_start_ms, stroke_end_ms,
  and air_time_before_ms (gap since the previous stroke ended).

src/core/trace/replay.tsx — renders a stored stroke array as an animation at
recorded speed WITH THE PAUSES PRESERVED. Reused by the caregiver dashboard in
Phase 8. Respect prefers-reduced-motion: show the static final trace with pause
durations annotated instead.

Game:
- Condition 'command': speak "draw a clock, put in all the numbers, set the
  hands to ten past eleven" (>=12 words is fine here, it's the standard task).
- Condition 'copy': show a reference clock, reproduce it.
- Condition 'trace' for severe patients: trace a japi outline, a living-root-
  bridge arch, or a Naga shawl border. Same graphomotor signal, culturally
  warm, failure impossible.
- A large "I'm done" PatientButton. No timer. No countdown. No timeout.
- DO NOT SCORE THE CLOCK. No automated clock scoring, no shape recognition, no
  "correct/incorrect". Store the trace and the timing features. A caregiver
  watching last month's clock and this month's clock draw themselves side by
  side is a more powerful demo than any number, and it is entirely honest.
- Emit strokes rows plus one attempts row per condition (game_type
  'ghorir_chobi', domain 'perceptual_motor') carrying the derived features:
    pre_first_stroke_latency, post_clock_face_latency, pre_first_hand_latency,
    total_air_time, longest_latency, latency_variability, total_time,
    stroke_count
  Put these in a jsonb column or reuse existing numeric columns — tell me which
  and add a migration if needed.
```

### Verify
- Draw a clock slowly with two deliberate long pauses. Query the `strokes` rows. **Count the points.** If a 5-second stroke has ~300 points you have coalesced events working; if it has ~60 you do not — fix it, because the fine timing is the whole finding.
- `air_time_before_ms` between strokes is non-zero and matches your actual pauses.
- Replay the trace. The pauses are visible, in the right places, at the right length.
- Play Xorai Milan and check the deck: roughly 60% vintage everyday objects.
- Try to run `build-asset-pack.ts` with a CSV row missing a licence. It refuses.

---

# Block G — Adaptive difficulty & assistance layer

> **SPLIT** — assistance layer = Phase 6, adaptive difficulty = Phase 10

### Prompt

```
Build adaptive difficulty and the memory assistance layer.
Read docs/architecture.md §9 and docs/prd.md §5.1 (assistance layer).

Touch only:
  src/core/difficulty/staircase.ts  (new)
  src/patient/assist/               (new files)
  src/caregiver/settings/reminders/ (new files)
  src/patient/session/SessionRunner.tsx  (read level from difficulty_state)

=== PART A: ADAPTIVE DIFFICULTY ===

staircase.ts — a weighted staircase targeting ~85% success. 85 is high on
purpose: errorless learning wants the failure rate LOW, not optimal-challenge-
high.

  per (patient, game):
    starting level from severity gate: mild=3, moderate=2, severe=1
    rolling window = last 10 trials
    if window_accuracy >= 0.90 and hint_rate <= 0.10 :  level += 1
    if window_accuracy <= 0.60 or  hint_rate >= 0.40 :  level -= 1
    clamp to [1, severity_ceiling]
    NEVER move more than one level per session, in either direction

Persist to difficulty_state and mirror to Dexie so it works offline. It is
rule-based — do not add ML, do not call it AI. Elo, IRT and Bayesian Knowledge
Tracing were all evaluated and rejected on cold-start grounds.

=== PART B: ASSISTANCE LAYER ===

This is half the problem statement's title and most teams omit it entirely.
It is also the cheapest half to build. Do not skip it.

1. Reminders — medication, meals, routine.
   - Fire OFFLINE. Use the Notification API plus an in-app full-screen takeover
     if the app is foregrounded. Schedule via a service worker timer; on app
     open, catch up any that were missed while closed.
   - Each reminder plays audio: the caregiver's recorded voice note if one
     exists, otherwise pre-generated TTS. A grandchild's actual voice saying
     "Aita, it's time for your medicine" beats synthesised speech clinically
     and emotionally — prefer it always.
   - One giant "Done" PatientButton -> writes reminder_logs.acknowledged_at.
     No snooze (a snooze button is a decision, and decisions are expensive).

2. Family contacts — a grid of PatientCards: photo, name, KINSHIP TERM.
   One tap = tel: link. No dial pad, no contact list, no search.

3. SOS — one persistent, unmistakable button. Madder fill, white text, the word
   plus an icon. One tap calls the primary emergency contact (is_emergency).
   Confirmation dialog with exactly two options: call / go back. Both 72px.

4. Orientation card — always reachable from the patient home. Today's day, date,
   season, place, in 56px type, spoken on open. This is the reality-orientation
   board and it costs almost nothing.

5. Music player — the patient's own tracks, one big play/pause, one track list
   of PatientCards. Triggerable standalone (not only inside a session) because
   personalised music is used during agitation, not just during play.

6. Caregiver-side CRUD for reminders in settings, including voice-note recording
   per reminder.

Everything here works fully offline. Nothing here shows a number to the patient.
```

### Verify
- Force ten deliberately bad trials: level drops by **exactly one**, not more. Ten perfect ones: rises by exactly one.
- Set a reminder for 2 minutes out. Airplane mode. Lock the tablet. It fires, with audio.
- Close the app entirely, wait past a reminder time, reopen: the missed reminder is caught up.
- Tap SOS. Confirmation appears with two large options. Cancel works.

---

# Block J — Caregiver dashboard & analysis

> **SPLIT** — analysis pipeline = Phase 12, dashboard = Phase 13

### Prompt

```
Build the analysis pipeline and the caregiver dashboard.
Read docs/architecture.md §8 (analysis pipeline), §8.1 (low-effort
discriminator) and §8.2 (flag copy — use the EXACT wording, do not paraphrase),
plus docs/prd.md §2 (scope boundary) and docs/design.md §2.1.

Touch only:
  supabase/functions/nightly-rollup/   (new)
  supabase/functions/export-pdf/       (new)
  src/caregiver/dashboard/             (new files)
  supabase/migrations/0004_views.sql   (new)

=== PART A: EDGE FUNCTION nightly-rollup (Deno, service role) ===

Idempotent — safe to re-run any night. Runs on cron and on demand when the
caregiver opens the dashboard.

1. session_summaries: for each unsummarised session compute
     mean_rt_ms, sd_rt_ms, cv_rt = sd/mean   <- cv_rt IS the IIV measure
     accuracy_raw, accuracy_hint_adjusted, hint_rate
     domain_scores jsonb
   Use latency = responded_at_ms - presented_at_ms. Exclude omissions from RT
   stats but count them in accuracy.

2. baselines: once a patient has >= 10 COMPLETED sessions, freeze mean and SD
   per domain and set patients.baseline_status = 'established'.
   Until then, analyse NOTHING. The dashboard shows a "getting to know <name>"
   state. There are no published norms for these games in these languages, and
   Indian digital-clock data shows strong education and age effects, so every
   comparison is within-person by design — not by limitation.

3. flags, per domain:
     current = mean over last 7 days (require >= 4 sessions)
     z = (current - baseline_mean) / baseline_sd
     z < -1.5 sustained 14 days -> level 'amber'
     z < -2.0 sustained 14 days -> level 'red'
   Run EWMA (alpha = 0.3) alongside to smooth noise.

4. SUPPRESSION — apply all three, and record which one fired:
   a) < 4 sessions in the window -> suppressed_reason 'insufficient_data'.
      Below ~3 sessions/week the noise floor swamps any real signal and no
      honest system flags anything.
   b) an overlapping care_events row (illness / medication_change / hospital /
      travel) -> 'care_event'
   c) THE LOW-EFFORT SIGNATURE -> 'low_effort', and create a level 'effort'
      flag that prompts a PHQ-2 instead of a decline flag:
        high omission rate + long latency + early session abandonment +
        LOW hint usage  =  poor effort  -> PHQ-2 prompt
        high engagement + FULL hint usage + wrong answers = genuine difficulty
                                                          -> normal flag path
      Depressed patients give poor effort; dementia patients try hard and get
      it wrong. This discrimination is the most clinically sophisticated
      feature in the product and it costs almost nothing.

=== PART B: DASHBOARD ===

Caregiver mode, per docs/design.md §2.1. Sections divided by 1px hairlines, not
cards. The ONLY carded element is a flag, because a flag is a discrete object
that gets acknowledged.

1. Per-domain trend lines (Recharts) with the personal baseline band shaded in
   brassSoft at 40%. Tabular numerals on every axis.
2. Session compliance calendar — played / missed, using generate_series in a
   SQL view so gaps are real gaps.
3. Flag cards. USE THIS EXACT COPY, do not rewrite it:
     "Memory scores have been lower than usual for the past two weeks. This can
      happen for many reasons - illness, poor sleep, a change in medication, or
      low mood. It may be worth mentioning at the next doctor's visit."
   Substitute the domain name; keep the structure. An "Acknowledge" action and
   a "Log something that happened" action that creates a care_event.
   BANNED anywhere in this UI: "decline detected", "condition worsening",
   "stage", "diagnosis", "screening result", "risk score".
4. CLOCK TRACE REPLAY — the emotional centrepiece. Two traces from different
   months, side by side, replaying at recorded speed with pauses preserved,
   using src/core/trace/replay.tsx. A month selector for each side. This is the
   single most persuasive thing in the product: the hesitation IS the finding.
5. Sustained retrieval interval per family member, phrased for a human:
   "Holds Priya's name for 8 minutes, was 2 minutes in July."
6. SyncStatus from Phase 3.
7. The disclaimer from docs/prd.md §2, always visible, not in a collapsed
   accordion.

=== PART C: export-pdf ===

An Edge Function producing a one-page A4 PDF for a doctor's appointment:
patient name, age, education level, date range, per-domain trend sparklines,
any active flags with their copy, adherence rate, and the full disclaimer.
No diagnosis, no stage, no interpretation. It is a data summary the family
carries to an appointment — deliberately not a clinician portal, because a
portal nobody logs into is worse than a PDF a family actually brings.
```

### Verify
- Seed a synthetic gradual decline. A flag appears at the right z threshold.
- Add a `care_event` overlapping it. **The flag is suppressed with reason `care_event`.**
- Seed the low-effort signature (high omissions, long latencies, low hint use, early abandonment). A PHQ-2 prompt appears — **not** a decline flag.
- Seed a patient with 6 sessions. Nothing is analysed; the "getting to know" state shows.
- Export the PDF. Read every word. It contains the disclaimer and none of the banned strings.
- Grep the whole `src/caregiver/` tree for the banned strings. Zero hits.

---

# Block F — Language layer & audio pipeline

> **MOVED UP** — run as Phase 5, before any game

### Before you start
You need Bhashini API access. Apply in Phase 0 — approval takes time. If it has not come through, the pipeline should fall back to AI4Bharat Indic-TTS open weights (Assamese, Bodo, Manipuri) run locally.

### Prompt

```
Build the language layer. Read docs/architecture.md §10 and docs/design.md §3, §9.

Touch only:
  src/core/i18n/               (new files)
  i18n/*.json                  (new)
  scripts/generate-audio.ts    (new)
  src/core/audio/speak.ts      (replace the Phase 4 stub)
  public/fonts/                (add Meetei Mayek subset)
  vite.config.ts               (precache the new audio)

THE ARCHITECTURAL RULE: no Bhashini call ever happens at runtime. Everything is
pre-generated at build time and precached. The app must run a full session with
the network off and ZERO requests.

1. i18n/en.json — the flat-key source of truth. Every patient-facing string.
   Keys are dot-namespaced: orientation.*, aponjon.*, dhol.*, milan.*,
   ghorir.*, assist.*, kin.*, close.*
   RULES for every patient string: present tense, active voice, <= 12 words,
   sentence case. The strings "wrong", "incorrect", "try again", "failed",
   "error" MUST NOT appear in any patient-mode key. Add a test asserting this.

2. THE KINSHIP TABLE — kin.* keys. This is the real localisation work and it is
   what makes this an NER product rather than a generic app with a language
   toggle. Assamese, Khasi and Mizo distinguish relationships English collapses:
   paternal vs maternal, elder vs younger. Khasi is matrilineal, so the maternal
   uncle (kni) is a structurally central relationship, not a peripheral one.
   Produce a table of kinship keys per language and expose it in onboarding so
   the caregiver picks the correct term rather than typing "uncle".
   Ask me for the term list per language — do NOT invent kinship terms. Getting
   one wrong in front of a judge from the region is worse than not having them.

3. Translations for: as (Assamese), brx (Bodo), mni (Manipuri/Meitei), ne
   (Nepali), hi (Hindi). Ship kha (Khasi) and lus (Mizo) strings too; their
   audio is best-effort.

4. scripts/generate-audio.ts:
   - reads every key from every i18n/{lang}.json
   - calls Bhashini TTS per string (rate-limit, retry, resume from partial)
   - renders slightly SLOWER than default speed
   - prepends 800ms of silence to every file so the first word is not clipped
     by playback start
   - writes public/audio/{lang}/{key}.mp3
   - emits a manifest and refuses to complete if any key is missing audio
   Ask me for the Bhashini API key; I'll put it in .env.local. Never hardcode it.

5. speak.ts — plays public/audio/{lang}/{key}.mp3 from the precache. Zero
   network. If a file is missing, log it and continue silently (never show the
   patient an error). Family voice notes take priority over TTS wherever one
   exists for that content.

6. Fonts: load ONLY the Noto Sans subsets the selected language needs. Shipping
   Latin + Bengali + Devanagari + Meetei Mayek to every device blows the
   precache budget.

7. vite.config.ts: precache all of public/audio/. Print the total precache size
   at build time and FAIL the build if it exceeds 40MB — an oversized precache
   fails silently on device and kills the demo.
```

### Verify
- Switch to Assamese. **Open the network tab. Airplane mode. Complete a full session.** Zero requests. Every prompt spoken.
- Check that only the Bengali-Assamese font subset loaded, not all four.
- Check the build output's precache size against the 40 MB budget.
- Run the banned-string test on `i18n/`.
- Show the kinship terms to someone from the region if you possibly can. This is the detail that either lands or embarrasses.

---

# Block K — Seed, harden, demo

> **SPLIT** — seed = Phase 11, harden + demo = Phase 15

### Prompt

```
Final phase: seed data, hardening, deployment, demo assets.

Touch only:
  scripts/seed-telemetry.ts    (new)
  tests/invariants.test.ts     (new)
  README.md                    (new)
  vercel.json                  (new)

1. scripts/seed-telemetry.ts — 60 days of realistic telemetry for THREE
   synthetic patients. Realistic means: 4-5 sessions/week not 7, occasional
   abandoned sessions, plausible RT distributions (roughly log-normal, mean
   1200-2500ms depending on domain and severity), hint rates that track
   difficulty, and reaction-time variability that rises with the decline.

   Patient A "stable"    — flat trend, normal day-to-day noise. No flag fires.
   Patient B "declining" — gradual decline in memory and executive over weeks.
                           An amber flag then a red flag fire at the right times.
   Patient C "confound"  — a sharp 10-day drop that fully resolves, with a
                           care_events row (illness) covering it. THE FLAG MUST
                           BE SUPPRESSED with reason 'care_event'. This patient
                           exists purely to demo the suppression logic, which is
                           the thing that shows we understand the domain.

   Also seed strokes for A and B across two months so the clock replay
   comparison has real data on both sides.

2. tests/invariants.test.ts — automated checks of docs/rules.md §2:
   - no "Date.now()" in src/core/telemetry/ or src/patient/ (with allowlist)
   - the banned clinical strings ("diagnosis", "diagnose", "decline detected",
     "condition worsening", "stage", "screening result", "risk score", "MMSE",
     "MoCA") appear NOWHERE in src/ or i18n/
   - the banned patient strings ("wrong", "incorrect", "try again", "failed",
     "error") appear in no patient-mode i18n key
   - every media_assets row has a non-null licence and source_url
   - src/patient/** contains no import from caregiver, and vice versa

3. Performance: run the seeded volume and check the dashboard queries. Add
   indexes if anything is slow. Report the numbers to me.

4. Deploy to Vercel. vercel.json with SPA rewrite. Confirm the PWA installs
   from the production URL and that offline works there — not just on localhost.

5. README.md: what it is, the scope boundary, the stack, how to run, how to
   seed, and the four demo links.
```

### Verify — this is the submission checklist

- [ ] Hosted URL live, PWA installs from it, **offline works in production**
- [ ] Source repo public
- [ ] `tests/rls.test.ts`, `tests/sync.test.ts`, `tests/clock.test.ts`, `tests/invariants.test.ts` all green
- [ ] Three seeded patients, all three flag behaviours demonstrable
- [ ] Clock replay shows two months side by side with visible pause differences
- [ ] **3-minute demo video** in this order: onboarding (fast) → patient session → **airplane mode toggled mid-session** → reconnect and sync → caregiver dashboard trend → flag with its non-diagnostic copy → care_event suppression → clock replay side by side
- [ ] Figma link live
- [ ] All four links on the idea slide

---

## Standing troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Asynchronies in the hundreds or thousands of ms | Audio clock mixed with DOM clock | Both the beat and the tap must be `audioCtx.currentTime` |
| Stroke has ~60 points for 5 seconds of drawing | Coalesced events not captured | `getCoalescedEvents()` on every `pointerrawupdate` |
| RT variability looks noisy and implausible | `Date.now()` leaked into the telemetry path | Grep. `performance.now()` only. |
| Duplicate rows after reconnect | `onConflict` not set, or wrong column | `upsert(..., { onConflict: 'client_event_id', ignoreDuplicates: true })` |
| Offline works on localhost, fails in production | Precache over quota, or SW scope wrong | Check the build's precache size; check SW registration scope |
| A caregiver sees another's data | A missing `WITH CHECK`, or RLS not enabled on that table | Re-run `tests/rls.test.ts` and read the failing policy |
| First word of every prompt is clipped | No head silence in the audio | 800 ms silence at the head of every file |
| Agent starts refactoring unrelated files | Prompt was too vague | Re-issue naming the exact files and adding "do not scan the rest" |
