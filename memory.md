# memory.md — Xorai build state

The agent updates this at the end of every phase. Humans read the top three lines.

**Current phase:** Block I — Xorai Milan & Ghorir Chobi (Phases 9 & 14) (completed)
**Last file worked on:** `memory.md`
**Next action:** Phase 5 — Voice & language pipeline (Block F in `docs/buildbook.md`) or Phase 6 — Assistance layer (Block G in `docs/buildbook.md`)
**Last updated:** 2026-09-11

---

## Phase status

| # | Phase | Status | Exit criterion met? | Commit |
|---|---|---|---|---|
| 0 | Foundation, tooling, first deploy | done | ☑ scaffolding complete; boundary lint rules & build passing | `42dba45` |
| 1 | Design system, patient shell, i18n scaffold | done | ☑ 60 px targets, 7:1 contrast; tokens, primitives, patient & caregiver shells, /demo harness | `10c8791` |
| 2 | Supabase — schema, RLS, auth, consent | done | ☑ schema & RLS migrations written, auth, onboarding, consent, rls.test.ts | `aa27e5e` |
| 3 | Offline layer | done | ☑ airplane-mode session survives force-quit, syncs with zero dupes; sync.test.ts passing | `0d7d8dc` |
| 4 | Telemetry SDK, clock, orientation | done | ☑ `tests/clock.test.ts` green (8/8); hesitation computable from real rows | `8e57e00` |
| 5 | Voice & language pipeline | not started | ☐ full Assamese session offline, zero requests on the patient path | — |
| 6 | Assistance layer | not started | ☐ reminder fires with audio offline; kinship terms spoken correctly | — |
| 7 | Dhol Bator | done | ☑ asynchronies in tens of ms, not hundreds; rhythm.test.ts passing | `6aa4bef` |
| 8 | Aponjon | done | ☑ retrieval intervals advance, drop back, and survive a restart; aponjon.test.ts passing | `6aa4bef` |
| 9 | Ghorir Chobi | done | ☑ point count >> frame count; replay shows pauses in the right places | — |
| 10 | Adaptive difficulty | not started | ☐ level moves exactly one step, offline, and survives a reload | — |
| 11 | Seed telemetry | not started | ☐ 60 days x 3 patients; index performance checked at volume | — |
| 12 | Analysis pipeline | not started | ☐ flag fires; care_event suppresses it; low effort routes to mood check-in | — |
| 13 | Caregiver dashboard | not started | ☐ PDF exports with disclaimer and no banned string | — |
| 14 | Xorai Milan | done | ☑ revisit rate computable and plausible; vintage weighting 60/40 | — |
| 15 | Harden, languages, demo | not started | ☐ four links live; all four test suites green | — |

Status values: `not started` · `in progress` · `blocked` · `done`

---

## Completed phases log

### Block I — Xorai Milan & Ghorir Chobi (Phases 9 & 14)
- **Status:** done
- **Files created:**
  - `src/patient/games/xorai-milan/` (`XoraiMilanGame.tsx`, `deck.ts` with era weighting, grid caps, layout)
  - `src/patient/games/ghorir-chobi/` (`GhorirChobiGame.tsx`, `shapes.tsx` with reference figures & trace shapes)
  - `src/core/trace/` (`capture.ts` single-branch pointer capture & derived features, `replay.tsx` animated trace replay)
  - `scripts/build-asset-pack.ts` (strict asset pack validation, WebP conversion, SQL seed emitter)
  - `supabase/migrations/0004_attempt_features.sql` (`attempts.features` jsonb column & index)
  - `tests/milan.test.ts` (11/11 tests: vintage 60/40 weighting, grid caps, trace features, non-scoring verification)
- **Files modified:**
  - `src/patient/session/SessionRunner.tsx` (registered real `ghorirChobiGame` and `xoraiMilanGame`, removed stubs)
  - `src/core/telemetry/types.ts` (added `features` to `AttemptEvent` and `EmittedAttempt`)
  - `src/core/telemetry/emit.ts` (handled `features` default in `emitAttempt`)
  - `src/core/db/schemas.ts` (validated `features` in `attemptEventSchema`)
  - `i18n/en.json` (prompt strings and translations for Ghorir Chobi and Xorai Milan)
  - `tests/sync.test.ts` (updated attempt fixtures for `features`)
  - `CLAUDE.md` (updated tree and stroke capture / non-scoring / deck contracts)
  - `memory.md` (updated build state, files, notes, and log)
- **Deferred / surprises:**
  - `setPointerCapture` throws `InvalidPointerId` when pointer is no longer tracked; wrapped in try/catch to avoid losing entire strokes.
  - Calling `getCoalescedEvents()` on `pointerrawupdate` returns only that event, resulting in fewer points than plain `pointermove` + coalesced. Selected single branch at subscribe time (`raw_capture` feature).
  - Derived clock features live in `attempts.features jsonb` (migration 0004) rather than separate columns, facilitating offline dashboard replay without parsing raw strokes.
  - The clock is strictly never scored: `attempts.correct` is NULL, never false, and features exclude any accuracy/score keys.
  - In Xorai Milan, matched pairs stay face-up with a brass frame instead of disappearing, providing a reassuring sense of accomplishment.
  - `scripts/build-asset-pack.ts` refuses CSV rows missing `licence` or `source_url`. Image conversion requires build-time `sharp` (needs approval).
- **Next phase:** Phase 5 — Voice & language pipeline (Block F in `docs/buildbook.md`) or Phase 6 — Assistance layer (Block G in `docs/buildbook.md`).

---

### Block H — Dhol Bator & Aponjon (Phases 7 & 8)
- **Status:** done
- **Files created:**
  - `src/patient/games/dhol-bator/` (`DholBatorGame.tsx`, `DholHead.tsx`, `patterns.ts`)
  - `src/patient/games/aponjon/` (`AponjonGame.tsx`, `kinship.ts`, `demoFamily.ts`)
  - `src/core/audio/` (`context.ts` single audio context + sample cache, `scheduler.ts` lookahead audio scheduler)
  - `src/core/difficulty/spaced-retrieval.ts` (spaced retrieval state machine, exponential intervals, single-step fallback)
  - `public/audio/drums/` (`dhol-high.wav`, `dhol-low.wav`, `gogona.wav`, `pepa.wav`, `SOURCE.md`)
  - `tests/rhythm.test.ts` (8/8 tests: timing, lookahead scheduling, audio clock alignment)
  - `tests/aponjon.test.ts` (16/16 tests: spaced retrieval progression, kinship hierarchy, error classification)
- **Files modified:**
  - `src/patient/session/SessionRunner.tsx` (registered real games in game roster and selection)
  - `src/patient/session/GameHost.tsx` (passes audio context and helpers to game components)
  - `src/core/telemetry/types.ts` (audio and attempt types updated)
  - `i18n/en.json` (prompt strings and feedback for Dhol Bator and Aponjon)
  - `CLAUDE.md` (updated tree and audio clock / rhythm timing contracts)
  - `memory.md` (updated build state, notes, and log)
- **Deferred / surprises:**
  - Guarded against suspended `AudioContext` hanging `currentTime` or freezing callbacks with `resumeWithTimeout` and playback watchdog.
  - Pattern intervals must not be isochronous to ensure true rhythm recall rather than tapping at arbitrary speed.
  - Spaced retrieval drops back exactly one rung on failure and never decreases `longest_interval_s`.
  - Error classification follows strict priority: perseveration > intrusion > semantic_near > random.
  - Kinship term definitions use structured metadata; vernacular vocabulary deferred to language packs.
- **Next phase:** Phase 5 — Voice & language pipeline (Block F in `docs/buildbook.md`) or Phase 9 — Ghorir Chobi (Block I in `docs/buildbook.md`).

---

### Phase 4 — Telemetry SDK, clock, orientation
- **Status:** done
- **Files created:**
  - `src/core/telemetry/clock.ts` (single wall-clock `Date.now()` at session start, `performance.now()` session clock, pointer delta interval getter, audio clock anchor)
  - `src/core/telemetry/emit.ts` (void-returning `emitAttempt`, `emitStroke`, `emitRhythmTrial` writing to Dexie outbox)
  - `src/patient/session/store.ts` (zustand session store with phase machine, 15-minute cap, attempt counters)
  - `src/patient/session/GameHost.tsx` (sandboxed `GameContext` injector, auto-fills IDs and offsets)
  - `src/patient/session/SessionRunner.tsx` (session lifecycle orchestrator, orientation warm-up, and close screen transitions)
  - `src/patient/session/CloseScreen.tsx` (bamboo grove completion screen with warm reassuring copy)
  - `src/patient/orientation/OrientationGame.tsx` (4 daily orientation questions, errorless UI, 3-attempt guidance ladder)
  - `src/patient/orientation/questions.ts` (pure question generator: time of day, day of week, season, home place)
  - `src/patient/orientation/SeasonMark.tsx` (hand-drawn season marks)
  - `tests/clock.test.ts` (8/8 passing tests enforcing the `Date.now()` ban in telemetry, anchor monotonicity, and pointer delta calculation)
- **Files modified:**
  - `src/core/telemetry/types.ts` (added `EmittedAttempt`, `EmittedStroke`, `EmittedRhythmTrial`)
  - `src/app/router.tsx` (connected `SessionRunner` to `/p` route)
  - `i18n/en.json` (orientation question strings, options, and completion messages)
  - `CLAUDE.md` (updated tree and telemetry clock / GameHost contracts)
  - `memory.md` (updated build state, notes, and log)
- **Deferred / surprises:**
  - Prevented component re-mount loops by hoisting placeholder patient object out of `PatientRoute` render body.
  - `clock.fromAudio()` throws explicitly without an active `AudioContext` to avoid silent timestamp corruption.
  - `pointerSampleIntervalMs` is a dynamic getter reading real touch deltas or animation frames.
  - `Date.now()` grep test strips comments to allow descriptive code documentation.
- **Next phase:** Phase 5 — Voice & language pipeline (Block F in `docs/buildbook.md`).

---

### Phase 3 — Offline layer
- **Status:** done
- **Files created:**
  - `src/core/db/dexie.ts` (Dexie v1 schema with 10 stores: outbox, state stores, cached summaries)
  - `src/core/db/schemas.ts` (zod schemas for outbox rows and telemetry validation)
  - `src/core/db/outbox.ts` (void-returning `queueSession`, `queueAttempt`, `queueStroke`, `queueRhythmTrial`)
  - `src/core/db/sync-engine.ts` (batch sync engine, exponential backoff, foreign-key ordered flushes, pruning)
  - `src/sw.ts` (Service Worker with precaching and runtime caching)
  - `src/caregiver/dashboard/SyncStatus.tsx` (offline/syncing/synced visual indicator with relative timestamps)
  - `src/caregiver/dashboard/CaregiverHome.tsx` (caregiver home landing screen)
  - `tests/sync.test.ts` (9/9 passing tests for Dexie outbox and sync engine)
  - `public/icons/` (PWA icon placeholders)
- **Files modified:**
  - `vite.config.ts` (registered `VitePWA` with `injectManifest`, 25 MB precache budget check in `closeBundle`)
  - `src/app/providers.tsx` (`syncEngine.start()` at app root)
  - `src/app/router.tsx` (integrated `CaregiverHome` and routes)
  - `src/patient/shell/PatientShell.tsx` (offline patient shell resilience)
  - `src/core/supabase/client.ts` (`getSupabase()` lazy client preventing module-load throws)
  - `i18n/en.json` (sync status translation keys)
  - `CLAUDE.md` (updated tree and contracts for Dexie, outbox, sw, and precache check)
  - `memory.md` (updated build state, notes, and log)
- **Deferred / surprises:**
  - IndexedDB rejects `null` as key: `flushed_at` is `number` with `0` for unflushed and `-1` for quarantined.
  - Outbox queue functions return `void` to prevent awaiting network in interaction handlers.
  - Precache budget assertion runs as a `sequential`/`post` `closeBundle` hook.
  - `getSupabase()` lazy initialization prevents missing `.env.local` from breaking offline and tests.
  - Zod `.nullable()` requires explicit `null` rather than `undefined` for optional telemetry fields.
- **Next phase:** Phase 4 — Telemetry SDK, clock, orientation (Block E + amendment 2 in `docs/buildbook.md`).

---

### Phase 2 — Supabase: schema, RLS, auth, consent
- **Status:** done
- **Files created:**
  - `supabase/migrations/0001_init.sql` (13 tables, CHECK constraints, indexes, `client_event_id` UNIQUE)
  - `supabase/migrations/0002_rls.sql` (RLS policies, storage buckets & policies, column grants for consents/flags)
  - `src/core/supabase/client.ts` (typed singleton client, env var guards)
  - `src/core/i18n/index.ts`, `src/core/i18n/languages.ts`, `i18n/en.json` (i18n scaffold + English string catalog)
  - `src/caregiver/auth/` (`AuthProvider`, `RequireAuth`, `SignIn`, `SignUp`, `ResetPassword`, `api.ts`, `Form.tsx`)
  - `src/caregiver/onboarding/` (`OnboardingFlow`, `schema.ts`, `api.ts`, `VoiceNoteRecorder`, `steps/Step1_Patient`, `steps/Step2_Clinical`, `steps/Step3_Family`, `steps/Step4_Music`, `steps/Step5_Routine`, `steps/Step6_Consent`)
  - `src/caregiver/settings/ConsentSettings.tsx` (DPDP withdrawal and scope deletion flow)
  - `tests/rls.test.ts` (cross-caregiver isolation, append-only consent, derived table revokes)
- **Files modified:**
  - `src/app/router.tsx` (auth routes `/auth/login`, `/auth/signup`, `/auth/reset`, `/onboarding`, `/settings/consent`)
  - `CLAUDE.md` (updated tree, contracts, i18n, RLS column grants)
  - `memory.md` (updated build state, notes, and log)
- **Deferred / surprises:**
  - Four deviations from `architecture.md §4` noted in `0001_init.sql`: `patients.severity` and `family_members.photo_path` nullable for step-by-step onboarding; `retrieval_state.updated_at` added.
  - `window` is a reserved SQL word and was quoted in `difficulty_state."window"`.
  - Append-only `consents` and read-only derived tables enforced via PostgreSQL `REVOKE`/`GRANT` at column level.
  - `tests/rls.test.ts` requires real Supabase instance and test accounts in `.env.local` (`VITE_RLS_TEST_*`).
- **Next phase:** Phase 3 — Offline layer (Block D + amendment 3 in `docs/buildbook.md`).

---

### Phase 1 — Design system, patient shell, i18n scaffold
- **Status:** done
- **Files created:**
  - `src/styles/tokens.css` (full design tokens from `docs/design.md §2` and `[data-mode="caregiver"]`)
  - `tailwind.config.ts` (extended theme colors, patient font scale, touch spacing: 60px touch, 72px touchLg)
  - `public/fonts/fonts.css` + 14 self-hosted woff2 font files (Noto Sans Latin/Devanagari/Bengali, Inter)
  - `src/ui/cn.ts` (custom tailwind-merge config extending font-size group)
  - `src/ui/PatientButton.tsx`, `src/ui/PatientCard.tsx`, `src/ui/Prompt.tsx`, `src/ui/ReplayAudioButton.tsx` (patient primitives adhering to 60px/72px targets, visible borders, fills, focus outlines)
  - `src/patient/shell/PatientShell.tsx`, `src/patient/shell/WovenSessionBorder.tsx`, `src/patient/shell/weave.ts`, `src/patient/shell/ExitGuard.tsx`, `src/patient/shell/useKioskLocks.ts`
  - `src/caregiver/AppShell.tsx` (`CaregiverAppShell`, `CaregiverSection`, `CaregiverFlagCard`)
- **Files modified:**
  - `index.html` (meta tags, viewport lock, fonts.css import)
  - `src/app/router.tsx` (added `/demo` harness route)
  - `CLAUDE.md` (updated tree, stack, and tailwind-merge font-size contract)
  - `memory.md` (updated build state, files, and notes)
- **Deferred / surprises:**
  - `tailwind-merge` silent drop of custom font sizes in `cn()` — fixed in `src/ui/cn.ts`.
  - `ExitGuard` uses timer-based threshold instead of rAF accumulator.
  - `--ring` and `--brass-deep` tokens did not exist in design tokens; adapted to token rules.
  - Focus ring uses `--focus` (8.35:1 contrast) instead of brass (2.91:1).
  - Woven border thickness uses responsive clamp `clamp(12px, 2.6vh, 16px)`.
- **Next phase:** Phase 2 — Supabase: schema, RLS, auth, consent (Block C in `docs/buildbook.md`).

---

### Phase 0 — Foundation & scaffolding
- **Status:** done
- **Files created:**
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `eslint.config.js`, `.env.example`
  - `CLAUDE.md` (master index), `.claude/rules/{rules,design}.md` (copies)
  - `src/main.tsx`, `src/app/router.tsx`, `src/app/providers.tsx`, `src/core/telemetry/types.ts`, `src/styles/tokens.css` (empty)
  - Full folder tree with `.gitkeep` placeholders
- **Files moved:** `prd.md`, `architecture.md`, `design.md`, `rules.md`, `phases.md`, `buildbook.md`, `audit.md` — root -> `docs/`. Block A's "Before you start" required this and it had not been done; `rules.md` §2 also scopes the banned-string grep to exclude `docs/`.
- **Verification:** `npm run build` passed (Vite + TS), `npm run lint` passed (ESLint boundary rules verified).
- **Deferred / surprises:**
  - Vercel live deploy deferred to project environment setup.
  - See Notes & gotchas below for dependency decisions and configs.
- **Next:** Phase 1 — Design system, patient shell, i18n scaffold (Block B + amendment 1 in `docs/buildbook.md`).

---

### One-time Git setup
- **Status:** done
- **Files created or changed:**
  - `.gitignore` (created) — configured exclusions for `.env`, `.env.local`, `.env*.local`, `*.local`, `node_modules/`, `dist/`, `.vercel/`, `supabase/.temp/`, `coverage/`
  - `memory.md` (updated) — tracking build state and completed setup
- **Deferred / Surprises:**
  - None deferred.
  - Remote origin linked to `https://github.com/ksaihavish/Xorai.git`.
- **Next phase:** Phase 0 — Foundation, tooling, first deploy (Block A in `buildbook.md`)

---

## Files by area — fill in as they land

| Area | Path | State |
|---|---|---|
| Master context | `CLAUDE.md` | written |
| Telemetry contract | `src/core/telemetry/types.ts` | written — types + `features` jsonb |
| Boundary lint rule | `eslint.config.js` | written and verified |
| Design tokens | `src/styles/tokens.css` | written |
| Tailwind theme | `tailwind.config.ts` | written |
| Fonts | `public/fonts/` | 14 woff2 subsets + `fonts.css`, 1.19 MB |
| Patient primitives | `src/ui/` | `cn`, `PatientButton`, `PatientCard`, `Prompt`, `ReplayAudioButton` |
| Caregiver shell | `src/caregiver/AppShell.tsx` | written |
| Design harness | `/demo` route | written |
| Patient shell | `src/patient/shell/` | `PatientShell`, `WovenSessionBorder`, `weave.ts`, `ExitGuard`, `useKioskLocks` |
| Session runner | `src/patient/session/` | `SessionRunner`, `GameHost`, `store.ts`, `CloseScreen` |
| Clock + emit | `src/core/telemetry/` | `clock.ts`, `emit.ts`, `types.ts` |
| Orientation | `src/patient/orientation/` | `OrientationGame`, `questions.ts`, `SeasonMark` |
| Games | `src/patient/games/{aponjon,dhol-bator,xorai-milan,ghorir-chobi}/` | all four games written (`DholBatorGame`, `AponjonGame`, `GhorirChobiGame`, `XoraiMilanGame`) |
| Assistance | `src/patient/assist/` | — |
| Onboarding | `src/caregiver/onboarding/` | 6 steps + api + zod schemas |
| Dashboard | `src/caregiver/dashboard/` | — |
| Offline | `src/core/db/` | `dexie.ts`, `schemas.ts`, `outbox.ts`, `sync-engine.ts` |
| Service worker | `src/sw.ts` | precache + runtime caches |
| Sync indicator | `src/caregiver/dashboard/SyncStatus.tsx` | caregiver mode only |
| PWA icons | `public/icons/` | **placeholders, replace before submission** |
| Telemetry | `src/core/telemetry/` | types + clock + emit (features support) |
| Supabase client | `src/core/supabase/client.ts` | written; `types.ts` not yet generated |
| Auth | `src/caregiver/auth/` | email+password, reset, phone OTP behind the flag |
| Consent + withdrawal | `src/caregiver/settings/ConsentSettings.tsx` | written |
| i18n | `src/core/i18n/` + `i18n/en.json` | scaffold + games / orientation / sync catalog |
| Audio | `src/core/audio/` | `context.ts`, `scheduler.ts` |
| Trace | `src/core/trace/` | `capture.ts`, `replay.tsx` |
| Migrations | `supabase/migrations/` | `0001_init.sql`, `0002_rls.sql`, `0004_attempt_features.sql` — **written, not applied** |
| Edge Functions | `supabase/functions/` | — |
| Scripts | `scripts/` | `build-asset-pack.ts` |

---

## Content production (parallel track — teammates, not the agent)

| Owner | Deliverable | Needed by | State |
|---|---|---|---|
| 1 | Cultural asset library: 150+ images across the 7 categories, weighted to 1950s–70s everyday objects. `assets.csv` with `id, category, item_name_key, image_file, licence, source_url, region_tags, era` + square-cropped WebP ≤200 KB. Wikimedia Commons / GoI tourism / own photos only — **no scraping**. | Phase 14 | — |
| 2 | Language pack: translations for as, brx, mni, ne, hi (+ kha, lus strings) from the `i18n/en.json` key list, and the **kinship term table per language**. | **Phase 5 — this is now the earliest external dependency in the build. Start it first.** | — |
| 3 | Dhol / gogona / pepa samples, short WAVs, CC0 or team-recorded, with licence noted. | Phase 7 | — |
| 4 | Demo script, 3-minute video, and the deck. | Phase 15 | — |
| 5 | Music library or the caregiver-upload content flow, plus all disclaimer, consent, and flag copy in plain language. | Phase 6 | — |

---

## Notes & gotchas

*Append as you hit them. This section is why future-you doesn't repeat a two-hour debug.*

- Pre-seeded, from `buildbook.md`: audio-clock/DOM-clock mixing is the most likely bug in the build. If `asynchronies` are in the hundreds of ms, that is what happened.
- Pre-seeded: coalesced pointer events are easy to forget and the failure is silent — the trace just looks fine and has 5× too few points.
- Pre-seeded: Tailwind stays pinned at 3.4.x with no caret. Do not let a dependency bump move it.
- Pre-seeded: `difficulty_state` and `retrieval_state` do NOT use the telemetry idempotency rule. Last-write-wins on a server `updated_at`. Using `ignoreDuplicates` here loses the newer value silently.
- Pre-seeded: reminders do not fire on a locked screen in a PWA. Kiosk mode is the v1 answer — tablet awake, app foregrounded.
- Pre-seeded: `cv_rt` is per game_type. Pooling reaction times across games makes the headline metric measure which games were played, not the person.
- **Phase 9: `setPointerCapture` throws** (`InvalidPointerId`) when the browser no longer tracks the pointer, and an unguarded call inside `pointerdown` aborts the handler — losing the ENTIRE stroke, silently. Now wrapped in try/catch. Pointer capture is an optimisation; never let it cost the data.
- **Phase 9: the prompt asked for `getCoalescedEvents()` on every event, which contradicts `rules.md` 2 and would have made the trace WORSE.** Called on a `pointerrawupdate`, it returns only that one event, so the combination captures fewer points than plain `pointermove` + coalesced — and it fails silently. `capture.ts` picks one branch at subscribe time and records which in `features.raw_capture`.
- Phase 9: derived clock features live in `attempts.features jsonb` (migration 0004), not in new numeric columns. They are recomputable from `strokes`, but the rollup should not parse thousands of points to read eight numbers, and the dashboard renders offline after strokes are pruned.
- Phase 9: `attempts.correct` is NULL for ghorir_chobi, never false. There is no right answer to record and writing `false` would be scoring the clock by the back door.
- Phase 14: a matched pair does NOT vanish — it stays face up with a brass frame. An emptying board is a record of what is gone; a filling one is a record of what was remembered.
- Phase 14: `scripts/build-asset-pack.ts` REFUSES a CSV row missing `licence` or `source_url`. It fails, it does not warn. It needs `sharp` (build-time only, NOT installed, NOT in rules.md 3) — until approved it validates and emits SQL but skips conversion.
- **Phase 7, the trap: a SUSPENDED AudioContext.** Its `currentTime` does not advance, and that breaks three separate things silently. (1) `await ctx.resume()` can stay PENDING forever when audio is blocked — it hung a probe for 45 s, and in production would freeze a game with no error, which design.md 6 forbids showing anyway. (2) Playback reports finishing by comparing `currentTime` to the last onset, so it never fires and the game sticks in the listen phase. (3) Every tap reads the SAME frozen value, producing inter-tap intervals of 0 and a tidy set of entirely fictional asynchronies. All three are now guarded — `resumeWithTimeout`, a playback watchdog, and a `clockRunning` check that writes EMPTY arrays and `completed: false` rather than fabrications. **Never let a frozen clock write a timing row.**
- Phase 7: `tests/rhythm.test.ts` caught a flaw in my own game content — span 3's pattern was `[600, 600]`, isochronous, so a patient could reproduce it by tapping at a steady rate without remembering anything. Every pattern with 2+ intervals must now vary.
- Phase 7: game selection is working when it looks broken. A session that ran the two stubs instead of the two real games was the rotation correctly avoiding the pair played last session. Clear `games_last_played` / `games_last_pair` in `sync_meta` to force a specific pair while testing.
- Phase 8: spaced retrieval drops back exactly ONE rung on a miss, never to zero, and `longest_interval_s` never decreases. A bad afternoon is usually an infection, not a change in the person.
- Phase 8: error typing order is perseveration > intrusion > semantic_near > random, most informative first — a wrong answer often satisfies several at once.
- Phase 8: `kinship.ts` defines the STRUCTURE (paternal vs maternal, elder vs younger) with English glosses only. **No Assamese, Khasi or Mizo words are invented** — owner 2 supplies those. A confidently wrong kinship term spoken to an elder is worse than an English one.
- **Phase 4: never build a prop object inline in a component that feeds `useMemo`/`useEffect` deps.** `PatientRoute` created the placeholder `LocalPatient` as an object literal per render; every downstream dep changed identity each pass, `SessionRunner` restarted the session every render, and the renderer **locked up** rather than throwing. Hoisted to module scope. `buildOrientationQuestions` now takes `{ home_place }` rather than a whole `LocalPatient`, so no component can memoise on object identity again.
- Phase 4: `clock.fromAudio()` throws without an AudioContext instead of returning 0/NaN. Phase 7 (Dhol Bator) must pass one to `createSessionClock()`. A plausible wrong number here corrupts both the attempt offsets and the asynchronies, and neither looks wrong.
- Phase 4: `pointerSampleIntervalMs` is a **getter**, not a captured value — the measurement finishes ~500 ms after session start and the session record is written at both ends. Real pointer deltas are preferred; the animation-frame interval is the fallback (an upper bound). It read 16.7 in the live run because the patient had not touched the screen during the window, which is the expected path.
- Phase 4: `GameContext.emit` takes `EmittedAttempt` (no `client_event_id`, `session_id`, `patient_id`) — `architecture.md` 7 writes it as `AttemptEvent`, which a game cannot satisfy. Letting a game mint its own `client_event_id` would silently break offline replay.
- Phase 4: the `Date.now()` ban test strips comments before grepping, so `clock.ts` can explain the rule at length without tripping it. The allowlist prints on every run and a second test asserts the allowlisted file still contains the call — otherwise the allowlist quietly becomes a list of files that used to matter.
- Phase 4: repeated loads of `/p` leave un-ended session rows behind. That is the intended behaviour of writing the session at START (an interrupted session must still exist for its attempts to reference), not a leak.
- **Cleanup pass: never import a Supabase client at module scope.** Use `getSupabase()`. A module-level instance that throws on missing config couples every downstream module to `.env.local` existing — it white-screened patient mode before React mounted and broke the offline layer's own test. `isSupabaseConfigured()` guards the optional paths.
- Cleanup pass: i18next resolves a key with `{count}` to `<key>_one` / `<key>_other`. A bare `<key>` is never read for a counted string. Getting this wrong renders the literal key on screen, and only at the moment the count is non-zero.
- Cleanup pass: `syncEngine.start()` belongs in `src/app/providers.tsx`. Nothing else calls it, and without it the outbox fills forever while the app looks fine.
- **Phase 3, the one that would have cost a day:** IndexedDB rejects `null` as a key. A row written with `flushed_at: null` is silently absent from the `flushed_at` index — `where('flushed_at').equals(null)` does not throw, it returns nothing. The outbox would have looked permanently empty while filling up, with no error anywhere. Hence `flushed_at: number`, `0` = unflushed, `-1` = quarantined. **Never make this column nullable.**
- Phase 3: an unparseable outbox row (written by an older app version) is moved to `flushed_at = -1`, not deleted — `rules.md` 2 forbids deleting an unflushed row. Moving it out of the UNFLUSHED index is what stops it sitting at the head of every batch and blocking the queue behind it forever. Pruning uses `between(1, cutoff)`, so neither 0 nor -1 can ever be caught by it.
- Phase 3: `queue*` functions return `void`, not a Promise, on purpose. It is the only way to make "never await a fetch in an interaction handler" unwriteable rather than merely forbidden. Do not "fix" them to return promises.
- Phase 3: the precache budget assertion must be a `closeBundle` hook with `sequential: true, order: 'post'`. vite-plugin-pwa emits `dist/sw.js` from its own `closeBundle`, and `closeBundle` is a parallel hook — the first version of this check ran before the file existed, found nothing, and passed silently. It now throws on every "cannot check" path instead of returning.
- Phase 3: `sync-engine.ts` imports the Supabase client with a **dynamic** import. A static one would make importing the sync engine require `VITE_SUPABASE_URL`, because `client.ts` throws at module load — which broke `tests/sync.test.ts` outright. The wider issue stands: that eager throw couples every module downstream of it to the presence of `.env.local`.
- Phase 3: zod `.nullable()` rejects `undefined`. Every optional telemetry field is a required property with a nullable value, so a game must write `null` explicitly — a field simply omitted gets the row quarantined and it never syncs. That is deliberate, but it means Phases 7-9 must not leave fields off.
- Phase 3: signed Storage URLs carry a token in the query string, so the family-media runtime cache matches with `ignoreSearch: true`. Without it every re-signing stores the same photo again under a new key and burns through the 300-entry cap in about a week.
- Phase 3: `public/icons/*.png` are generated placeholders, not artwork. Replace before submission.
- **Phase 2: four DEVIATIONs from `architecture.md` 4, all marked in `0001_init.sql`.** `patients.severity` and `family_members.photo_path` dropped NOT NULL (a resumable flow creates the patient row before severity is asked for; a declined photo consent has to be able to null the path). `retrieval_state.updated_at` added (5.1 indexes on it and amendment 3 makes it the conflict key). Read the comments before "fixing" any of them.
- **Phase 2: `window` is a reserved SQL word.** `difficulty_state."window"` is quoted. An unquoted one is a syntax error at migration time, not at query time.
- Phase 2: RLS cannot express "append-only". `consents` is protected by a **column grant** instead — `revoke update` then `grant update (withdrawn_at)`. Same trick, opposite direction, on `flags`: revoke all writes, then grant only `acknowledged_at`. **The revoke must come before the grant**; Supabase grants table-level privileges to `authenticated` by default, so a column grant issued first is widened straight back.
- Phase 2: do **not** put `alter table storage.objects enable row level security` in a migration. That table is owned by `supabase_storage_admin`, the statement raises "must be owner of table objects", and it aborts the rest of the file. RLS is already on there.
- Phase 2: storage paths are `<patient_id>/<uuid>.<ext>` and the policies in 0002 match on that first segment. Change the path shape and the policies stop matching **silently** — as an empty listing, not an error.
- Phase 2: consent is collected at step 6, after photos and recordings are uploaded at steps 1, 3 and 4. `applyScopeDeletions` in `onboarding/api.ts` deletes what a declined category already stored. Without it the toggles are decoration.
- **Phase 2, unresolved:** the mandatory disclaimer in `prd.md` 2 contains the words "diagnose" and "stage", both on the `rules.md` 2 banned list. It has to appear on the dashboard and the PDF in Phase 13, and a word-boundary grep cannot tell a denial from a claim. Decide then whether to exempt that one key or narrow the grep.
- Phase 2: `tests/rls.test.ts` needs two pre-created Supabase accounts and six `VITE_RLS_TEST_*` variables in `.env.local`. It **fails** rather than skips when they are missing, on purpose.
- Phase 2: the app now hard-fails at module load without `.env.local`, `/demo` included, because the router imports the Supabase client transitively.
- **Phase 1, the expensive one:** `tailwind-merge` silently deletes named font sizes. It classifies `text-*` as a colour unless the value looks like a size to *its* config, so `cn('text-prompt', 'text-ink')` returned only `text-ink` and every 40 px prompt rendered at the 16 px browser default — 8 px below this product's type floor, with no error anywhere. Fixed by extending the `font-size` class group in `src/ui/cn.ts`. **Any new named size in `tailwind.config.ts` must be added there too.** The bug was invisible in the CSS (the `.text-prompt` rule was generated correctly) and only showed up on screen.
- Phase 1: `ExitGuard`'s 3-second threshold is a `setTimeout`, not a `requestAnimationFrame` accumulator. rAF was found not firing at all in one browser context, which meant the hold could never complete. Frames draw the ring; the timer owns the contract. Do not merge them back together.
- Phase 1: `design.md` Part II 2 asks for the weave in `--ring` at 40% opacity. **There is no `--ring` token** in 2 or in 2.1 — the weave uses black at 17% for warp threads and white at 42% for the diamond lattice instead. If a `--ring` token is ever added, revisit `src/patient/shell/weave.ts`.
- Phase 1: `design.md` 5 names `--brass-deep` for the pressed button border. **There is no such token**; `--madder-deep` is used, which is what the Block B prompt asked for and the only deep token that exists.
- Phase 1: the exit PIN question is settled — **hold only, no PIN**, per `architecture.md` 3 and `audit.md` 18. The `buildbook.md` Block B prompt still says "4-digit PIN dialog"; it is the line the audit corrected. Do not re-add it without `caregivers.pin_hash` and an onboarding step.
- Phase 1: focus rings are `--focus` (#8A241C, 8.35:1), never `--brass` (2.91:1, fails even the 3:1 non-text minimum). The Block B prompt says brass; `design.md` 5 and Part II 3 both override it.
- Phase 1: the woven border thickness is `clamp(12px, 2.6vh, 16px)`, not a flat 16 px — `design.md` 10 makes it responsive because height, not width, is the binding constraint at 1024x600.
- Phase 0: `docs/phases.md` lists **16** phases (0-15), not the 11 that Block A's prompt mentions. The doc wins; this table is the 16.
- Phase 0: `vite-plugin-pwa` is installed but **not registered in `vite.config.ts`**. `injectManifest` needs `src/sw.ts` to exist at build time or `vite build` fails. Phase 3 adds both together. Do not wire an empty one to make the plugin "present".
- Phase 0: `GameSummary` field names are **not** specified in `architecture.md`. Its metric names were taken from the `session_summaries` columns (4) and scoped to one `game_type` per buildbook amendment 7. If Phase 4 needs different fields, change it there before any game consumes it.
- Phase 0: `LocalPatient` is likewise unspecified; it mirrors the `patients` columns. Phase 3 owns the canonical version in `src/core/db` — keep the two in step.
- Phase 0: extra dependencies approved beyond the Block A list: `react-router-dom` v7 (router.tsx needs one), plus toolchain peers `postcss`, `autoprefixer`, `jsdom`, `globals`, `@eslint/js`, `i18next`, `@types/react`, `@types/react-dom`, `@types/node`.
- One-time Git setup: Repository initialized on branch `main`, remote origin configured to `https://github.com/ksaihavish/Xorai.git`, standard ignores in place.

---

## Deferred / cut

*Record anything dropped, with the reason, so the answer is ready in Q&A.*

| Item | Reason | Where it's answered |
|---|---|---|
| Spatial navigation game | Needs a game engine; continuous directional control is the hardest input for this population | `prd.md §5.3` |
| Trained ML model | Telemetry schema is ML-ready; the data volume to train one doesn't exist yet | `architecture.md §9` |
| Native mobile app | One PWA, two design systems. Offline, one codebase, no store review, installs to the home screen | `prd.md §5.3` |
| Caregiver exit PIN | Nothing collects one at onboarding and `caregivers` has no column for it. A 3-second hold on an unmarked corner is enough | `architecture.md §3` |
| PHQ-2 as a named instrument | Administered to the person, not to an informant. Replaced with an unscored mood check-in | `architecture.md §8.1` |
| Doctor portal | A portal nobody logs into is worse than a PDF a family carries | `prd.md §3.4` |
