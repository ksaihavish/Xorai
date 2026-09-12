# CLAUDE.md — Xorai master index

**Read this file, not the repo.** It exists so no task starts with a filesystem scan. If the tree or a core contract changes, update this file in the same commit (`docs/rules.md` §1.5).

**Current phase:** Block H (Phases 7 & 8: Dhol Bator & Aponjon) complete — Next: Phase 5 (Voice & language pipeline) or Phase 9 (Ghorir Chobi).

---

## What this is

Xorai is an offline-first, voice-first PWA for elderly people living with dementia in India's North Eastern Region, built for SIH 26003. One codebase runs two modes: a locked, simplified **patient mode** on a landscape tablet, which runs short sessions of culturally-grounded cognitive games plus a memory-assistance layer, and a **caregiver mode** with onboarding and a longitudinal dashboard. The clinical claim rests on reaction-time *variability* measured across months, which is why the session clock, the offline layer, and the errorless-UI contract are load-bearing rather than nice-to-have.

Source of truth, in order: `docs/rules.md` (wins over any prompt) → `docs/architecture.md` → `docs/prd.md` → `docs/design.md` → `docs/phases.md` → `docs/buildbook.md`.

---

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Build | Vite 6 + `@vitejs/plugin-react` | `vite.config.ts` holds the `@/*` alias and the vitest block |
| UI | React 19 + TypeScript strict | `noUncheckedIndexedAccess` on; no `any`, no `@ts-ignore`, no `!` outside tests |
| Styling | Tailwind CSS **3.4.17, pinned, no caret** | `tailwind.config.ts`. v4 moved config into CSS. Do not let a bump move it |
| Components | shadcn/ui, copy-in | We own the code. No UI kit as a dependency |
| Server state | TanStack Query v5 | `src/app/providers.tsx` |
| Client state | Zustand v5 | |
| Offline store | Dexie 4 (IndexedDB) + dexie-react-hooks | `src/core/db/`. Never `localStorage` for telemetry |
| Service worker | vite-plugin-pwa, `injectManifest` | `src/sw.ts`. Registered via `registerType: 'autoUpdate'` |
| Backend | `@supabase/supabase-js` v2 | Postgres + RLS + Edge Functions, Mumbai region |
| Routing | react-router-dom v7 | |
| Charts | Recharts | Caregiver mode only |
| i18n | react-i18next + i18next | `src/core/i18n/`, bundles in `i18n/*.json`, statically imported. No runtime TTS |
| Dates | date-fns | Not moment, not dayjs |
| IDs | uuid v7 (`uuid` v13) | `client_event_id` on every telemetry row |
| Validation | zod | Anything crossing the network or coming out of Dexie |
| Class names | clsx + tailwind-merge | `src/ui/cn.ts` — tailwind-merge is **extended** with the patient font-size scale, see below |
| Icons | lucide-react | **Caregiver mode only.** Lint-enforced |
| Tests | vitest + @testing-library/react (jsdom) | `tests/` |
| Lint | eslint 9 flat config + typescript-eslint | `eslint.config.js` holds the boundary rule |

---

## Tree

| Path | What lives there |
|---|---|
| `.claude/rules/` | Copies of `rules.md` and `design.md`, so an agent session loads them without reading `docs/` |
| `CLAUDE.md` | This file — the master index |
| `memory.md` | Phase-by-phase progress tracker, updated at the end of every phase |
| `docs/` | `prd.md`, `architecture.md`, `design.md`, `rules.md`, `phases.md`, `buildbook.md`, `audit.md`. Source of truth; excluded from the banned-string grep |
| `i18n/` | `en.json` (328 FLAT dot-keys, source of truth) + seven stub `{lang}.json`. **In** the banned-string grep |
| `public/audio/` | Pre-generated speech, one folder per language, precached |
| `public/audio/drums/` | **Synthesized placeholders** + `SOURCE.md`. Owner 3 replaces them |
| `public/assets/cultural/` | The Xorai Milan deck — square WebP, ≤120 KB each |
| `public/fonts/` | Self-hosted woff2 subsets + `fonts.css`. Noto Sans (latin, latin-ext, devanagari), Noto Sans Bengali (bengali), Noto Sans Meetei Mayek (meetei-mayek), Inter (latin, latin-ext). Weights 400/600 only, **no italic face** |
| `supabase/migrations/` | `0001_init.sql` (every table, indexes, `client_event_id` UNIQUE), `0002_rls.sql` (RLS on every table, storage buckets, the write bans), `0004_attempt_features.sql` (`attempts.features` jsonb), `0005_views.sql` (`security_invoker` views), `0006_perf_indexes.sql` (analytical indexes). Forward-only; never edited after being applied |
| `supabase/functions/` | `nightly-rollup` (summaries, baselines, flags, suppression) and `export-pdf` (hand-built A4, no PDF dependency). Service role; the client never writes derived tables |
| `scripts/` | `build-asset-pack.ts`, `seed-telemetry.ts` (3 patients x 60 days, deterministic), `generate-audio.ts` (offline TTS generation) |
| `src/main.tsx` | Mount point. Guards on `#root` rather than asserting |
| `src/sw.ts` | Service worker. Precache + runtime caches, and the NetworkOnly rules for Supabase |
| `public/icons/` | **Placeholder** PWA icons, generated not designed. Replace before submission |
| `src/app/router.tsx` | `/p` → patient mode (`AssistHome` + `SessionRunner`), `/` → caregiver mode (`Dashboard.tsx`), `/demo` → design-system harness |
| `src/app/providers.tsx` | `QueryClientProvider` only, for now |
| `src/patient/` | **Patient mode.** `design.md` is law here. May not import from `src/caregiver/**`, or from `lucide-react` |
| `src/patient/shell/` | `PatientShell` (viewport, landscape gate, kiosk locks), `WovenSessionBorder` (the frame **is** the progress indicator), `weave.ts` (gamosa CSS), `ExitGuard` (3 s hold, no PIN), `useKioskLocks` |
| `src/patient/session/` | `SessionRunner` (phases + game selection + the 15-min cap), `GameHost` (builds `GameContext`), `store.ts` (zustand), `CloseScreen` (the bamboo grove) |
| `src/patient/games/dhol-bator/` | `DholBatorGame`, `DholHead`, `patterns.ts` |
| `src/patient/games/aponjon/` | `AponjonGame`, `kinship.ts` (the NER kinship structure), `demoFamily.ts` (fixture) |
| `src/patient/games/xorai-milan/` | `XoraiMilanGame`, `deck.ts` (era weighting + grid caps) |
| `src/patient/games/ghorir-chobi/` | `GhorirChobiGame`, `shapes.tsx` (clock + japi / root-bridge / Naga border) |
| `src/core/trace/` | `capture.ts` (the pointer ladder + latency features), `replay.tsx` (**shared with the Phase 13 dashboard**) |
| `src/patient/orientation/` | `OrientationGame` (four questions, errorless), `questions.ts` (pure builder), `SeasonMark` (four line drawings) |
| `src/patient/assist/` | `AssistHome` (the patient home), `reminders.ts` (scheduling + catch-up), `ReminderTakeover`, `ContactsAndSos`, `OrientationCard`, `MusicPlayer` |
| `src/caregiver/` | **Caregiver mode.** Different design system. May not import from `src/patient/**` |
| `src/caregiver/AppShell.tsx` | `CaregiverAppShell`, `CaregiverSection` (hairline bands, not cards), `CaregiverFlagCard` (the only carded element in the mode) |
| `src/caregiver/onboarding/` | `OnboardingFlow` (6 steps, resumable), `steps/Step1..Step6`, `api.ts` (all caregiver reads/writes + storage), `schema.ts` (zod), `VoiceNoteRecorder` |
| `src/caregiver/auth/` | `AuthProvider`, `RequireAuth`, `SignIn`, `SignUp`, `ResetPassword`, `api.ts`, and `Form.tsx` — caregiver form primitives that belong in `src/ui/` |
| `src/caregiver/dashboard/` | `Dashboard` (hairline sections), `TrendChart` (baseline band), `ComplianceCalendar`, `ClockCompare` (the centrepiece), `queries.ts`, `CaregiverHome`, `SyncStatus` |
| `src/caregiver/settings/` | `ConsentSettings` (DPDP withdraw-and-delete), `reminders/RemindersSettings` (CRUD + per-reminder voice note) |
| `src/core/db/` | `dexie.ts` (v1 schema, 10 stores), `schemas.ts` (zod, parsed on every read out), `outbox.ts` (the four `queue*` writers), `sync-engine.ts` |
| `src/core/supabase/` | `client.ts` — **the only client in the app**. `types.ts` is generated and still missing; see below |
| `src/core/telemetry/` | `types.ts` (the contract), `clock.ts` (**the one `Date.now()`**), `emit.ts` |
| `src/core/audio/` | `context.ts` (**the one AudioContext**), `scheduler.ts` (lookahead), `speak.ts` (plays precached files, **zero network**) |
| `src/core/i18n/` | `index.ts` (i18next, FLAT keys), `languages.ts`, `kinship.ts` (**shared by both modes — that is why it is in core**) |
| `src/core/difficulty/` | `staircase.ts` (the 85% weighted staircase), `spaced-retrieval.ts` |
| `src/ui/` | `cn.ts`, `PatientButton`, `PatientCard`, `Prompt`, `ReplayAudioButton`. Patient primitives written to design.md 5, **not** shadcn defaults. shadcn copies land here too when a phase needs one |
| `src/styles/tokens.css` | The three `@tailwind` directives, then every token from design.md 2 plus the `[data-mode="caregiver"]` overrides |
| `tests/` | `rls.test.ts`, `sync.test.ts`, `clock.test.ts`, `rhythm.test.ts`, `aponjon.test.ts`, `milan.test.ts`, `difficulty.test.ts`, `analysis.test.ts`, `invariants.test.ts`, `i18n.test.ts` — 146 unit tests passing; none may be deleted or skipped |

---

## Core contracts already written

`src/core/telemetry/types.ts` — `GameType`, `Domain`, `Severity`, `ErrorType`, `AttemptEvent`, `StrokeEvent`, `RhythmTrialEvent`, `SessionRecord`, `GameSummary`, `LocalPatient`, `GameContext`, `SessionClock`. Field names mirror the Postgres columns in `docs/architecture.md` §4 exactly; renaming one is a migration, not a refactor.

`eslint.config.js` — the patient/caregiver import boundary, plus the `lucide-react` ban in `src/patient/**`. Error, not warning.

`src/ui/cn.ts` — **tailwind-merge is extended with the patient font-size scale.** It resolves `text-*` against its own idea of a size, so `text-prompt` was classified as a colour and silently dropped whenever a colour followed it, collapsing 40 px type to the 16 px browser default. Any new named size added to `tailwind.config.ts` must also be added to the `font-size` class group here or it will vanish at runtime with no error.

**Design-system contracts that are enforced nowhere but must hold:** every interactive element has a visible border *and* a fill at rest; no icon-only buttons; no scale transform on press; focus is 4 px `--focus`, never brass; `--indigo` never distinguishes two options from each other in patient mode.

`src/core/db/dexie.ts` — **`flushed_at` is a number, and 0 means unflushed.** It must never become nullable. IndexedDB rejects `null` as a key, so a row stored with `flushed_at: null` is silently dropped from the index: `where('flushed_at').equals(null)` does not throw, it just never returns the row, and the outbox looks permanently empty while filling up. `-1` means quarantined (unparseable, kept forever, never pruned).

`src/core/db/outbox.ts` — **`queueSession`/`queueAttempt`/`queueStroke`/`queueRhythmTrial` return `void`, not a Promise.** That is the enforcement mechanism for "the network is never in the interaction path": a function that returns nothing cannot be awaited inside a `pointerdown` handler.

`src/core/db/sync-engine.ts` — flush order `sessions → attempts → strokes → rhythm` is a foreign-key order, not a preference. Batches of 200, `ignoreDuplicates` on `client_event_id` (`id` for sessions) as the entire idempotency story, backoff 1s→5min, prune only confirmed rows older than 7 days. It never throws into the UI.

`src/core/supabase/client.ts` — **never import a client at module scope.** Call `getSupabase()`, and guard optional paths with `isSupabaseConfigured()`. An earlier version threw at module load when `.env.local` was absent, which white-screened the patient route before React mounted and made the offline layer's own test unrunnable. A patient must never see a technical failure (design.md §6), and the offline layer specifically has to work when the backend does not.

`src/core/telemetry/clock.ts` — **the only `Date.now()` in the telemetry path**, and it produces `sessions.started_at` and nothing else. `tests/clock.test.ts` greps `src/core/telemetry/**` and `src/patient/**` for any other one, prints its allowlist on every run, and asserts the allowlisted file still contains the call it is listed for. A negative control confirmed the grep catches a planted violation. Everything else is `performance.now()` offsets from one origin.

`clock.fromAudio()` **throws** without an AudioContext rather than returning 0 or NaN. Dhol Bator (Phase 7) must pass one to `createSessionClock()`. A silent wrong answer here makes both the attempt offsets and the asynchronies wrong while both still look plausible.

**Rhythm timing lives entirely on the audio clock.** Beats are scheduled on `audioCtx.currentTime`, taps are read from `audioCtx.currentTime` in `pointerdown`, and neither ever touches `performance.now()`. Scheduling precision was measured through an `OfflineAudioContext` render: five notes at 600/300/300/600 ms came back at exactly 600/300/300/600, max onset error **0.271 ms** and constant, so it cancels in the differences.

**A suspended AudioContext is the trap.** Its `currentTime` does not advance, so (a) `await ctx.resume()` can stay pending forever, (b) playback never reports finishing, and (c) every tap reads the same frozen value and produces tidy, entirely fictional asynchronies. All three are guarded: `resumeWithTimeout`, a playback watchdog, and a `clockRunning` check that writes EMPTY timing arrays and `completed: false` rather than fabrications.

**The banned-string list has exactly ONE exemption: `legal.disclaimer`.** prd.md §2 mandates that sentence word for word and it contains "diagnose" and "stage" — because it *denies* them. A word-boundary grep cannot tell a denial from a claim. `tests/banned-strings.test.ts` enforces the exemption, asserts there is only one, and asserts the sentence is still a denial. Adding a second exemption is a decision to argue for, not a convenience.

**`supabase/functions/nightly-rollup/analysis.ts` holds ALL the arithmetic and is the only copy.** `index.ts` imports it. Keeping a second copy there is how the tested version and the shipped version drift apart. `tests/analysis.test.ts` drives it over the seeded profiles.

**When you smooth one side of a z-score, smooth the other.** The baseline window is EWMA-smoothed with the same alpha as the current value, and `evaluateDomain` takes the FULL series and slices the sustain window off the smoothed output. Both of these were bugs that made the detector silently never fire.

**The analysis corrections that matter** (all from `architecture.md` §8, all places the obvious implementation is wrong):
- `cv_rt` is computed **per `game_type`, then weighted-mean aggregated**. Pooling raw RTs across games measures which games were played that day, not the person — and it is the metric the pitch rests on.
- `accuracy_hint_adjusted` counts a **hinted trial as incorrect**. That is what turns "accuracy is inflated by design" into a number.
- The baseline window is **sessions 4–13, not 1–10**. The first three are the patient learning the interface; including them bakes the practice effect into the reference.
- EWMA (α=0.3) runs on the **raw daily** score and z comes from the EWMA value. There is deliberately **no 7-day rolling mean underneath** — α=0.3 is already a ~6-day window and double-smoothing makes the 14-day sustain rule meaningless.

**The staircase's hint condition carries an accuracy guard: `accuracy <= 0.60 || (hint_rate >= 0.40 && accuracy < 0.85)`.** Dropping the second clause makes the level oscillate forever — hints fire automatically on hesitation, so a slow-but-perfect patient is demoted at 100% accuracy, the easier level shortens their latency, the hints stop, and they are promoted again. `tests/difficulty.test.ts` pins it. **Never move more than one level per session**, which `last_session_id` enforces.

**`/p` is the assistance layer, not a session.** The session sits behind a "Play" button. The assistance half is what gets used every day; the games are fifteen minutes of it.

**Reminders cannot fire on a locked screen** and the product says so rather than pretending (buildbook amendment 8). The design is: in-app full-screen takeover while open, a Notification when merely backgrounded, and CATCH-UP on open capped at the 2 most recent within 12 hours. No snooze — a snooze button is a decision, and decisions are expensive here.

**Stroke capture uses ONE branch, never both.** `pointerrawupdate` alone where it exists; otherwise `pointermove` WITH `getCoalescedEvents()`. Calling `getCoalescedEvents()` on a `pointerrawupdate` returns only that event, so the combination captures FEWER points than the plain fallback — and it fails silently, because the trace still looks like a clock. `capture.ts` picks at subscribe time and records which branch it took in `features.raw_capture`.

**The clock is never scored.** No shape recognition, no accuracy, and `attempts.correct` is written as NULL for this game rather than false. Storing a judgement is what would make this a screening instrument, which `prd.md` §2 says we never build. `tests/milan.test.ts` asserts no feature key contains score/accuracy/correct/shape/quality.

**Xorai Milan: matched pairs stay face up with a brass frame.** An emptying board is a record of what is gone; a filling one is a record of what was remembered. Errorless hint re-reveals a seen card after 3 consecutive non-matches. Deck is weighted 60/40 vintage everyday objects over contemporary landmarks.

`scripts/build-asset-pack.ts` **refuses any CSV row missing `licence` or `source_url`.** It fails rather than warns to enforce strict asset provenance for submission. Requires `sharp` (build-time only, needs approval) for WebP image conversion.

`src/core/telemetry/emit.ts` and `src/core/db/outbox.ts` — **every emit and queue function returns `void`, never a Promise.** That is the enforcement mechanism for "the network is never in the interaction path": a function returning nothing cannot be awaited in a `pointerdown` handler.

`src/patient/session/GameHost.tsx` — a game receives `GameContext` and nothing else: no Supabase, no Dexie, no fetch, no `Date`. `GameContext.emit` takes `EmittedAttempt`, which omits `client_event_id`, `session_id` and `patient_id` — GameHost fills all three. Letting a game mint its own `client_event_id` would silently break offline replay.

`src/app/providers.tsx` — **`syncEngine.start()` lives here**, at the root, not in a screen. The outbox fills whether or not anything drains it, and the engine has to keep running while patient mode is on screen, which is where the events come from.

`vite.config.ts` — the **precache budget assertion** fails the build above 25 MB (`architecture.md` §5.3). It runs as a `sequential`/`post` `closeBundle` hook because vite-plugin-pwa emits `sw.js` from its own `closeBundle`, and it throws rather than returning on every "cannot check" path.

`supabase/migrations/0002_rls.sql` — RLS on every table, plus two things RLS cannot express:
- **`consents` is append-only by column grant.** `UPDATE` is revoked on every column but `withdrawn_at`, because "you may withdraw but you may not rewrite what was agreed" is column-level, not row-level. `tests/rls.test.ts` asserts it.
- **`session_summaries`, `baselines` and `flags` have a SELECT policy and nothing else**, plus a blanket `REVOKE`. Only `flags.acknowledged_at` is grantable, so a caregiver can dismiss a flag but not author or re-level one.

**Regenerating `src/core/supabase/types.ts`** — required after every migration (`rules.md` §5), and it is hand-edited by nobody:

```
npx supabase login
npx supabase gen types typescript --project-id <your-project-ref> --schema public > src/core/supabase/types.ts
```

Until it exists, `client.ts` is generically typed and every read is validated by the zod schemas in `src/caregiver/onboarding/schema.ts` instead.

---

## Environment

`.env.example` lists `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENABLE_PHONE_OTP`, `VITE_APP_VERSION`. Copy it to `.env.local`, which is gitignored and must never be committed. The service-role key never appears in a `VITE_` variable — it belongs in Supabase Edge Function secrets only.

---

## Standing rules

> Reproduced verbatim from `docs/rules.md` §1 and §2. That file wins over any prompt, including this one. If a prompt conflicts with it, say so and stop.

## 1. Standing rules for every prompt

1. **Touch only the files named in the prompt.** Do not scan the repo. Do not "improve" adjacent code. Do not reformat files you were not asked to change.
2. **Ask, never invent.** Any credential, API key, project URL, connection string, or config value: stop and ask. Never write a placeholder secret. Never commit one.
3. **No new dependency without asking.** If a task seems to need a library not in §3, stop and propose it with a one-line reason.
4. **Update `memory.md` at the end of every phase.** Mark what is done, what file you were last in, what is next.
5. **Update `CLAUDE.md` when the file tree or a core contract changes.** It is the index that prevents repo scans.
6. **Verify before declaring done.** Run the phase's Verify block yourself where it is runnable. If something fails, say so — do not report success.
7. **One phase at a time.** Do not start the next phase because you have context left over.
8. **TypeScript `strict` stays on.** No `any`, no `@ts-ignore`, no `!` non-null assertion outside tests. If types fight you, the model is wrong — fix the model.
9. **No comments explaining what the code does.** Comments explain *why*, and only where the why is non-obvious.

---

## 2. Invariants — code that violates these is wrong even if it works

These are checked in review and some are enforced by tests. They exist because each one, if broken, silently destroys either the clinical claim or the demo.

### Timing
- **`Date.now()` is banned in any telemetry path.** `performance.now()` only. `Date.now()` is wall-clock and gets NTP-corrected mid-session; one correction poisons the variability metric that the entire pitch rests on. The only permitted `Date.now()` is `sessions.started_at`.
- Every `*_ms` field is an offset from a single `sessionStartPerfNow` captured once at session start.
- Tap capture uses `pointerdown`, never `click`.
- Game surfaces set `touch-action: none` and register listeners with `{ passive: false }`.
- **One audio↔performance anchor per session.** Dhol Bator needs both clocks. Capture `{perfOrigin, audioOrigin}` once at session start (ideally via `audioCtx.getOutputTimestamp()`), expose `clock.fromAudio(t)` on `SessionClock`, and convert there. No game does this arithmetic itself. Without it, either the `attempts` offsets or the asynchronies are wrong, and both look plausible.
- **Rhythm timing lives entirely on the audio clock.** Beats are scheduled with `AudioContext.currentTime + lookahead`; taps are recorded as `audioCtx.currentTime`. Never compare an audio-clock beat to a `performance.now()` tap — the clocks drift and the asynchrony numbers become meaningless.
- Stroke capture follows this ladder exactly: **`pointerrawupdate` alone** where available (it is already the un-coalesced stream), **otherwise `pointermove` with `getCoalescedEvents()`**. De-duplicate by timestamp. Never both on the same event — `getCoalescedEvents()` on a `pointerrawupdate` returns only that event, so the combination can capture *fewer* points than the fallback, and the failure is silent.

### Telemetry
- Events are written to **Dexie first, synchronously with the interaction.** The network is never in the interaction path. An event that only exists after a successful POST is an event that will be lost.
- Every synced **telemetry** row carries a client-generated `client_event_id` (uuid v7) and every write is an `upsert(..., { onConflict: 'client_event_id', ignoreDuplicates: true })`. This is the whole idempotency story for append-only data; do not add a second mechanism.
- **`difficulty_state` and `retrieval_state` are not telemetry.** They are read-modify-write state. Last-write-wins on a server-side `updated_at`, and a local row never overwrites a newer server row. Applying `ignoreDuplicates` here silently loses the newer value.
- Never delete an unflushed outbox row. On error, back off and retry.
- The client **never** writes `session_summaries`, `baselines`, or `flags`. Those are Edge Function + service role only. A client that can write its own flags can write its own diagnosis.

### Errorless UI
- No patient-facing surface may indicate the patient was wrong. See `design.md §6` for the full contract. This includes technical errors: the patient never sees an error dialog, a toast, a spinner-with-failure, or a network warning.
- No score, percentage, streak, timer-that-loses-progress, or leaderboard in patient mode.
- No icon-only buttons in patient mode, **including the replay-audio button**. Icon plus the word, in the active language, every time. It is the most-used control in the product.
- The strings "wrong", "incorrect", "try again", "failed", "error" do not appear in any patient-mode i18n key. A test asserts this.

### Data & language
- **Banned strings in `src/**` and `i18n/**`, matched on word boundaries** (`\bstage\b`, not a substring — `staging` and `staged` are legitimate). `docs/` and `.claude/` are excluded, because the spec files themselves discuss every one of these words. The banned list: "diagnosis", "diagnose", "decline detected", "condition worsening", "stage", "screening result", "risk score", "MMSE", "MoCA". MMSE is copyrighted and MoCA requires certification — we do not reproduce or claim equivalence to either. A test greps for these.
- `media_assets.licence` and `media_assets.source_url` are `NOT NULL`. No asset enters the repo without both.
- No health data, patient names, or photos in logs, error reports, or analytics events.

### Boundaries
- `src/patient/**` may not import from `src/caregiver/**`, and vice versa. Enforced by an ESLint `no-restricted-imports` rule, not by discipline.
- `lucide-react` is **also** in `no-restricted-imports` for `src/patient/**`. Patient icons are hand-drawn inline SVG so they carry the same 3 px stroke as the rest of the design system. A rule nothing enforces is a rule nobody follows.
- Games import from `src/core/**` only through the `GameContext` interface. A game that reaches directly into Dexie or Supabase is wrong.
