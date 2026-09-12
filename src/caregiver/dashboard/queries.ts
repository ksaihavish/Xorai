import { getSupabase } from '@/core/supabase/client'
import type { CapturedStroke } from '@/core/trace/capture'

/**
 * Dashboard reads. Every one is SELECT-only.
 *
 * `session_summaries`, `baselines` and `flags` have a select policy and nothing
 * else (0002). The client cannot write them and must not try — a client that
 * can write its own flags is a client that can write its own conclusion about a
 * person. The two things a caregiver CAN write are `flags.acknowledged_at`
 * (one granted column) and a `care_events` row, both below.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; messageKey: string }

function fail<T>(key = 'auth.errors.generic'): Result<T> {
  return { ok: false, messageKey: key }
}

export type DomainKey =
  | 'memory'
  | 'attention'
  | 'executive'
  | 'perceptual_motor'
  | 'language'
  | 'orientation'

export type DailyScore = {
  domain: DomainKey
  day: string
  accuracy: number
  sessions: number
}

export type Baseline = { domain: DomainKey; baseline_mean: number; baseline_sd: number }

export type FlagRow = {
  id: string
  domain: DomainKey
  level: 'amber' | 'red' | 'effort'
  z_value: number | null
  window_start: string
  window_end: string
  acknowledged_at: string | null
  suppressed_reason: string | null
}

export type CalendarDay = { day: string; played: boolean; sessions_played: number }

export type RetrievalRow = {
  family_member_id: string
  display_name: string
  current_interval_s: number
  longest_interval_s: number
}

export async function fetchDaily(patientId: string, days = 90): Promise<Result<DailyScore[]>> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await getSupabase()
      .from('v_daily_domain_score')
      .select('domain,day,accuracy,sessions')
      .eq('patient_id', patientId)
      .gte('day', since)
      .order('day', { ascending: true })
    if (error) return fail()
    return { ok: true, value: (data ?? []) as DailyScore[] }
  } catch {
    return fail('auth.errors.network')
  }
}

export async function fetchBaselines(patientId: string): Promise<Result<Baseline[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('baselines')
      .select('domain,baseline_mean,baseline_sd')
      .eq('patient_id', patientId)
    if (error) return fail()
    return { ok: true, value: (data ?? []) as Baseline[] }
  } catch {
    return fail('auth.errors.network')
  }
}

export async function fetchFlags(patientId: string): Promise<Result<FlagRow[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('flags')
      .select('id,domain,level,z_value,window_start,window_end,acknowledged_at,suppressed_reason')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) return fail()
    return { ok: true, value: (data ?? []) as FlagRow[] }
  } catch {
    return fail('auth.errors.network')
  }
}

export async function fetchCalendar(patientId: string, weeks = 12): Promise<Result<CalendarDay[]>> {
  try {
    const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString().slice(0, 10)
    const { data, error } = await getSupabase()
      .from('v_session_calendar')
      .select('day,played,sessions_played')
      .eq('patient_id', patientId)
      .gte('day', since)
      .order('day', { ascending: true })
    if (error) return fail()
    return { ok: true, value: (data ?? []) as CalendarDay[] }
  } catch {
    return fail('auth.errors.network')
  }
}

export async function fetchRetrieval(patientId: string): Promise<Result<RetrievalRow[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('v_retrieval_progress')
      .select('family_member_id,display_name,current_interval_s,longest_interval_s')
      .eq('patient_id', patientId)
    if (error) return fail()
    return { ok: true, value: (data ?? []) as RetrievalRow[] }
  } catch {
    return fail('auth.errors.network')
  }
}

export type ClockDrawing = {
  session_id: string
  started_at: string
  strokes: CapturedStroke[]
}

/**
 * Clock drawings, grouped by session and ordered oldest first.
 *
 * Strokes are the largest rows in the schema, so this is deliberately narrow:
 * one condition, and only the columns the replay needs.
 */
export async function fetchClockDrawings(patientId: string): Promise<Result<ClockDrawing[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('strokes')
      .select('session_id,stroke_index,points,stroke_start_ms,stroke_end_ms,air_time_before_ms,sessions(started_at)')
      .eq('patient_id', patientId)
      .order('stroke_index', { ascending: true })
    if (error) return fail()

    const bySession = new Map<string, ClockDrawing>()
    for (const row of data ?? []) {
      const r = row as unknown as {
        session_id: string
        points: CapturedStroke['points']
        stroke_start_ms: number
        stroke_end_ms: number
        air_time_before_ms: number
        sessions: { started_at: string } | null
      }
      const entry =
        bySession.get(r.session_id) ??
        { session_id: r.session_id, started_at: r.sessions?.started_at ?? '', strokes: [] }
      entry.strokes.push({
        points: r.points ?? [],
        stroke_start_ms: r.stroke_start_ms,
        stroke_end_ms: r.stroke_end_ms,
        air_time_before_ms: r.air_time_before_ms,
      })
      bySession.set(r.session_id, entry)
    }

    return {
      ok: true,
      value: [...bySession.values()].sort((a, b) => a.started_at.localeCompare(b.started_at)),
    }
  } catch {
    return fail('auth.errors.network')
  }
}

/** The one column of `flags` a caregiver is granted (0002). */
export async function acknowledgeFlag(flagId: string): Promise<Result<null>> {
  try {
    const { error } = await getSupabase()
      .from('flags')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', flagId)
    return error ? fail() : { ok: true, value: null }
  } catch {
    return fail('auth.errors.network')
  }
}

/**
 * Logging a care event is how a caregiver tells the analysis to stop reading
 * anything into a period. It suppresses flags rather than explaining them away.
 */
export async function logCareEvent(
  patientId: string,
  type: 'illness' | 'medication_change' | 'hospital' | 'travel' | 'other',
  startedOn: string,
  note: string | null,
): Promise<Result<null>> {
  try {
    const { error } = await getSupabase()
      .from('care_events')
      .insert({ patient_id: patientId, type, started_on: startedOn, note })
    return error ? fail() : { ok: true, value: null }
  } catch {
    return fail('auth.errors.network')
  }
}

/** Kicks the rollup so the dashboard reflects last night's sessions. */
export async function runRollup(patientId: string): Promise<void> {
  try {
    await getSupabase().functions.invoke('nightly-rollup', { body: { patient_id: patientId } })
  } catch {
    // Idempotent and also on cron, so a failure here costs freshness, not data.
  }
}

export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}
