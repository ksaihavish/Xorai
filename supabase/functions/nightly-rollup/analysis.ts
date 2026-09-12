/**
 * The analysis maths, with no Supabase and no Deno in it.
 *
 * Split out of index.ts for one reason: this is the part that can be WRONG in a
 * way nobody notices, and it needs a test suite. index.ts imports Supabase from
 * esm.sh and calls Deno.serve, neither of which runs under vitest — so as long
 * as the arithmetic lived there, the arithmetic was unverifiable.
 *
 * Everything here is pure. Same inputs, same outputs, no clock, no network.
 * `tests/analysis.test.ts` drives it over sixty days of three synthetic
 * patients: one stable, one declining, one with a sharp drop that resolves.
 */

export type Domain =
  | 'memory'
  | 'attention'
  | 'executive'
  | 'perceptual_motor'
  | 'language'
  | 'orientation'

export type Attempt = {
  session_id: string
  patient_id: string
  game_type: string
  domain: Domain
  correct: boolean | null
  hints_used: number
  presented_at_ms: number
  responded_at_ms: number | null
}

export const EWMA_ALPHA = 0.3
export const SUSTAIN_DAYS = 14
export const WINDOW_DAYS = 7
export const MIN_SESSIONS_IN_WINDOW = 4
export const BASELINE_SKIP = 3
export const BASELINE_COUNT = 10
export const AMBER_Z = -1.5
export const RED_Z = -2.0

// ─── session summaries ────────────────────────────────────────

export type SessionSummary = {
  mean_rt_ms: number | null
  sd_rt_ms: number | null
  cv_rt: number | null
  accuracy_raw: number | null
  accuracy_hint_adjusted: number | null
  hint_rate: number | null
  domain_scores: Record<string, number>
}

export function computeSummary(rows: Attempt[]): SessionSummary {
  const trials = rows.length
  const correct = rows.filter((r) => r.correct === true).length

  /**
   * cv_rt is computed PER game_type and aggregated as a weighted mean.
   *
   * NEVER pool raw reaction times across games. Aponjon latencies are seconds
   * and cognitive; Dhol Bator taps are tens of milliseconds and motor. A pooled
   * CV measures WHICH GAMES WERE PLAYED that day rather than the person — and
   * this is the metric the whole pitch rests on, so pooling would invalidate the
   * headline claim while still producing a number that looks entirely fine.
   */
  const byGame = new Map<string, number[]>()
  for (const row of rows) {
    // Omissions are excluded from RT statistics but still counted in accuracy.
    // An unanswered trial has no latency; treating it as a slow one invents
    // data that was never collected.
    if (row.responded_at_ms === null || row.correct === null) continue
    const latency = row.responded_at_ms - row.presented_at_ms
    if (!Number.isFinite(latency) || latency <= 0) continue
    const list = byGame.get(row.game_type) ?? []
    list.push(latency)
    byGame.set(row.game_type, list)
  }

  let weightedCv = 0
  let weightTotal = 0
  const allLatencies: number[] = []

  for (const [, latencies] of byGame) {
    allLatencies.push(...latencies)
    if (latencies.length < 2) continue
    const m = mean(latencies)
    const s = m === null ? null : sd(latencies, m)
    if (m === null || s === null || m <= 0) continue
    weightedCv += (s / m) * latencies.length
    weightTotal += latencies.length
  }

  const meanRt = mean(allLatencies)

  const domainScores: Record<string, number> = {}
  for (const domain of new Set(rows.map((r) => r.domain))) {
    const inDomain = rows.filter((r) => r.domain === domain)
    domainScores[domain] =
      inDomain.filter((r) => r.correct === true).length / Math.max(1, inDomain.length)
  }

  return {
    mean_rt_ms: meanRt,
    sd_rt_ms: meanRt === null ? null : sd(allLatencies, meanRt),
    cv_rt: weightTotal > 0 ? weightedCv / weightTotal : null,
    accuracy_raw: trials > 0 ? correct / trials : null,
    /**
     * A HINTED TRIAL COUNTS AS INCORRECT. This is what turns "accuracy in this
     * product is inflated by design" from an admission into a number: the
     * errorless UI dims distractors on hesitation so the patient succeeds, so
     * accuracy_raw overstates ability on purpose, and this says by how much.
     */
    accuracy_hint_adjusted:
      trials > 0
        ? rows.filter((r) => r.correct === true && r.hints_used === 0).length / trials
        : null,
    hint_rate: trials > 0 ? rows.filter((r) => r.hints_used > 0).length / trials : null,
    domain_scores: domainScores,
  }
}

// ─── baselines ────────────────────────────────────────────────

export type BaselineResult = { established: false } | { established: true; mean: number; sd: number }

/**
 * The baseline window is sessions 4-13, NOT 1-10.
 *
 * The first three are excluded because the patient is learning the interface,
 * not being measured. Including them bakes the practice effect into the
 * reference, which makes every later session look like a decline from a
 * baseline that was never real.
 *
 * ─── The baseline is smoothed with the SAME EWMA as the current value ───
 *
 * This is not a refinement, it is a correctness requirement, and getting it
 * wrong makes the detector quietly far less sensitive than specified.
 *
 * `z` is computed from an EWMA-smoothed current value. Smoothing reduces
 * variance — roughly by a factor of sqrt(alpha / (2 - alpha)) for white noise,
 * about 0.42 at alpha = 0.3. If the baseline SD comes from RAW daily scores
 * while the numerator comes from smoothed ones, the denominator is more than
 * twice too large and every z is pulled toward zero.
 *
 * Measured on seeded data before this was fixed: a patient losing 25 accuracy
 * points over sixty days produced a baseline SD of 0.146 and never crossed
 * -1.5, so no flag ever fired. Both sides of the ratio have to be the same
 * statistic.
 */
export function computeBaseline(orderedDomainScores: number[]): BaselineResult {
  if (orderedDomainScores.length < BASELINE_SKIP + BASELINE_COUNT) return { established: false }

  const rawWindow = orderedDomainScores.slice(BASELINE_SKIP, BASELINE_SKIP + BASELINE_COUNT)
  // Same transform as evaluateDomain applies to the current series.
  const windowScores = ewma(rawWindow, EWMA_ALPHA)

  const m = mean(windowScores)
  if (m === null) return { established: false }
  const s = sd(windowScores, m)

  return {
    established: true,
    mean: m,
    // A zero SD would divide by zero in the z-score. Ten identical scores is
    // possible, and a floor is the honest answer rather than an infinite z.
    sd: s === null || s < 0.01 ? 0.01 : s,
  }
}

// ─── flags ────────────────────────────────────────────────────

export type DailyPoint = { day: string; accuracy: number; sessions: number }

export type FlagVerdict = {
  level: 'amber' | 'red' | 'effort' | null
  z: number | null
  suppressed: 'insufficient_data' | 'care_event' | 'low_effort' | null
}

/**
 * Pass the patient's FULL daily series, not the last fortnight.
 *
 * The EWMA has to run over the whole history and the sustain rule then looks at
 * the last SUSTAIN_DAYS of its OUTPUT. Restarting the smoother on a 14-day slice
 * gives its first value no smoothing at all — that point is a single raw noisy
 * day, and because the rule requires EVERY point in the window to be below
 * threshold, one noisy day at the left edge vetoes a real fortnight-long
 * excursion.
 *
 * Measured on seeded data: with a cold-started smoother the declining patient
 * produced z values from -6.04 to -1.47 and never flagged, purely because of
 * that first unsmoothed point.
 */
export function evaluateDomain(
  series: DailyPoint[],
  baseline: { mean: number; sd: number },
  options: { sessionsInWindow: number; hasCareEvent: boolean; lowEffort: boolean },
): FlagVerdict {
  if (series.length === 0) return { level: null, z: null, suppressed: null }

  /**
   * EWMA on the RAW DAILY score, and z computed from the EWMA value.
   *
   * There is deliberately NO 7-day rolling mean underneath. Alpha = 0.3 on a
   * daily series is already roughly a six-day window, and smoothing twice makes
   * the 14-day sustain rule meaningless — a "sustained" excursion would just be
   * the second smoother's lag.
   */
  const smoothedAll = ewma(series.map((p) => p.accuracy), EWMA_ALPHA)
  // The sustain window: the last fortnight of SMOOTHED values.
  const smoothed = smoothedAll.slice(-SUSTAIN_DAYS)
  const zs = smoothed.map((value) => (value - baseline.mean) / baseline.sd)

  const sustainedAmber = zs.every((z) => z < AMBER_Z)
  const sustainedRed = zs.every((z) => z < RED_Z)
  const latestZ = zs[zs.length - 1] ?? null

  if (!sustainedAmber) return { level: null, z: latestZ, suppressed: null }

  // Suppression, in order, recording which one fired.
  let suppressed: FlagVerdict['suppressed'] = null
  if (options.sessionsInWindow < MIN_SESSIONS_IN_WINDOW) suppressed = 'insufficient_data'
  else if (options.hasCareEvent) suppressed = 'care_event'
  else if (options.lowEffort) suppressed = 'low_effort'

  return {
    // A suppressed low-effort case becomes an 'effort' flag, which routes the
    // caregiver to the unscored mood check-in instead of telling them anything
    // about memory.
    level: suppressed === 'low_effort' ? 'effort' : sustainedRed ? 'red' : 'amber',
    z: latestZ,
    suppressed,
  }
}

// ─── the low-effort discriminator (8.1) ───────────────────────

export type EffortInputs = {
  omissionRate: number
  abandonRate: number
  hintRate: number
  medianLatencyMs: number
  trials: number
}

/**
 * Depressed patients give poor effort; dementia patients try hard and get it
 * wrong. The two look identical in an accuracy column and completely different
 * in telemetry.
 *
 * The HINT term carries the discrimination. Hints fire automatically on
 * hesitation, so someone who is trying and struggling accumulates them, while
 * someone who has disengaged answers quickly-or-not-at-all and never triggers
 * one. A LOW hint rate alongside poor accuracy is the signature of someone who
 * has stopped participating — and telling that person's family their memory is
 * declining would be both wrong and cruel.
 */
export function isLowEffort(input: EffortInputs): boolean {
  if (input.trials < 10) return false
  return (
    input.omissionRate >= 0.25 &&
    input.abandonRate >= 0.3 &&
    // Without this clause the rule fires on anyone genuinely struggling.
    input.hintRate <= 0.15 &&
    input.medianLatencyMs > 6_000
  )
}

// ─── helpers ──────────────────────────────────────────────────

export function ewma(values: number[], alpha: number): number[] {
  const out: number[] = []
  let previous: number | null = null
  for (const value of values) {
    previous = previous === null ? value : alpha * value + (1 - alpha) * previous
    out.push(previous)
  }
  return out
}

export function mean(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
}

export function sd(values: number[], m: number): number | null {
  if (values.length < 2) return null
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}
