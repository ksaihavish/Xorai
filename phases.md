# Phases — Xorai

Sixteen phases instead of eleven. Same total work, cut into smaller pieces, with four things moved earlier because building them late means rewriting everything above them.

---

## What changed from v1, and why

| Moved | From | To | Reason |
|---|---|---|---|
| **Voice & language pipeline** | 9 | **5** | Every game is voice-led. Building four games against a stubbed `speak()` and wiring real audio at the end means retrofitting i18n keys, audio latency and precache budget into four finished games. Audio is cross-cutting, exactly like offline and the clock. This was the worst ordering error in v1. |
| **Assistance layer** | 7 | **6** | It is half the problem statement's title, it is the cheapest half to build, and most teams omit it. In v1 it sat behind all four games, so it was first in line to be cut when time ran out. |
| **Seed telemetry** | 10 | **11** (before dashboard) | v1 built the dashboard and the analysis pipeline at Phase 8 and seeded data at Phase 10. You cannot verify a flag, a suppression rule or a trend line against an empty table. Seed first, then build what reads it. |
| **First deploy** | 10 | **0** | The four-links slide needs a live URL. Deploying on day one means the link is never a scramble, and every phase ships to something real. |
| **Games** | one phase for two | **one phase each** | Two games in one phase is the biggest, riskiest block in v1. Split, so each has its own exit criterion and its own restore point. |
| **Adaptive difficulty** | 7 | **10** | It needs at least two real games to drive it. Building it before games meant testing it against nothing. |
| **Xorai Milan** | 6 | **14** | It is your own designated cut candidate (`phases.md §What to cut`, item 4). Anything you would cut first should be built last. |

**Unchanged and still right:** design system before anything is built on it; RLS before any data is written; offline and the telemetry clock before any game exists.

---

## The order

| # | Phase | Ships | Exit criterion |
|---|---|---|---|
| 0 | Foundation, tooling, **first deploy** | Repo, lint boundary rule, `CLAUDE.md`, live Vercel URL | Blank shell is live at a public URL; the boundary lint rule fires on a deliberate violation |
| 1 | Design system, patient shell, **i18n scaffold** | Tokens, patient primitives, `PatientShell` with the woven border, `i18n/en.json` + `t()` wired from the start | 60 px targets and 7:1 contrast measured on a real tablet; **no hardcoded user-facing string exists anywhere** |
| 2 | Supabase — schema, RLS, auth, consent, onboarding | Migrations, RLS, caregiver auth, six-step onboarding, DPDP consent | `tests/rls.test.ts` proves cross-caregiver isolation; withdraw-and-delete actually deletes |
| 3 | Offline layer | Dexie, outbox, sync engine, service worker, precache | Airplane-mode session survives a force-quit and syncs with **zero duplicate rows** |
| 4 | Telemetry SDK, session clock, orientation | `SessionClock`, `emit()`, `SessionRunner`, orientation warm-up, bamboo-grove close | `tests/clock.test.ts` green; hesitation computable from real `attempts` rows |
| 5 | **Voice & language pipeline** | `scripts/generate-audio.ts`, English + Assamese audio, precache wiring, Noto subsets, caregiver voice-note recording | A full orientation session runs in Assamese, offline, every prompt spoken, **zero network requests on the patient path** |
| 6 | **Assistance layer** | Reminders, family contact cards with kinship terms, one-tap call, SOS, always-available orientation card, music player | A reminder fires with audio while offline; every contact card speaks the correct kinship term |
| 7 | Game 1 — **Dhol Bator** | Pre-decoded buffers, lookahead scheduler, `rhythm_trials`, audio-clock capture | Asynchronies are in tens of ms, not hundreds — proves the audio clock is not mixed with the DOM clock |
| 8 | Game 2 — **Aponjon** | Study/test phases, expanding-interval scheduler, `retrieval_state`, kinship voice prompts, error typing | Intervals advance and drop back correctly across a session and persist across a restart |
| 9 | Game 3 — **Ghorir Chobi** | Canvas capture with coalesced events, command/copy/trace conditions, stroke persistence, replay renderer | Stored point count far exceeds frame count; replay shows pauses in the right places |
| 10 | Adaptive difficulty | Weighted staircase, severity clamp, `difficulty_state` in Postgres **and Dexie** | Play badly for ten trials: level drops by exactly one, offline, and survives a reload |
| 11 | **Seed telemetry** | `scripts/seed-telemetry.ts` — 3 patients × 60 days: stable, declining, sharp-drop-that-resolves | Index and query performance checked against real volume before anything reads it |
| 12 | Analysis pipeline | `nightly-rollup`: summaries → baselines → z-score + EWMA → flags → suppression → low-effort discriminator | Against seeded data: flag fires; `care_event` suppresses it; low-effort signature routes to the mood check-in |
| 13 | Caregiver dashboard | Trends with baseline band, compliance calendar, flag cards, **clock replay side by side**, sync status, PDF | Export a PDF and read it: disclaimer present, no banned string |
| 14 | Game 4 — **Xorai Milan** | Grids 2×2 → 4×4, cultural asset deck, spoken captions, revisit-rate telemetry | Revisit rate is computable and plausible |
| 15 | Harden, remaining languages, demo | Bodo / Manipuri / Nepali / Hindi audio, full invariant pass, banned-string grep, 3-minute video | Four links live; all four test suites green |

---

## Two things to hold constant across every phase

**Deploy every phase.** Phase 0 gets the URL live. Every phase after it pushes to that URL. You are never more than one phase away from a working demo, which is the whole point of a restore point.

**Nothing user-facing is ever hardcoded.** From Phase 1 onward, every string goes through `t()` against `i18n/en.json`. This is what makes Phase 5 a wiring job instead of a rewrite, and it is the single cheapest insurance policy in the plan.

---

## What to cut, in order, if you run out of time

1. Khasi and Mizo audio — ship the strings, fall back to caregiver voice notes
2. `export-pdf` Edge Function — show the dashboard on screen and use the browser's print-to-PDF
3. EWMA — keep the plain rolling z-score
4. **Phase 14 (Xorai Milan)** — the other three games cover every domain it covers
5. The copy condition in Ghorir Chobi — keep command only

**Never cut:** offline, the errorless contract, RLS, consent, the assistance layer, or the clock replay. Each of those is an answer to a question you will be asked, not a feature.
