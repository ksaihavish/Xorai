import 'fake-indexeddb/auto'
import { v7 as uuidv7 } from 'uuid'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { META_KEYS, QUARANTINED, UNFLUSHED, XoraiDb, readMeta } from '@/core/db/dexie'
import { pendingCount, queueAttempt } from '@/core/db/outbox'
import { BATCH_SIZE, createSyncEngine, type UpsertPort } from '@/core/db/sync-engine'

/**
 * Idempotent replay of a partial flush. rules.md 5 / phases.md Phase 3: an
 * airplane-mode session must survive a force-quit and sync with ZERO duplicate
 * rows.
 *
 * The interesting failure is not "the request failed". It is "the request
 * succeeded and the response never arrived" — the rows are on the server, the
 * client has no idea, and the retry sends them again. That is the case
 * `ignoreDuplicates` on client_event_id exists for, and it is the case this
 * file reproduces. A stub that merely rejects would prove nothing.
 */

/** Stands in for Postgres: a table keyed by the same column the real UNIQUE is on. */
class FakeServer {
  rows = new Map<string, Record<string, unknown>>()
  /** Every call, so the test can assert the retry actually happened. */
  calls: { table: string; count: number; failed: boolean }[] = []

  private failures: (('write-then-fail' | 'fail') | null)[] = []

  /** Queue a behaviour for the Nth upcoming call; anything past it succeeds. */
  program(behaviours: (('write-then-fail' | 'fail') | null)[]): void {
    this.failures = [...behaviours]
  }

  port(): UpsertPort {
    return {
      upsert: async (table, rows, onConflict) => {
        const behaviour = this.failures.shift() ?? null

        const write = () => {
          for (const row of rows) {
            const key = String(row[onConflict])
            // ignoreDuplicates: true — first write wins, later ones are no-ops.
            if (!this.rows.has(key)) this.rows.set(key, row)
          }
        }

        if (behaviour === 'fail') {
          this.calls.push({ table, count: rows.length, failed: true })
          return { error: { message: 'network lost' } }
        }

        // The dangerous case: the server committed, then the response was lost.
        write()
        const failed = behaviour === 'write-then-fail'
        this.calls.push({ table, count: rows.length, failed })
        return { error: failed ? { message: 'response lost after commit' } : null }
      },
    }
  }
}

const SESSION_ID = uuidv7()
const PATIENT_ID = uuidv7()

function attempt(trialIndex: number) {
  return {
    session_id: SESSION_ID,
    patient_id: PATIENT_ID,
    game_type: 'dhol_bator' as const,
    domain: 'attention' as const,
    trial_index: trialIndex,
    difficulty_level: 2,
    stimulus_id: null,
    presented_at_ms: trialIndex * 1000,
    first_touch_at_ms: trialIndex * 1000 + 420,
    responded_at_ms: trialIndex * 1000 + 900,
    correct: true,
    error_type: 'none' as const,
    hints_used: 0,
    retrieval_interval_s: null,
    hint_latency_ms: null,
    touch_x: 1.5,
    touch_y: -2.5,
    target_radius_px: 60,
    features: null,
  }
}

let db: XoraiDb
let server: FakeServer
let dbName: string

beforeEach(async () => {
  // A fresh database per test; fake-indexeddb persists within the module.
  dbName = `xorai-test-${uuidv7()}`
  db = new XoraiDb(dbName)
  await db.open()
  server = new FakeServer()
})

afterEach(async () => {
  db.close()
  await XoraiDb.delete(dbName)
})

/** queueAttempt returns void by contract, so tests wait on the queue draining. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

function engineFor(port: UpsertPort, now = () => 1_700_000_000_000) {
  return createSyncEngine({
    database: db,
    port,
    now,
    // Backoff must not spend real seconds inside a test, and an unattended
    // retry firing mid-assertion would make this flaky.
    setTimeoutFn: () => 0,
    clearTimeoutFn: () => undefined,
  })
}

describe('offline outbox and sync engine', () => {
  it('queues 250 attempts offline without touching the network', async () => {
    for (let i = 0; i < 250; i++) queueAttempt(attempt(i), db)
    await settle()

    expect(await db.outbox_attempts.count()).toBe(250)
    expect(await pendingCount(db)).toBe(250)
    // Nothing was sent: no engine has run yet.
    expect(server.calls).toHaveLength(0)
  })

  it('replays a partial flush with zero duplicates', async () => {
    for (let i = 0; i < 250; i++) queueAttempt(attempt(i), db)
    await settle()
    expect(await db.outbox_attempts.count()).toBe(250)

    // Call 1 (200 rows) succeeds. Call 2 (50 rows) commits server-side and then
    // loses the response, so the client still believes those 50 never landed.
    server.program([null, 'write-then-fail'])

    const engine = engineFor(server.port())
    const first = await engine.flushNow()

    expect(first.complete).toBe(false)
    expect(server.calls.map((c) => c.count)).toEqual([BATCH_SIZE, 50])
    expect(await db.outbox_attempts.where('flushed_at').equals(UNFLUSHED).count()).toBe(50)

    // Reconnect. The 50 go up a second time and the server must absorb them.
    const second = await engine.flushNow()
    expect(second.complete).toBe(true)

    // The retry re-sent the same 50 rows.
    expect(server.calls.map((c) => c.count)).toEqual([BATCH_SIZE, 50, 50])

    // The whole point: 250 rows on the server, not 300.
    expect(server.rows.size).toBe(250)

    const trialIndexes = [...server.rows.values()].map((row) => row['trial_index'] as number)
    expect(new Set(trialIndexes).size).toBe(250)

    // And locally, all 250 are marked flushed.
    expect(await db.outbox_attempts.where('flushed_at').equals(UNFLUSHED).count()).toBe(0)
    expect(await pendingCount(db)).toBe(0)
    expect(await db.outbox_attempts.count()).toBe(250)
  })

  it('never deletes an unflushed row when the server refuses outright', async () => {
    for (let i = 0; i < 10; i++) queueAttempt(attempt(i), db)
    await settle()

    server.program(['fail'])
    const engine = engineFor(server.port())
    const result = await engine.flushNow()

    expect(result.complete).toBe(false)
    expect(server.rows.size).toBe(0)
    expect(await db.outbox_attempts.count()).toBe(10)
    expect(await pendingCount(db)).toBe(10)
  })

  it('strips flushed_at before sending — the server has no such column', async () => {
    queueAttempt(attempt(0), db)
    await settle()

    await engineFor(server.port()).flushNow()

    const [sent] = [...server.rows.values()]
    expect(sent).toBeDefined()
    expect(sent).not.toHaveProperty('flushed_at')
    expect(sent).toHaveProperty('client_event_id')
  })

  it('records last_synced_at only on a complete flush', async () => {
    for (let i = 0; i < 5; i++) queueAttempt(attempt(i), db)
    await settle()

    server.program(['fail'])
    const engine = engineFor(server.port())

    await engine.flushNow()
    expect(await readMeta(META_KEYS.lastSyncedAt, db)).toBeNull()

    await engine.flushNow()
    expect(await readMeta(META_KEYS.lastSyncedAt, db)).toBe(1_700_000_000_000)
  })

  it('quarantines an unparseable row instead of blocking the queue behind it', async () => {
    // A row left by an older app version, missing required fields.
    await db.outbox_attempts.put({
      client_event_id: uuidv7(),
      flushed_at: UNFLUSHED,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    for (let i = 0; i < 3; i++) queueAttempt(attempt(i), db)
    await settle()

    const result = await engineFor(server.port()).flushNow()

    expect(result.complete).toBe(true)
    expect(result.quarantined).toBe(1)
    // The three good rows still got through.
    expect(server.rows.size).toBe(3)
    // The bad row is kept, not deleted, and is out of the pending count.
    expect(await db.outbox_attempts.where('flushed_at').equals(QUARANTINED).count()).toBe(1)
    expect(await db.outbox_attempts.count()).toBe(4)
    expect(await pendingCount(db)).toBe(0)
  })

  it('prunes flushed rows older than 7 days and keeps recent ones', async () => {
    const day = 24 * 60 * 60 * 1000
    const nowMs = 1_700_000_000_000

    await db.outbox_attempts.bulkPut([
      { ...attempt(1), client_event_id: uuidv7(), flushed_at: nowMs - 8 * day },
      { ...attempt(2), client_event_id: uuidv7(), flushed_at: nowMs - 2 * day },
      { ...attempt(3), client_event_id: uuidv7(), flushed_at: UNFLUSHED },
      { ...attempt(4), client_event_id: uuidv7(), flushed_at: QUARANTINED },
    ])

    await engineFor(server.port(), () => nowMs).prune()

    const remaining = await db.outbox_attempts.toArray()
    const marks = remaining.map((row) => row.flushed_at).sort((x, y) => x - y)

    // Gone: only the 8-day-old flushed row. Kept: the recent flushed row (the
    // dashboard reads it offline), the unflushed row, and the quarantined one.
    expect(remaining).toHaveLength(3)
    expect(marks).toEqual([QUARANTINED, UNFLUSHED, nowMs - 2 * day])
  })

  it('flushes sessions before attempts, because attempts reference them', async () => {
    const engine = engineFor(server.port())

    await db.outbox_sessions.put({
      id: SESSION_ID,
      patient_id: PATIENT_ID,
      started_at: new Date(1_700_000_000_000).toISOString(),
      ended_at: null,
      completed: false,
      abandoned_at_game: null,
      device_id: 'test-tablet',
      app_version: 'test',
      tz_offset_min: 330,
      pointer_sample_interval_ms: 8,
      flushed_at: UNFLUSHED,
    })
    queueAttempt(attempt(0), db)
    await settle()

    await engine.flushNow()

    expect(server.calls.map((c) => c.table)).toEqual(['sessions', 'attempts'])
  })

  it('collapses concurrent triggers into one flush', async () => {
    for (let i = 0; i < 10; i++) queueAttempt(attempt(i), db)
    await settle()

    const engine = engineFor(server.port())
    // An `online` event and the 60s poll landing in the same tick must not send
    // the same batch twice.
    const [a, b] = await Promise.all([engine.flushNow(), engine.flushNow()])

    expect(a).toBe(b)
    expect(server.calls).toHaveLength(1)
    expect(server.rows.size).toBe(10)
  })
})
