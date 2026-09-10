import { supabase } from '@/core/supabase/client'

/**
 * Every Supabase call in caregiver mode goes through a wrapper like this.
 * rules.md 4: a rejected promise from supabase-js must never reach a component,
 * and a raw error code must never reach a caregiver. Each function returns a
 * discriminated result and the caller renders an i18n key, never error.message.
 */
export type AuthResult = { ok: true } | { ok: false; messageKey: string }

const OK: AuthResult = { ok: true }

/**
 * Supabase returns deliberately vague messages for sign-in failures so an
 * attacker cannot enumerate accounts. We keep that vagueness and translate only
 * the cases that genuinely help someone who owns the account.
 */
function messageKeyFor(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'auth.errors.invalidCredentials'
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'auth.errors.emailTaken'
  }
  if (m.includes('password should be at least') || m.includes('weak password')) {
    return 'auth.errors.weakPassword'
  }
  if (m.includes('unable to validate email') || m.includes('invalid email')) {
    return 'auth.errors.invalidEmail'
  }
  if (m.includes('token has expired') || m.includes('invalid otp') || m.includes('otp')) {
    return 'auth.errors.otpInvalid'
  }
  if (m.includes('fetch') || m.includes('network')) return 'auth.errors.network'
  return 'auth.errors.generic'
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

/**
 * The caregivers row is created here rather than by a database trigger, because
 * display_name is collected on this form and a trigger would have to guess it.
 * When email confirmation is on there is no session yet, so the row is written
 * on the first authenticated load instead — see ensureCaregiverRow.
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) return { ok: false, messageKey: messageKeyFor(error.message) }
    if (data.session) await ensureCaregiverRow(displayName)
    return OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

/**
 * Idempotent, and run on every authenticated load, so an account created before
 * its email was confirmed still ends up with a caregivers row — without a
 * trigger and without a second source of truth for display_name.
 */
export async function ensureCaregiverRow(displayNameFallback?: string): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    if (!user) return

    const metadataName = user.user_metadata['display_name']
    const displayName =
      (typeof metadataName === 'string' ? metadataName : undefined) ??
      displayNameFallback ??
      user.email ??
      'Caregiver'

    await supabase
      .from('caregivers')
      .upsert(
        { id: user.id, display_name: displayName },
        { onConflict: 'id', ignoreDuplicates: true },
      )
  } catch {
    // Non-fatal: the next authenticated load retries. Surfacing this would put
    // an error in front of someone who has done nothing wrong.
  }
}

export async function signOut(): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signOut()
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/new-password`,
    })
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

export async function updatePassword(password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.updateUser({ password })
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

/** Both of these are only reachable when VITE_ENABLE_PHONE_OTP is 'true'. */
export async function sendPhoneOtp(phone: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
    return error ? { ok: false, messageKey: messageKeyFor(error.message) } : OK
  } catch {
    return { ok: false, messageKey: 'auth.errors.network' }
  }
}
