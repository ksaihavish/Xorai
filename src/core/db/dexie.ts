import Dexie, { type EntityTable } from 'dexie'
import type {
  AttemptEvent,
  GameType,
  RhythmTrialEvent,
  SessionRecord,
  StrokeEvent,
} from '@/core/telemetry/types'

/**
 * The offline store. architecture.md 5.1.
 *
 * Everything the patient path writes lands here first, synchronously with the
 * interaction, and the network never appears in that path (rules.md 2). An event
 * that only exists after a successful POST is an event that will be lost.
 *
 * ─── The one thing to know before editing this file ───
 *
 * `flushed_at` is a NUMBER and 0 means "not yet flushed". It is not nullable,
 * and it must not become nullable.
 *
 * IndexedDB accepts only number, string, Date, ArrayBuffer and Array as keys.
 * `null` is not a valid key, so a row stored with `flushed_at: null` is silently
 * omitted from the `flushed_at` index — `where('flushed_at').equals(null)` does
 * not throw, it simply never returns that row. The outbox would look permanently
 * empty while filling up, and nothing anywhere would report an error.
 *
 * Hence the sentinel. `where('flushed_at').equals(UNFLUSHED)` is an index hit,
 * and pruning is `.between(1, cutoff)`.
 */

/** Not yet accepted by the server. */
export const UNFLUSHED = 0

/**
 * Written by an older app version and no longer parseable.
 *
 * Kept, never deleted — rules.md 2 says an unflushed outbox row is never
 * discarded. Moving it out of the UNFLUSHED index is what stops it reappearing
 * at the head of every batch and blocking the queue behind it forever. Pruning
 * uses between(1, cutoff), so neither 0 nor -1 can be caught by it.
 */
export const QUARANTINED = -1

type Outbox<T> = T & { flushed_at: number }

export type OutboxSession = Outbox<SessionRecord>
export type OutboxAttempt = Outbox<AttemptEvent>
export type OutboxStroke = Outbox<StrokeEvent>
export type OutboxRhythm = Outbox<RhythmTrialEvent>

/**
 * The patient, their family, their reminders and their music, cached whole. The
 * patient path reads this and never queries Supabase.
 */
export type LocalProfile = {
  patient_id: string
  /** Opaque here on purpose: the shape belongs to the caregiver-mode schemas. */
  payload: unknown
  cached_at: number
}

export type AssetManifestEntry = {
  id: string
  path: string
  bytes: number
  cached_at: number
}

/** last_synced_at, device_id. Small, single-row-per-key settings. */
export type SyncMeta = {
  key: string
  value: string | number | null
}

/**
 * STATE, not telemetry, and the distinction is load-bearing.
 *
 * These three are read-modify-write with last-write-wins on a SERVER updated_at,
 * and a local row never overwrites a newer server row. Applying the telemetry
 * `ignoreDuplicates` rule to them silently loses the newer value (rules.md 2).
 *
 * They are declared in version 1 rather than added later because buildbook
 * amendment 3 is explicit: without them adaptive difficulty and spaced retrieval
 * do not survive a reload, and the dashboard cannot render offline. Their sync
 * belongs to Phases 8 and 10; the stores exist now so those phases are not a
 * schema migration.
 */
export type LocalDifficultyState = {
  patient_id: string
  game_type: GameType
  level: number
  window: unknown
  updated_at: number
}

export type LocalRetrievalState = {
  patient_id: string
  family_member_id: string
  current_interval_s: number
  longest_interval_s: number
  consecutive_success: number
  last_tested_at: number | null
  updated_at: number
}

export type CachedSummary = {
  session_id: string
  patient_id: string
  payload: unknown
}

export class XoraiDb extends Dexie {
  outbox_sessions!: EntityTable<OutboxSession, 'id'>
  outbox_attempts!: EntityTable<OutboxAttempt, 'client_event_id'>
  outbox_strokes!: EntityTable<OutboxStroke, 'client_event_id'>
  outbox_rhythm!: EntityTable<OutboxRhythm, 'client_event_id'>
  local_profile!: EntityTable<LocalProfile, 'patient_id'>
  asset_manifest!: EntityTable<AssetManifestEntry, 'id'>
  sync_meta!: EntityTable<SyncMeta, 'key'>
  difficulty_state!: EntityTable<LocalDifficultyState, 'patient_id'>
  retrieval_state!: EntityTable<LocalRetrievalState, 'patient_id'>
  cached_summaries!: EntityTable<CachedSummary, 'session_id'>

  constructor(name = 'xorai') {
    super(name)

    this.version(1).stores({
      outbox_sessions: 'id, flushed_at',
      outbox_attempts: 'client_event_id, session_id, flushed_at',
      outbox_strokes: 'client_event_id, session_id, flushed_at',
      outbox_rhythm: 'client_event_id, session_id, flushed_at',
      local_profile: 'patient_id',
      asset_manifest: 'id',
      sync_meta: 'key',

      // --- STATE, not telemetry. Different conflict rule. See 5.2. ---
      difficulty_state: '[patient_id+game_type], updated_at',
      retrieval_state: '[patient_id+family_member_id], updated_at',
      cached_summaries: 'session_id, patient_id',
    })

    // Upgrade path, for whoever adds version 2.
    //
    // Rules for this file specifically:
    //  - Never renumber or edit version(1). A device in the field is already on
    //    it, and Dexie replays versions in order.
    //  - An .upgrade() callback runs inside the version transaction. It may only
    //    touch tables, never the network, and it must be idempotent.
    //  - A store added without a version bump simply does not exist at runtime,
    //    and reads against it fail as "table not found" at the first write —
    //    which on the patient path means a lost event, not an error message.
    //
    // this.version(2).stores({ ...unchanged stores..., new_store: 'id' })
    //   .upgrade(async (tx) => { await tx.table('outbox_attempts').toCollection().modify(...) })
  }
}

export const db = new XoraiDb()

/** sync_meta keys, in one place so a typo cannot invent a second setting. */
export const META_KEYS = {
  lastSyncedAt: 'last_synced_at',
  deviceId: 'device_id',
} as const

export async function readMeta(key: string, database: XoraiDb = db): Promise<SyncMeta['value']> {
  const row = await database.sync_meta.get(key)
  return row?.value ?? null
}

export async function writeMeta(
  key: string,
  value: SyncMeta['value'],
  database: XoraiDb = db,
): Promise<void> {
  await database.sync_meta.put({ key, value })
}
