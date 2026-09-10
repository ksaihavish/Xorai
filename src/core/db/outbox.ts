import { v7 as uuidv7 } from 'uuid'
import { UNFLUSHED, db, type XoraiDb } from '@/core/db/dexie'
import type {
  AttemptEvent,
  RhythmTrialEvent,
  SessionRecord,
  StrokeEvent,
} from '@/core/telemetry/types'

/**
 * The write side of the offline layer.
 *
 * ─── The contract these four functions exist to enforce ───
 *
 * Every one returns `void`, not a Promise. That is the whole point.
 *
 * rules.md 2: events are written to Dexie first, synchronously with the
 * interaction, and the network is never in the interaction path. If these
 * returned a Promise, a game would sooner or later `await` one inside a
 * `pointerdown` handler, and the tap that the reaction-time metric is measuring
 * would be delayed by the thing measuring it. Returning void makes that
 * impossible to write by accident.
 *
 * "Synchronously" is doing precise work here, and it is worth being exact about
 * what it does and does not mean. IndexedDB has no synchronous API. What happens
 * is that the write is *issued* in the same task as the interaction, before the
 * handler returns — nothing is queued behind a fetch, a timer, or a microtask
 * chain that could be starved. Durability lands a tick later. That is as close
 * to synchronous as the platform allows, and it is enough: the failure mode this
 * guards against is a lost event from a network round trip, not a crash between
 * the tap and the next microtask.
 *
 * A rejection is swallowed and counted rather than thrown. These run on the
 * patient path, where design.md 6 forbids surfacing any error at all — the
 * session continues, and a caregiver sees the outbox depth in SyncStatus.
 */

/**
 * Failed local writes, exposed for the caregiver's sync indicator. Never zeroed:
 * a device that has dropped events should keep saying so.
 */
let droppedWrites = 0

export function droppedWriteCount(): number {
  return droppedWrites
}

function fireAndForget(operation: Promise<unknown>): void {
  // `void` on a caught promise: no unhandled rejection, no awaiting caller.
  void operation.catch(() => {
    droppedWrites += 1
  })
}

export function queueSession(session: SessionRecord, database: XoraiDb = db): void {
  fireAndForget(database.outbox_sessions.put({ ...session, flushed_at: UNFLUSHED }))
}

export function queueAttempt(
  attempt: Omit<AttemptEvent, 'client_event_id'> & { client_event_id?: string },
  database: XoraiDb = db,
): void {
  fireAndForget(
    database.outbox_attempts.put({
      ...attempt,
      // uuid v7 is time-ordered, so the outbox reads back in the order events
      // happened without needing a separate sequence column.
      client_event_id: attempt.client_event_id ?? uuidv7(),
      flushed_at: UNFLUSHED,
    }),
  )
}

export function queueStroke(
  stroke: Omit<StrokeEvent, 'client_event_id'> & { client_event_id?: string },
  database: XoraiDb = db,
): void {
  fireAndForget(
    database.outbox_strokes.put({
      ...stroke,
      client_event_id: stroke.client_event_id ?? uuidv7(),
      flushed_at: UNFLUSHED,
    }),
  )
}

export function queueRhythmTrial(
  trial: Omit<RhythmTrialEvent, 'client_event_id'> & { client_event_id?: string },
  database: XoraiDb = db,
): void {
  fireAndForget(
    database.outbox_rhythm.put({
      ...trial,
      client_event_id: trial.client_event_id ?? uuidv7(),
      flushed_at: UNFLUSHED,
    }),
  )
}

/** Everything still waiting on the server. Drives the caregiver indicator. */
export async function pendingCount(database: XoraiDb = db): Promise<number> {
  const counts = await Promise.all([
    database.outbox_sessions.where('flushed_at').equals(UNFLUSHED).count(),
    database.outbox_attempts.where('flushed_at').equals(UNFLUSHED).count(),
    database.outbox_strokes.where('flushed_at').equals(UNFLUSHED).count(),
    database.outbox_rhythm.where('flushed_at').equals(UNFLUSHED).count(),
  ])
  return counts.reduce((sum, n) => sum + n, 0)
}
