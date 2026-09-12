import { describe, expect, it } from 'vitest'
import {
  BASELINE_COUNT,
  BASELINE_SKIP,
  computeBaseline,
  computeSummary,
  evaluateDomain,
  ewma,
  isLowEffort,
  type Attempt,
  type DailyPoint,
} from '../supabase/functions/nightly-rollup/analysis'
import { PROFILES, generatePatient, type SeedAttempt } from '../scripts/seed-telemetry'

/**
 * The analysis pipeline, driven over sixty days of the three seeded profiles.
 *
 * phases.md Phase 12's exit criterion is exactly this: "against seeded data, a
 * flag fires; a care_event suppresses it; a low-effort signature routes to the
 * mood check-in". Until this file existed none of that had ever been executed.
 */

// ─── build the same daily series the SQL view produces ────────

function dailySeries(attempts: SeedAttempt[], sessions: { id: string; started_at: string }[]) {
  const dayOf = new Map(sessions.map((s) => [s.id, s.started_at.slice(0, 10)]))
  const byDay = new Map<string, { correct: number; total: number; sessions: Set<string> }>()

  for (const a of attempts) {
    const day = dayOf.get(a.session_id)
    if (!day) continue
    const entry = byDay.get(day) ?? { correct: 0, total: 0, sessions: new Set<string>() }
    entry.total += 1
    if (a.correct === true) entry.correct += 1
    entry.sessions.add(a.session_id)
    byDay.set(day, entry)
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, e]): DailyPoint => ({
      day,
      accuracy: e.correct / Math.max(1, e.total),
      sessions: e.sessions.size,
    }))
}

function baselineFor(series: DailyPoint[]) {
  const result = computeBaseline(series.map((p) => p.accuracy))
  if (!result.established) throw new Error('baseline not established from seeded data')
  return { mean: result.mean, sd: result.sd }
}

const seeded = PROFILES.map((p) => {
  const { sessions, attempts } = generatePatient(p.id, p.profile, p.seed)
  return { ...p, sessions, attempts, series: dailySeries(attempts, sessions) }
})

const stable = seeded.find((s) => s.profile === 'stable')!
const declining = seeded.find((s) => s.profile === 'declining')!
const confound = seeded.find((s) => s.profile === 'confound')!

describe('seeded data is usable', () => {
  it('produces 60 days of three patients with real volume', () => {
    for (const patient of seeded) {
      expect(patient.sessions.length).toBeGreaterThan(30)
      expect(patient.attempts.length).toBeGreaterThan(400)
      expect(patient.series.length).toBeGreaterThan(30)
    }
  })

  it('is deterministic — the same seed gives the same data', () => {
    const a = generatePatient('x', 'declining', 99)
    const b = generatePatient('x', 'declining', 99)
    expect(a.attempts.length).toBe(b.attempts.length)
    expect(a.attempts[10]?.responded_at_ms).toBe(b.attempts[10]?.responded_at_ms)
  })
})

describe('session summaries', () => {
  const attemptsFor = (sessionId: string): Attempt[] =>
    declining.attempts.filter((a) => a.session_id === sessionId)

  it('computes cv_rt PER game and never pools across them', () => {
    // Two games with wildly different scales and ZERO within-game variance.
    // Pooled, the CV would be large; per-game, it is zero. That difference is
    // the whole argument, so it is asserted rather than described.
    const rows: Attempt[] = [
      ...Array.from({ length: 4 }, (_, i) => row('aponjon', 2400, i)),
      ...Array.from({ length: 4 }, (_, i) => row('dhol_bator', 420, i)),
    ]
    const summary = computeSummary(rows)
    expect(summary.cv_rt).toBeCloseTo(0, 6)

    // Sanity: pooling the same latencies would give a large CV.
    const pooled = [2400, 2400, 2400, 2400, 420, 420, 420, 420]
    const m = pooled.reduce((a, b) => a + b, 0) / pooled.length
    const s = Math.sqrt(pooled.reduce((acc, v) => acc + (v - m) ** 2, 0) / (pooled.length - 1))
    expect(s / m).toBeGreaterThan(0.5)
  })

  it('counts a hinted trial as incorrect in accuracy_hint_adjusted', () => {
    const rows: Attempt[] = [
      { ...row('aponjon', 1000, 0), correct: true, hints_used: 0 },
      { ...row('aponjon', 1000, 1), correct: true, hints_used: 1 },
    ]
    const summary = computeSummary(rows)
    expect(summary.accuracy_raw).toBe(1)
    // The number that says how much the errorless design inflates accuracy.
    expect(summary.accuracy_hint_adjusted).toBe(0.5)
  })

  it('excludes omissions from RT stats but counts them in accuracy', () => {
    const rows: Attempt[] = [
      { ...row('aponjon', 1000, 0), correct: true },
      { ...row('aponjon', 1000, 1), correct: null, responded_at_ms: null },
    ]
    const summary = computeSummary(rows)
    expect(summary.accuracy_raw).toBe(0.5)
    // One usable latency, so no SD — never a fabricated one.
    expect(summary.sd_rt_ms).toBeNull()
  })

  it('summarises a real seeded session', () => {
    const first = declining.sessions[5]
    const summary = computeSummary(attemptsFor(first?.id ?? ''))
    expect(summary.accuracy_raw).toBeGreaterThan(0)
    expect(summary.cv_rt).toBeGreaterThan(0)
    expect(Object.keys(summary.domain_scores).length).toBeGreaterThan(0)
  })
})

describe('baselines', () => {
  it('needs 13 sessions, not 10, and uses the 4th through 13th', () => {
    const scores = Array.from({ length: 12 }, () => 0.8)
    expect(computeBaseline(scores).established).toBe(false)

    const enough = Array.from({ length: BASELINE_SKIP + BASELINE_COUNT }, () => 0.8)
    expect(computeBaseline(enough).established).toBe(true)
  })

  it('excludes the first three sessions from the reference', () => {
    // The practice effect: three poor sessions while learning the interface,
    // then ten steady ones. The baseline must be 0.8, not dragged down by 0.3.
    const scores = [0.3, 0.3, 0.3, ...Array.from({ length: 10 }, () => 0.8)]
    const result = computeBaseline(scores)
    expect(result.established).toBe(true)
    if (result.established) expect(result.mean).toBeCloseTo(0.8, 6)
  })

  it('floors the SD so a z-score can never divide by zero', () => {
    const identical = Array.from({ length: 13 }, () => 0.8)
    const result = computeBaseline(identical)
    if (result.established) expect(result.sd).toBeGreaterThanOrEqual(0.01)
  })
})

describe('EWMA', () => {
  it('smooths without lagging like a second rolling mean would', () => {
    const flat = ewma([0.8, 0.8, 0.8, 0.8], 0.3)
    expect(flat.every((v) => Math.abs(v - 0.8) < 1e-9)).toBe(true)

    // A step down converges toward the new level rather than jumping to it.
    const step = ewma([0.8, 0.8, 0.4, 0.4, 0.4, 0.4], 0.3)
    expect(step[2]).toBeLessThan(0.8)
    expect(step[5]).toBeLessThan(step[2] as number)
    expect(step[5]).toBeGreaterThan(0.4)
  })
})

describe('flags, against seeded data', () => {
  const opts = { sessionsInWindow: 6, hasCareEvent: false, lowEffort: false }

  it('does NOT flag the stable patient — the negative control', () => {
    const baseline = baselineFor(stable.series)
    // The FULL series: the smoother needs history, and evaluateDomain takes the
    // last fortnight of its output itself.
    const verdict = evaluateDomain(stable.series, baseline, opts)

    expect(verdict.level).toBeNull()
    expect(verdict.suppressed).toBeNull()
  })

  it('DOES flag the declining patient', () => {
    const baseline = baselineFor(declining.series)
    const verdict = evaluateDomain(declining.series, baseline, opts)

    expect(verdict.level).not.toBeNull()
    expect(['amber', 'red']).toContain(verdict.level)
    expect(verdict.z).toBeLessThan(-1.5)
    expect(verdict.suppressed).toBeNull()
  })

  /**
   * The confound patient: a sharp illness that FULLY RESOLVES.
   *
   * ─── The two defences, in order ───
   *
   * The 14-day sustain window is the FIRST defence against transient illness,
   * before any caregiver logs anything. Measured: a thirteen-day dip produces a
   * run of only six consecutive days below -1.5, so it never flags at all —
   * the system working as designed rather than a gap in it.
   *
   * care_event suppression is the SECOND defence, and it exists for the illness
   * that OUTLASTS a fortnight — a chest infection with a slow recovery, a
   * hospital stay, a medication change that takes weeks to settle. The seeded
   * confound patient is deliberately that longer case, because an illness short
   * enough to be caught by the first defence never exercises the second.
   *
   * That ordering is worth knowing: a system whose only protection was the
   * caregiver remembering to log an infection would cry wolf constantly,
   * because caregivers of people with dementia have a great deal else to do.
   */
  it('does NOT flag an illness shorter than the sustain window, with nothing logged', () => {
    // Constructed, not seeded, so the boundary is exact: twelve bad days inside
    // a longer healthy history can never fill a fourteen-day window.
    const baseline = { mean: 0.82, sd: 0.05 }
    const shortDip = [
      ...constantSeries(0.82, 20),
      ...constantSeries(0.6, 12),
      ...constantSeries(0.82, 8),
    ]
    expect(evaluateDomain(shortDip.slice(0, 32), baseline, opts).level).toBeNull()
  })

  it('DOES flag the confound patient at the depth of the illness', () => {
    const baseline = baselineFor(confound.series)
    const atWorst = worstStretchEnd(confound.series, 14)
    const verdict = evaluateDomain(confound.series.slice(0, atWorst), baseline, opts)

    // It has to fire BEFORE suppression can mean anything. A suppressed flag
    // that would not have fired anyway proves nothing about the rule.
    expect(verdict.level).not.toBeNull()
  })

  it('SUPPRESSES the confound patient as care_event when the illness is logged', () => {
    const baseline = baselineFor(confound.series)
    const atWorst = worstStretchEnd(confound.series, 14)
    const verdict = evaluateDomain(confound.series.slice(0, atWorst), baseline, {
      ...opts,
      hasCareEvent: true,
    })

    expect(verdict.suppressed).toBe('care_event')
  })

  it('the confound patient is clear again once the illness has resolved', () => {
    // The whole point of the profile: it goes back to normal, and the dashboard
    // stops flagging without anyone intervening.
    const baseline = baselineFor(confound.series)
    expect(evaluateDomain(confound.series, baseline, opts).level).toBeNull()
  })

  it('seeds exactly the three verdicts the demo depends on', () => {
    // The seeds in PROFILES are CHOSEN — see the note there. This locks what
    // they produce, so a change to the arithmetic that silently empties the
    // demo dashboards fails here instead of on stage.
    expect(evaluateDomain(stable.series, baselineFor(stable.series), opts).level).toBeNull()
    expect(evaluateDomain(declining.series, baselineFor(declining.series), opts).level).not.toBeNull()
    expect(evaluateDomain(confound.series, baselineFor(confound.series), opts).level).toBeNull()
  })

  it('an illness that DOES outlast the window is caught, then suppressed', () => {
    // The case the care_event rule exists for: an illness long enough to clear
    // the sustain rule. Constructed rather than seeded, so the boundary is exact.
    const baseline = { mean: 0.82, sd: 0.05 }
    const longIllness = [...constantSeries(0.82, 20), ...constantSeries(0.6, 20)]

    expect(evaluateDomain(longIllness, baseline, opts).level).toBe('red')
    expect(
      evaluateDomain(longIllness, baseline, { ...opts, hasCareEvent: true }).suppressed,
    ).toBe('care_event')
  })

  /**
   * The detection floor, asserted rather than assumed.
   *
   * A drift shallower than ~1.5 SD of the person's own daily variation does not
   * fire, however long it lasts. That is the rule working as specified, and it
   * is the honest answer to "what can this actually see": a decline of about
   * one and a half standard deviations, sustained a fortnight. Anything slower
   * is below the noise floor and no honest system would flag it.
   */
  it('does NOT fire on a drift shallower than the threshold, however sustained', () => {
    const baseline = { mean: 0.82, sd: 0.09 }
    const shallow = constantSeries(0.71, 20) // about -1.2 SD
    expect(evaluateDomain(shallow, baseline, opts).level).toBeNull()
  })

  it('escalates to red only when the excursion is deeper than -2.0', () => {
    const baseline = { mean: 0.82, sd: 0.05 }
    const amberish = constantSeries(0.73, 14) // z ~ -1.8
    const redish = constantSeries(0.68, 14) // z ~ -2.8

    expect(evaluateDomain(amberish, baseline, opts).level).toBe('amber')
    expect(evaluateDomain(redish, baseline, opts).level).toBe('red')
  })

  it('requires the excursion to be SUSTAINED, not a single bad day', () => {
    const baseline = { mean: 0.82, sd: 0.05 }
    const oneBadDay: DailyPoint[] = [
      ...constantSeries(0.82, 13),
      { day: '2026-01-14', accuracy: 0.2, sessions: 1 },
    ]
    // The last value dips, but the earlier days are fine, so `every` fails.
    expect(evaluateDomain(oneBadDay, baseline, opts).level).toBeNull()
  })
})

describe('suppression — all three, in order', () => {
  const baseline = { mean: 0.82, sd: 0.05 }
  const bad = constantSeries(0.6, 14)

  it('suppresses as insufficient_data below 4 sessions in the window', () => {
    const verdict = evaluateDomain(bad, baseline, {
      sessionsInWindow: 3,
      hasCareEvent: false,
      lowEffort: false,
    })
    // Below roughly three sessions a week the noise floor swamps any signal.
    expect(verdict.suppressed).toBe('insufficient_data')
  })

  it('suppresses as care_event when something was logged over the window', () => {
    const verdict = evaluateDomain(bad, baseline, {
      sessionsInWindow: 6,
      hasCareEvent: true,
      lowEffort: false,
    })
    // An infection is not dementia. A system that cannot tell the difference
    // cries wolf at every chest cold and stops being believed.
    expect(verdict.suppressed).toBe('care_event')
    expect(verdict.level).toBe('red')
  })

  it('routes a low-effort signature to an EFFORT flag, not a decline flag', () => {
    const verdict = evaluateDomain(bad, baseline, {
      sessionsInWindow: 6,
      hasCareEvent: false,
      lowEffort: true,
    })
    expect(verdict.suppressed).toBe('low_effort')
    // The whole point: the caregiver gets an unscored mood check-in, and is
    // never told anything about memory.
    expect(verdict.level).toBe('effort')
  })

  it('checks insufficient_data before the other two', () => {
    const verdict = evaluateDomain(bad, baseline, {
      sessionsInWindow: 2,
      hasCareEvent: true,
      lowEffort: true,
    })
    expect(verdict.suppressed).toBe('insufficient_data')
  })
})

describe('the low-effort discriminator (8.1)', () => {
  const disengaged = {
    omissionRate: 0.4,
    abandonRate: 0.5,
    hintRate: 0.05,
    medianLatencyMs: 9_000,
    trials: 60,
  }

  it('recognises disengagement: omissions, abandonment, slow, and FEW hints', () => {
    expect(isLowEffort(disengaged)).toBe(true)
  })

  it('does NOT fire on someone trying hard and failing', () => {
    // Identical except the hint rate. Hints fire on hesitation, so someone who
    // is engaged and struggling accumulates them — and calling that low effort
    // would tell a family the wrong thing about a person who is trying.
    expect(isLowEffort({ ...disengaged, hintRate: 0.6 })).toBe(false)
  })

  it('does not fire on someone slow but present', () => {
    expect(isLowEffort({ ...disengaged, omissionRate: 0.05, abandonRate: 0.05 })).toBe(false)
  })

  it('refuses to judge on too little data', () => {
    expect(isLowEffort({ ...disengaged, trials: 6 })).toBe(false)
  })
})

// ─── helpers ──────────────────────────────────────────────────

function row(game: string, latency: number, i: number): Attempt {
  return {
    session_id: 's',
    patient_id: 'p',
    game_type: game,
    domain: 'memory',
    correct: true,
    hints_used: 0,
    presented_at_ms: i * 1000,
    responded_at_ms: i * 1000 + latency,
  }
}

/** Index just past the `size` consecutive entries with the lowest mean accuracy. */
function worstStretchEnd(series: DailyPoint[], size: number): number {
  let bestEnd = size
  let bestMean = Number.POSITIVE_INFINITY

  for (let i = 0; i + size <= series.length; i++) {
    const window = series.slice(i, i + size)
    const m = window.reduce((sum, p) => sum + p.accuracy, 0) / size
    if (m < bestMean) {
      bestMean = m
      bestEnd = i + size
    }
  }
  return bestEnd
}

function constantSeries(accuracy: number, days: number): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    day: `2026-01-${String(i + 1).padStart(2, '0')}`,
    accuracy,
    sessions: 1,
  }))
}
