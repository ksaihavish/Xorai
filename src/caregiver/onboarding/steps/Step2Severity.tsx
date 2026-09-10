import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormError, PrimaryButton, SecondaryButton } from '@/caregiver/auth/Form'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { saveSeverity } from '@/caregiver/onboarding/api'
import type { SeverityValue } from '@/caregiver/onboarding/schema'

const VALUES: SeverityValue[] = ['mild', 'moderate', 'severe']

/**
 * prd.md 2: severity is an INPUT taken from the caregiver, never an output. It
 * gates difficulty and which modules appear, and the app never revises it.
 *
 * The copy on this screen is doing real work. Every word of it exists to make
 * clear that we are being told something, not deciding it — because the moment
 * a caregiver believes the app assessed their relative, we are doing the thing
 * prd.md 2 says we never do.
 */
export function Step2Severity({ patient, onNext, onBack }: StepProps) {
  const { t } = useTranslation()
  const [value, setValue] = useState<SeverityValue | null>(patient?.severity ?? null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!patient || !value) {
      setErrorKey('common.required')
      return
    }
    setBusy(true)
    setErrorKey(null)
    const result = await saveSeverity(patient.id, value)
    setBusy(false)
    if (result.ok) onNext()
    else setErrorKey(result.messageKey)
  }

  return (
    <div>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.01em]">
        {t('onboarding.severity.title')}
      </h2>

      <p className="mb-3 max-w-[72ch] text-[15px] leading-[1.6] text-ink">
        {t('onboarding.severity.intro')}
      </p>
      <p className="mb-8 max-w-[72ch] text-[14px] leading-[1.6] text-clay">
        {t('onboarding.severity.notAssessment')}
      </p>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      <fieldset className="mb-8">
        <legend className="mb-3 text-[14px] font-medium text-ink">
          {t('onboarding.severity.label')}
        </legend>

        <div className="flex flex-col gap-3">
          {VALUES.map((option) => {
            const selected = value === option
            return (
              <label
                key={option}
                className={
                  'flex cursor-pointer items-start gap-3 rounded-[8px] border p-4 ' +
                  (selected ? 'border-signal bg-paperSunk' : 'border-rule bg-paperSunk')
                }
              >
                <input
                  type="radio"
                  name="severity"
                  value={option}
                  checked={selected}
                  onChange={() => setValue(option)}
                  className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-[var(--signal)]"
                />
                <span>
                  <span className="block text-[15px] font-semibold text-ink">
                    {t(`onboarding.severity.options.${option}`)}
                  </span>
                  <span className="block max-w-[72ch] text-[14px] leading-[1.5] text-clay">
                    {t(`onboarding.severity.hints.${option}`)}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t('common.back')}</SecondaryButton>
        <PrimaryButton onClick={() => void submit()} disabled={busy || !value}>
          {busy ? t('common.loading') : t('common.continue')}
        </PrimaryButton>
      </div>
    </div>
  )
}
