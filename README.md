# Xorai

An offline-first, voice-first tablet app for elderly people living with dementia
in India's North Eastern Region, and for the family member who looks after them.

SIH problem statement **26003**.

---

## What it is

Two modes in one installable PWA.

**Patient mode** is a locked, simplified surface: four culturally grounded
cognitive games and a memory-assistance layer (faces, reminders, contacts, SOS).
It runs full-screen in landscape on a tablet, speaks every instruction aloud, and
works with no network at all.

**Caregiver mode** is onboarding plus a longitudinal dashboard. It shows one
person's scores against *their own* earlier scores, a session calendar, spaced
retrieval progress, two clock drawings replayed side by side, and — when the
numbers warrant it — a flag written in plain language.

The four games:

| Game | In English | Measures |
| --- | --- | --- |
| **Aponjon** | *kinship* | Face–name recall, spaced retrieval, error typing |
| **Dhol Bator** | *drum beats* | Rhythm reproduction, attention, motor timing |
| **Xorai Milan** | *xorai matching* | Executive function, set-shifting |
| **Ghorir Chobi** | *picture of a clock* | Clock drawing: stroke kinematics and pauses |

Everything is built around kinship terms rather than names, because "which one
is your *mother's brother*" is a different question from "which one is Rajesh" —
and in Khasi, which is matrilineal, the maternal uncle (*kni*) is the
structurally central relation, not a detail.

---

## The scope boundary

**This product does not diagnose, does not stage, and does not screen.**

It is not a cognitive test and it is not equivalent to one. It does not
reproduce MMSE or MoCA, and it does not claim to substitute for either.

Every comparison it makes is **within-person by design**: a score today against
that same person's own baseline from sessions 4–13, never against a population
norm, never against another patient. When it raises a flag, the flag says that
*this person's* scores have been lower than *their own* usual for a fortnight,
and it lists the ordinary reasons that happens — illness, poor sleep, a
medication change, low mood — before suggesting it might be worth mentioning to
a doctor.

Three things it deliberately refuses to do:

- **It will not tell the patient they were wrong.** No score, no percentage, no
  streak, no leaderboard, no red cross. A person with dementia who is told they
  failed does not learn from it; they learn that the tablet is a place where
  they fail, and they stop picking it up. A product nobody will touch measures
  nothing. This is enforced in CI, not just in review — see
  `tests/invariants.test.ts`.
- **It will not read a bad fortnight as a decline.** An excursion must be
  sustained fourteen days, and three suppression rules sit in front of the flag
  (insufficient data → a logged care event → low effort).
- **It will not confuse "not trying" with "cannot".** High omissions, an
  abandoned session, long latencies, *and low hint usage* is the signature of
  disengagement, not impairment — the person who is struggling triggers hints,
  the person who has checked out does not. That routes to an unscored mood
  check-in and never to a decline flag.

The disclaimer required by `docs/prd.md` §2 appears in full on the dashboard and
on every exported PDF.

---

## Stack

Fixed, with no substitutions:

Vite 6 · React 19 · TypeScript strict (`noUncheckedIndexedAccess`) · Tailwind
3.4.17 (pinned exactly, no caret) · shadcn/ui (copy-in) · TanStack Query v5 ·
Zustand v5 · Dexie 4 · vite-plugin-pwa (injectManifest) · supabase-js v2 ·
Recharts · react-i18next · date-fns · zod · Vitest.

Three things worth knowing before reading the code:

**The timing contract.** `Date.now()` is banned everywhere in `src/core/telemetry/`
and `src/patient/`. Wall clock is not monotonic — NTP steps it, the device
sleeps, the user changes it — so a reaction time computed from it is not a
reaction time. Every `*_ms` field is an offset from one `performance.now()`
origin captured at session start. Rhythm timing lives entirely on
`audioCtx.currentTime`, joined to the session clock by a single anchor. There
are exactly two allowlisted exceptions and `tests/invariants.test.ts` prints
them on every run.

**Offline is the default, not a degraded mode.** Writes go to a Dexie outbox and
sync when there is a connection. Idempotency is one line: every row carries a
`client_event_id` and every upload is
`upsert(..., { onConflict: 'client_event_id', ignoreDuplicates: true })`. There
is no reconciliation logic because there is nothing to reconcile.

**The patient/caregiver boundary is enforced.** The two modes share
`src/core/**` and `src/ui/**` and nothing else. Lint enforces it as an error in
both directions, and the test suite asserts it again, because lint is a separate
command a hurried person can skip.

---

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
```

```bash
npm run build          # tsc --noEmit && vite build (asserts the precache budget)
npm run preview        # serve the production build
npm test               # 146 tests
npm run lint
```

### Configuration

`.env.local` is **not** created for you and contains no placeholder values — a
placeholder secret is worse than an empty one, because it looks configured.
Copy the template already in the repo and fill it in:

```
VITE_SUPABASE_URL=          # Supabase → Project Settings → API → Project URL
VITE_SUPABASE_ANON_KEY=     # ...→ Project API keys → anon / public
VITE_ENABLE_PHONE_OTP=false # phone OTP needs a paid SMS provider
VITE_APP_VERSION=0.1.0
```

The `service_role` key never goes in this file. Anything prefixed `VITE_` is
compiled into the browser bundle; `service_role` belongs in Supabase Edge
Function secrets only.

The app runs without Supabase — patient mode is fully functional offline. What
you lose is sign-in, sync, and the dashboard.

### Database

Run these in the Supabase SQL editor, in order:

```
supabase/migrations/0001_init.sql            tables
supabase/migrations/0002_rls.sql             row-level security, storage buckets
supabase/migrations/0004_attempt_features.sql
supabase/migrations/0005_views.sql           dashboard views
supabase/migrations/0006_perf_indexes.sql    dashboard read-path indexes
```

`tests/rls.test.ts` runs against a real project and is **red until you do this**,
by design. It is the only test that talks to a network, and a green RLS suite
that never connected to anything would be worse than a red one.

---

## Seeding

```bash
npx tsx scripts/seed-telemetry.ts --dry-run          # prints the summary, writes JSON
npx tsx scripts/seed-telemetry.ts --url <URL> --key <SERVICE_ROLE_KEY>
```

Sixty days for three synthetic patients — deterministic, from a seeded PRNG, and
attached to nobody real. Together they are the argument that the analysis works.

| | | What it proves |
| --- | --- | --- |
| **Nirmala** | stable | The negative control. Normal day-to-day noise, **nothing fires.** The test that matters most and the one most likely to be skipped. |
| **Dipali** | declining | Memory goes amber, then red, and is still red today. Executive follows at amber. Attention, motor and orientation stay quiet — a decline that hit every domain equally would look like a broken device, not like this. |
| **Anjali** | confound | A chest infection with a slow recovery. Flags fire in three domains and **every one is suppressed as `care_event`** — then it resolves on its own and the dashboard goes quiet without anyone intervening. |

Anjali is the one to look at. Telling an infection from a dementia decline is
the whole problem; anything that flags both is a smoke alarm that goes off when
you make toast.

The seeder also writes the flag rows the nightly rollup *would* have written on
each of those sixty nights, importing the arithmetic from
`supabase/functions/nightly-rollup/analysis.ts` rather than reimplementing it.
It has to: the rollup only ever evaluates the last fourteen days, so running it
once today finds Dipali's decline and misses Anjali's illness entirely — it
resolved a fortnight ago. Without the replay, the one screen that proves the
suppression logic works is empty.

**The profile seeds are chosen, and the verdicts they produce are asserted in
`tests/analysis.test.ts`.** That is worth being upfront about, because picking a
seed can be a way of hiding a problem and here it is the opposite. Run the
declining profile across thirty seeds and it flags on roughly a third of them
with an identical underlying decline. The cause is not the seed: the baseline SD
is estimated from ten EWMA-smoothed points, which are heavily autocorrelated, so
its effective sample size is nearer three, and the same profile yields baseline
SDs from 0.02 to 0.11 — a fivefold spread in the denominator of every z-score
downstream. Sixty days is a short history for a rule that needs thirteen sessions
of baseline plus fourteen sustained days on top. The seeds are fixed and asserted
so a change to the arithmetic fails a test rather than silently emptying the demo.

---

## Performance

Measured over the seeded volume — 134 sessions, 6,300 attempts, 888 stroke
points, 48 flags:

| | |
| --- | --- |
| Generate all three patients, 60 days | 6.8 ms |
| `computeSummary` across all 134 sessions | 1.3 ms |
| `computeBaseline`, 5 domains | 0.01 ms |
| `evaluateDomain`, 5 domains, one night | 0.02 ms |
| Full 60-night flag replay, 3 patients × 5 domains | 1.8 ms |

The analysis is not a bottleneck and no amount of seeding will make it one. The
cost is in the payload: roughly 550 KB of attempts per patient for sixty days,
which is why the dashboard reads aggregate views and never touches `attempts`.

Two missing indexes were found by reading the dashboard's queries against the
schema and added in `0006_perf_indexes.sql`. The significant one is on `strokes`:
`fetchClockDrawings` filters by `patient_id`, the table had only a `session_id`
index, and `strokes` is by far the widest table in the schema — each row carries
a `points` jsonb array. That query was scanning every patient's drawings to find
one patient's.

**These are not EXPLAIN numbers.** There is no Supabase project connected to this
checkout, so the database side was reasoned about rather than measured, and no
millisecond figure is claimed for it. Anyone with the project connected should
run `EXPLAIN (ANALYZE)` on `fetchClockDrawings` either side of that migration.

---

## Deploying

```bash
npm i -g vercel
vercel link
vercel --prod
```

`vercel.json` sets the SPA rewrite, and marks `sw.js`, `registerSW.js`,
`index.html` and the manifest as must-revalidate while fingerprinted assets get
a year. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel
project's environment variables before the first production build — Vite inlines
them at build time, so setting them afterwards requires a redeploy.

Verify on the production URL, not just locally: install the PWA, then turn the
network off and **hard-reload a deep route** such as `/p`. In-app navigation
will keep working offline no matter what, because React Router never touches the
network — the failure only shows on a cold load, which is exactly what a kiosk
tablet does when the OS restarts its webview or the device reboots.

That case was broken until this phase. `injectManifest` does not add a
navigation fallback the way `generateSW` does, so with the server stopped `/`
loaded from the precache and `/p`, `/demo` and `/settings` were Chrome's error
page. `src/sw.ts` now registers a `NavigationRoute` bound to the app shell, with
the Supabase paths denylisted so an API call can never be answered with HTML.
Verified both ways by A/B: without it, the error page; with it, patient mode
renders with the server dead.

---

## The four demo links

Replace the host with your deployment.

| | |
| --- | --- |
| **`/p`** | **Patient mode.** The locked surface. Full-screen landscape, voice-first, works with the network off. Hold the corner to exit — there is no PIN, by design: a PIN is one more thing for a caregiver to forget and one more thing for a patient to be frightened by. |
| **`/`** | **Caregiver dashboard.** Within-person trends, session calendar, spaced retrieval progress, two clock drawings replayed side by side, flags in plain language. Needs sign-in and seeded data. |
| **`/onboarding`** | **Caregiver onboarding.** Consent, the patient's details, family members with photographs and kinship terms, music, reminders. This is where the product learns who the family is. |
| **`/demo`** | **Design harness.** Patient and caregiver surfaces stacked on one page so the two design systems can be compared directly. They share a palette and nothing else — which is the point. Hardcoded English, no telemetry. |

---

## What is not finished

Honest list, because a demo that hides these is worth less than one that does not:

- **`public/audio/` is empty.** The Bhashini pipeline (`scripts/generate-audio.ts`)
  is written and refuses to run on a missing key rather than shipping silence.
  Until it is registered, nothing speaks. Text is unaffected.
- **Translations are stubs.** All seven NER languages ship as empty bundles, which
  is safe: i18next falls back to English for a missing key, so an untranslated
  language renders English rather than invented Indic text. The parity test
  enforces that each file is either *empty or complete* — a half-translated
  language is worse than an English one, because the patient hears their own
  language and then, mid-session, does not.
- **Kinship terms per language, and the photographic deck**, are owner-supplied.
  Nothing here invents a kinship term.
- **PWA icons and drum samples are placeholders.**
- **`tests/rls.test.ts` is red** until the migrations are applied. See above.

---

## Layout

```
src/core/        shared by both modes — telemetry, db, audio, trace, i18n, difficulty
src/patient/     the locked surface. No caregiver imports. No icon library.
src/caregiver/   onboarding and dashboard. No patient imports.
src/ui/          the design system, shared
supabase/        migrations and edge functions (nightly-rollup, export-pdf)
scripts/         seed-telemetry, generate-audio, build-asset-pack
tests/           146 tests; invariants.test.ts is the rules.md §2 gate
docs/            the source of truth — rules, architecture, design, prd, phases
```

When the code and `docs/` disagree, `docs/` wins.
