import { z } from 'zod'

/**
 * rules.md 4: zod-parse everything crossing a boundary — network responses,
 * Dexie reads, Edge Function payloads. These schemas are that boundary for
 * caregiver-mode reads, and they mirror the CHECK constraints in 0001_init.sql.
 * If a constraint changes there, it changes here, or a stale row parses as valid.
 */

export const educationLevel = z.enum(['none', 'primary', 'middle', 'secondary', 'higher'])
export type EducationLevel = z.infer<typeof educationLevel>

export const severity = z.enum(['mild', 'moderate', 'severe'])
export type SeverityValue = z.infer<typeof severity>

export const reminderKind = z.enum(['medication', 'meal', 'routine'])
export type ReminderKind = z.infer<typeof reminderKind>

export const patientRow = z.object({
  id: z.string().uuid(),
  caregiver_id: z.string().uuid(),
  display_name: z.string(),
  birth_year: z.number().int().nullable(),
  education_level: educationLevel.nullable(),
  severity: severity.nullable(),
  language: z.string(),
  photo_path: z.string().nullable(),
  home_place: z.string().nullable(),
  baseline_status: z.enum(['collecting', 'established']),
  created_at: z.string(),
})
export type PatientRow = z.infer<typeof patientRow>

export const familyMemberRow = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  display_name: z.string(),
  kinship_term_key: z.string().nullable(),
  relationship_en: z.string().nullable(),
  photo_path: z.string().nullable(),
  voice_note_path: z.string().nullable(),
  phone: z.string().nullable(),
  is_emergency: z.boolean(),
  sort_order: z.number().int().nullable(),
})
export type FamilyMemberRow = z.infer<typeof familyMemberRow>

export const musicTrackRow = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  title: z.string(),
  audio_path: z.string(),
  source: z.string().nullable(),
  created_at: z.string(),
})
export type MusicTrackRow = z.infer<typeof musicTrackRow>

export const reminderRow = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  kind: reminderKind,
  label: z.string(),
  time_of_day: z.string(),
  days_of_week: z.array(z.number().int()).nullable(),
  audio_path: z.string().nullable(),
  active: z.boolean(),
})
export type ReminderRow = z.infer<typeof reminderRow>

/**
 * The four DPDP categories. `gameplay` is required and the type says so: it is
 * a literal true, so a scopes object with gameplay off will not compile and will
 * not parse. The other three are genuinely optional and the app has a defined
 * behaviour with each of them off — see consent.categories.*.offNote.
 */
export const consentScopes = z.object({
  gameplay: z.literal(true),
  photos: z.boolean(),
  audio: z.boolean(),
  analytics: z.boolean(),
})
export type ConsentScopes = z.infer<typeof consentScopes>

export const consentRow = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  caregiver_id: z.string().uuid(),
  guardian_relationship: z.string(),
  attested: z.boolean(),
  scopes: consentScopes,
  notice_version: z.string(),
  notice_locale: z.string(),
  granted_at: z.string(),
  withdrawn_at: z.string().nullable(),
})
export type ConsentRow = z.infer<typeof consentRow>

/** Hardcoded, and bumped whenever the wording of the notice changes. */
export const NOTICE_VERSION = 'v1'

export const ONBOARDING_STEPS = [
  'profile',
  'severity',
  'family',
  'music',
  'routine',
  'consent',
] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]
