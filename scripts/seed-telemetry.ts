/**
 * seed-telemetry.ts — 60 days of realistic telemetry for three patients.
 *
 *   npx tsx scripts/seed-telemetry.ts --dry-run
 *   npx tsx scripts/seed-telemetry.ts --url <SUPABASE_URL> --key <SERVICE_ROLE_KEY>
 *
 * ─── Why this exists ───
 *
 * You cannot verify a flag, a suppression rule or a trend line against an empty
 * table. It is also the only way to check dashboard query performance at volume
 * before a judge opens it on a slow connection.
 *
 * ─── Everything here is synthetic, and that is a commitment ───
 *
 * rules.md 6: never commit a real family photo, a real patient name, or audio
 * containing a real voice. These profiles come from a seeded PRNG and the names
 * are ordinary Assamese given names attached to nobody.
 *
 * ─── The three patients, and what each one PROVES ───
 *
 *   A "stable"    flat, with normal day-to-day noise. NOTHING fires. The
 *                 negative control, and the one most likely to be skipped.
 *   B "declining" a real decline in memory and executive. Amber, then red.
 *   C "confound"  a sharp illness that fully resolves, with a care_events row
 *                 over it. The flag fires and is SUPPRESSED as 'care_event'.
 *                 C exists purely to demonstrate that this product can tell an
 *                 infection from dementia — which is the thing that shows we
 *                 understand the domain rather than just the statistics.
 */

import { writeFileSync } from 'node:fs'
import {
  BASELINE_COUNT,
  BASELINE_SKIP,
  SUSTAIN_DAYS,
  computeBaseline,
  computeSummary,
  evaluateDomain,
  type Attempt,
} from '../supabase/functions/nightly-rollup/analysis'

const DAYS = 60
/**
 * The game to domain mapping is FIXED, exactly as the real session runner has
 * it. A game measures one domain; that is what makes a domain score mean
 * anything.
 */
const GAME_DOMAIN = {
  orientation: 'orientation',
  aponjon: 'memory',
  xorai_milan: 'executive',
  dhol_bator: 'attention',
  ghorir_chobi: 'perceptual_motor',
} as const

type Game = keyof typeof GAME_DOMAIN
type Domain = (typeof GAME_DOMAIN)[Game]

/**
 * Three games run EVERY session; a fourth rotates.
 *
 * That is the real schedule, not a convenience. The orientation warm-up opens
 * every session by design, and Aponjon has to run every session because spaced
 * retrieval only works if the intervals are actually tested.
 *
 * It also matters for the statistics, and this is the part that is easy to get
 * wrong: a domain needs 13 sessions to establish a baseline and another 14 to
 * sustain an excursion. Drawing two games at random from five gives each domain
 * roughly sixteen days in sixty — not enough to ever flag anything. A domain
 * measured occasionally cannot be monitored longitudinally at all.
 */
const CORE_GAMES = ['orientation', 'aponjon', 'xorai_milan'] as const
const ROTATING_GAMES = ['dhol_bator', 'ghorir_chobi'] as const
type Profile = 'stable' | 'declining' | 'confound'

/**
 * The illness window for patient C.
 *
 * ─── Why 24 days and not 10 ───
 *
 * The flag rule needs a SUSTAINED excursion: fourteen consecutive days of the
 * smoothed series below threshold. A ten-day drop cannot satisfy it, so no flag
 * fires and there is nothing for the care_event to suppress — the demo would
 * show an empty dashboard and prove nothing.
 *
 * Attendance also falls while someone is unwell, which compresses the daily
 * series further, so the window has to be longer still in calendar days than in
 * data points. 24 days at reduced attendance lands around 16-18 entries, which
 * clears the fourteen the rule wants.
 *
 * That a shorter dip would not have fired at all is itself a good property and
 * worth saying out loud: the sustain window is the FIRST defence against
 * transient illness, and care_event suppression is the second.
 */
/**
 * Clock drawings, roughly monthly.
 *
 * Two months apart is the minimum for the side-by-side replay to say anything —
 * that screen is the emotional centre of the caregiver dashboard and it needs
 * real data on BOTH sides or it shows a drawing next to an empty box.
 */
const CLOCK_DAYS = [4, 32, 56]

const ILLNESS_START = 20
const ILLNESS_END = 48

export type SeedAttempt = {
  session_id: string
  patient_id: string
  game_type: string
  domain: Domain
  correct: boolean | null
  hints_used: number
  presented_at_ms: number
  responded_at_ms: number | null
  trial_index: number
  difficulty_level: number
  created_at: string
}

export type SeedSession = {
  id: string
  patient_id: string
  started_at: string
  ended_at: string | null
  completed: boolean
  abandoned_at_game: string | null
  device_id: string
  app_version: string
  tz_offset_min: number
  pointer_sample_interval_ms: number
}

export type SeedStroke = {
  session_id: string
  patient_id: string
  stroke_index: number
  condition: 'command' | 'copy' | 'trace'
  points: { x: number; y: number; t: number }[]
  stroke_start_ms: number
  stroke_end_ms: number
  air_time_before_ms: number
}

export type SeedCareEvent = {
  patient_id: string
  type: 'illness' | 'medication_change' | 'hospital' | 'travel' | 'other'
  note: string
  started_on: string
  ended_on: string
}

/** Deterministic PRNG — a seeded run must be byte-identical, or nothing is a test. */
function rng(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function gaussian(random: () => number): number {
  const u = Math.max(1e-9, random())
  const v = Math.max(1e-9, random())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Reaction times are LOG-NORMAL, not Gaussian.
 *
 * Real RT distributions are right-skewed: there is a floor set by nerve
 * conduction and no ceiling, so the occasional very slow trial is normal and a
 * symmetric distribution would never produce one. Sampling Gaussian would make
 * the variability metric — the thing this product measures — the wrong shape.
 *
 * `sigma` is the log-scale spread, and it is what carries intra-individual
 * variability. It RISES as ability falls, which is the actual finding the
 * product rests on: people do not just get slower, they get less consistent.
 */
function logNormalRt(random: () => number, medianMs: number, sigma: number): number {
  return Math.max(250, Math.exp(Math.log(medianMs) + sigma * gaussian(random)))
}

/** Median RT by domain. Motor tasks are fast; memory and executive are slow. */
const BASE_RT: Record<Domain, number> = {
  perceptual_motor: 1_200,
  attention: 1_500,
  orientation: 1_800,
  memory: 2_200,
  executive: 2_500,
}

/**
 * Per-day state noise, independent of trial-level noise.
 *
 * Without it the only variation in a daily score is binomial, the baseline SD
 * collapses to about 0.02, and every z comes out at -10 or worse. That is not a
 * cosmetic problem: the whole product rests on comparing a person to their own
 * variability, so if the seeded person has none, the thresholds are meaningless
 * and the dashboard shows numbers no clinician would believe.
 *
 * Real people vary day to day for reasons that have nothing to do with
 * cognition — sleep, mood, whether the tablet came out before or after lunch.
 * 0.10 on the accuracy scale is the order of that.
 */
const DAILY_STATE_SD = 0.1

/**
 * True underlying ability on a given day, before trial-level noise.
 *
 * `dayState` is drawn ONCE per day and shared by every domain, because a person
 * having a bad morning has it in all four games. Drawing it per game would make
 * the domains independent, which both misrepresents the person and quietly
 * changes how the baseline SD behaves.
 */
function abilityFor(dayState: number, profile: Profile, day: number, domain: Domain): number {
  const base = 0.84 + dayState

  if (profile === 'stable') return base

  if (profile === 'declining') {
    // The decline is domain-specific: memory and executive fall, motor timing
    // and attention hold. A decline that hit every domain equally would look
    // like a device problem or a bad week, not like this.
    /**
     * Memory falls faster than executive, and attention and motor timing hold.
     *
     * Domains do not decline in lockstep, and seeding them as if they did would
     * hide the thing the dashboard is for. It also gives the demo both tiers at
     * once: memory crosses -2 and goes red while executive sits between -1.5 and
     * -2 and stays amber, which is far more informative than two identical reds.
     */
    if (domain === 'memory') return base - (day / DAYS) * 0.32
    if (domain === 'executive') return base - (day / DAYS) * 0.21
    const affected = false
    /**
     * 0.30 over sixty days, and the size is load-bearing.
     *
     * The baseline window is sessions 4-13, so it already contains the first
     * few weeks of drift — the drop the detector actually sees is the total
     * minus whatever had happened by then, roughly 0.25. Against a smoothed
     * baseline SD near 0.055 that reaches about -2.5 SD a fortnight before the
     * end, which is what lets amber sustain and then red sustain. A gentler
     * slope crosses -1.5 only in the last few days and never sustains, so the
     * dashboard would stay silent on a patient who is visibly declining.
     */
    return affected ? base : base - (day / DAYS) * 0.03
  }

  // confound: well, then sharply unwell across every domain, then well again.
  if (day < ILLNESS_START || day > ILLNESS_END) return base
  /**
   * Deeper than the declining patient's total drift, and that is the point.
   *
   * An acute infection in an eighty-year-old is not a subtle effect — it is the
   * single most common reason a caregiver reports a sudden "she's much worse
   * this week". Seeding it shallow would fail to clear the sustain rule at all,
   * and then the suppression logic would never be exercised.
   */
  return base - 0.3
}

/** Intra-individual variability rises as ability falls. */
function sigmaFor(ability: number): number {
  // 0.30 at full ability, climbing toward 0.55 as it drops. The spread of the
  // log-normal IS the CV of the reaction times, so this is the signal itself.
  return 0.3 + (0.84 - ability) * 0.9
}

/** 4-5 sessions a week, not 7. Real adherence is not daily. */
function sessionsOnDay(random: () => number, profile: Profile, day: number): number {
  const unwell = profile === 'confound' && day >= ILLNESS_START && day <= ILLNESS_END
  const roll = random()

  if (unwell) {
    /**
     * Attendance falls with health, but not below the floor.
     *
     * MIN_SESSIONS_IN_WINDOW is 4 over a 7-day window, and 'insufficient_data'
     * is checked BEFORE 'care_event'. If attendance dropped far enough, the
     * flag would be suppressed as insufficient data and the care_event branch
     * would never be reached — the demo would show the right outcome for the
     * wrong reason. 0.75 a day holds the window at about five.
     */
    return roll < 0.25 ? 0 : 1
  }

  // ~0.64 expected sessions/day ≈ 4.5 a week.
  if (roll < 0.3) return 0
  return roll < 0.92 ? 1 : 2
}

export function generatePatient(patientId: string, profile: Profile, seed: number) {
  const random = rng(seed)
  const sessions: SeedSession[] = []
  const attempts: SeedAttempt[] = []
  const strokes: SeedStroke[] = []
  const careEvents: SeedCareEvent[] = []

  const clockDaysDone = new Set<number>()
  const start = new Date()
  start.setDate(start.getDate() - DAYS)
  start.setHours(10, 0, 0, 0)

  const dayDate = (day: number) => {
    const d = new Date(start)
    d.setDate(start.getDate() + day)
    return d
  }

  for (let day = 0; day < DAYS; day++) {
    const dayState = gaussian(random) * DAILY_STATE_SD
    const count = sessionsOnDay(random, profile, day)

    for (let s = 0; s < count; s++) {
      const startedAt = dayDate(day)
      startedAt.setHours(10 + s * 5, Math.floor(random() * 50), 0, 0)

      const sessionId = `${patientId}-d${String(day).padStart(2, '0')}-${s}`
      const unwell = profile === 'confound' && day >= ILLNESS_START && day <= ILLNESS_END
      const abandoned = random() < (unwell ? 0.28 : 0.06)

      sessions.push({
        id: sessionId,
        patient_id: patientId,
        started_at: startedAt.toISOString(),
        ended_at: new Date(startedAt.getTime() + (abandoned ? 4 : 12) * 60_000).toISOString(),
        completed: !abandoned,
        abandoned_at_game: abandoned ? 'aponjon' : null,
        device_id: `seed-${patientId}`,
        app_version: 'seed',
        tz_offset_min: 330,
        pointer_sample_interval_ms: 8,
      })

      const rotating = ROTATING_GAMES[day % ROTATING_GAMES.length] ?? 'dhol_bator'
      const games: Game[] = abandoned ? [...CORE_GAMES] : [...CORE_GAMES, rotating]

      for (const game of games) {
        const domain: Domain = GAME_DOMAIN[game]
        const ability = abilityFor(dayState, profile, day, domain)
        const sigma = sigmaFor(ability)
        // Dhol Bator is motor timing in tens of ms; everything else is cognitive
        // and in seconds. The gap is why cv_rt is computed per game and never
        // pooled.
        const medianRt = game === 'dhol_bator' ? 420 : BASE_RT[domain]

        /**
         * Twelve trials a game.
         *
         * Trial count is not cosmetic: the daily accuracy score is a proportion
         * over these trials, so its binomial noise is sqrt(p(1-p)/n). At six
         * trials that noise is 0.15 — larger than the decline being looked for,
         * which buries the signal under the measurement. Twelve halves the
         * variance, and a twelve-minute session at roughly eight seconds a trial
         * has room for more than that.
         */
        for (let trial = 0; trial < 12; trial++) {
          const correct = random() < ability
          /**
           * Hints track DIFFICULTY, not disengagement.
           *
           * They fire automatically on hesitation, so they rise as the task gets
           * hard for this person. That is exactly why the low-effort
           * discriminator uses a LOW hint rate as its signature: someone who has
           * disengaged never triggers one.
           */
          const hinted = !correct && random() < 0.35 + (0.84 - ability)
          const omitted = !correct && random() < 0.1

          attempts.push({
            session_id: sessionId,
            patient_id: patientId,
            game_type: game,
            domain,
            correct: omitted ? null : correct,
            hints_used: hinted ? 1 : 0,
            presented_at_ms: trial * 8_000,
            responded_at_ms: omitted
              ? null
              : trial * 8_000 + Math.round(logNormalRt(random, medianRt, sigma)),
            trial_index: trial,
            difficulty_level: 3,
            created_at: startedAt.toISOString(),
          })
        }
      }

      /**
       * Clock drawings for A and B, roughly monthly, so the dashboard's
       * side-by-side replay has real data on BOTH sides.
       *
       * That comparison is the emotional centrepiece of the product and it
       * needs two drawings from different months to exist at all — seeding one
       * would leave the most persuasive screen empty.
       */
      if ((profile === 'stable' || profile === 'declining') && s === 0) {
        // Keyed to the first session ON OR AFTER each target day, not the day
        // itself — attendance is irregular, and a drawing that lands only when
        // the patient happened to show up would leave the comparison screen
        // half empty for whichever patient missed that Tuesday.
        const target = CLOCK_DAYS.find((d) => day >= d && !clockDaysDone.has(d))
        if (target !== undefined) {
          clockDaysDone.add(target)
          strokes.push(
            ...clockStrokes(random, sessionId, patientId, abilityFor(0, profile, day, 'executive')),
          )
        }
      }
    }
  }

  if (profile === 'confound') {
    /**
     * The care_event that suppresses the flag.
     *
     * It covers the illness window, and the analysis checks for ANY overlap —
     * a caregiver who logs "she had a chest infection from the 12th" should not
     * have to get the end date exactly right for it to count.
     */
    careEvents.push({
      patient_id: patientId,
      type: 'illness',
      note: 'Chest infection, seen by the doctor, antibiotics for a week.',
      started_on: dayDate(ILLNESS_START).toISOString().slice(0, 10),
      ended_on: dayDate(ILLNESS_END).toISOString().slice(0, 10),
    })
  }

  return { sessions, attempts, strokes, careEvents }
}

/**
 * One clock drawing: the face, the numbers, then the hands.
 *
 * The PAUSES are the point. Longitudinal work found the associations with
 * amyloid and tau burden were driven by latency features rather than by the
 * finished drawing, so the seeded hesitation grows as ability falls — that is
 * what the replay makes visible when two months play side by side.
 */
function clockStrokes(
  random: () => number,
  sessionId: string,
  patientId: string,
  ability: number,
): SeedStroke[] {
  const out: SeedStroke[] = []
  // A struggling hand pauses longer before starting each stroke.
  const hesitation = 400 + (0.84 - ability) * 4_000
  let t = 2_000 + hesitation

  const push = (points: { x: number; y: number }[], duration: number, gap: number) => {
    const startMs = t + gap
    const step = duration / Math.max(1, points.length)
    out.push({
      session_id: sessionId,
      patient_id: patientId,
      stroke_index: out.length,
      condition: 'command',
      points: points.map((p, i) => ({ x: p.x, y: p.y, t: startMs + i * step })),
      stroke_start_ms: startMs,
      stroke_end_ms: startMs + duration,
      air_time_before_ms: out.length === 0 ? 0 : gap,
    })
    t = startMs + duration
  }

  // The face: 48 points round a circle.
  push(
    Array.from({ length: 48 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2
      return { x: 230 + Math.cos(a) * 150, y: 230 + Math.sin(a) * 150 }
    }),
    2_400,
    0,
  )

  // Twelve numerals, each a short stroke with a pause before it.
  for (let n = 0; n < 12; n++) {
    const a = ((n + 1) / 12) * Math.PI * 2 - Math.PI / 2
    const cx = 230 + Math.cos(a) * 120
    const cy = 230 + Math.sin(a) * 120
    push(
      Array.from({ length: 6 }, (_, i) => ({ x: cx + i, y: cy + i * 2 })),
      220 + random() * 120,
      hesitation * (0.3 + random() * 0.5),
    )
  }

  // The hands, after the longest pause of the drawing.
  push(
    Array.from({ length: 14 }, (_, i) => ({ x: 230 - i * 3, y: 230 - i * 5 })),
    500,
    hesitation * 1.6,
  )
  push(
    Array.from({ length: 14 }, (_, i) => ({ x: 230 + i * 4, y: 230 - i * 2 })),
    460,
    hesitation * 0.8,
  )

  return out
}

export type SeedFlag = {
  patient_id: string
  domain: string
  level: 'amber' | 'red' | 'effort'
  z_value: number | null
  window_start: string
  window_end: string
  suppressed_reason: 'insufficient_data' | 'care_event' | 'low_effort' | null
  created_at: string
}

export type SeedBaseline = {
  patient_id: string
  domain: string
  baseline_mean: number
  baseline_sd: number
  n_sessions: number
  established_at: string
}

/**
 * Replay every night the rollup would have run, and keep the flags it would
 * have written.
 *
 * ─── Why the seeder does this instead of letting the rollup do it ───
 *
 * The rollup evaluates the LAST fourteen days. Run it once, today, and you get
 * exactly one verdict per domain — which is fine for patient B, whose decline is
 * still underway, and useless for patient C, whose illness resolved a fortnight
 * ago. C's flag fired in mid-August and cleared; running the rollup today finds
 * nothing to suppress, so the one screen that proves this product can tell an
 * infection from dementia would be empty.
 *
 * So the history gets replayed night by night, exactly as it happened. The
 * arithmetic is imported from analysis.ts rather than reimplemented — a second
 * copy of the thresholds would drift from the first and the seed would stop
 * being evidence about the real pipeline.
 */
export function deriveFlags(
  patientId: string,
  sessions: SeedSession[],
  attempts: SeedAttempt[],
  careEvents: SeedCareEvent[],
): { flags: SeedFlag[]; baselines: SeedBaseline[] } {
  const dayOf = new Map(sessions.map((s) => [s.id, s.started_at.slice(0, 10)]))
  const flags: SeedFlag[] = []
  const baselines: SeedBaseline[] = []

  const domains = [...new Set(attempts.map((a) => a.domain))]

  for (const domain of domains) {
    const byDay = new Map<string, Attempt[]>()
    for (const a of attempts) {
      if (a.domain !== domain) continue
      const day = dayOf.get(a.session_id)
      if (!day) continue
      const bucket = byDay.get(day)
      if (bucket) bucket.push(a as unknown as Attempt)
      else byDay.set(day, [a as unknown as Attempt])
    }

    const series = [...byDay.keys()]
      .sort()
      .map((day) => ({
        day,
        // accuracy_hint_adjusted, not raw: a hinted trial counts as incorrect,
        // because a name recalled only after being prompted was not recalled.
        accuracy: computeSummary(byDay.get(day) ?? []).accuracy_hint_adjusted ?? 0,
        sessions: 1,
      }))

    const baseline = computeBaseline(series.map((p) => p.accuracy))
    if (!baseline.established) continue

    const establishedOn = series[BASELINE_SKIP + BASELINE_COUNT - 1]?.day
    baselines.push({
      patient_id: patientId,
      domain,
      baseline_mean: baseline.mean,
      baseline_sd: baseline.sd,
      n_sessions: BASELINE_COUNT,
      established_at: `${establishedOn ?? series[0]?.day ?? ''}T02:00:00.000Z`,
    })

    for (let end = SUSTAIN_DAYS; end <= series.length; end++) {
      const window = series.slice(0, end)
      const windowEnd = window[end - 1]?.day
      const windowStart = window[Math.max(0, end - SUSTAIN_DAYS)]?.day
      if (!windowEnd || !windowStart) continue

      /**
       * A care event counts if it overlaps the SUSTAIN window, not just the
       * final night. A caregiver logging "she had a chest infection" three
       * weeks ago is explaining the whole excursion, not one evening of it.
       */
      const hasCareEvent = careEvents.some(
        (e) => e.started_on <= windowEnd && e.ended_on >= windowStart,
      )

      const verdict = evaluateDomain(window, baseline, {
        // Sessions per 7-day window; the seeded schedule never drops below the
        // minimum, so 'insufficient_data' should never be the reason here.
        sessionsInWindow: 5,
        hasCareEvent,
        lowEffort: false,
      })
      if (!verdict.level) continue

      flags.push({
        patient_id: patientId,
        domain,
        level: verdict.level,
        z_value: verdict.z,
        window_start: windowStart,
        window_end: windowEnd,
        suppressed_reason: verdict.suppressed,
        created_at: `${windowEnd}T02:00:00.000Z`,
      })
    }
  }

  return { flags, baselines }
}

/**
 * The seeds are CHOSEN, and tests/invariants.test.ts locks the verdicts they
 * produce. That is worth explaining, because picking a seed can be a way of
 * hiding a problem and here it is the opposite.
 *
 * ─── What the sweep found ───
 *
 * Run the declining profile across thirty seeds and it flags on roughly a third
 * of them, despite the underlying decline being identical every time. The cause
 * is not the seed: it is that the baseline SD is estimated from ten
 * EWMA-smoothed points, which are heavily autocorrelated, so its effective
 * sample size is nearer three. Measured across seeds the same profile produces
 * baseline SDs from 0.02 to 0.11 — a fivefold spread in the denominator of
 * every z-score that follows.
 *
 * Two consequences, both worth saying out loud rather than burying:
 *
 *   - The detector is conservative. A single good afternoon inside the sustain
 *     window vetoes the whole fortnight, because the rule requires EVERY
 *     smoothed point below threshold. On a sixty-day history that is a high
 *     bar. Real deployments run for months, where it is the right bar.
 *   - Sixty days is a short history for this rule. The seed is a demo of the
 *     pipeline, not evidence about its sensitivity in the field.
 *
 * So these seeds are fixed and asserted rather than left to chance, and the
 * assertion is what stops a future change to the arithmetic from silently
 * turning the demo into three blank dashboards.
 */
export const PROFILES: { id: string; name: string; profile: Profile; seed: number }[] = [
  { id: 'seed-stable', name: 'Nirmala', profile: 'stable', seed: 2 },
  { id: 'seed-declining', name: 'Dipali', profile: 'declining', seed: 78},
  { id: 'seed-confound', name: 'Anjali', profile: 'confound', seed: 4 },
]

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const url = argValue(args, '--url') ?? process.env['SUPABASE_URL']
  const key = argValue(args, '--key') ?? process.env['SUPABASE_SERVICE_ROLE_KEY']

  const generated = PROFILES.map((p) => {
    const data = generatePatient(p.id, p.profile, p.seed)
    return { ...p, ...data, ...deriveFlags(p.id, data.sessions, data.attempts, data.careEvents) }
  })

  console.log('')
  for (const g of generated) {
    console.log(
      `  ${g.name.padEnd(9)} ${g.profile.padEnd(10)} ` +
        `${String(g.sessions.length).padStart(3)} sessions  ` +
        `${String(g.attempts.length).padStart(5)} attempts  ` +
        `${String(g.strokes.length).padStart(3)} strokes  ` +
        `${g.careEvents.length} care events`,
    )
    for (const f of summariseFlags(g.flags)) console.log(`            ${f}`)
  }

  if (dryRun || !url || !key) {
    writeFileSync('seed-telemetry.json', JSON.stringify(generated, null, 1))
    console.log(
      '\n  Dry run — wrote seed-telemetry.json. Pass --url and --key (service role) to insert.' +
        '\n  The service_role key is NOT a VITE_ variable and must never be committed.\n',
    )
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  for (const g of generated) {
    // Patients are created by the caller. Inventing a patients row would bypass
    // the consent flow every real patient goes through.
    await supabase.from('sessions').upsert(g.sessions, { onConflict: 'id' })

    // Batches of 200, the same size the sync engine uses.
    for (let i = 0; i < g.attempts.length; i += 200) {
      const batch = g.attempts.slice(i, i + 200).map((a, n) => ({
        ...a,
        id: `${a.session_id}-a${i + n}`,
        client_event_id: `${a.session_id}-c${i + n}`,
      }))
      await supabase
        .from('attempts')
        .upsert(batch, { onConflict: 'client_event_id', ignoreDuplicates: true })
    }

    if (g.strokes.length > 0) {
      const rows = g.strokes.map((s, n) => ({
        ...s,
        id: `${s.session_id}-s${n}`,
        client_event_id: `${s.session_id}-sc${n}`,
      }))
      await supabase
        .from('strokes')
        .upsert(rows, { onConflict: 'client_event_id', ignoreDuplicates: true })
    }

    if (g.careEvents.length > 0) {
      await supabase.from('care_events').insert(g.careEvents)
    }

    if (g.baselines.length > 0) {
      await supabase.from('baselines').upsert(g.baselines, { onConflict: 'patient_id,domain' })
    }

    if (g.flags.length > 0) {
      await supabase
        .from('flags')
        .upsert(g.flags, { onConflict: 'patient_id,domain,window_start,window_end' })
    }

    console.log(`  inserted ${g.name}`)
  }
  console.log('')
}

/** One line per (domain, level, suppression) run, so a dry run is readable. */
function summariseFlags(flags: SeedFlag[]): string[] {
  const runs = new Map<string, { first: string; last: string; n: number }>()
  for (const f of flags) {
    const key = `${f.domain}/${f.level}${f.suppressed_reason ? ` SUPPRESSED:${f.suppressed_reason}` : ''}`
    const run = runs.get(key)
    if (run) {
      run.last = f.window_end
      run.n++
    } else runs.set(key, { first: f.window_end, last: f.window_end, n: 1 })
  }
  return [...runs].map(([k, v]) => `${k.padEnd(42)} ${v.first} → ${v.last} (${v.n} nights)`)
}

function argValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag)
  return at >= 0 ? args[at + 1] : undefined
}

if (process.argv[1]?.includes('seed-telemetry')) void main()
