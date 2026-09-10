import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { v7 as uuidv7 } from 'uuid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Cross-caregiver isolation. rules.md 5: this file must never be deleted or
 * skipped. It is the artifact behind the answer to "how is patient data
 * isolated", and that answer is worth nothing if nobody can watch it pass.
 *
 * It runs against a REAL Supabase project with 0001 and 0002 applied, using two
 * real accounts. A mock would prove that the mock works.
 *
 * Required in .env.local (Vite loads it for vitest too):
 *
 *   VITE_SUPABASE_URL=...
 *   VITE_SUPABASE_ANON_KEY=...
 *   VITE_RLS_TEST_A_EMAIL=...
 *   VITE_RLS_TEST_A_PASSWORD=...
 *   VITE_RLS_TEST_B_EMAIL=...
 *   VITE_RLS_TEST_B_PASSWORD=...
 *
 * Create the two accounts first, in the Supabase dashboard, with email
 * confirmation already done. The test signs in as each; it does not sign up,
 * because a confirmation email in the middle of a test suite is not a test.
 *
 * When the variables are missing this suite FAILS rather than skips. A green run
 * that quietly proved nothing is worse than a red one.
 */

function required(name: string): string {
  const fromProcess = typeof process !== 'undefined' ? process.env[name] : undefined
  const fromVite: unknown = import.meta.env[name]
  const value = fromProcess ?? (typeof fromVite === 'string' ? fromVite : undefined)
  if (!value) {
    throw new Error(
      `${name} is not set. tests/rls.test.ts runs against a real Supabase project — see the comment at the top of this file. Do not skip this suite.`,
    )
  }
  return value
}

type Ctx = {
  client: SupabaseClient
  caregiverId: string
  patientId: string
  sessionId: string
}

const url = required('VITE_SUPABASE_URL')
const anonKey = required('VITE_SUPABASE_ANON_KEY')

/**
 * A separate client per caregiver, each with its own storage, so the two auth
 * sessions cannot overwrite one another. This is the one place in the codebase
 * that constructs a client other than src/core/supabase/client.ts, and it does
 * so because the whole point is to hold two identities at once.
 */
function makeClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function setUp(emailVar: string, passwordVar: string, label: string): Promise<Ctx> {
  const client = makeClient()

  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: required(emailVar),
    password: required(passwordVar),
  })
  if (authError || !auth.user) {
    throw new Error(`Could not sign in test caregiver ${label}: ${authError?.message ?? 'no user'}`)
  }
  const caregiverId = auth.user.id

  const { error: caregiverError } = await client
    .from('caregivers')
    .upsert({ id: caregiverId, display_name: `RLS test ${label}` }, { onConflict: 'id' })
  if (caregiverError) throw new Error(`caregivers upsert failed for ${label}: ${caregiverError.message}`)

  const { data: patient, error: patientError } = await client
    .from('patients')
    .insert({
      caregiver_id: caregiverId,
      display_name: `RLS patient ${label}`,
      language: 'en',
      severity: 'mild',
    })
    .select('id')
    .single()
  if (patientError || !patient) {
    throw new Error(`patients insert failed for ${label}: ${patientError?.message ?? 'no row'}`)
  }
  const patientId = patient.id as string

  // Rows for A to try, and fail, to read.
  const sessionId = uuidv7()
  const { error: sessionError } = await client.from('sessions').insert({
    id: sessionId,
    patient_id: patientId,
    started_at: new Date().toISOString(),
    device_id: `rls-test-${label}`,
    app_version: 'test',
    tz_offset_min: 330,
  })
  if (sessionError) throw new Error(`sessions insert failed for ${label}: ${sessionError.message}`)

  const { error: attemptError } = await client.from('attempts').insert({
    id: uuidv7(),
    client_event_id: uuidv7(),
    session_id: sessionId,
    patient_id: patientId,
    game_type: 'orientation',
    domain: 'orientation',
    trial_index: 0,
    difficulty_level: 1,
    presented_at_ms: 0,
    hints_used: 0,
  })
  if (attemptError) throw new Error(`attempts insert failed for ${label}: ${attemptError.message}`)

  const { error: strokeError } = await client.from('strokes').insert({
    id: uuidv7(),
    client_event_id: uuidv7(),
    session_id: sessionId,
    patient_id: patientId,
    stroke_index: 0,
    condition: 'command',
    points: [{ x: 1, y: 1, t: 0 }],
    stroke_start_ms: 0,
    stroke_end_ms: 10,
    air_time_before_ms: 0,
  })
  if (strokeError) throw new Error(`strokes insert failed for ${label}: ${strokeError.message}`)

  const { error: familyError } = await client.from('family_members').insert({
    patient_id: patientId,
    display_name: `RLS family ${label}`,
    is_emergency: false,
  })
  if (familyError) throw new Error(`family_members insert failed for ${label}: ${familyError.message}`)

  return { client, caregiverId, patientId, sessionId }
}

let a: Ctx
let b: Ctx

beforeAll(async () => {
  a = await setUp('VITE_RLS_TEST_A_EMAIL', 'VITE_RLS_TEST_A_PASSWORD', 'A')
  b = await setUp('VITE_RLS_TEST_B_EMAIL', 'VITE_RLS_TEST_B_PASSWORD', 'B')
}, 60_000)

afterAll(async () => {
  // Deleting the patient cascades through every table below it.
  if (a) {
    await a.client.from('patients').delete().eq('id', a.patientId)
    await a.client.auth.signOut()
  }
  if (b) {
    await b.client.from('patients').delete().eq('id', b.patientId)
    await b.client.auth.signOut()
  }
}, 60_000)

describe('RLS: caregiver A cannot see caregiver B', () => {
  it('sets up two distinct caregivers and patients', () => {
    expect(a.caregiverId).not.toBe(b.caregiverId)
    expect(a.patientId).not.toBe(b.patientId)
  })

  it('patients: A sees its own row and none of B', async () => {
    const { data, error } = await a.client.from('patients').select('id')
    expect(error).toBeNull()

    const ids = (data ?? []).map((row) => row.id as string)
    expect(ids).toContain(a.patientId)
    expect(ids).not.toContain(b.patientId)
  })

  // An unfiltered select is the honest form of this assertion. Filtering by
  // B's id would also return zero rows if the query were simply wrong, so it
  // would pass against a database with no RLS at all.
  it.each(['sessions', 'attempts', 'strokes', 'family_members'] as const)(
    '%s: A retrieves zero of B rows',
    async (table) => {
      const { data, error } = await a.client.from(table).select('patient_id')
      expect(error).toBeNull()

      const patientIds = (data ?? []).map((row) => row.patient_id as string)
      expect(patientIds).not.toContain(b.patientId)
      expect(patientIds.every((id) => id === a.patientId)).toBe(true)
    },
  )

  it('attempts: A cannot insert a row against B patient_id', async () => {
    const { error } = await a.client.from('attempts').insert({
      id: uuidv7(),
      client_event_id: uuidv7(),
      session_id: b.sessionId,
      patient_id: b.patientId,
      game_type: 'orientation',
      domain: 'orientation',
      trial_index: 99,
      difficulty_level: 1,
      presented_at_ms: 0,
      hints_used: 0,
    })

    // The WITH CHECK half of the policy is what rejects this. USING alone would
    // let it through, which is why every patient-scoped policy in 0002 has both.
    expect(error).not.toBeNull()
    expect(error?.code === '42501' || /row-level security/i.test(error?.message ?? '')).toBe(true)
  })

  // Isolation has to hold in both directions, and only testing one is how a
  // policy that was pasted onto the wrong table gets through review.
  it.each(['sessions', 'attempts', 'strokes', 'family_members'] as const)(
    '%s: B retrieves zero of A rows',
    async (table) => {
      const { data, error } = await b.client.from(table).select('patient_id')
      expect(error).toBeNull()

      const patientIds = (data ?? []).map((row) => row.patient_id as string)
      expect(patientIds).not.toContain(a.patientId)
      expect(patientIds.every((id) => id === b.patientId)).toBe(true)
    },
  )

  it('flags: A cannot insert at all, because no write policy exists', async () => {
    const { error } = await a.client.from('flags').insert({
      patient_id: a.patientId,
      domain: 'attention',
      level: 'amber',
      window_start: '2026-01-01',
      window_end: '2026-01-14',
    })

    // Its own patient, and still refused. A client that can write its own flags
    // can write its own conclusion about a person.
    expect(error).not.toBeNull()
  })

  it('session_summaries and baselines: A cannot insert either', async () => {
    const summary = await a.client
      .from('session_summaries')
      .insert({ session_id: a.sessionId, patient_id: a.patientId, cv_rt: 0.1 })
    expect(summary.error).not.toBeNull()

    const baseline = await a.client
      .from('baselines')
      .insert({ patient_id: a.patientId, domain: 'attention', baseline_mean: 1, baseline_sd: 1 })
    expect(baseline.error).not.toBeNull()
  })

  it('consents: scopes cannot be rewritten in place', async () => {
    const { error: insertError } = await a.client.from('consents').insert({
      patient_id: a.patientId,
      caregiver_id: a.caregiverId,
      guardian_relationship: 'daughter',
      attested: true,
      scopes: { gameplay: true, photos: true, audio: true, analytics: true },
      notice_version: 'v1',
      notice_locale: 'en',
    })
    expect(insertError).toBeNull()

    // 0002 revokes UPDATE on every column but withdrawn_at. The audit trail is
    // the entire reason this table exists.
    const { error: updateError } = await a.client
      .from('consents')
      .update({ scopes: { gameplay: true, photos: false, audio: false, analytics: false } })
      .eq('patient_id', a.patientId)
    expect(updateError).not.toBeNull()

    // Withdrawal, the one permitted update, still works.
    const { error: withdrawError } = await a.client
      .from('consents')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('patient_id', a.patientId)
    expect(withdrawError).toBeNull()
  })
})
