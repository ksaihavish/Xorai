import { v7 as uuidv7 } from 'uuid'
import { SUPABASE_NOT_CONFIGURED, getSupabase } from '@/core/supabase/client'
import {
  consentRow,
  familyMemberRow,
  musicTrackRow,
  patientRow,
  reminderRow,
  type ConsentRow,
  type ConsentScopes,
  type FamilyMemberRow,
  type MusicTrackRow,
  type PatientRow,
  type ReminderKind,
  type ReminderRow,
  type SeverityValue,
  NOTICE_VERSION,
} from '@/caregiver/onboarding/schema'

/**
 * Caregiver-mode data layer. rules.md 4: every Supabase call is wrapped, a
 * rejected promise never reaches a component, and every read is zod-parsed
 * because a row can be stale against a newer schema.
 *
 * RLS in 0002 already scopes every one of these queries to the signed-in
 * caregiver. The filters below are for correctness and index use, not security —
 * removing one would not leak anything, and neither would relying on one.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; messageKey: string }

function fail<T>(messageKey = 'auth.errors.generic'): Result<T> {
  return { ok: false, messageKey }
}

/** A missing .env.local is a setup problem, not a network problem. Say which. */
function failFrom<T>(thrown: unknown): Result<T> {
  const message = String((thrown as Error | undefined)?.message ?? '')
  return fail(message === SUPABASE_NOT_CONFIGURED ? 'auth.errors.notConfigured' : 'auth.errors.network')
}

export const BUCKETS = {
  patientPhotos: 'patient-photos',
  familyPhotos: 'family-photos',
  voiceNotes: 'voice-notes',
  music: 'music',
} as const

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS]

/**
 * Every object lives under <patient_id>/, because that prefix is what the
 * storage policies in 0002 match on. Change this shape and the policies stop
 * matching — silently, as an empty listing rather than an error.
 */
function objectPath(patientId: string, fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : 'bin'
  return `${patientId}/${uuidv7()}.${ext}`
}

export async function uploadObject(
  bucket: BucketName,
  patientId: string,
  file: Blob,
  fileName: string,
): Promise<Result<string>> {
  try {
    const path = objectPath(patientId, fileName)
    const { error } = await getSupabase().storage.from(bucket).upload(path, file, { upsert: false })
    if (error) return fail('auth.errors.generic')
    return { ok: true, value: path }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

/**
 * Buckets are private. Nothing is ever served from a public URL — a family
 * photograph behind a guessable URL is a breach with extra steps.
 */
export async function signedUrl(
  bucket: BucketName,
  path: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const { data, error } = await getSupabase().storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds)
    return error ? null : data.signedUrl
  } catch {
    return null
  }
}

async function removeObjects(bucket: BucketName, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await getSupabase().storage.from(bucket).remove(paths)
  } catch {
    // Recorded by the caller's result, never surfaced from here.
  }
}

/** Everything this caregiver stored for this patient, across one bucket. */
async function listAllObjects(bucket: BucketName, patientId: string): Promise<string[]> {
  try {
    const { data, error } = await getSupabase().storage.from(bucket).list(patientId, { limit: 1000 })
    if (error || !data) return []
    return data.map((entry) => `${patientId}/${entry.name}`)
  } catch {
    return []
  }
}

// ─── patient ──────────────────────────────────────────────────

export async function loadDraftPatient(caregiverId: string): Promise<Result<PatientRow | null>> {
  try {
    const { data, error } = await getSupabase()
      .from('patients')
      .select('*')
      .eq('caregiver_id', caregiverId)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) return fail('auth.errors.generic')
    const first = data?.[0]
    if (!first) return { ok: true, value: null }

    const parsed = patientRow.safeParse(first)
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export type ProfileInput = {
  display_name: string
  birth_year: number | null
  education_level: PatientRow['education_level']
  language: string
  home_place: string | null
}

/**
 * Step 1 creates the row; every later step updates it. This is why severity is
 * nullable in 0001 — the row exists before severity has been asked for.
 */
export async function savePatientProfile(
  caregiverId: string,
  existingId: string | null,
  input: ProfileInput,
): Promise<Result<PatientRow>> {
  try {
    const client = getSupabase()
    const query = existingId
      ? client.from('patients').update(input).eq('id', existingId).select('*').single()
      : client
          .from('patients')
          .insert({ ...input, caregiver_id: caregiverId })
          .select('*')
          .single()

    const { data, error } = await query
    if (error) return fail('auth.errors.generic')

    const parsed = patientRow.safeParse(data)
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export async function setPatientPhoto(
  patientId: string,
  path: string | null,
): Promise<Result<null>> {
  try {
    const { error } = await getSupabase().from('patients').update({ photo_path: path }).eq('id', patientId)
    return error ? fail('auth.errors.generic') : { ok: true, value: null }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export async function saveSeverity(
  patientId: string,
  value: SeverityValue,
): Promise<Result<null>> {
  try {
    const { error } = await getSupabase().from('patients').update({ severity: value }).eq('id', patientId)
    return error ? fail('auth.errors.generic') : { ok: true, value: null }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

// ─── family ───────────────────────────────────────────────────

export async function listFamily(patientId: string): Promise<Result<FamilyMemberRow[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('family_members')
      .select('*')
      .eq('patient_id', patientId)
      .order('sort_order', { ascending: true })
    if (error) return fail('auth.errors.generic')

    const parsed = familyMemberRow.array().safeParse(data ?? [])
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export type FamilyInput = {
  display_name: string
  kinship_term_key: string | null
  relationship_en: string | null
  phone: string | null
  is_emergency: boolean
  photo_path: string | null
  voice_note_path: string | null
  sort_order: number
}

export async function addFamilyMember(
  patientId: string,
  input: FamilyInput,
): Promise<Result<FamilyMemberRow>> {
  try {
    const { data, error } = await getSupabase()
      .from('family_members')
      .insert({ ...input, patient_id: patientId })
      .select('*')
      .single()
    if (error) return fail('auth.errors.generic')

    const parsed = familyMemberRow.safeParse(data)
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export async function removeFamilyMember(id: string): Promise<Result<null>> {
  try {
    const { error } = await getSupabase().from('family_members').delete().eq('id', id)
    return error ? fail('auth.errors.generic') : { ok: true, value: null }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

// ─── music ────────────────────────────────────────────────────

export async function listMusic(patientId: string): Promise<Result<MusicTrackRow[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('music_tracks')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true })
    if (error) return fail('auth.errors.generic')

    const parsed = musicTrackRow.array().safeParse(data ?? [])
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export async function addMusicTrack(
  patientId: string,
  title: string,
  audioPath: string,
  source: string,
): Promise<Result<MusicTrackRow>> {
  try {
    const { data, error } = await getSupabase()
      .from('music_tracks')
      .insert({ patient_id: patientId, title, audio_path: audioPath, source })
      .select('*')
      .single()
    if (error) return fail('auth.errors.generic')

    const parsed = musicTrackRow.safeParse(data)
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export async function removeMusicTrack(id: string, audioPath: string): Promise<Result<null>> {
  try {
    await removeObjects(BUCKETS.music, [audioPath])
    const { error } = await getSupabase().from('music_tracks').delete().eq('id', id)
    return error ? fail('auth.errors.generic') : { ok: true, value: null }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

// ─── routine ──────────────────────────────────────────────────

export async function listReminders(patientId: string): Promise<Result<ReminderRow[]>> {
  try {
    const { data, error } = await getSupabase()
      .from('reminders')
      .select('*')
      .eq('patient_id', patientId)
      .order('time_of_day', { ascending: true })
    if (error) return fail('auth.errors.generic')

    const parsed = reminderRow.array().safeParse(data ?? [])
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

export type ReminderInput = {
  kind: ReminderKind
  label: string
  time_of_day: string
  days_of_week: number[] | null
  /** The caregiver's recording. Preferred over generated speech, always. */
  audio_path?: string | null
  active?: boolean
}

/**
 * Replaces the whole set rather than diffing it. The routine step is a small
 * fixed list a caregiver edits as a whole, and reminder_logs references
 * reminders with ON DELETE CASCADE, so a diff would silently discard the
 * acknowledgement history of a reminder whose time merely moved.
 *
 * That trade is fine during onboarding, where there is no history yet. If a
 * later phase lets a caregiver edit reminders after weeks of use, this must
 * become a real diff.
 */
export async function replaceReminders(
  patientId: string,
  inputs: ReminderInput[],
): Promise<Result<null>> {
  try {
    const { error: deleteError } = await getSupabase()
      .from('reminders')
      .delete()
      .eq('patient_id', patientId)
    if (deleteError) return fail('auth.errors.generic')

    if (inputs.length === 0) return { ok: true, value: null }

    const { error } = await getSupabase()
      .from('reminders')
      .insert(inputs.map((input) => ({ ...input, patient_id: patientId })))
    return error ? fail('auth.errors.generic') : { ok: true, value: null }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

// ─── consent ──────────────────────────────────────────────────

export async function latestConsent(patientId: string): Promise<Result<ConsentRow | null>> {
  try {
    const { data, error } = await getSupabase()
      .from('consents')
      .select('*')
      .eq('patient_id', patientId)
      .order('granted_at', { ascending: false })
      .limit(1)
    if (error) return fail('auth.errors.generic')

    const first = data?.[0]
    if (!first) return { ok: true, value: null }

    const parsed = consentRow.safeParse(first)
    return parsed.success ? { ok: true, value: parsed.data } : fail('auth.errors.generic')
  } catch (thrown) {
    return failFrom(thrown)
  }
}

/**
 * Always an INSERT. Never an UPDATE.
 *
 * A change of mind is a new row, so the table reads as a history of what was
 * agreed and when. 0002 enforces this at the column level — UPDATE is revoked
 * on every column except withdrawn_at — so a future caller that tries to patch
 * scopes in place fails rather than quietly rewriting the record.
 */
export async function recordConsent(
  patientId: string,
  caregiverId: string,
  guardianRelationship: string,
  scopes: ConsentScopes,
  noticeLocale: string,
): Promise<Result<ConsentRow>> {
  try {
    const { data, error } = await getSupabase()
      .from('consents')
      .insert({
        patient_id: patientId,
        caregiver_id: caregiverId,
        guardian_relationship: guardianRelationship,
        attested: true,
        scopes,
        notice_version: NOTICE_VERSION,
        notice_locale: noticeLocale,
      })
      .select('*')
      .single()
    if (error) return fail('auth.errors.generic')

    const parsed = consentRow.safeParse(data)
    if (!parsed.success) return fail('auth.errors.generic')

    await applyScopeDeletions(patientId, scopes)
    return { ok: true, value: parsed.data }
  } catch (thrown) {
    return failFrom(thrown)
  }
}

/**
 * Consent is collected at step 6, after photos and recordings have been added at
 * steps 1, 3 and 4. Declining a category therefore has to delete what is already
 * there, or the toggle is decoration.
 *
 * This is the honest reading of "the app must work with them off": off means the
 * data is gone, not that a flag hides it.
 */
async function applyScopeDeletions(patientId: string, scopes: ConsentScopes): Promise<void> {
  if (!scopes.photos) {
    await removeObjects(BUCKETS.patientPhotos, await listAllObjects(BUCKETS.patientPhotos, patientId))
    await removeObjects(BUCKETS.familyPhotos, await listAllObjects(BUCKETS.familyPhotos, patientId))
    try {
      await getSupabase().from('patients').update({ photo_path: null }).eq('id', patientId)
      await getSupabase().from('family_members').update({ photo_path: null }).eq('patient_id', patientId)
    } catch {
      // The objects are already gone; the dangling paths are corrected on retry.
    }
  }

  if (!scopes.audio) {
    await removeObjects(BUCKETS.voiceNotes, await listAllObjects(BUCKETS.voiceNotes, patientId))
    await removeObjects(BUCKETS.music, await listAllObjects(BUCKETS.music, patientId))
    try {
      await getSupabase()
        .from('family_members')
        .update({ voice_note_path: null })
        .eq('patient_id', patientId)
      await getSupabase().from('music_tracks').delete().eq('patient_id', patientId)
    } catch {
      // As above.
    }
  }
}

/**
 * DPDP s.6: withdrawal must be as easy as giving. This is the whole of it.
 *
 * Order matters. The withdrawal is recorded first, so that a deletion which
 * fails halfway still leaves a record that consent was withdrawn. Then the
 * storage objects, then the patient row — whose ON DELETE CASCADE takes
 * sessions, attempts, strokes, rhythm_trials, family members, music, reminders,
 * care events, adaptive state and the consent history with it.
 *
 * The consent rows die with the patient, which is correct: this is an erasure
 * request, and keeping an audit trail of a person who asked to be forgotten is
 * the thing DPDP is trying to prevent.
 */
export async function withdrawConsentAndDelete(patientId: string): Promise<Result<null>> {
  try {
    const { error: withdrawError } = await getSupabase()
      .from('consents')
      .update({ withdrawn_at: new Date().toISOString() })
      .eq('patient_id', patientId)
      .is('withdrawn_at', null)
    if (withdrawError) return fail('settings.consent.withdrawFailed')

    for (const bucket of Object.values(BUCKETS)) {
      await removeObjects(bucket, await listAllObjects(bucket, patientId))
    }

    const { error } = await getSupabase().from('patients').delete().eq('id', patientId)
    if (error) return fail('settings.consent.withdrawFailed')

    return { ok: true, value: null }
  } catch {
    return fail('settings.consent.withdrawFailed')
  }
}
