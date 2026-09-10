import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { signUp } from '@/caregiver/auth/api'
import {
  AuthPage,
  Field,
  FormError,
  PrimaryButton,
  TextInput,
} from '@/caregiver/auth/Form'

export function SignUp() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setErrorKey('auth.errors.weakPassword')
      return
    }

    setBusy(true)
    setErrorKey(null)
    const result = await signUp(email, password, displayName)
    setBusy(false)

    if (!result.ok) {
      setErrorKey(result.messageKey)
      return
    }

    // With email confirmation on there is no session yet, so we cannot route
    // into onboarding — the caregivers row is written on first authenticated
    // load instead. With it off, AuthProvider picks the session up immediately.
    setConfirmationSent(true)
    navigate('/onboarding', { replace: true })
  }

  return (
    <AuthPage
      title={t('auth.signUp.title')}
      subtitle={t('auth.signUp.subtitle')}
      footer={
        <Link to="/auth/sign-in" className="underline">
          {t('auth.signUp.hasAccount')}
        </Link>
      }
    >
      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}
      {confirmationSent ? <p className="mb-4 text-[14px]">{t('auth.signUp.checkEmail')}</p> : null}

      <form onSubmit={submit} noValidate>
        <Field id="displayName" label={t('auth.signUp.displayName')} required>
          <TextInput
            id="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
          />
        </Field>

        <Field id="email" label={t('auth.signUp.email')} required>
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field
          id="password"
          label={t('auth.signUp.password')}
          hint={t('auth.signUp.passwordHint')}
          required
        >
          <TextInput
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <PrimaryButton type="submit" disabled={busy}>
          {busy ? t('common.loading') : t('auth.signUp.submit')}
        </PrimaryButton>
      </form>
    </AuthPage>
  )
}
