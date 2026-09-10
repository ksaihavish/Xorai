# memory.md — Xorai build state

The agent updates this at the end of every phase. Humans read the top three lines.

**Current phase:** Phase 2 — Supabase: schema, RLS, auth, consent (completed)
**Last file worked on:** `memory.md`
**Next action:** Phase 3 — Offline layer (Block D + amendment 3 in `docs/buildbook.md`)
**Last updated:** 2026-09-10

---

## Phase status

| # | Phase | Status | Exit criterion met? | Commit |
|---|---|---|---|---|
| 0 | Foundation, tooling, first deploy | done | ☑ scaffolding complete; boundary lint rules & build passing | `42dba45` |
| 1 | Design system, patient shell, i18n scaffold | done | ☑ 60 px targets, 7:1 contrast; tokens, primitives, patient & caregiver shells, /demo harness | `10c8791` |
| 2 | Supabase — schema, RLS, auth, consent | done | ☑ schema & RLS migrations written, auth, onboarding, consent, rls.test.ts | `aa27e5e` |
| 3 | Offline layer | not started | ☐ airplane-mode session survives force-quit, syncs with zero dupes | — |
| 4 | Telemetry SDK, clock, orientation | not started | ☐ `tests/clock.test.ts` green; hesitation computable from real rows | — |
| 5 | Voice & language pipeline | not started | ☐ full Assamese session offline, zero requests on the patient path | — |
| 6 | Assistance layer | not started | ☐ reminder fires with audio offline; kinship terms spoken correctly | — |
| 7 | Dhol Bator | not started | ☐ asynchronies in tens of ms, not hundreds | — |
| 8 | Aponjon | not started | ☐ retrieval intervals advance, drop back, and survive a restart | — |
| 9 | Ghorir Chobi | not started | ☐ point count >> frame count; replay shows pauses in the right places | — |
| 10 | Adaptive difficulty | not started | ☐ level moves exactly one step, offline, and survives a reload | — |
| 11 | Seed telemetry | not started | ☐ 60 days x 3 patients; index performance checked at volume | — |
| 12 | Analysis pipeline | not started | ☐ flag fires; care_event suppresses it; low effort routes to mood check-in | — |
| 13 | Caregiver dashboard | not started | ☐ PDF exports with disclaimer and no banned string | — |
| 14 | Xorai Milan | not started | ☐ revisit rate computable and plausible | — |
| 15 | Harden, languages, demo | not started | ☐ four links live; all four test suites green | — |

Status values: `not started` · `in progress` · `blocked` · `done`

---

## Completed phases log

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
| Telemetry contract | `src/core/telemetry/types.ts` | written — types only |
| Boundary lint rule | `eslint.config.js` | written and verified |
| Design tokens | `src/styles/tokens.css` | written |
| Tailwind theme | `tailwind.config.ts` | written |
| Fonts | `public/fonts/` | 14 woff2 subsets + `fonts.css`, 1.19 MB |
| Patient primitives | `src/ui/` | `cn`, `PatientButton`, `PatientCard`, `Prompt`, `ReplayAudioButton` |
| Caregiver shell | `src/caregiver/AppShell.tsx` | written |
| Design harness | `/demo` route | written |
| Patient shell | `src/patient/shell/` | `PatientShell`, `WovenSessionBorder`, `weave.ts`, `ExitGuard`, `useKioskLocks` |
| Session runner | `src/patient/session/` | — |
| Games | `src/patient/games/{aponjon,dhol-bator,xorai-milan,ghorir-chobi}/` | — |
| Assistance | `src/patient/assist/` | — |
| Onboarding | `src/caregiver/onboarding/` | 6 steps + api + zod schemas |
| Dashboard | `src/caregiver/dashboard/` | — |
| Offline | `src/core/db/` | — |
| Telemetry | `src/core/telemetry/` | types only |
| Supabase client | `src/core/supabase/client.ts` | written; `types.ts` not yet generated |
| Auth | `src/caregiver/auth/` | email+password, reset, phone OTP behind the flag |
| Consent + withdrawal | `src/caregiver/settings/ConsentSettings.tsx` | written |
| i18n | `src/core/i18n/` + `i18n/en.json` | scaffold built this phase |
| Audio | `src/core/audio/` | — |
| Trace | `src/core/trace/` | — |
| Migrations | `supabase/migrations/` | `0001_init.sql`, `0002_rls.sql` — **written, not applied** |
| Edge Functions | `supabase/functions/` | — |
| Scripts | `scripts/` | — |

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
