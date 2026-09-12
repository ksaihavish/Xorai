// nightly-rollup — the analysis pipeline. architecture.md 8.
//
// Deno, service role. Runs on cron and on demand when the caregiver opens the
// dashboard, which is why every step below is IDEMPOTENT: re-running it on the
// same night must change nothing. The unique key on `flags`
// (patient_id, domain, window_start, window_end) is what makes that true for
// the only table where a duplicate would be visible to a human — without it,
// three dashboard refreshes make three identical flags.
//
// ─── The boundary this file must never cross ───
//
// prd.md 2: we do not diagnose, we do not stage, we do not screen. Nothing here
// compares a patient to a population, because there is no population to compare
// to — there are no published norms for these games in these languages, and
// Indian digital-clock data shows strong education and age effects. Every
// comparison is within-person BY DESIGN, not by limitation. That is a better
// answer than a norm table would have been, and it is worth saying out loud.
//
// The client can never write any table this function writes (0002 gives them a
// SELECT policy and nothing else). A client that can write its own flags is a
// client that can write its own conclusion about a person.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
// The arithmetic lives in analysis.ts so it can be tested outside Deno. Keeping
// a second copy here is how the tested version and the shipped version drift.
import {
  BASELINE_COUNT,
  BASELINE_SKIP,
  SUSTAIN_DAYS,
  WINDOW_DAYS,
  computeBaseline,
  computeSummary,
  evaluateDomain,
  isLowEffort,
  median,
  type Attempt,
  type DailyPoint,
} from './analysis.ts'


Deno.serve(async (req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    // Service role: bypasses RLS, which is the entire reason this work happens
    // server-side. This key never appears in a VITE_ variable.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  try {
    const body = (await req.json().catch(() => ({}))) as { patient_id?: string }
    const patientIds = body.patient_id
      ? [body.patient_id]
      : await allPatientIds(supabase)

    const report: Record<string, unknown>[] = []
    for (const patientId of patientIds) {
      report.push(await runForPatient(supabase, patientId))
    }

    return json({ ok: true, patients: report.length, report })
  } catch (error) {
    // Structured, and logged with patient_id only — never names, photos or free
    // text (rules.md 4).
    console.error('[nightly-rollup]', error instanceof Error ? error.message : String(error))
    return json({ ok: false, error: 'rollup_failed' }, 500)
  }
})

async function allPatientIds(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from('patients').select('id')
  return (data ?? []).map((row: { id: string }) => row.id)
}

async function runForPatient(supabase: SupabaseClient, patientId: string) {
  const summaries = await summariseSessions(supabase, patientId)
  const baseline = await establishBaselines(supabase, patientId)
  const flags = baseline.established ? await evaluateFlags(supabase, patientId) : []
  return { patient_id: patientId, summaries, baseline, flags }
}

// ─── 1. session_summaries ─────────────────────────────────────

async function summariseSessions(supabase: SupabaseClient, patientId: string) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('patient_id', patientId)
    .not('ended_at', 'is', null)

  const { data: existing } = await supabase
    .from('session_summaries')
    .select('session_id')
    .eq('patient_id', patientId)

  const done = new Set((existing ?? []).map((r: { session_id: string }) => r.session_id))
  const todo = (sessions ?? [])
    .map((s: { id: string }) => s.id)
    .filter((id: string) => !done.has(id))

  for (const sessionId of todo) {
    const { data: attempts } = await supabase
      .from('attempts')
      .select('session_id,patient_id,game_type,domain,correct,hints_used,presented_at_ms,responded_at_ms,first_touch_at_ms')
      .eq('session_id', sessionId)

    const rows = (attempts ?? []) as Attempt[]
    if (rows.length === 0) continue

    await supabase.from('session_summaries').upsert(
      { session_id: sessionId, patient_id: patientId, ...computeSummary(rows) },
      { onConflict: 'session_id' },
    )
  }

  return { summarised: todo.length }
}


// ─── 2. baselines ─────────────────────────────────────────────

async function establishBaselines(supabase: SupabaseClient, patientId: string) {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id,started_at')
    .eq('patient_id', patientId)
    .eq('completed', true)
    .order('started_at', { ascending: true })

  const completed = sessions ?? []

  /**
   * The baseline window is sessions 4-13, NOT 1-10.
   *
   * The first three are excluded because the patient is learning the interface,
   * not being measured. Including them bakes the practice effect into the
   * reference, which makes every later session look like a decline from a
   * baseline that was never real.
   */
  if (completed.length < BASELINE_SKIP + BASELINE_COUNT) {
    return { established: false, completed_sessions: completed.length }
  }

  const windowIds = completed
    .slice(BASELINE_SKIP, BASELINE_SKIP + BASELINE_COUNT)
    .map((s: { id: string }) => s.id)

  const { data: summaries } = await supabase
    .from('session_summaries')
    .select('session_id,domain_scores')
    .in('session_id', windowIds)

  const perDomain = new Map<string, number[]>()
  for (const row of summaries ?? []) {
    const scores = (row as { domain_scores: Record<string, number> | null }).domain_scores ?? {}
    for (const [domain, value] of Object.entries(scores)) {
      if (typeof value !== 'number') continue
      const list = perDomain.get(domain) ?? []
      list.push(value)
      perDomain.set(domain, list)
    }
  }

  for (const [domain, values] of perDomain) {
    // Sessions 4-13, EWMA-smoothed to match the transform z is computed from.
    const result = computeBaseline(values)
    if (!result.established) continue

    await supabase.from('baselines').upsert(
      {
        patient_id: patientId,
        domain,
        baseline_mean: result.mean,
        baseline_sd: result.sd,
        n_sessions: values.length,
        established_at: new Date().toISOString(),
      },
      { onConflict: 'patient_id,domain' },
    )
  }

  await supabase
    .from('patients')
    .update({ baseline_status: 'established' })
    .eq('id', patientId)

  return { established: true, completed_sessions: completed.length, domains: perDomain.size }
}

// ─── 3 + 4. flags and suppression ─────────────────────────────

async function evaluateFlags(supabase: SupabaseClient, patientId: string) {
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 86_400_000)
  const sustainStart = new Date(windowEnd.getTime() - SUSTAIN_DAYS * 86_400_000)

  const { data: baselines } = await supabase
    .from('baselines')
    .select('domain,baseline_mean,baseline_sd')
    .eq('patient_id', patientId)

  const { data: daily } = await supabase
    .from('v_daily_domain_score')
    .select('domain,day,accuracy,sessions')
    .eq('patient_id', patientId)
    // The FULL history: the EWMA needs it, and evaluateDomain slices the
    // sustain window off its own output. See analysis.ts.
    .gte('day', new Date(windowEnd.getTime() - 180 * 86_400_000).toISOString().slice(0, 10))
    .order('day', { ascending: true })

  const careEvents = await overlappingCareEvents(supabase, patientId, sustainStart, windowEnd)
  const lowEffort = await lowEffortSignature(supabase, patientId, windowStart, windowEnd)

  const written: Record<string, unknown>[] = []

  for (const base of baselines ?? []) {
    const b = base as { domain: string; baseline_mean: number; baseline_sd: number }
    const series = (daily ?? []).filter(
      (r) => (r as { domain: string }).domain === b.domain,
    ) as { day: string; accuracy: number; sessions: number }[]

    if (series.length === 0) continue

    // All the arithmetic — EWMA, z, the sustain rule and the suppression
    // ordering — lives in analysis.ts and is covered by tests/analysis.test.ts.
    const verdict = evaluateDomain(series as DailyPoint[], b, {
      sessionsInWindow,
      hasCareEvent: careEvents.length > 0,
      lowEffort,
    })
    if (verdict.level === null) continue

    const level = verdict.level
    const latestZ = verdict.z
    const suppressed = verdict.suppressed

    await supabase.from('flags').upsert(
      {
        patient_id: patientId,
        domain: b.domain,
        // A suppressed low-effort case becomes an 'effort' flag, which routes
        // the caregiver to the unscored mood check-in instead of telling them
        // anything about memory.
        level,
        z_value: latestZ,
        window_start: windowStart.toISOString().slice(0, 10),
        window_end: windowEnd.toISOString().slice(0, 10),
        suppressed_reason: suppressed,
      },
      // The unique key is load-bearing: this function also runs on demand when
      // the dashboard opens, so without it three refreshes make three flags.
      { onConflict: 'patient_id,domain,window_start,window_end' },
    )

    written.push({ domain: b.domain, level, z: latestZ, suppressed })
  }

  return written
}

async function overlappingCareEvents(
  supabase: SupabaseClient,
  patientId: string,
  from: Date,
  to: Date,
) {
  const { data } = await supabase
    .from('care_events')
    .select('id,type,started_on,ended_on')
    .eq('patient_id', patientId)
    .lte('started_on', to.toISOString().slice(0, 10))

  return (data ?? []).filter((row) => {
    const e = row as { started_on: string; ended_on: string | null }
    const ended = e.ended_on ? new Date(e.ended_on) : new Date()
    return ended >= from
  })
}

/**
 * 8.1 — the low-effort discriminator.
 *
 * Depressed patients give poor effort; dementia patients try hard and get it
 * wrong. The two look identical in an accuracy column and completely different
 * in telemetry:
 *
 *   poor effort        high omissions + long latency + early abandonment
 *                      + LOW hint usage
 *   genuine difficulty high engagement + FULL hint usage + wrong answers
 *
 * The hint term is what carries the discrimination. Hints fire automatically on
 * hesitation, so someone who is TRYING and struggling accumulates them; someone
 * who has disengaged answers quickly-or-not-at-all and never triggers one. A
 * low hint rate alongside poor accuracy is the signature of someone who has
 * stopped participating, and telling that person's family their memory is
 * declining would be both wrong and cruel.
 *
 * The output is never a decline flag. It is an unscored mood check-in.
 */
async function lowEffortSignature(
  supabase: SupabaseClient,
  patientId: string,
  from: Date,
  to: Date,
): Promise<boolean> {
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id,completed')
    .eq('patient_id', patientId)
    .gte('started_at', from.toISOString())
    .lte('started_at', to.toISOString())

  const all = (sessions ?? []) as { id: string; completed: boolean }[]
  if (all.length === 0) return false

  const abandonRate = all.filter((s) => !s.completed).length / all.length

  const { data: attempts } = await supabase
    .from('attempts')
    .select('correct,hints_used,presented_at_ms,responded_at_ms')
    .in('session_id', all.map((s) => s.id))

  const rows = (attempts ?? []) as Attempt[]
  
  const omissionRate = rows.filter((r) => r.correct === null).length / rows.length
  const hintRate = rows.filter((r) => r.hints_used > 0).length / rows.length

  const latencies = rows
    .filter((r) => r.responded_at_ms !== null)
    .map((r) => (r.responded_at_ms as number) - r.presented_at_ms)
    .filter((v) => Number.isFinite(v) && v > 0)
  const medianLatency = median(latencies)

  return isLowEffort({
    omissionRate,
    abandonRate,
    hintRate,
    medianLatencyMs: medianLatency ?? 0,
    trials: rows.length,
  })
}

// ─── helpers ──────────────────────────────────────────────────





function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
