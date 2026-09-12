import { db } from '@/core/db/dexie'
import type { GameType, Severity } from '@/core/telemetry/types'

/**
 * Rule-based weighted staircase. architecture.md 9.
 *
 * ─── Call it what it is ───
 *
 * This is a handful of thresholds and a rolling window. It is NOT AI, it is not
 * a model, and nothing here learns. Elo, IRT and Bayesian Knowledge Tracing were
 * all evaluated and rejected on cold-start grounds: every one of them needs a
 * population of prior players to calibrate against, and this product's first
 * user is its first user.
 *
 * The pitch line is "rule-based adaptive difficulty with ML-ready telemetry" —
 * the schema is deliberately shaped so a model could be trained on it later, and
 * the data volume to train one does not exist yet. Judges reward teams who know
 * what they have not built.
 *
 * ─── Why the target is 85% and not the usual ~70% ───
 *
 * Optimal-challenge tuning maximises learning rate by keeping people near the
 * edge of their ability. That is the wrong objective here. Errorless learning
 * wants the failure rate LOW: for this population a wrong answer is not useful
 * feedback, it is a small humiliation, and the whole design contract in
 * design.md 6 exists to prevent it. So the staircase aims high and moves slowly.
 */

export const WINDOW_SIZE = 10

/** Severity gate, both the starting level and the ceiling. */
const START: Record<Severity, number> = { mild: 3, moderate: 2, severe: 1 }
const CEILING: Record<Severity, number> = { mild: 6, moderate: 4, severe: 2 }

export const MIN_LEVEL = 1

export function startingLevel(severity: Severity | null): number {
  return START[severity ?? 'mild']
}

export function ceilingFor(severity: Severity | null): number {
  return CEILING[severity ?? 'mild']
}

export type TrialOutcome = { correct: boolean; hinted: boolean }

export type DifficultyState = {
  patient_id: string
  game_type: GameType
  level: number
  /** The rolling window of the last WINDOW_SIZE trials. */
  window: TrialOutcome[]
  /** Guards the once-per-session rule. */
  last_session_id: string | null
}

export function initialDifficulty(
  patientId: string,
  gameType: GameType,
  severity: Severity | null,
): DifficultyState {
  return {
    patient_id: patientId,
    game_type: gameType,
    level: startingLevel(severity),
    window: [],
    last_session_id: null,
  }
}

export type StaircaseDecision = {
  next: DifficultyState
  /** -1, 0 or +1. Never anything else. */
  moved: -1 | 0 | 1
  reason: 'promoted' | 'demoted' | 'holding' | 'already-moved-this-session' | 'insufficient-data'
  accuracy: number | null
  hintRate: number | null
}

/**
 * Fold new trials into the window and decide whether the level moves.
 *
 * `sessionId` is what enforces "never more than one level per session, in either
 * direction". Two games of the same type in one session, or a mid-session
 * recomputation, must not compound into a two-level jump — the patient would
 * feel the floor drop out from under them inside a single sitting.
 */
export function applyTrials(
  state: DifficultyState,
  trials: TrialOutcome[],
  severity: Severity | null,
  sessionId: string,
): StaircaseDecision {
  const window = [...state.window, ...trials].slice(-WINDOW_SIZE)
  const withWindow: DifficultyState = { ...state, window }

  if (window.length < WINDOW_SIZE) {
    // A short window is not evidence. Promoting on three good trials is how a
    // patient ends up two levels above where they can actually play.
    return {
      next: withWindow,
      moved: 0,
      reason: 'insufficient-data',
      accuracy: null,
      hintRate: null,
    }
  }

  const accuracy = window.filter((t) => t.correct).length / window.length
  const hintRate = window.filter((t) => t.hinted).length / window.length

  if (state.last_session_id === sessionId) {
    return {
      next: withWindow,
      moved: 0,
      reason: 'already-moved-this-session',
      accuracy,
      hintRate,
    }
  }

  const ceiling = ceilingFor(severity)
  let moved: -1 | 0 | 1 = 0

  if (accuracy >= 0.9 && hintRate <= 0.1) {
    moved = 1
  } else if (accuracy <= 0.6 || (hintRate >= 0.4 && accuracy < 0.85)) {
    /**
     * ─── The accuracy guard on the hint condition is load-bearing ───
     *
     * architecture.md 9 spells this out and it is easy to drop by accident.
     * Hints fire AUTOMATICALLY on hesitation, so a slow-but-perfect patient
     * accumulates a high hint rate at 100% accuracy. Without `accuracy < 0.85`
     * they get demoted for being slow; the easier level shortens their latency;
     * the shorter latency stops the hints; they get promoted again; the slower
     * level lengthens their latency. The staircase oscillates forever and the
     * level column becomes noise.
     *
     * Demote for being WRONG, or for needing help while also being wrong. Never
     * for being unhurried.
     */
    moved = -1
  }

  const level = clamp(state.level + moved, MIN_LEVEL, ceiling)
  const actuallyMoved: -1 | 0 | 1 = level === state.level ? 0 : moved

  return {
    next: {
      ...withWindow,
      level,
      // Only stamped when the level actually changed, so a session that merely
      // held does not block a legitimate move by a later game of the same type.
      last_session_id: actuallyMoved === 0 ? state.last_session_id : sessionId,
    },
    moved: actuallyMoved,
    reason:
      actuallyMoved === 1
        ? 'promoted'
        : actuallyMoved === -1
          ? 'demoted'
          : 'holding',
    accuracy,
    hintRate,
  }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

// ─── persistence ──────────────────────────────────────────────
//
// rules.md 2: difficulty_state is STATE, not telemetry. Read-modify-write with
// last-write-wins on a SERVER updated_at, and a local row never overwrites a
// newer server row. Reusing the telemetry `ignoreDuplicates` rule here silently
// loses the newer value, which is why this has its own store and never goes
// through the outbox.
//
// Dexie is the source of truth during a session; it works offline, which is the
// normal case for the tablet this runs on.

export async function loadDifficulty(
  patientId: string,
  gameType: GameType,
  severity: Severity | null,
): Promise<DifficultyState> {
  try {
    const row = await db.difficulty_state.get([patientId, gameType])
    if (!row) return initialDifficulty(patientId, gameType, severity)

    return {
      patient_id: row.patient_id,
      game_type: row.game_type,
      level: row.level,
      // A row from an older build may hold something else entirely here.
      window: Array.isArray(row.window) ? row.window.slice(-WINDOW_SIZE) : [],
      last_session_id: typeof row.last_session_id === 'string' ? row.last_session_id : null,
    }
  } catch {
    return initialDifficulty(patientId, gameType, severity)
  }
}

export async function saveDifficulty(state: DifficultyState): Promise<void> {
  try {
    await db.difficulty_state.put({
      patient_id: state.patient_id,
      game_type: state.game_type,
      level: state.level,
      window: state.window,
      last_session_id: state.last_session_id,
      // Local only, and only so a later sync can compare. The server replaces
      // this with its own value on the way in — that is the whole conflict rule.
      updated_at: performance.now(),
    })
  } catch {
    // Losing one update costs one level step, never a session (design.md 6).
  }
}
