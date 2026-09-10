# Audit — Xorai spec files

Every finding is against the seven uploaded files. Format: what is wrong · where · what to change.

Severity: **S1** breaks the build, the demo or the central claim · **S2** a feature cannot work as specified · **S3** inconsistency a judge or an agent will trip over.

---

## S1 — will break the build, the demo, or the pitch

### 1. `cv_rt` is computed across games, which destroys the headline metric
`architecture.md §4` (`session_summaries.cv_rt = sd/mean`), `§8 step 1`.

The pitch rests on reaction-time variability. Computed per session across all trials of all games, it mixes Aponjon latencies (seconds, cognitive) with Dhol Bator tap latencies (tens of ms, motor). The resulting CV is dominated by *which games were played that day*, not by the person. Two different game pairs on two days will look like a change in the patient.

**Fix.** Compute `cv_rt` per `game_type`, store it in `domain_scores` keyed by game, and derive the session-level figure as a weighted mean of per-game CVs. Never pool raw RTs across games.

### 2. Nothing in the docs actually prevents the audio-clock bug they warn about
`rules.md §2 Timing`, `architecture.md §6`, `memory.md Notes & gotchas`.

`rhythm_trials` stores intervals, which are clock-agnostic — fine. But the same game must also emit `attempts` rows with `first_touch_at_ms` and `responded_at_ms` **as offsets from `sessionStartPerfNow`**, which is the `performance.now()` timeline. So Dhol Bator holds two clocks and must map between them, and no file says how. An agent will either put audio-clock values into `attempts` (wrong offsets) or `performance.now()` values into the asynchrony computation (meaningless asynchronies).

**Fix.** At session start, capture one anchor pair: `{ perfOrigin: performance.now(), audioOrigin: audioCtx.currentTime }`, ideally via `audioCtx.getOutputTimestamp()`. Convert with `perfMs = (audioTime - audioOrigin) * 1000 + (perfAtAnchor - perfOrigin)`. Put this in `SessionClock` as `fromAudio(t)` so no game does the arithmetic itself. Add it to `rules.md §2` as an invariant.

### 3. Dexie has no store for `difficulty_state` or `retrieval_state`
`architecture.md §5.1` (store list) vs `§9` ("mirrored in Dexie so it works offline") and `§7.1` (spaced retrieval persists across sessions).

The Dexie schema is `outbox_sessions, outbox_attempts, outbox_strokes, outbox_rhythm, local_profile, asset_manifest, sync_meta`. Neither adaptive state nor retrieval state has anywhere to live locally, so the adaptive-difficulty exit criterion cannot pass offline and Aponjon's intervals reset on every reload.

**Fix.** Add `difficulty_state: '[patient_id+game_type], updated_at'` and `retrieval_state: '[patient_id+family_member_id], updated_at'` to `db.version(1)`.

**And note the conflict rule is different.** Telemetry is append-only, so `upsert(..., ignoreDuplicates: true)` is a complete idempotency story. These two tables are read-modify-write. Two devices, or one device replaying a stale local row, will silently clobber. Specify last-write-wins on a server-side `updated_at`, and never let a stale local row overwrite a newer server row.

### 4. Offline reminders with the tablet locked are not achievable in a PWA
`phases.md Phase 7 exit`, `buildbook.md Phase 7`, `prd.md §5.1`.

The exit criterion is "set a reminder two minutes out, go offline, lock the tablet: it fires with audio." Notification Triggers (`showTrigger`) was never shipped to stable. With the PWA backgrounded and the screen locked, no timer runs and no service worker wakes on schedule.

**Fix — pick one now and write it into the docs:**
- **(a) Kiosk mode.** The tablet stays awake and foregrounded in the patient's room. This is the realistic deployment for a shared household tablet, it makes the wake lock load-bearing rather than incidental, and it is completely defensible in the pitch.
- **(b) TWA / Capacitor shell** for exact alarms, at the cost of the "one PWA, no store review" argument.
- **(c) Caregiver-side push** from a server cron — works, but requires network, which contradicts the offline claim.

(a) is the honest answer for v1. Change the exit criterion to match, or a judge will ask you to demonstrate it and it will fail on stage.

### 5. Supabase free projects pause after inactivity
`buildbook.md Accounts to create first`.

If judges open the hosted link weeks after submission, the database is asleep and the demo errors. Nothing in the docs mentions this.

**Fix.** A scheduled ping (GitHub Action, daily `select 1`), or a paid month across the judging window. Cheap insurance on the single most-weighted asset you have.

### 6. Frozen baselines will manufacture a false decline flag for everyone
`architecture.md §8 step 2`.

Freeze mean and SD at 10 sessions and never re-estimate. Practice effects push performance up over the following weeks, so every patient looks like they are improving. When the practice effect saturates, the z-score falls back toward and below zero — and a cohort-wide decline flag fires at roughly the same point in every patient's timeline. A clinician judge will find this.

**Fix.** Exclude the first three sessions from the baseline window (they are learning the interface, not being measured), widen the baseline to sessions 4–13, and state openly that a fixed personal baseline is the v1 simplification and that a rolling reference with an explicit anchor is the v1.1 plan. Saying this scores better than not having noticed.

### 7. The banned-string grep test fails on day one
`rules.md §2 Data & language`, `phases.md Phase 10`, `buildbook.md Phase 10`.

The banned list — "diagnosis", "diagnose", "stage", "MMSE", "MoCA", "screening result" — is scoped to "anywhere in the product, including comments and commit messages". But `prd.md`, `architecture.md`, `design.md` and `rules.md` itself ship inside the repo (`docs/`, `.claude/rules/`) and contain all of those words repeatedly. "stage" also matches `staging`, `staged`, `stageRef`.

**Fix.** Scope the grep to `src/**` and `i18n/**`, use word boundaries (`\bstage\b`), and add an explicit `docs/` and `.claude/` exclusion with a one-line comment explaining why.

---

## S2 — a specified feature cannot work

### 8. Orientation's "where are you" question can never run
`buildbook.md Phase 4 step 6` reads the place from "the patient profile's location". `architecture.md §4` `patients` has no such column. The instruction says to skip the question if absent, so one of four orientation questions dies silently and the orientation domain score is computed from three.

**Fix.** Add `home_place text` to `patients` in `0001_init.sql`, and collect it in onboarding step 1.

### 9. `sessions` cannot store the pointer sample interval
`architecture.md §6` and `buildbook.md Phase 4 step 1` both require storing the device's measured sample interval on the session. `sessions` has no such column, and migrations are forward-only.

**Fix.** Add `pointer_sample_interval_ms real` to `sessions` in `0001`.

### 10. `attempts.domain` is singular; `Game.domains` is an array
`architecture.md §4` vs `§7`. Aponjon declares memory + language; an attempt row can carry one. `baselines` is keyed `(patient_id, domain)`, so whichever domain is dropped never gets a baseline.

**Fix.** Either `domain text[]` on `attempts` with a GIN index, or — simpler and enough for v1 — each game declares one `primaryDomain` for telemetry and the extra domains stay documentation. Write down which you chose.

### 11. `retrieval_state` has no history, but the dashboard promises a trend
`architecture.md §4`, `prd.md §5.1` ("holds Priya's name for 8 minutes, was 2 in July").

`retrieval_state` is one current row per (patient, family member). There is no way to answer "was 2 in July".

**Fix.** Write `current_interval_s` onto the Aponjon `attempts` row (or a small `retrieval_history` table) so the value is a time series. This line is one of the most persuasive things in the product; it needs data behind it.

### 12. The offline dashboard has nothing to render
`architecture.md §5.2` keeps seven days of rows locally "so the caregiver dashboard works offline". But the dashboard renders `session_summaries`, `baselines` and `flags` — all server-only, none of them in the Dexie schema.

**Fix.** Either add a `cached_summaries` store populated on each successful sync, or drop the claim and state that the dashboard is online-only while the patient path is fully offline. The second is a perfectly good answer; the current docs claim the first and deliver neither.

### 13. `flags` has no uniqueness, and the rollup runs on demand
`architecture.md §8` ("plus on demand when the caregiver opens the dashboard"), `rules.md §4` ("Idempotent — safe to re-run any night").

Nothing gives the upsert something to conflict on. Three dashboard refreshes produce three identical flags.

**Fix.** `unique(patient_id, domain, window_start, window_end)` on `flags`, and upsert against it.

### 14. `patients.severity NOT NULL` breaks resumable onboarding
`architecture.md §4` vs `buildbook.md Phase 2 step 6` ("one step per screen, resumable, saving after each step"). Severity is step 2; the patient row is created at step 1. The insert fails.

**Fix.** Make `severity` nullable with a `baseline_status`-style gate, or create the patient row only when step 2 completes and hold step 1 in local state.

### 15. Sync flush order omits half the offline-originated tables
`architecture.md §5.2`: `sessions → attempts → strokes → rhythm`. Missing: `reminder_logs` (generated offline by design), `care_events`, `informant_checks`, `difficulty_state`, `retrieval_state`.

**Fix.** Extend the flush order and say which tables are append-only (idempotent upsert) and which are state (last-write-wins). See finding 3.

### 16. `media_assets` has no alt text
`design.md §10` requires alt text in the active language for every image. Nothing stores it.

**Fix.** Add `alt_text_key text NOT NULL` and generate from `item_name_key` where they coincide.

### 17. Precache budget already fails at its own stated ceiling
`architecture.md §5.3`: "≤ 200 KB per image, ~150 images → under 30 MB". That is 30 MB exactly, before audio, fonts and the app shell — and the same section says to precache **all** pre-generated audio, which across seven languages is many times the image pack.

**Fix.** Drop the image ceiling to 80–120 KB (square WebP at 512 px is comfortably under 100 KB), precache audio for the **selected language only**, runtime-cache the rest. Add a build-time assertion that fails the build above 25 MB.

---

## S3 — inconsistencies between files

### 18. The exit PIN exists in one file and is unimplementable
`architecture.md §3` says press-and-hold **then a 4-digit caregiver PIN**. `design.md §5`, `phases.md Phase 1`, `memory.md` all say hold only. Nothing collects a PIN in onboarding and `caregivers` has no `pin_hash`.

**Fix.** Decide. If you keep the PIN, add `caregivers.pin_hash` and an onboarding step. Hold-only is defensible for v1 — a patient will not discover a 3-second hold in an unmarked corner.

### 19. The replay-audio button violates your own icon rule
`design.md §4` draws it as `[ ▶ ]`. `design.md §5` and `rules.md §3` both ban icon-only buttons in patient mode and require icon **and** word.

**Fix.** Make it icon + the word for "listen again" in the active language. It is the most-used control in the product; it should be the one that most obeys the rule.

### 20. `lucide-react` "caregiver mode only" is unenforced
`rules.md §3`. The ESLint rule only restricts patient↔caregiver imports, so nothing stops a lucide import in `src/patient/`.

**Fix.** Add `lucide-react` to `no-restricted-imports` for `src/patient/**`, and hand-draw the handful of patient icons as inline SVG so they can carry the 3 px stroke weight the design system uses everywhere else.

### 21. The Framer Motion line is self-contradictory
`rules.md §3`: "Framer Motion in `src/patient/**` — Ambient motion is banned there. **Allowed nowhere else it is needed.**" That sentence has no coherent reading, and Framer Motion is not in the allowed list either, so it is in fact banned everywhere.

**Fix.** "Banned in `src/patient/**`. Not currently used in caregiver mode either — the clock replay is a canvas animation, not a component transition."

### 22. PHQ-2 contradicts the scope boundary
`architecture.md §8.1`, `§4` (`informant_checks.instrument IN ('iqcode_short','phq2')`) vs `prd.md §2` ("We do not screen") and `rules.md §2` (bans "screening result").

Also, PHQ-2 is a two-item depression screen administered to the person, not to an informant about them. As specified — prompted to the caregiver — it is not PHQ-2 and calling it that is the same category of over-claim you correctly refuse elsewhere.

**Fix.** Rename to an unscored **mood check-in**: two plain-language questions to the caregiver about the patient's mood and interest, no score, no threshold, output is a suggestion to raise low mood at the next appointment. Change the enum to `('informant_short','mood_checkin')`.

### 23. `iqcode_short` asserts a named instrument
Same reasoning that made you ban MMSE and MoCA. `prd.md §5.1` correctly says "IQCODE-style"; the schema drops the hedge.

**Fix.** `informant_short`.

### 24. `accuracy_hint_adjusted` has no definition
It is a `session_summaries` column and a Phase 8 deliverable with no formula anywhere.

**Fix.** Define it as accuracy with hinted trials counted as incorrect, and state it in `architecture.md §8 step 1`. This is the number that makes `prd.md §6.3` ("accuracy is inflated by design") true rather than rhetorical.

### 25. EWMA is undefined relative to the rolling mean
`architecture.md §8 step 3`: `z` uses a 7-day rolling mean; "EWMA (α = 0.3) runs alongside to smooth noise." α = 0.3 on a daily series has an effective window of about six days — shorter than the mean it is smoothing. Double-smoothing, and "alongside" is not a specification.

**Fix.** Apply EWMA to the raw daily domain score and compute `z` from the EWMA value, or drop EWMA for v1. Do not run both on the same series.

### 26. The difficulty staircase and the hint threshold will oscillate
`architecture.md §9`: level drops if `window_accuracy <= 0.60` **or** `hint_rate >= 0.40`. Hints fire automatically on hesitation (`prd.md §6.3`), so a slow but perfectly accurate patient trips the hint condition at 100% accuracy and gets demoted, which shortens latencies, which lifts them again.

**Fix.** `if (accuracy <= 0.60) or (hint_rate >= 0.40 and accuracy < 0.85)`.

### 27. Wake lock and orientation lock have unstated preconditions
`architecture.md §3`, `phases.md Phase 1`. `navigator.wakeLock` releases on tab hide and needs re-acquiring on `visibilitychange`. `screen.orientation.lock()` requires fullscreen and is unsupported on iOS Safari entirely.

**Fix.** Request fullscreen on entering patient mode, re-acquire the wake lock on `visibilitychange`, and add both to Phase 1's exit criterion. Without the re-acquire the screen dies mid-session, which is the failure the patient cannot recover from.

### 28. The stroke-capture rule can produce fewer points, not more
`rules.md §2`: "uses `pointerrawupdate` where available and stores every point from `getCoalescedEvents()`". `pointerrawupdate` already delivers the un-coalesced high-frequency stream; calling `getCoalescedEvents()` on one typically returns just that event. An agent implementing the sentence literally can end up with fewer points than plain `pointermove` + coalesced, and the failure is silent — the trace still looks fine.

**Fix.** Spell out the ladder: `pointerrawupdate` **alone** where available (Chromium, secure context); otherwise `pointermove` **with** `getCoalescedEvents()`. De-duplicate by timestamp. Phase 9's exit check (point count ≫ frame count) catches this, so keep it.

### 29. Phase 9's "zero network requests" will be false
Supabase Auth `autoRefresh` fires on a timer regardless of the patient session.

**Fix.** Scope the criterion to the patient path, or disable `autoRefreshToken` while patient mode is active.

### 30. `prd.md §5.3` under-claims your own domain coverage
It says DSM-5 requires decline in one of six domains "and we cover four". The four games cover memory/learning, language, complex attention, perceptual-motor and executive — five of six. Only social cognition is absent, which is the one you deliberately cut.

**Fix.** Say five. Free points.

### 31. A live demo cannot produce a flag
A 7-day rolling mean plus a 14-day sustain rule means the earliest possible flag is around day 24 of real use. Only seeded data can show one.

**Fix.** Not a bug — but say it in the video script and in Q&A before someone asks why the flag appeared instantly. "This is 60 days of synthetic telemetry; here is the seed script" is a strong answer. "It just appeared" is not.

### 32. Design tokens do not meet the contrast law they declare

Measured, not estimated:

| Pair | `design.md` claims | Actual | Verdict |
|---|---|---|---|
| `--ink` on `--paper` | ~14:1 | **15.14:1** | passes, understated |
| `--clay` on `--paper` | ~7.2:1 | **6.26:1** | **fails the stated AAA 7:1** |
| `--madder` on `--paper` | ~6.2:1 | 5.85:1 | fill-only, so fine |
| `--tea` on `--paper` | "passes" | 9.88:1 | passes |
| `--brass` on `--paper` | — | **2.91:1** | **fails 3:1 for the focus ring** |

`--clay` is the designated secondary-text colour and it does not clear the law the file itself sets. `--brass` is the 4 px focus-ring colour and misses the 3:1 non-text minimum.

**Fix.** `--clay: #5E5142` (≈7.4:1). Focus rings in `--madder-deep` (8.35:1) or `--tea`; keep brass for reward fills only, where it sits under dark text and measures 10.7:1.

### 33. The design viewport is specified by width only
`design.md §10` assumes ≥1024 px landscape; `prd.md §4` targets 7–10" tablets. A 7" tablet is typically 1024×600. With a 40 px prompt, 72 px buttons, 240 px cards, 24 px gaps and the woven border, 600 px of height is very tight.

**Fix.** State the design viewport as **1024×600**, and make the border thickness responsive rather than fixed.

### 34. Ownership clash on the demo video
`memory.md` assigns the deck and video to content owner 4; `phases.md` Phase 10 lists the video as a build deliverable.

**Fix.** Cosmetic, but pick one before submission week.
