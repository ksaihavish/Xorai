import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/caregiver/auth/Form'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { listReminders, replaceReminders, type ReminderInput } from '@/caregiver/onboarding/api'
import type { ReminderKind } from '@/caregiver/onboarding/schema'

type Draft = ReminderInput & { key: string }

const KINDS: { kind: ReminderKind; labelKey: string }[] = [
  { kind: 'medication', labelKey: 'onboarding.routine.medication' },
  { kind: 'meal', labelKey: 'onboarding.routine.meals' },
  { kind: 'routine', labelKey: 'onboarding.routine.sleep' },
]

export function Step5Routine({ patient, onNext, onBack }: StepProps) {
  const { t } = useTranslation()
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!patient) return
    let active = true
    void listReminders(patient.id).then((result) => {
      if (!active) return
      if (!result.ok) {
        setErrorKey(result.messageKey)
        return
      }
      setDrafts(
        result.value.map((row) => ({
          key: row.id,
          kind: row.kind,
          label: row.label,
          time_of_day: row.time_of_day.slice(0, 5),
          days_of_week: row.days_of_week,
        })),
      )
    })
    return () => {
      active = false
    }
  }, [patient])

  const addDraft = (kind: ReminderKind) => {
    setDrafts((current) => [
      ...current,
      {
        key: `${kind}-${current.length}-${String(Math.random()).slice(2, 8)}`,
        kind,
        label: '',
        time_of_day: '08:00',
        days_of_week: null,
      },
    ])
  }

  const update = (key: string, patch: Partial<ReminderInput>) => {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  const submit = async () => {
    if (!patient) return
    setBusy(true)
    setErrorKey(null)

    const usable = drafts.filter((d) => d.label.trim() && d.time_of_day)
    const result = await replaceReminders(
      patient.id,
      usable.map(({ kind, label, time_of_day, days_of_week }) => ({
        kind,
        label: label.trim(),
        time_of_day,
        days_of_week,
      })),
    )

    setBusy(false)
    if (result.ok) onNext()
    else setErrorKey(result.messageKey)
  }

  return (
    <div>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.01em]">
        {t('onboarding.routine.title')}
      </h2>
      <p className="mb-8 max-w-[72ch] text-[15px] leading-[1.6] text-clay">
        {t('onboarding.routine.intro')}
      </p>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      {KINDS.map(({ kind, labelKey }) => {
        const forKind = drafts.filter((d) => d.kind === kind)
        return (
          <section key={kind} className="mb-8 border-t border-rule pt-6">
            <h3 className="mb-4 text-[14px] font-semibold uppercase tracking-[0.08em] text-clay">
              {t(labelKey)}
            </h3>

            {forKind.map((draft) => (
              <div key={draft.key} className="mb-4 grid grid-cols-12 gap-3">
                <div className="col-span-12 sm:col-span-8">
                  <Field id={`label-${draft.key}`} label={t('onboarding.routine.label')} hint={t('onboarding.routine.labelHint')}>
                    <TextInput
                      id={`label-${draft.key}`}
                      value={draft.label}
                      onChange={(e) => update(draft.key, { label: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="col-span-12 sm:col-span-4">
                  <Field id={`time-${draft.key}`} label={t('onboarding.routine.addTime')}>
                    <TextInput
                      id={`time-${draft.key}`}
                      type="time"
                      value={draft.time_of_day}
                      onChange={(e) => update(draft.key, { time_of_day: e.target.value })}
                    />
                  </Field>
                </div>
              </div>
            ))}

            <SecondaryButton onClick={() => addDraft(kind)}>
              {t('onboarding.routine.addTime')}
            </SecondaryButton>
          </section>
        )
      })}

      {/* buildbook amendment 8. A PWA cannot fire a notification on a locked
          screen, so we say what actually happens rather than demonstrate a claim
          that will not hold on the day. */}
      <p className="mb-8 max-w-[72ch] border-l-[3px] border-brass bg-paperSunk px-4 py-3 text-[14px] leading-[1.6] text-ink">
        {t('onboarding.routine.kioskNote')}
      </p>

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t('common.back')}</SecondaryButton>
        <PrimaryButton onClick={() => void submit()} disabled={busy}>
          {busy ? t('common.loading') : t('common.continue')}
        </PrimaryButton>
      </div>
    </div>
  )
}
