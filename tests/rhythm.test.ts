import { describe, expect, it } from 'vitest'
import { offsetsFromIois, patternFor, spanForLevel, timbreForLevel, toleranceMs } from '@/patient/games/dhol-bator/patterns'
import { toIois } from '@/core/audio/scheduler'

/**
 * Dhol Bator's timing arithmetic. phases.md Phase 7's exit criterion is
 * "asynchronies in tens of ms, not hundreds" — that is what proves the audio
 * clock was not mixed with the DOM clock.
 *
 * The scheduler's precision was measured separately through an
 * OfflineAudioContext render: five notes scheduled at 600/300/300/600 ms came
 * back at exactly 600/300/300/600, with a constant 0.271 ms offset that is the
 * sample's own attack ramp and cancels in the differences. That measurement
 * needs a browser; the arithmetic below does not, so it lives here where it runs
 * on every commit.
 */

/** Mirrors the anchoring in DholBatorGame.finishTrial. Audio-clock seconds in, ms out. */
function asynchroniesFor(taps: number[], modelIois: number[]): number[] {
  const first = taps[0]
  if (first === undefined) return []
  const cumulative = offsetsFromIois(modelIois)
  return taps.map((tap, i) => {
    const offset = cumulative[i]
    return offset === undefined ? 0 : (tap - (first + offset)) * 1000
  })
}

describe('Dhol Bator timing', () => {
  it('a perfect reproduction yields all-zero asynchronies', () => {
    const modelIois = [600, 300, 300, 600]
    // Taps in audio-clock SECONDS, starting at an arbitrary time — the anchor is
    // the first tap, so the absolute value must not matter.
    const start = 1234.5678
    const taps = offsetsFromIois(modelIois).map((o) => start + o)

    const async_ = asynchroniesFor(taps, modelIois)
    expect(async_).toHaveLength(5)
    for (const value of async_) expect(Math.abs(value)).toBeLessThan(1e-6)
  })

  it('is invariant to when the patient chooses to start', () => {
    const modelIois = [400, 800]
    const a = asynchroniesFor(offsetsFromIois(modelIois).map((o) => 10 + o), modelIois)
    const b = asynchroniesFor(offsetsFromIois(modelIois).map((o) => 9999 + o), modelIois)
    expect(a).toEqual(b)
  })

  it('reports a late tap as a positive error of the right size', () => {
    const modelIois = [600, 600]
    const start = 100
    const taps = [start, start + 0.6, start + 1.28]  // third tap 80 ms late

    const async_ = asynchroniesFor(taps, modelIois)
    expect(async_[0]).toBeCloseTo(0, 6)
    expect(async_[1]).toBeCloseTo(0, 6)
    expect(async_[2]).toBeCloseTo(80, 6)
  })

  it('response_iois are the intervals actually produced, in ms', () => {
    const taps = [5, 5.61, 5.9]
    expect(toIois(taps).map((v) => Math.round(v))).toEqual([610, 290])
  })

  it('tolerance scales with the interval but never below the floor', () => {
    // 60 ms accuracy is not achievable in this population; demanding it would
    // make every trial a miss and saturate the hint rate, killing the signal.
    expect(toleranceMs(300)).toBe(180)
    expect(toleranceMs(800)).toBeCloseTo(280, 6)
  })

  it('span and timbre climb with level, and span is clamped to 2..7', () => {
    expect(spanForLevel(1)).toBe(2)
    expect(spanForLevel(6)).toBe(7)
    expect(spanForLevel(99)).toBe(7)
    expect(spanForLevel(-5)).toBe(2)

    expect(timbreForLevel(1)).toBe('dhol')
    expect(timbreForLevel(5)).toBe('gogona')
    expect(timbreForLevel(7)).toBe('pepa')
  })

  it('a replayed trial presents the SAME pattern', () => {
    // The errorless replay has to be the pattern they just heard. A fresh one
    // would make the correction a new trial they also failed.
    expect(patternFor(5, 3)).toEqual(patternFor(5, 3))
  })

  it('no pattern is isochronous', () => {
    // An evenly spaced pattern can be reproduced by tapping at a steady rate
    // without remembering anything, so it would measure nothing.
    for (let span = 3; span <= 7; span++) {
      for (let trial = 0; trial < 2; trial++) {
        const iois = patternFor(span, trial)
        expect(new Set(iois).size).toBeGreaterThan(1)
      }
    }
  })
})
