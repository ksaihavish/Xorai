# Rules — Xorai

Rules for any AI coding agent working in this repository. Read this file before touching code, every session. If a rule here conflicts with a prompt in `buildbook.md`, **this file wins** — say so and stop.

---

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

---

## 3. Libraries

### Use these
`react` 19 · `react-dom` · `typescript` · `vite` · `tailwindcss@3.4` · `shadcn/ui` (copy-in) · `@tanstack/react-query` v5 · `zustand` · `dexie` + `dexie-react-hooks` · `vite-plugin-pwa` · `@supabase/supabase-js` v2 · `recharts` · `react-i18next` + `i18next` · `date-fns` · `uuid` (v7) · `clsx` + `tailwind-merge` · `lucide-react` (caregiver mode only) · `zod` (validate anything crossing the network or coming out of Dexie) · `vitest` + `@testing-library/react` · `@vitejs/plugin-react`

### Do not use, and the reason
| Banned | Why |
|---|---|
| Next.js | RSC + service worker = unreliable offline. Settled decision. |
| Firebase / Firestore | The core workload is relational time-series queries. Wrong tool. |
| Tailwind v4 | Config moved into CSS; agents get it wrong. Stay on 3.4. |
| Tone.js | A library between us and `AudioContext.currentTime` is a measurement liability. |
| Framer Motion | Banned in `src/patient/**` — ambient motion is banned there. Not used in caregiver mode either: the clock replay is a canvas animation, not a component transition. |
| moment, dayjs | `date-fns` only. |
| Prisma, Drizzle | Supabase generates types from the schema. One source of truth. |
| Redux, MobX, Recoil | Zustand + TanStack Query cover it. |
| Any UI kit (MUI, Chakra, Ant, Mantine) | The accessibility requirements are stricter than any kit's defaults and we must own the component code. |
| Any runtime translation or TTS API | Everything is pre-generated at build time. Offline is not optional. |
| `localStorage` for telemetry | IndexedDB via Dexie. localStorage is synchronous, small, and lossy. |
| Any analytics SDK | We are processing health-adjacent data under DPDP. No third-party beacons. |
| Icon-only buttons in patient mode | See `design.md §5`. |

---

## 4. Error handling

**Layered by audience.**

| Layer | Behaviour |
|---|---|
| Patient UI | Never surfaces an error. Degrade silently: audio fails → show text and keep going; asset fails → skip that stimulus and log it; sync fails → queue and continue. The session always completes. |
| Caregiver UI | Normal error states. Name what happened and the next action. No apology, no vagueness, no raw error codes. Empty states are an invitation to act, not a shrug. |
| Sync engine | Retries with exponential backoff (1s, 2s, 4s … cap 5 min). Never throws into the UI. Surfaces only as the "last synced" indicator. |
| Edge Functions | Structured JSON errors, logged with `patient_id` but never with names, photos, or free text. Idempotent — safe to re-run any night. |

Rules:
- Wrap every Supabase call. A rejected promise from `supabase-js` must never reach a component.
- `zod`-parse everything crossing a boundary: network responses, Dexie reads, and Edge Function payloads. Dexie data can be stale from a previous schema version.
- Fail loudly in development, silently in patient mode in production. Use a `__DEV__` guard.
- Never swallow an error without recording it. Silent `catch {}` is banned; `catch { logSilent(e) }` is the pattern.

---

## 5. Database

- Migrations are **numbered, forward-only, and never edited after being applied.** Fixing a mistake means a new migration.
- RLS is enabled on every table before any data is written to it. Not after.
- `tests/rls.test.ts` asserts cross-caregiver isolation and must never be deleted or skipped. It is the artifact behind the answer "how is patient data isolated".
- Regenerate `src/core/supabase/types.ts` after every migration. Do not hand-edit it.
- Indexes: `attempts(patient_id, created_at)`, `attempts(session_id)`, `sessions(patient_id, started_at)`, `strokes(session_id)`. Add before seeding 60 days of data, not after it is slow.

---

## 6. Git

- Commit after every phase that passes Verify. Each phase is a restore point.
- `.gitignore` covers `.env*`, `node_modules/`, `dist/`, `.vercel/`, `supabase/.temp/`.
- Never commit a real family photo, a real patient name, or an audio file containing a real voice. Seed and demo data is synthetic, and the demo video uses synthetic profiles.
- Asset commits include the licence CSV row in the same commit as the image.

---

## 7. What to do when stuck

Stop and ask. Do not:
- guess a schema shape,
- install a library to route around a problem,
- disable a lint rule or a type check,
- comment out a failing test,
- or reimplement something that already exists in `src/core/`.

A question costs one message. A wrong guess costs a phase.
