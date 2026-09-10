import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CaregiverAppShell, CaregiverSection } from '@/caregiver/AppShell'
import { useCaregiverId } from '@/caregiver/auth/AuthProvider'
import {
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/caregiver/auth/Form'
import {
  latestConsent,
  loadDraftPatient,
  withdrawConsentAndDelete,
} from '@/caregiver/onboarding/api'
import type { ConsentRow, PatientRow } from '@/caregiver/onboarding/schema'

/**
 * DPDP s.6: withdrawal must be as easy as giving it.
 *
 * "As easy" is not "one tap" — this deletes a person's entire history and cannot
 * be undone, so it takes a typed confirmation. What it must not be is harder
 * than consenting was: no support ticket, no email, no waiting period, no dark
 * pattern. It is on the first settings screen and it works immediately.
 */
export function ConsentSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const caregiverId = useCaregiverId()

  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [consent, setConsent] = useState<ConsentRow | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    if (!caregiverId) return
    let active = true

    void loadDraftPatient(caregiverId).then(async (result) => {
      if (!active || !result.ok || !result.value) return
      setPatient(result.value)
      const consentResult = await latestConsent(result.value.id)
      if (active && consentResult.ok) setConsent(consentResult.value)
    })

    return () => {
      active = false
    }
  }, [caregiverId])

  const withdraw = async () => {
    if (!patient) return
    setBusy(true)
    setErrorKey(null)
    const result = await withdrawConsentAndDelete(patient.id)
    setBusy(false)

    if (!result.ok) {
      setErrorKey(result.messageKey)
      return
    }

    setDeleted(true)
    setPatient(null)
    setConsent(null)
  }

  const nameMatches = patient !== null && typedName.trim() === patient.display_name.trim()

  return (
    <CaregiverAppShell title={t('settings.title')}>
      <CaregiverSection heading={t('settings.consent.heading')} divider={false}>
        {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

        {deleted ? (
          <div>
            <p className="mb-4 max-w-[72ch] text-[15px]">{t('settings.consent.withdrawDone')}</p>
            <PrimaryButton onClick={() => navigate('/onboarding', { replace: true })}>
              {t('common.done')}
            </PrimaryButton>
          </div>
        ) : (
          <>
            {consent ? (
              <div className="mb-8">
                <h3 className="mb-2 text-[14px] font-semibold text-ink">
                  {t('settings.consent.current')}
                </h3>
                <dl className="mb-3 grid max-w-[420px] grid-cols-2 gap-y-2 text-[14px]">
                  {(['gameplay', 'photos', 'audio', 'analytics'] as const).map((key) => (
                    <div key={key} className="contents">
                      <dt className="text-clay">{t(`consent.categories.${key}.name`)}</dt>
                      <dd className="text-right font-medium">
                        {consent.scopes[key] ? t('consent.toggleOn') : t('consent.toggleOff')}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="tabular mb-2 text-[13px] text-clay">
                  {t('settings.consent.grantedOn', {
                    date: new Date(consent.granted_at).toLocaleDateString(),
                  })}
                  {' · '}
                  {t('consent.noticeVersionLabel')}: {consent.notice_version} ·{' '}
                  {consent.notice_locale}
                </p>
                <p className="max-w-[72ch] text-[13px] text-clay">{t('settings.consent.history')}</p>
              </div>
            ) : null}

            <div className="border-t border-rule pt-6">
              <p className="mb-4 max-w-[72ch] text-[14px] leading-[1.6] text-ink">
                {t('settings.consent.withdrawExplain')}
              </p>

              {!confirming ? (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!patient}
                  className="rounded-[6px] border border-madder bg-paperSunk px-4 py-2 text-[14px] font-semibold text-madder outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:opacity-50"
                >
                  {t('settings.consent.withdraw')}
                </button>
              ) : (
                <div className="max-w-[520px] rounded-[8px] border border-madder bg-paperSunk p-5">
                  <h3 className="mb-2 text-[16px] font-semibold">
                    {t('settings.consent.withdrawConfirmTitle', { name: patient?.display_name })}
                  </h3>
                  <p className="mb-4 text-[14px] leading-[1.6] text-ink">
                    {t('settings.consent.withdrawConfirmBody')}
                  </p>

                  <Field
                    id="confirm-name"
                    label={t('settings.consent.withdrawTypeToConfirm')}
                    required
                  >
                    <TextInput
                      id="confirm-name"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                    />
                  </Field>

                  <div className="flex gap-3">
                    <SecondaryButton onClick={() => setConfirming(false)}>
                      {t('common.cancel')}
                    </SecondaryButton>
                    <button
                      type="button"
                      onClick={() => void withdraw()}
                      disabled={busy || !nameMatches}
                      className="rounded-[6px] border border-madder bg-madder px-4 py-2 text-[14px] font-semibold text-paper outline-none focus-visible:ring-2 focus-visible:ring-signal/40 disabled:opacity-50"
                    >
                      {busy ? t('common.loading') : t('settings.consent.withdrawConfirmAction')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CaregiverSection>
    </CaregiverAppShell>
  )
}
