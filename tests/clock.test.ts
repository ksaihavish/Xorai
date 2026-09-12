import { describe, expect, it } from 'vitest'
import { createSessionClock } from '@/core/telemetry/clock'

/**
 * The clock is the thing the clinical claim rests on. rules.md 5 / phases.md
 * Phase 4: this suite is green or the reaction-time variability metric is not
 * trustworthy, and everything downstream of it is decoration.
 */

/**
 * The Date.now() ban that used to live here now sits in invariants.test.ts,
 * alongside the other rules.md §2 checks, so there is one place to look and one
 * place to keep current. This file is the SessionClock's own behaviour.
 */

describe('SessionClock', () => {
  it('produces monotonically non-decreasing offsets across 1000 calls', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    const samples: number[] = []
    for (let i = 0; i < 1000; i++) samples.push(clock.now())

    for (let i = 1; i < samples.length; i++) {
      const previous = samples[i - 1]
      const current = samples[i]
      expect(previous).toBeDefined()
      expect(current).toBeDefined()
      // Non-decreasing, not strictly increasing: performance.now() is allowed to
      // return the same value twice in a row, and on a browser with timer
      // coarsening for Spectre mitigation it routinely does. Requiring strict
      // increase here would be testing the platform's clock resolution, not ours.
      expect(current as number).toBeGreaterThanOrEqual(previous as number)
    }

    dispose()
  })

  it('starts at approximately zero and never goes negative', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    const first = clock.now()
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThan(50)

    dispose()
  })

  it('records started_at as a valid ISO wall-clock instant', () => {
    const { startedAt, dispose } = createSessionClock({ sampleWindowMs: 1 })

    expect(startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(new Date(startedAt).getTime())).toBe(false)

    dispose()
  })

  it('exposes a usable pointer sample interval before measurement finishes', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    // A default, not a null: the session record can be written at any moment and
    // the analysis needs something to normalise by.
    expect(clock.pointerSampleIntervalMs).toBeGreaterThan(0)
    expect(clock.pointerSampleIntervalMs).toBeLessThan(100)

    dispose()
  })

  it('refuses to convert an audio timestamp without an anchor', () => {
    const { clock, dispose } = createSessionClock({ sampleWindowMs: 1 })

    // Loud, not silent. Returning NaN or 0 here would put a plausible-looking
    // wrong number into rhythm_trials, and architecture.md 6 is explicit that
    // both the attempt offsets and the asynchronies would then be wrong while
    // still looking fine.
    expect(() => clock.fromAudio(1.5)).toThrow(/audio anchor/i)

    dispose()
  })

  it('converts audio time against a supplied anchor', () => {
    const fakeContext = {
      currentTime: 10,
      getOutputTimestamp: () => ({ contextTime: 10, performanceTime: performance.now() }),
    } as unknown as AudioContext

    const { clock, dispose } = createSessionClock({
      audioContext: fakeContext,
      sampleWindowMs: 1,
    })

    // One second later on the audio clock is ~1000 ms later on this timeline.
    const converted = clock.fromAudio(11)
    expect(converted).toBeGreaterThan(950)
    expect(converted).toBeLessThan(1050)

    dispose()
  })
})
