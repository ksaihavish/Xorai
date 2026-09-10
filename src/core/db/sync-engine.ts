import type { ZodType } from 'zod'
import { META_KEYS, QUARANTINED, UNFLUSHED, db, writeMeta, type XoraiDb } from '@/core/db/dexie'
import {
  outboxAttemptSchema,
  outboxRhythmSchema,
  outboxSessionSchema,
  outboxStrokeSchema,
} from '@/core/db/schemas'

export const BATCH_SIZE = 200
const BACKOFF_START_MS = 1_000
const BACKOFF_CAP_MS = 5 * 60 * 1_000
const POLL_INTERVAL_MS = 60_000
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1_000

/**
 * The only thing the engine needs from Supabase, narrowed to one method so the
 * test can supply a stub without mocking a client. src/core/supabase/client.ts
 * is still the only real client in the app.
 */
export type UpsertPort = {
  upsert: (
    table: string,
    rows: readonly Record<string, unknown>[],
    onConflict: string,
  ) => Promise<{ error: unknown | null }>
}

/**
 * The client is imported lazily, on the first real flush.
 *
 * src/core/supabase/client.ts throws at module load when VITE_SUPABASE_URL is
 * missing, so a static import here would make merely importing the sync engine
 * require Supabase configuration — which breaks tests/sync.test.ts, and would
 * break any offline-only entry point for the same reason. Deferring it also
 * matches what the engine actually needs: nothing from the network until it
 * genuinely has rows to send.
 */
export const supabaseUpsertPort: UpsertPort = {
  async upsert(table, rows, onConflict) {
    const { getSupabase } = await import('@/core/supabase/client')
    // ignoreDuplicates is the ENTIRE idempotency story for telemetry
    // (rules.md 2). Do not add a second mechanism beside it.
    const { error } = await getSupabase()
      .from(table)
      .upsert(rows as Record<string, unknown>[], { onConflict, ignoreDuplicates: true })
    return { error }
  },
}

/**
 * Flush order is strictly sessions → attempts → strokes → rhythm.
 *
 * It is a foreign-key order, not a preference. attempts.session_id references
 * sessions(id), so an attempt that reaches the server before its session is
 * rejected — and rejected rows keep flushed_at at 0 and come back forever.
 *
 * architecture.md 5.2 continues this list with reminder_logs, care_events,
 * informant_checks, difficulty_state and retrieval_state. Those tables have no
 * outbox yet; the last two are read-modify-write state with a different conflict
 * rule (last-write-wins on a server updated_at) and belong to Phases 8 and 10.
 * Reusing ignoreDuplicates for them silently loses the newer value.
 */
type Channel = {
  store: 'outbox_sessions' | 'outbox_attempts' | 'outbox_strokes' | 'outbox_rhythm'
  table: string
  onConflict: string
  schema: ZodType
}

const CHANNELS: Channel[] = [
  { store: 'outbox_sessions', table: 'sessions', onConflict: 'id', schema: outboxSessionSchema },
  {
    store: 'outbox_attempts',
    table: 'attempts',
    onConflict: 'client_event_id',
    schema: outboxAttemptSchema,
  },
  {
    store: 'outbox_strokes',
    table: 'strokes',
    onConflict: 'client_event_id',
    schema: outboxStrokeSchema,
  },
  {
    store: 'outbox_rhythm',
    table: 'rhythm_trials',
    onConflict: 'client_event_id',
    schema: outboxRhythmSchema,
  },
]

export type SyncResult = {
  flushed: number
  quarantined: number
  /** True when every channel drained without an error. */
  complete: boolean
}

function logSilent(context: string, error: unknown): void {
  // rules.md 4: fail loudly in development, silently in production. An empty
  // catch is banned; this is the pattern that replaces it.
  if (import.meta.env.DEV) {
    console.warn(`[sync] ${context}`, error)
  }
}

export type SyncEngineOptions = {
  database?: XoraiDb
  port?: UpsertPort
  now?: () => number
  /** Injected so the test does not spend real seconds in backoff. */
  setTimeoutFn?: (fn: () => void, ms: number) => number
  clearTimeoutFn?: (handle: number) => void
}

export function createSyncEngine(options: SyncEngineOptions = {}) {
  const database = options.database ?? db
  const port = options.port ?? supabaseUpsertPort
  const now = options.now ?? (() => Date.now())
  const schedule = options.setTimeoutFn ?? ((fn, ms) => window.setTimeout(fn, ms))
  const unschedule = options.clearTimeoutFn ?? ((handle) => window.clearTimeout(handle))

  let backoffMs = BACKOFF_START_MS
  let retryHandle: number | null = null
  let pollHandle: number | null = null
  let running = false
  let inFlight: Promise<SyncResult> | null = null

  /**
   * One channel, one batch. Returns false the moment the server refuses, so the
   * caller stops rather than marching on to a channel whose foreign keys have
   * not landed yet.
   */
  async function flushChannel(channel: Channel): Promise<{ ok: boolean; flushed: number; quarantined: number }> {
    let flushed = 0
    let quarantined = 0

    for (;;) {
      const batch = await database
        .table(channel.store)
        .where('flushed_at')
        .equals(UNFLUSHED)
        .limit(BATCH_SIZE)
        .toArray()

      if (batch.length === 0) return { ok: true, flushed, quarantined }

      const valid: Record<string, unknown>[] = []
      // Every outbox primary key is a uuid string: `id` or `client_event_id`.
      const validKeys: string[] = []
      const badKeys: string[] = []
      const primaryKey = database.table(channel.store).schema.primKey.keyPath as string

      for (const row of batch) {
        const parsed = channel.schema.safeParse(row)
        const key = String((row as Record<string, unknown>)[primaryKey])
        if (parsed.success) {
          // flushed_at is local bookkeeping. The server has no such column, and
          // sending it makes PostgREST reject the whole batch.
          const payload = { ...(parsed.data as Record<string, unknown>) }
          delete payload['flushed_at']
          valid.push(payload)
          validKeys.push(key)
        } else {
          badKeys.push(key)
          logSilent(`unparseable row in ${channel.store}`, parsed.error)
        }
      }

      /**
       * Quarantined, never deleted (rules.md 2: never delete an unflushed outbox
       * row). Moving them out of the UNFLUSHED index matters — a stale row that
       * can never parse would otherwise reappear at the head of every batch and
       * block the queue behind it forever. -1 is excluded from pruning too, so
       * the row stays on the device and can still be inspected.
       */
      if (badKeys.length > 0) {
        await database.table(channel.store).where(primaryKey).anyOf(badKeys).modify({
          flushed_at: QUARANTINED,
        })
        quarantined += badKeys.length
      }

      if (valid.length === 0) continue

      const { error } = await port.upsert(channel.table, valid, channel.onConflict)

      if (error) {
        // flushed_at stays at 0. The rows come back on the next attempt, and
        // ignoreDuplicates makes the resend a no-op for whatever already landed.
        logSilent(`upsert failed for ${channel.table}`, error)
        return { ok: false, flushed, quarantined }
      }

      await database.table(channel.store).where(primaryKey).anyOf(validKeys).modify({
        flushed_at: now(),
      })
      flushed += valid.length

      if (batch.length < BATCH_SIZE) return { ok: true, flushed, quarantined }
    }
  }

  /** Only rows the server has confirmed, and only once they are a week old. */
  async function prune(): Promise<void> {
    const cutoff = now() - PRUNE_AFTER_MS
    for (const channel of CHANNELS) {
      try {
        // between(1, cutoff): 0 is unflushed and -1 is quarantined, so neither
        // can be caught by this. Recent rows stay so the caregiver dashboard
        // still renders offline.
        await database.table(channel.store).where('flushed_at').between(1, cutoff).delete()
      } catch (error) {
        logSilent(`prune failed for ${channel.store}`, error)
      }
    }
  }

  async function runFlush(): Promise<SyncResult> {
    let flushed = 0
    let quarantined = 0
    let complete = true

    for (const channel of CHANNELS) {
      const result = await flushChannel(channel)
      flushed += result.flushed
      quarantined += result.quarantined
      if (!result.ok) {
        complete = false
        break
      }
    }

    if (complete) {
      await writeMeta(META_KEYS.lastSyncedAt, now(), database)
      await prune()
    }

    return { flushed, quarantined, complete }
  }

  /**
   * Never throws. rules.md 4: the sync engine retries with backoff and never
   * throws into the UI; it surfaces only as the "last synced" indicator.
   */
  async function flushNow(): Promise<SyncResult> {
    // Concurrent triggers are the norm here — an `online` event and the 60s
    // poll can land in the same tick. Without this, two passes read the same
    // unflushed batch and send it twice.
    if (inFlight) return inFlight

    const attempt = (async (): Promise<SyncResult> => {
      try {
        const result = await runFlush()
        if (result.complete) {
          backoffMs = BACKOFF_START_MS
          cancelRetry()
        } else {
          scheduleRetry()
        }
        return result
      } catch (error) {
        logSilent('flush threw', error)
        scheduleRetry()
        return { flushed: 0, quarantined: 0, complete: false }
      } finally {
        inFlight = null
      }
    })()

    inFlight = attempt
    return attempt
  }

  function cancelRetry(): void {
    if (retryHandle !== null) {
      unschedule(retryHandle)
      retryHandle = null
    }
  }

  function scheduleRetry(): void {
    cancelRetry()
    const delay = backoffMs
    // 1s, 2s, 4s … capped at 5 minutes. Reset only by a complete flush.
    backoffMs = Math.min(backoffMs * 2, BACKOFF_CAP_MS)
    retryHandle = schedule(() => {
      retryHandle = null
      void flushNow()
    }, delay)
  }

  const onOnline = () => void flushNow()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void flushNow()
  }

  function start(): void {
    if (running) return
    running = true

    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibility)

    pollHandle = schedule(function tick() {
      // Re-armed each time rather than setInterval, so a slow flush cannot
      // stack up behind itself.
      if (navigator.onLine) void flushNow()
      pollHandle = schedule(tick, POLL_INTERVAL_MS)
    }, POLL_INTERVAL_MS)

    if (navigator.onLine) void flushNow()
  }

  function stop(): void {
    running = false
    window.removeEventListener('online', onOnline)
    document.removeEventListener('visibilitychange', onVisibility)
    cancelRetry()
    if (pollHandle !== null) {
      unschedule(pollHandle)
      pollHandle = null
    }
  }

  return {
    start,
    stop,
    /** Call at session end. Safe to call at any time; never throws. */
    flushNow,
    /** Exposed for tests and for the caregiver's "sync now" affordance. */
    prune,
  }
}

export const syncEngine = createSyncEngine()
