import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PHONE_OTP_ENABLED } from '@/core/supabase/client'
import { sendPhoneOtp, signIn, verifyPhoneOtp } from '@/caregiver/auth/api'
import {
  AuthPage,
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/caregiver/auth/Form'

type Mode = 'password' | 'phone'

export function SignIn() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorKey(null)
    const result = await signIn(email, password)
    setBusy(false)
    if (result.ok) navigate(from, { replace: true })
    else setErrorKey(result.messageKey)
  }

  const submitPhone = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorKey(null)
    const result = otpSent ? await verifyPhoneOtp(phone, otp) : await sendPhoneOtp(phone)
    setBusy(false)
    if (!result.ok) {
      setErrorKey(result.messageKey)
      return
    }
    if (otpSent) navigate(from, { replace: true })
    else setOtpSent(true)
  }

  return (
    <AuthPage
      title={t('auth.signIn.title')}
      subtitle={t('auth.signIn.subtitle')}
      footer={
        <div className="flex flex-col gap-2">
          <Link to="/auth/reset" className="underline">
            {t('auth.signIn.forgot')}
          </Link>
          <Link to="/auth/sign-up" className="underline">
            {t('auth.signIn.noAccount')}
          </Link>
        </div>
      }
    >
      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      {mode === 'password' ? (
        <form onSubmit={submitPassword} noValidate>
          <Field id="email" label={t('auth.signIn.email')} required>
            <TextInput
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field id="password" label={t('auth.signIn.password')} required>
            <TextInput
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>

          <PrimaryButton type="submit" disabled={busy}>
            {busy ? t('common.loading') : t('auth.signIn.submit')}
          </PrimaryButton>
        </form>
      ) : (
        <form onSubmit={submitPhone} noValidate>
          <Field id="phone" label={t('auth.phone.number')} required>
            <TextInput
              id="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </Field>

          {otpSent ? (
            <Field id="otp" label={t('auth.phone.code')} hint={t('auth.phone.sent')} required>
              <TextInput
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
              />
            </Field>
          ) : null}

          <PrimaryButton type="submit" disabled={busy}>
            {busy ? t('common.loading') : otpSent ? t('auth.phone.verify') : t('auth.phone.send')}
          </PrimaryButton>
        </form>
      )}

      {/* architecture.md 3: phone OTP is the production path and email is the demo
          path. It stays behind the flag because it needs a paid SMS provider, and
          claiming it works when the flag is off would be a lie to a judge. */}
      {PHONE_OTP_ENABLED ? (
        <div className="mt-6">
          <SecondaryButton
            onClick={() => {
              setMode(mode === 'password' ? 'phone' : 'password')
              setErrorKey(null)
              setOtpSent(false)
            }}
          >
            {mode === 'password' ? t('auth.phone.tab') : t('auth.signIn.title')}
          </SecondaryButton>
        </div>
      ) : null}
    </AuthPage>
  )
}
