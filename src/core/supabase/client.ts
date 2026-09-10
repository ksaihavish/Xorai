import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The one Supabase client. Never construct a second: two clients means two auth
 * token refresh loops racing each other on the same storage key, and a caregiver
 * signed out at random.
 *
 * Values come from .env.local, which is gitignored. The anon key is safe in the
 * browser bundle by design — RLS is what protects the data, which is why
 * 0002_rls.sql exists and why tests/rls.test.ts must never be deleted. The
 * service_role key NEVER appears in a VITE_ variable; it lives in Edge Function
 * secrets only.
 *
 * ─── Why this is lazy ───
 *
 * The first version of this file threw at module load when the variables were
 * missing. That coupled every module downstream of it to the presence of
 * .env.local: importing the sync engine required Supabase configuration, the
 * offline layer's own test could not run, and — worst — the patient route white
 * screened before React mounted, because the router imports the auth provider
 * which imports this.
 *
 * A patient must never see a technical failure (design.md 6), and the offline
 * layer is specifically the part of this product that has to work when the
 * backend does not. So the client is built on first use, and callers that cannot
 * proceed without it say so in caregiver-mode language instead of crashing.
 */

// Coerced rather than read raw: Vite types import.meta.env with an `any` index
// signature, and rules.md 1.8 does not allow `any` to leak into a module boundary.
const url = String(import.meta.env.VITE_SUPABASE_URL ?? '')
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')

export const SUPABASE_NOT_CONFIGURED = 'supabase/not-configured'

export function isSupabaseConfigured(): boolean {
  return url.length > 0 && anonKey.length > 0
}

let cached: SupabaseClient | null = null

/**
 * Throws only when actually called without configuration. Every caregiver-mode
 * caller already wraps its Supabase access in a try/catch that maps a failure to
 * an i18n key (rules.md 4), so this surfaces as a sentence, not a stack trace.
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(SUPABASE_NOT_CONFIGURED)
  }

  cached ??= createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })

  return cached
}

/** VITE_ENABLE_PHONE_OTP defaults off: phone OTP needs a paid SMS provider. */
export const PHONE_OTP_ENABLED = import.meta.env.VITE_ENABLE_PHONE_OTP === 'true'
