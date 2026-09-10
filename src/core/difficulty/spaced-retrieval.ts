import { db, type LocalRetrievalState } from '@/core/db/dexie'

/**
 * Expanding-interval spaced retrieval. architecture.md 7.1.
 *
 * A face tested successfully is tested again after a longer gap; a face missed
 * drops back one step. The interval a person can sustain is the measurement —
 * "holds Priya's name for 8 minutes, was 2 in July" is a real longitudinal
 * metric a family understands without anything being explained to them.
 *
 * ─── Why it drops back exactly ONE step ───
 *
 * Not to zero. Dropping to the start on a single miss discards weeks of gain to
 * one bad afternoon, and a bad afternoon is usually an infection or a poor
 * night's sleep rather than a change in the person. One step back is the
 * standard errorless-learning schedule and it is also the honest one: it treats
 * a miss as evidence about today, not about the trajectory.
 *
 * `longest_interval_s` never decreases. It is the high-water mark, and it is
 * what the dashboard trends — the same reason the bamboo grove never shrinks.
 */

/** Seconds. architecture.md 7.1: 30s → 1m → 2m → 4m → 8m. */
export const INTERVALS = [30, 60, 120, 240, 480] as const

export type RetrievalState = {
  patient_id: string
  family_member_id: string
  current_interval_s: number
  longest_interval_s: number
  consecutive_success: number
  /** Audio-free monotonic session offset, ms. null until first tested. */
  last_tested_at: number | null
}

export function initialState(patientId: string, familyMemberId: string): RetrievalState {
  return {
    patient_id: patientId,
    family_member_id: familyMemberId,
    current_interval_s: INTERVALS[0],
    longest_interval_s: 0,
    consecutive_success: 0,
    last_tested_at: null,
  }
}

function indexOfInterval(seconds: number): number {
  const exact = INTERVALS.indexOf(seconds as (typeof INTERVALS)[number])
  if (exact >= 0) return exact
  // A value not on the ladder (an older build, a hand-edited row): snap to the
  // nearest rung rather than resetting, which would discard real progress.
  let best = 0
  for (let i = 1; i < INTERVALS.length; i++) {
    const candidate = INTERVALS[i]
    const incumbent = INTERVALS[best]
    if (candidate === undefined || incumbent === undefined) continue
    if (Math.abs(candidate - seconds) < Math.abs(incumbent - seconds)) best = i
  }
  return best
}

/**
 * Pure. Given a state and an outcome, produce the next state.
 *
 * `testedAt` is a session-clock offset in ms, never wall clock — the whole
 * product measures on one monotonic timeline (architecture.md 6).
 */
export function advance(
  state: RetrievalState,
  correct: boolean,
  testedAt: number,
): RetrievalState {
  const index = indexOfInterval(state.current_interval_s)

  if (correct) {
    const next = Math.min(index + 1, INTERVALS.length - 1)
    const nextInterval = INTERVALS[next] ?? state.current_interval_s
    return {
      ...state,
      current_interval_s: nextInterval,
      // High-water mark: records the interval they actually SUSTAINED, which is
      // the one just answered at, not the one they are being promoted to.
      longest_interval_s: Math.max(state.longest_interval_s, state.current_interval_s),
      consecutive_success: state.consecutive_success + 1,
      last_tested_at: testedAt,
    }
  }

  const previous = Math.max(index - 1, 0)
  return {
    ...state,
    current_interval_s: INTERVALS[previous] ?? INTERVALS[0],
    // Unchanged on a miss. It is a record of what was once true.
    longest_interval_s: state.longest_interval_s,
    consecutive_success: 0,
    last_tested_at: testedAt,
  }
}

/** When this face should next be tested, as a session-clock offset in ms. */
export function nextDueAt(state: RetrievalState): number {
  if (state.last_tested_at === null) return 0
  return state.last_tested_at + state.current_interval_s * 1000
}

/**
 * Which face to test next: the one most overdue.
 *
 * Faces never tested come first — a face with no history is at interval zero and
 * is the whole point of the study phase.
 */
export function selectDueFace(states: RetrievalState[], now: number): RetrievalState | null {
  const due = states
    .map((state) => ({ state, dueAt: nextDueAt(state) }))
    .filter((entry) => entry.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)

  return due[0]?.state ?? null
}

// ─── persistence ──────────────────────────────────────────────
//
// Dexie is the source of truth during a session. rules.md 2: this store is
// STATE, not telemetry — read-modify-write with last-write-wins on a SERVER
// updated_at, and a local row never overwrites a newer server row. Applying the
// telemetry `ignoreDuplicates` rule here silently loses the newer value, which
// is why it has its own store and its own function rather than going through
// the outbox.
//
// The Supabase half of that rule belongs with the difficulty staircase in
// Phase 10; nothing here needs the network to work.

export async function loadStates(patientId: string): Promise<RetrievalState[]> {
  try {
    const rows = await db.retrieval_state.where('patient_id').equals(patientId).toArray()
    return rows.map(fromRow)
  } catch {
    return []
  }
}

export async function saveState(state: RetrievalState): Promise<void> {
  try {
    await db.retrieval_state.put({
      patient_id: state.patient_id,
      family_member_id: state.family_member_id,
      current_interval_s: state.current_interval_s,
      longest_interval_s: state.longest_interval_s,
      consecutive_success: state.consecutive_success,
      last_tested_at: state.last_tested_at,
      // Local clock only, and only so a later sync can compare. The server
      // overwrites this with its own value on the way in.
      updated_at: performance.now(),
    })
  } catch {
    // Losing one update costs one interval step, never a session (design.md 6).
  }
}

function fromRow(row: LocalRetrievalState): RetrievalState {
  return {
    patient_id: row.patient_id,
    family_member_id: row.family_member_id,
    current_interval_s: row.current_interval_s,
    longest_interval_s: row.longest_interval_s,
    consecutive_success: row.consecutive_success,
    last_tested_at: row.last_tested_at,
  }
}
