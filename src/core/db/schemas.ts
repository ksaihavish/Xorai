import { z } from 'zod'

/**
 * Zod mirrors of src/core/telemetry/types.ts, used on every read OUT of Dexie.
 *
 * rules.md 4: Dexie data can be stale from a previous schema version. A row
 * written by an app version that has since been deployed over is still sitting
 * on the device, and it will be read during the next flush. Parsing it is the
 * difference between dropping one bad row and throwing inside the sync engine
 * mid-demo.
 *
 * These duplicate the TypeScript types on purpose: the types describe what this
 * build writes, these describe what a previous build might have left behind.
 * When a field changes in types.ts it changes here too — and the sync engine's
 * behaviour for a row that no longer parses is to quarantine it, never to
 * delete it (rules.md 2: never delete an unflushed outbox row).
 */

export const gameType = z.enum([
  'aponjon',
  'dhol_bator',
  'xorai_milan',
  'ghorir_chobi',
  'orientation',
])

export const domain = z.enum([
  'memory',
  'attention',
  'executive',
  'perceptual_motor',
  'language',
  'orientation',
])

export const severity = z.enum(['mild', 'moderate', 'severe'])

export const errorType = z.enum([
  'none',
  'omission',
  'intrusion',
  'perseveration',
  'semantic_near',
  'random',
])

/** See dexie.ts: 0 means unflushed, and it is never null. */
const flushedAt = z.number()

export const sessionRecordSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  completed: z.boolean(),
  abandoned_at_game: gameType.nullable(),
  device_id: z.string(),
  app_version: z.string(),
  tz_offset_min: z.number(),
  pointer_sample_interval_ms: z.number().nullable(),
})

export const attemptEventSchema = z.object({
  client_event_id: z.string(),
  session_id: z.string(),
  patient_id: z.string(),
  game_type: gameType,
  domain,
  trial_index: z.number(),
  difficulty_level: z.number(),
  stimulus_id: z.string().nullable(),
  presented_at_ms: z.number(),
  first_touch_at_ms: z.number().nullable(),
  responded_at_ms: z.number().nullable(),
  correct: z.boolean().nullable(),
  error_type: errorType.nullable(),
  hints_used: z.number(),
  retrieval_interval_s: z.number().nullable(),
  hint_latency_ms: z.number().nullable(),
  touch_x: z.number().nullable(),
  touch_y: z.number().nullable(),
  target_radius_px: z.number().nullable(),
})

export const strokePointSchema = z.object({
  x: z.number(),
  y: z.number(),
  t: z.number(),
})

export const strokeEventSchema = z.object({
  client_event_id: z.string(),
  session_id: z.string(),
  patient_id: z.string(),
  stroke_index: z.number(),
  condition: z.enum(['command', 'copy', 'trace']),
  points: z.array(strokePointSchema),
  stroke_start_ms: z.number(),
  stroke_end_ms: z.number(),
  air_time_before_ms: z.number(),
})

export const rhythmTrialEventSchema = z.object({
  client_event_id: z.string(),
  session_id: z.string(),
  patient_id: z.string(),
  trial_index: z.number(),
  span: z.number(),
  model_iois: z.array(z.number()),
  response_iois: z.array(z.number()),
  asynchronies: z.array(z.number()),
  completed: z.boolean(),
})

// The outbox rows are the events plus the local flush marker. The marker is
// stripped before the row goes to Supabase — the server has no such column.
export const outboxSessionSchema = sessionRecordSchema.extend({ flushed_at: flushedAt })
export const outboxAttemptSchema = attemptEventSchema.extend({ flushed_at: flushedAt })
export const outboxStrokeSchema = strokeEventSchema.extend({ flushed_at: flushedAt })
export const outboxRhythmSchema = rhythmTrialEventSchema.extend({ flushed_at: flushedAt })

export const syncMetaSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.null()]),
})
