# memory.md — Xorai build state

The agent updates this at the end of every phase. Humans read the top three lines.

**Current phase:** Phase 0 — Foundation, tooling, first deploy (completed)
**Last file worked on:** `memory.md`
**Next action:** Phase 1 — Design system, patient shell, i18n scaffold (Block B + amendment 1 in `docs/buildbook.md`)
**Last updated:** 2026-09-10

---

## Phase status

| # | Phase | Status | Exit criterion met? | Commit |
|---|---|---|---|---|
| 0 | Foundation, tooling, first deploy | done | ☑ scaffolding complete; boundary lint rules & build passing | `42dba45` |
| 1 | Design system, patient shell, i18n scaffold | not started | ☐ 60 px targets, 7:1 contrast; no hardcoded user-facing string | — |
| 2 | Supabase — schema, RLS, auth, consent | not started | ☐ `tests/rls.test.ts` proves cross-caregiver isolation | — |
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
| Design tokens | `src/styles/tokens.css` | empty — Phase 1 |
| Patient shell | `src/patient/shell/` | — |
| Session runner | `src/patient/session/` | — |
| Games | `src/patient/games/{aponjon,dhol-bator,xorai-milan,ghorir-chobi}/` | — |
| Assistance | `src/patient/assist/` | — |
| Onboarding | `src/caregiver/onboarding/` | — |
| Dashboard | `src/caregiver/dashboard/` | — |
| Offline | `src/core/db/` | — |
| Telemetry | `src/core/telemetry/` | — |
| Audio | `src/core/audio/` | — |
| Trace | `src/core/trace/` | — |
| Migrations | `supabase/migrations/` | empty |
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
