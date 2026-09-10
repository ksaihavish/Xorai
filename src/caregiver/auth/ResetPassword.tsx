import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { requestPasswordReset, updatePassword } from '@/caregiver/auth/api'
import { AuthPage, Field, FormError, PrimaryButton, TextInput } from '@/caregiver/auth/Form'

/** Step one: ask for the email and send the link. */
export function ResetPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrorKey(null)
    const result = await requestPasswordReset(email)
    setBusy(false)
    // Reported as sent either way. Telling an anonymous visitor whether an
    // address has an account is account enumeration.
    if (result.ok) setSent(true)
    else setErrorKey(result.messageKey)
  }

  return (
    <AuthPage
      title={t('auth.reset.title')}
      subtitle={t('auth.reset.subtitle')}
      footer={
        <Link to="/auth/sign-in" className="underline">
          {t('auth.signIn.title')}
        </Link>
      }
    >
      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}
      {sent ? <p className="mb-4 text-[14px]">{t('auth.reset.sent')}</p> : null}

      <form onSubmit={submit} noValidate>
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

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('auth.reset.submit')}
        </PrimaryButton>
      </form>
    </AuthPage>
  )
}

/**
 * Step two: the screen the emailed link lands on. Supabase puts a recovery
 * session in the URL and detectSessionInUrl picks it up, so updateUser here is
 * already authenticated as the account being recovered.
 */
export function NewPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setErrorKey('auth.errors.weakPassword')
      return
    }
    setBusy(true)
    setErrorKey(null)
    const result = await updatePassword(password)
    setBusy(false)
    if (result.ok) navigate('/', { replace: true })
    else setErrorKey(result.messageKey)
  }

  return (
    <AuthPage title={t('auth.reset.setTitle')}>
      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      <form onSubmit={submit} noValidate>
        <Field
          id="new-password"
          label={t('auth.reset.newPassword')}
          hint={t('auth.signUp.passwordHint')}
          required
        >
          <TextInput
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('auth.reset.setSubmit')}
        </PrimaryButton>
      </form>
    </AuthPage>
  )
}
