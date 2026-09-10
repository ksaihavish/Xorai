import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useCaregiverId } from '@/caregiver/auth/AuthProvider'
import { FormError } from '@/caregiver/auth/Form'
import { latestConsent, listFamily, loadDraftPatient } from '@/caregiver/onboarding/api'
import { ONBOARDING_STEPS, type OnboardingStep, type PatientRow } from '@/caregiver/onboarding/schema'
import { Step1Profile } from '@/caregiver/onboarding/steps/Step1Profile'
import { Step2Severity } from '@/caregiver/onboarding/steps/Step2Severity'
import { Step3Family } from '@/caregiver/onboarding/steps/Step3Family'
import { Step4Music } from '@/caregiver/onboarding/steps/Step4Music'
import { Step5Routine } from '@/caregiver/onboarding/steps/Step5Routine'
import { Step6Consent } from '@/caregiver/onboarding/steps/Step6Consent'

export type StepProps = {
  caregiverId: string
  patient: PatientRow | null
  onPatientChange: (patient: PatientRow) => void
  onNext: () => void
  onBack: () => void
}

const PROGRESS_KEY = 'xorai.onboarding.furthestStep'

/**
 * Where to resume, derived from what is actually in the database rather than
 * from a stored cursor. A caregiver who set this up on a different device, or
 * cleared their browser data, still lands on the right screen.
 *
 * Music and routine are optional, so completing them cannot be derived from
 * data. localStorage carries only that — a per-device convenience whose loss
 * costs the caregiver two taps, which is exactly what localStorage is for.
 */
function deriveStepIndex(
  patient: PatientRow | null,
  familyCount: number,
  hasConsent: boolean,
): number {
  if (!patient) return 0
  if (!patient.severity) return 1
  if (familyCount === 0) return 2
  if (hasConsent) return ONBOARDING_STEPS.length - 1

  let furthest = 3
  try {
    const stored = Number(window.localStorage.getItem(PROGRESS_KEY))
    if (Number.isInteger(stored) && stored > furthest) {
      furthest = Math.min(stored, ONBOARDING_STEPS.length - 1)
    }
  } catch {
    // Private window, or site data blocked. Resume from the first optional step.
  }
  return furthest
}

export function OnboardingFlow() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const caregiverId = useCaregiverId()

  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [resumed, setResumed] = useState(false)

  useEffect(() => {
    if (!caregiverId) return
    let active = true

    const load = async () => {
      const patientResult = await loadDraftPatient(caregiverId)
      if (!active) return
      if (!patientResult.ok) {
        setErrorKey(patientResult.messageKey)
        setLoading(false)
        return
      }

      const found = patientResult.value
      setPatient(found)

      let familyCount = 0
      let hasConsent = false
      if (found) {
        const [family, consent] = await Promise.all([
          listFamily(found.id),
          latestConsent(found.id),
        ])
        if (!active) return
        if (family.ok) familyCount = family.value.length
        if (consent.ok) hasConsent = consent.value !== null && consent.value.withdrawn_at === null
      }

      const index = deriveStepIndex(found, familyCount, hasConsent)
      setStepIndex(index)
      setResumed(index > 0)
      setLoading(false)
    }

    void load()
    return () => {
      active = false
    }
  }, [caregiverId])

  const goTo = useCallback((index: number) => {
    const clamped = Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1)
    setStepIndex(clamped)
    try {
      const stored = Number(window.localStorage.getItem(PROGRESS_KEY))
      if (!Number.isInteger(stored) || clamped > stored) {
        window.localStorage.setItem(PROGRESS_KEY, String(clamped))
      }
    } catch {
      // See deriveStepIndex.
    }
  }, [])

  if (!caregiverId) return null

  const step: OnboardingStep = ONBOARDING_STEPS[stepIndex] ?? 'profile'

  const stepProps: StepProps = {
    caregiverId,
    patient,
    onPatientChange: setPatient,
    onNext: () => {
      if (stepIndex === ONBOARDING_STEPS.length - 1) navigate('/', { replace: true })
      else goTo(stepIndex + 1)
    },
    onBack: () => goTo(stepIndex - 1),
  }

  return (
    <div data-mode="caregiver" className="min-h-screen bg-paper font-ui text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-[720px] items-baseline justify-between gap-6 px-6 py-5">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{t('onboarding.title')}</h1>
          <span className="tabular text-[13px] text-clay">
            {t('onboarding.stepOf', { current: stepIndex + 1, total: ONBOARDING_STEPS.length })}
          </span>
        </div>
        <nav className="mx-auto flex max-w-[720px] gap-1 px-6 pb-4" aria-label={t('onboarding.title')}>
          {ONBOARDING_STEPS.map((name, index) => (
            <span
              key={name}
              aria-current={index === stepIndex ? 'step' : undefined}
              className={
                'h-[3px] flex-1 rounded-full ' +
                (index <= stepIndex ? 'bg-signal' : 'bg-rule')
              }
            />
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-6 py-10">
        {loading ? (
          <p className="text-[14px] text-clay">{t('common.loading')}</p>
        ) : (
          <>
            {errorKey ? <FormError>{t(errorKey)}</FormError> : null}
            {resumed && stepIndex > 0 ? (
              <p className="mb-6 text-[14px] text-clay">{t('onboarding.resume')}</p>
            ) : null}

            {step === 'profile' ? <Step1Profile {...stepProps} /> : null}
            {step === 'severity' ? <Step2Severity {...stepProps} /> : null}
            {step === 'family' ? <Step3Family {...stepProps} /> : null}
            {step === 'music' ? <Step4Music {...stepProps} /> : null}
            {step === 'routine' ? <Step5Routine {...stepProps} /> : null}
            {step === 'consent' ? (
              <Step6Consent {...stepProps} noticeLocale={i18n.language} />
            ) : null}
          </>
        )}
      </main>
    </div>
  )
}
