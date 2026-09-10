# CLAUDE.md — Xorai master index

**Read this file, not the repo.** It exists so no task starts with a filesystem scan. If the tree or a core contract changes, update this file in the same commit (`docs/rules.md` §1.5).

**Current phase:** Phase 1 complete — Next: Phase 2 (Supabase — schema, RLS, auth, consent).

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
| Offline store | Dexie 4 (IndexedDB) | Never `localStorage` for telemetry |
| Service worker | vite-plugin-pwa, `injectManifest` | Installed, **not yet registered** — Phase 3 adds `src/sw.ts` and the config block |
| Backend | `@supabase/supabase-js` v2 | Postgres + RLS + Edge Functions, Mumbai region |
| Routing | react-router-dom v7 | |
| Charts | Recharts | Caregiver mode only |
| i18n | react-i18next + i18next | All audio pre-generated at build time. No runtime TTS |
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
| `public/audio/` | Pre-generated speech, one folder per language, precached |
| `public/audio/drums/` | Dhol / gogona / pepa samples for Dhol Bator, pre-decoded at app start |
| `public/assets/cultural/` | The Xorai Milan deck — square WebP, ≤120 KB each |
| `public/fonts/` | Self-hosted woff2 subsets + `fonts.css`. Noto Sans (latin, latin-ext, devanagari), Noto Sans Bengali (bengali), Inter (latin, latin-ext). Weights 400/600 only, **no italic face**. Meetei Mayek lands in Phase 9 |
| `supabase/migrations/` | Numbered, forward-only `.sql`. Never edited after being applied |
| `supabase/functions/` | Edge Functions — `nightly-rollup`, `export-pdf`. Service role; the client never writes derived tables |
| `scripts/` | `generate-audio.ts`, `build-asset-pack.ts`, `seed-telemetry.ts` |
| `src/main.tsx` | Mount point. Guards on `#root` rather than asserting |
| `src/app/router.tsx` | `/p` → patient mode, `/` → caregiver mode (both stubs), `/demo` → the design-system harness showing one patient and one caregiver screen |
| `src/app/providers.tsx` | `QueryClientProvider` only, for now |
| `src/patient/` | **Patient mode.** `design.md` is law here. May not import from `src/caregiver/**`, or from `lucide-react` |
| `src/patient/shell/` | `PatientShell` (viewport, landscape gate, kiosk locks), `WovenSessionBorder` (the frame **is** the progress indicator), `weave.ts` (gamosa CSS), `ExitGuard` (3 s hold, no PIN), `useKioskLocks` |
| `src/patient/session/` | `SessionRunner`, `GameHost`, the close screen |
| `src/patient/games/` | One folder per game: `aponjon`, `dhol-bator`, `xorai-milan`, `ghorir-chobi` |
| `src/patient/orientation/` | The reality-orientation warm-up that runs every session |
| `src/patient/assist/` | Reminders, contact cards, SOS, music, the always-available orientation card |
| `src/caregiver/` | **Caregiver mode.** Different design system. May not import from `src/patient/**` |
| `src/caregiver/AppShell.tsx` | `CaregiverAppShell`, `CaregiverSection` (hairline bands, not cards), `CaregiverFlagCard` (the only carded element in the mode) |
| `src/caregiver/onboarding/` | Profile, family, music, routine, DPDP consent |
| `src/caregiver/dashboard/` | Trends, compliance calendar, flag cards, clock replay, PDF export |
| `src/caregiver/settings/` | |
| `src/core/db/` | `dexie.ts`, `outbox.ts`, `sync-engine.ts` |
| `src/core/supabase/` | `client.ts`, generated `types.ts`, `queries/` |
| `src/core/telemetry/` | `types.ts` (the contract, written), plus `emit.ts` and `clock.ts` in Phase 4 |
| `src/core/audio/` | `context.ts`, `scheduler.ts`, `speak.ts` |
| `src/core/i18n/` | `t()` wiring and the language packs |
| `src/core/difficulty/` | `staircase.ts`, `spaced-retrieval.ts` |
| `src/ui/` | `cn.ts`, `PatientButton`, `PatientCard`, `Prompt`, `ReplayAudioButton`. Patient primitives written to design.md 5, **not** shadcn defaults. shadcn copies land here too when a phase needs one |
| `src/styles/tokens.css` | The three `@tailwind` directives, then every token from design.md 2 plus the `[data-mode="caregiver"]` overrides |
| `tests/` | `rls.test.ts`, `sync.test.ts`, `clock.test.ts` — none of these may be deleted or skipped |

---

## Core contracts already written

`src/core/telemetry/types.ts` — `GameType`, `Domain`, `Severity`, `ErrorType`, `AttemptEvent`, `StrokeEvent`, `RhythmTrialEvent`, `SessionRecord`, `GameSummary`, `LocalPatient`, `GameContext`, `SessionClock`. Field names mirror the Postgres columns in `docs/architecture.md` §4 exactly; renaming one is a migration, not a refactor.

`eslint.config.js` — the patient/caregiver import boundary, plus the `lucide-react` ban in `src/patient/**`. Error, not warning.

`src/ui/cn.ts` — **tailwind-merge is extended with the patient font-size scale.** It resolves `text-*` against its own idea of a size, so `text-prompt` was classified as a colour and silently dropped whenever a colour followed it, collapsing 40 px type to the 16 px browser default. Any new named size added to `tailwind.config.ts` must also be added to the `font-size` class group here or it will vanish at runtime with no error.

**Design-system contracts that are enforced nowhere but must hold:** every interactive element has a visible border *and* a fill at rest; no icon-only buttons; no scale transform on press; focus is 4 px `--focus`, never brass; `--indigo` never distinguishes two options from each other in patient mode.

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
