import { createClient } from '@supabase/supabase-js'

/**
 * The one Supabase client. Never construct a second: two clients means two auth
 * token refresh loops racing each other on the same storage key, and a caregiver
 * signed out at random.
 *
 * Values come from .env.local, which is gitignored. The anon key is safe in the
 * browser bundle by design — RLS is what protects the data, which is why 0002
 * exists and why tests/rls.test.ts must never be deleted. The service_role key
 * NEVER appears in a VITE_ variable; it lives in Edge Function secrets only.
 */
// Coerced rather than read raw: Vite types import.meta.env with an `any` index
// signature, and rules.md 1.8 does not allow `any` to leak into a module boundary.
const url = String(import.meta.env.VITE_SUPABASE_URL ?? '')
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '')

if (!url || !anonKey) {
  // Fails loudly here rather than as an opaque 401 from the first query. The
  // patient path never surfaces an error, but this fires before any patient
  // surface can mount.
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy .env.example to .env.local and fill them in.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** VITE_ENABLE_PHONE_OTP defaults off: phone OTP needs a paid SMS provider. */
export const PHONE_OTP_ENABLED = import.meta.env.VITE_ENABLE_PHONE_OTP === 'true'
