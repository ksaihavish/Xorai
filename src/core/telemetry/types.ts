/**
 * Telemetry contract. Field names here mirror the Postgres columns in
 * docs/architecture.md 4 and the game interfaces in 7 exactly. A rename here is
 * a schema migration, not a refactor.
 *
 * Every `*_ms` value is a monotonic offset from a single `performance.now()`
 * captured at session start. `Date.now()` appears in exactly one place in the
 * product, `SessionRecord.started_at`. See docs/architecture.md 6.
 *
 * Types only. Phase 4 owns the implementation in emit.ts and clock.ts.
 */

// --- string unions, matching the CHECK constraints in architecture.md 4 ---

export type GameType =
  | 'aponjon'
  | 'dhol_bator'
  | 'xorai_milan'
  | 'ghorir_chobi'
  | 'orientation'

export type Domain =
  | 'memory'
  | 'attention'
  | 'executive'
  | 'perceptual_motor'
  | 'language'
  | 'orientation'

export type Severity = 'mild' | 'moderate' | 'severe'

export type ErrorType =
  | 'none'
  | 'omission'
  | 'intrusion'
  | 'perseveration'
  | 'semantic_near'
  | 'random'

// --- rows the client writes ---

/** One row of `attempts`. `id` and `created_at` carry database defaults. */
export interface AttemptEvent {
  client_event_id: string
  session_id: string
  patient_id: string
  game_type: GameType
  /**
   * Singular by decision: a game declares several domains, an attempt row
   * carries its ONE primary telemetry domain, because `baselines` is keyed
   * (patient, domain) and a secondary domain would never get a baseline.
   */
  domain: Domain
  trial_index: number
  difficulty_level: number
  stimulus_id: string | null
  presented_at_ms: number
  first_touch_at_ms: number | null
  responded_at_ms: number | null
  correct: boolean | null
  error_type: ErrorType | null
  hints_used: number
  /** aponjon only: the interval this face was tested at, in seconds. */
  retrieval_interval_s: number | null
  hint_latency_ms: number | null
  /** Relative to target centre, px. */
  touch_x: number | null
  touch_y: number | null
  target_radius_px: number | null
}

/** One row of `strokes`. ghorir_chobi only. */
export interface StrokeEvent {
  client_event_id: string
  session_id: string
  patient_id: string
  stroke_index: number
  condition: 'command' | 'copy' | 'trace'
  /** `t` is ms from session start, on the same timeline as every `*_ms` field. */
  points: Array<{ x: number; y: number; t: number }>
  stroke_start_ms: number
  stroke_end_ms: number
  air_time_before_ms: number
}

/** One row of `rhythm_trials`. dhol_bator only. All values are ms. */
export interface RhythmTrialEvent {
  client_event_id: string
  session_id: string
  patient_id: string
  trial_index: number
  span: number
  /** Inter-onset intervals presented. */
  model_iois: number[]
  /** Inter-tap intervals produced. */
  response_iois: number[]
  /** Signed error per tap. Captured on the audio clock, never the DOM clock. */
  asynchronies: number[]
  completed: boolean
}

/** One row of `sessions`. `id` is generated client-side as a uuid v7. */
export interface SessionRecord {
  id: string
  patient_id: string
  /** ISO wall clock. The only permitted `Date.now()` in the product. */
  started_at: string
  ended_at: string | null
  completed: boolean
  abandoned_at_game: GameType | null
  device_id: string
  app_version: string
  tz_offset_min: number
  /** Measured once at session start; normalises analysis across tablets. */
  pointer_sample_interval_ms: number | null
}

// --- in-memory contracts, not rows ---

/**
 * What a game hands back to the session runner when it finishes.
 *
 * Metric names match the `session_summaries` columns they roll up into, but the
 * values are scoped to ONE `game_type`: buildbook amendment 7 requires `cv_rt`
 * to be computed per game and aggregated afterwards, because pooling reaction
 * times across games measures which games were played, not the person.
 */
export interface GameSummary {
  game_type: GameType
  domain: Domain
  difficulty_level: number
  trials_presented: number
  trials_completed: number
  mean_rt_ms: number | null
  sd_rt_ms: number | null
  cv_rt: number | null
  accuracy_raw: number | null
  accuracy_hint_adjusted: number | null
  hint_rate: number | null
}

/**
 * The patient profile as cached in Dexie `local_profile`. Columns mirror
 * `patients` in architecture.md 4. Phase 3 owns the canonical version in
 * `src/core/db`; this is the read-only view a game is given.
 */
export interface LocalPatient {
  id: string
  display_name: string
  birth_year: number | null
  education_level: 'none' | 'primary' | 'middle' | 'secondary' | 'higher' | null
  severity: Severity | null
  /** BCP-47-ish tag: as, brx, mni, ne, hi, en, kha, lus. */
  language: string
  photo_path: string | null
  /** District or town. Orientation skips "where are you" without it. */
  home_place: string | null
  baseline_status: 'collecting' | 'established'
}

/**
 * The single timeline for a session. Games never read a clock directly.
 *
 * `fromAudio` exists so that no game converts between the audio clock and the
 * performance clock itself. Dhol Bator needs both: asynchronies live on the
 * audio clock, its `attempts` offsets on the performance clock. Getting that
 * arithmetic wrong makes both look plausible and both be wrong.
 */
export interface SessionClock {
  /** Monotonic ms offset from session start. */
  now(): number
  /** Converts an `AudioContext.currentTime` value onto the `now()` timeline. */
  fromAudio(audioTime: number): number
  readonly perfOrigin: number
  readonly audioOrigin: number
  readonly pointerSampleIntervalMs: number
}

/**
 * What a game hands to `emit`.
 *
 * architecture.md 7 writes the context method as `(e: AttemptEvent) => void`,
 * but a game holds none of the three identifiers that type requires: the
 * session id belongs to the session runner, the patient id to the profile, and
 * `client_event_id` is minted by the outbox writer at the moment of the write.
 * Asking a game for them would mean either widening GameContext until a game can
 * reach the session, or letting each game invent its own idempotency key — and
 * the second one silently breaks offline replay.
 *
 * GameHost fills all three in. This type is the honest signature of what is
 * actually passed.
 */
export type EmittedAttempt = Omit<
  AttemptEvent,
  'client_event_id' | 'session_id' | 'patient_id'
>

/**
 * The only surface a game may touch. A game that reaches directly into Dexie or
 * Supabase is wrong (rules.md 2 Boundaries).
 */
export interface GameContext {
  patient: LocalPatient
  /** From `difficulty_state`. */
  level: number
  /** Writes to Dexie synchronously. The network is never in this path. */
  emit: (e: EmittedAttempt) => void
  /** Plays pre-generated audio for an i18n key. Never a runtime TTS call. */
  speak: (key: string) => Promise<void>
  onComplete: (summary: GameSummary) => void
  clock: SessionClock
}
