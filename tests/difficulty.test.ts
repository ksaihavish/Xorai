import { describe, expect, it } from 'vitest'
import {
  WINDOW_SIZE,
  applyTrials,
  ceilingFor,
  initialDifficulty,
  startingLevel,
  type DifficultyState,
  type TrialOutcome,
} from '@/core/difficulty/staircase'
import { dueBetween, minutesOfDay, nextDue, occurrenceKey } from '@/patient/assist/reminders'
import type { LocalReminder } from '@/core/telemetry/types'

const P = 'patient-1'
const trials = (n: number, correct: boolean, hinted = false): TrialOutcome[] =>
  Array.from({ length: n }, () => ({ correct, hinted }))

function stateAt(level: number, window: TrialOutcome[] = []): DifficultyState {
  return { ...initialDifficulty(P, 'aponjon', 'mild'), level, window }
}

describe('adaptive difficulty staircase', () => {
  it('starts from the severity gate', () => {
    expect(startingLevel('mild')).toBe(3)
    expect(startingLevel('moderate')).toBe(2)
    expect(startingLevel('severe')).toBe(1)
  })

  it('holds until the window is full', () => {
    const decision = applyTrials(stateAt(3), trials(WINDOW_SIZE - 1, true), 'mild', 's1')
    // Promoting on a handful of good trials is how a patient ends up two levels
    // above where they can actually play.
    expect(decision.reason).toBe('insufficient-data')
    expect(decision.moved).toBe(0)
    expect(decision.next.level).toBe(3)
  })

  it('promotes at >=90% accuracy with <=10% hints', () => {
    const decision = applyTrials(stateAt(3), trials(10, true), 'mild', 's1')
    expect(decision.moved).toBe(1)
    expect(decision.next.level).toBe(4)
    expect(decision.accuracy).toBe(1)
  })

  it('demotes at <=60% accuracy', () => {
    const window = [...trials(5, true), ...trials(5, false)]
    const decision = applyTrials(stateAt(3), window, 'mild', 's1')
    expect(decision.moved).toBe(-1)
    expect(decision.next.level).toBe(2)
  })

  /**
   * The regression this whole suite exists for.
   *
   * architecture.md 9 guards the hint condition with `accuracy < 0.85`. Hints
   * fire automatically on hesitation, so a slow-but-perfect patient racks up a
   * high hint rate at 100% accuracy. Without the guard they are demoted for
   * being slow, the easier level shortens their latency, the hints stop, they
   * are promoted, and the level oscillates forever.
   */
  it('does NOT demote a slow-but-perfect patient, however many hints they used', () => {
    const window = trials(10, true, true) // 100% accuracy, 100% hint rate
    const decision = applyTrials(stateAt(3), window, 'mild', 's1')

    expect(decision.accuracy).toBe(1)
    expect(decision.hintRate).toBe(1)
    expect(decision.moved).toBe(0)
    expect(decision.next.level).toBe(3)
  })

  it('does demote when hints are high AND accuracy is below 85%', () => {
    const window = [...trials(8, true, true), ...trials(2, false, true)] // 80% / 100%
    const decision = applyTrials(stateAt(3), window, 'mild', 's1')
    expect(decision.moved).toBe(-1)
  })

  it('never moves more than one level in a session, in either direction', () => {
    const first = applyTrials(stateAt(3), trials(10, true), 'mild', 'session-A')
    expect(first.moved).toBe(1)
    expect(first.next.level).toBe(4)

    // A second game of the same type in the SAME session must not compound.
    const second = applyTrials(first.next, trials(10, true), 'mild', 'session-A')
    expect(second.reason).toBe('already-moved-this-session')
    expect(second.next.level).toBe(4)

    // A new session may move again.
    const third = applyTrials(second.next, trials(10, true), 'mild', 'session-B')
    expect(third.next.level).toBe(5)
  })

  it('clamps to the severity ceiling and to level 1', () => {
    let state = stateAt(ceilingFor('severe'))
    state = { ...state, level: ceilingFor('severe') }
    const up = applyTrials(state, trials(10, true), 'severe', 's1')
    expect(up.next.level).toBeLessThanOrEqual(ceilingFor('severe'))
    expect(up.moved).toBe(0)

    const down = applyTrials(stateAt(1), trials(10, false), 'mild', 's2')
    expect(down.next.level).toBe(1)
    expect(down.moved).toBe(0)
  })

  it('keeps only the last 10 trials in the window', () => {
    const decision = applyTrials(stateAt(3), trials(25, true), 'mild', 's1')
    expect(decision.next.window).toHaveLength(WINDOW_SIZE)
  })

  it('does not stamp the session when the level did not actually move', () => {
    // Otherwise a game that merely held would block a legitimate move by the
    // second game of the same session.
    const decision = applyTrials(stateAt(3), trials(10, true, true), 'mild', 's1')
    expect(decision.moved).toBe(0)
    expect(decision.next.last_session_id).toBeNull()
  })
})

describe('reminder scheduling', () => {
  const reminder = (over: Partial<LocalReminder> = {}): LocalReminder => ({
    id: 'r1',
    kind: 'medication',
    label: 'Time for the blue tablet',
    time_of_day: '09:00',
    days_of_week: null,
    audio_url: null,
    active: true,
    ...over,
  })

  it('parses HH:MM into minutes', () => {
    expect(minutesOfDay('09:00')).toBe(540)
    expect(minutesOfDay('00:30')).toBe(30)
    expect(minutesOfDay('23:45')).toBe(1425)
  })

  it('finds an occurrence inside the window', () => {
    const from = new Date(2026, 8, 11, 8, 0)
    const to = new Date(2026, 8, 11, 10, 0)
    const due = dueBetween([reminder()], from, to)

    expect(due).toHaveLength(1)
    expect(due[0]?.dueAt.getHours()).toBe(9)
  })

  it('ignores an inactive reminder', () => {
    const due = dueBetween(
      [reminder({ active: false })],
      new Date(2026, 8, 11, 8, 0),
      new Date(2026, 8, 11, 10, 0),
    )
    expect(due).toHaveLength(0)
  })

  it('honours days_of_week', () => {
    // 11 Sep 2026 is a Friday (day 5).
    const window: [Date, Date] = [new Date(2026, 8, 11, 8, 0), new Date(2026, 8, 11, 10, 0)]
    expect(dueBetween([reminder({ days_of_week: [5] })], ...window)).toHaveLength(1)
    expect(dueBetween([reminder({ days_of_week: [1, 2] })], ...window)).toHaveLength(0)
  })

  it('spans midnight without losing the next day', () => {
    const due = dueBetween(
      [reminder({ time_of_day: '07:00' })],
      new Date(2026, 8, 11, 22, 0),
      new Date(2026, 8, 12, 9, 0),
    )
    expect(due).toHaveLength(1)
    expect(due[0]?.dueAt.getDate()).toBe(12)
  })

  it('gives each occurrence a stable, per-minute key', () => {
    const at = new Date(2026, 8, 11, 9, 0)
    expect(occurrenceKey(reminder(), at)).toBe(occurrenceKey(reminder(), at))
    expect(occurrenceKey(reminder(), at)).not.toBe(
      occurrenceKey(reminder(), new Date(2026, 8, 12, 9, 0)),
    )
  })

  it('finds the next occurrence ahead of now', () => {
    const next = nextDue([reminder()], new Date(2026, 8, 11, 10, 0))
    // Already past today, so tomorrow.
    expect(next?.dueAt.getDate()).toBe(12)
    expect(next?.dueAt.getHours()).toBe(9)
  })

  it('returns occurrences in time order', () => {
    const due = dueBetween(
      [reminder({ id: 'b', time_of_day: '13:00' }), reminder({ id: 'a', time_of_day: '09:00' })],
      new Date(2026, 8, 11, 8, 0),
      new Date(2026, 8, 11, 18, 0),
    )
    expect(due.map((d) => d.reminder.id)).toEqual(['a', 'b'])
  })
})
