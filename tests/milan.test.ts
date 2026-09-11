import { describe, expect, it } from 'vitest'
import {
  DEMO_DECK,
  ERA_WEIGHTS,
  buildDeck,
  gridFor,
  layOutBoard,
  visibleMsFor,
} from '@/patient/games/xorai-milan/deck'
import { deriveFeatures, type CapturedStroke } from '@/core/trace/capture'

describe('Xorai Milan deck', () => {
  it('weights the deck toward vintage, 60/40', () => {
    // The clinical argument, not a content preference: remote memory outlives
    // recent memory, so a hurricane lantern is worth more than a landmark.
    expect(ERA_WEIGHTS.vintage).toBe(0.6)
    expect(ERA_WEIGHTS.contemporary).toBe(0.4)

    const deck = buildDeck(DEMO_DECK, 5, 1)
    const vintage = deck.filter((c) => c.era === 'vintage').length
    expect(vintage).toBe(3)
    expect(deck).toHaveLength(5)
  })

  it('never repeats a card within one deck', () => {
    const deck = buildDeck(DEMO_DECK, 6, 42)
    expect(new Set(deck.map((c) => c.id)).size).toBe(deck.length)
  })

  it('lays out exactly two of every card', () => {
    const deck = buildDeck(DEMO_DECK, 4, 7)
    const board = layOutBoard(deck, 7)
    expect(board).toHaveLength(8)
    for (const card of deck) {
      expect(board.filter((c) => c.id === card.id)).toHaveLength(2)
    }
  })

  it('caps the grid by severity, and severe never exceeds 2x3', () => {
    // A 4x4 board in front of someone who cannot hold four items is not a
    // harder game, it is an impossible one.
    for (const level of [1, 4, 9]) {
      const severe = gridFor(level, 'severe')
      expect(severe.cols * severe.rows).toBeLessThanOrEqual(6)
    }
    expect(gridFor(9, 'moderate')).toEqual({ cols: 4, rows: 3 })
    expect(gridFor(9, 'mild')).toEqual({ cols: 4, rows: 4 })
    expect(gridFor(1, 'mild')).toEqual({ cols: 2, rows: 2 })
  })

  it('every grid holds an even number of cards', () => {
    for (const level of [1, 2, 3, 4]) {
      for (const severity of ['mild', 'moderate', 'severe'] as const) {
        const grid = gridFor(level, severity)
        expect((grid.cols * grid.rows) % 2).toBe(0)
      }
    }
  })

  it('shrinks card-visible time with level but floors it', () => {
    expect(visibleMsFor(1)).toBeGreaterThan(visibleMsFor(3))
    // Below ~1.2 s the task measures eye speed rather than memory.
    expect(visibleMsFor(20)).toBe(1_200)
  })

  it('is deterministic for a given seed', () => {
    expect(buildDeck(DEMO_DECK, 4, 5).map((c) => c.id)).toEqual(
      buildDeck(DEMO_DECK, 4, 5).map((c) => c.id),
    )
  })
})

describe('Ghorir Chobi trace features', () => {
  const stroke = (start: number, end: number, air: number, points = 10): CapturedStroke => ({
    points: Array.from({ length: points }, (_, i) => ({
      x: i,
      y: i,
      t: start + (i / points) * (end - start),
    })),
    stroke_start_ms: start,
    stroke_end_ms: end,
    air_time_before_ms: air,
  })

  it('measures the hesitation before the pen ever moves', () => {
    const features = deriveFeatures([stroke(1_500, 2_000, 0)], 500)
    expect(features.pre_first_stroke_latency).toBe(1_000)
  })

  it('reports pauses, total air time and the longest one', () => {
    const strokes = [stroke(1_000, 1_500, 0), stroke(2_400, 2_800, 900), stroke(3_000, 3_400, 200)]
    const features = deriveFeatures(strokes, 1_000)

    expect(features.post_clock_face_latency).toBe(900)
    expect(features.total_air_time).toBe(1_100)
    expect(features.longest_latency).toBe(900)
    expect(features.stroke_count).toBe(3)
    expect(features.total_time).toBe(2_400)
    expect(features.latency_variability).toBeGreaterThan(0)
  })

  it('returns nulls rather than zeros for an empty drawing', () => {
    // A patient who never touched the canvas has no latency, which is a
    // different fact from a latency of zero.
    const features = deriveFeatures([], 0)
    expect(features.pre_first_stroke_latency).toBeNull()
    expect(features.stroke_count).toBe(0)
  })

  it('produces no score, accuracy or shape judgement of any kind', () => {
    // architecture.md 7.4 forbids automated clock scoring outright. If a key
    // like this ever appears, this product has become a screening instrument.
    const features = deriveFeatures([stroke(0, 100, 0)], 0)
    const keys = Object.keys(features)
    for (const banned of ['score', 'accuracy', 'correct', 'shape', 'quality']) {
      expect(keys.some((k) => k.includes(banned))).toBe(false)
    }
  })
})
