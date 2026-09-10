import type { DrumSampleName } from '@/core/audio/context'

/**
 * Bihu-flavoured rhythms for Dhol Bator. architecture.md 7.2.
 *
 * Span runs 2 to 7, which is the Corsi-block / digit-span range wearing
 * cultural clothing. The construct is validated; it does not feel like a test.
 *
 * Timbre changes with level rather than colour. design.md Part II 1: gogona and
 * pepa distinguish levels BY SOUND, because two colours a designer separates
 * easily may be identical to a 78-year-old whose lens has yellowed. A rhythm
 * game is the one place where a non-visual difficulty cue is free.
 */

export type Timbre = 'dhol' | 'gogona' | 'pepa'

/** Which sample carries the accent, and which the off-beats. */
export const TIMBRE_SAMPLES: Record<Timbre, { accent: DrumSampleName; plain: DrumSampleName }> = {
  dhol: { accent: 'dholLow', plain: 'dholHigh' },
  gogona: { accent: 'gogona', plain: 'dholHigh' },
  pepa: { accent: 'pepa', plain: 'dholHigh' },
}

/**
 * Inter-onset intervals in milliseconds, one array per span.
 *
 * Intervals stay well above 300 ms throughout. Faster than that and the task
 * stops measuring memory for a rhythm and starts measuring motor speed, which
 * this population fails for reasons that have nothing to do with cognition.
 *
 * Each pattern mixes a long and a short interval rather than being isochronous:
 * an evenly spaced pattern can be reproduced by tapping at a steady rate without
 * remembering anything, so it would measure nothing.
 */
const PATTERNS: Record<number, number[][]> = {
  2: [[600], [800]],
  3: [
    [600, 300],
    [400, 800],
  ],
  4: [
    [600, 300, 600],
    [400, 400, 800],
  ],
  5: [
    [600, 300, 300, 600],
    [400, 800, 400, 400],
  ],
  6: [
    [400, 400, 800, 400, 400],
    [600, 300, 600, 300, 600],
  ],
  7: [
    [400, 400, 800, 400, 400, 800],
    [300, 600, 300, 600, 300, 600],
  ],
}

export function spanForLevel(level: number): number {
  // Level 1 starts at span 2; Phase 10's staircase moves it from there.
  return Math.min(7, Math.max(2, level + 1))
}

export function timbreForLevel(level: number): Timbre {
  if (level >= 7) return 'pepa'
  if (level >= 5) return 'gogona'
  return 'dhol'
}

/** Deterministic per trial, so a replay after a miss is the SAME pattern. */
export function patternFor(span: number, trialIndex: number): number[] {
  const options = PATTERNS[span] ?? PATTERNS[2] ?? [[600]]
  const chosen = options[trialIndex % options.length] ?? options[0]
  return chosen ? [...chosen] : [600]
}

/** Cumulative offsets in SECONDS, which is what the scheduler wants. */
export function offsetsFromIois(iois: number[]): number[] {
  const offsets = [0]
  let total = 0
  for (const ioi of iois) {
    total += ioi
    offsets.push(total / 1000)
  }
  return offsets
}

/**
 * How close a tap has to be to count as reproducing the pattern.
 *
 * Proportional to the interval, with a floor: a 40 ms error inside a 300 ms gap
 * is a different thing from the same error inside an 800 ms gap. The floor
 * exists because no one in this population taps to within 60 ms, and demanding
 * it would make every trial a miss — which the errorless contract would then
 * paper over, leaving hint rate saturated and the difficulty signal dead.
 */
export function toleranceMs(ioi: number): number {
  return Math.max(180, ioi * 0.35)
}
