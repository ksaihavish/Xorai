import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CaregiverAppShell, CaregiverSection } from '@/caregiver/AppShell'
import { useCaregiverId } from '@/caregiver/auth/AuthProvider'
import {
  Checkbox,
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextInput,
} from '@/caregiver/auth/Form'
import {
  BUCKETS,
  listReminders,
  loadDraftPatient,
  replaceReminders,
  uploadObject,
  type ReminderInput,
} from '@/caregiver/onboarding/api'
import type { PatientRow, ReminderKind } from '@/caregiver/onboarding/schema'
import { VoiceNoteRecorder } from '@/caregiver/onboarding/VoiceNoteRecorder'

type Draft = ReminderInput & { key: string; active: boolean; audio_path: string | null }

const KINDS: ReminderKind[] = ['medication', 'meal', 'routine']

/**
 * Caregiver-side reminder CRUD, with a voice note per reminder.
 *
 * The recorder is the point of this screen, not an extra. design.md 9: a family
 * voice note takes priority over generated speech everywhere it exists, and a
 * grandchild saying "Aita, it's time for your medicine" outperforms anything we
 * can synthesise both clinically and emotionally. Every other field here is
 * bookkeeping; that one changes whether the reminder works.
 */
export function RemindersSettings() {
  const { t } = useTranslation()
  const caregiverId = useCaregiverId()

  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [recordings, setRecordings] = useState<Record<string, Blob>>({})
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!caregiverId) return
    let active = true

    void loadDraftPatient(caregiverId).then(async (result) => {
      if (!active || !result.ok || !result.value) return
      setPatient(result.value)

      const rows = await listReminders(result.value.id)
      if (!active || !rows.ok) return
      setDrafts(
        rows.value.map((row) => ({
          key: row.id,
          kind: row.kind,
          label: row.label,
          time_of_day: row.time_of_day.slice(0, 5),
          days_of_week: row.days_of_week,
          active: row.active,
          audio_path: row.audio_path,
        })),
      )
    })

    return () => {
      active = false
    }
  }, [caregiverId])

  const add = () => {
    setDrafts((current) => [
      ...current,
      {
        key: `new-${current.length}-${String(Math.random()).slice(2, 8)}`,
        kind: 'medication',
        label: '',
        time_of_day: '09:00',
        days_of_week: null,
        active: true,
        audio_path: null,
      },
    ])
  }

  const update = (key: string, patch: Partial<Draft>) => {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  const save = async () => {
    if (!patient) return
    setBusy(true)
    setErrorKey(null)
    setSaved(false)

    // Recordings upload first so a failure there does not leave a reminder row
    // pointing at a file that was never stored.
    const withAudio: ReminderInput[] = []
    for (const draft of drafts) {
      if (!draft.label.trim()) continue

      let audioPath = draft.audio_path
      const blob = recordings[draft.key]
      if (blob) {
        const upload = await uploadObject(BUCKETS.voiceNotes, patient.id, blob, 'reminder.webm')
        if (upload.ok) audioPath = upload.value
      }

      withAudio.push({
        kind: draft.kind,
        label: draft.label.trim(),
        time_of_day: draft.time_of_day,
        days_of_week: draft.days_of_week,
        audio_path: audioPath,
        active: draft.active,
      })
    }

    const result = await replaceReminders(patient.id, withAudio)
    setBusy(false)
    if (result.ok) setSaved(true)
    else setErrorKey(result.messageKey)
  }

  return (
    <CaregiverAppShell title={t('settings.reminders.heading')}>
      <CaregiverSection heading={t('settings.reminders.heading')} divider={false}>
        <p className="mb-4 max-w-[72ch] text-[15px] leading-[1.6] text-ink">
          {t('settings.reminders.intro')}
        </p>

        {/* buildbook amendment 8. Said plainly rather than demonstrated, because
            a PWA cannot fire on a locked screen and claiming otherwise would
            fail on the day it mattered. */}
        <p className="mb-8 max-w-[72ch] border-l-[3px] border-brass bg-paperSunk px-4 py-3 text-[14px] leading-[1.6] text-ink">
          {t('settings.reminders.kioskNote')}
        </p>

        {errorKey ? <FormError>{t(errorKey)}</FormError> : null}
        {saved ? <p className="mb-4 text-[14px] text-tea">{t('common.save')}</p> : null}

        {drafts.length === 0 ? (
          <p className="mb-6 text-[14px] text-clay">{t('settings.reminders.empty')}</p>
        ) : null}

        {drafts.map((draft) => (
          <div key={draft.key} className="mb-6 border-t border-rule pt-6">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-12 sm:col-span-5">
                <Field id={`label-${draft.key}`} label={t('settings.reminders.label')}>
                  <TextInput
                    id={`label-${draft.key}`}
                    value={draft.label}
                    onChange={(e) => update(draft.key, { label: e.target.value })}
                  />
                </Field>
              </div>

              <div className="col-span-6 sm:col-span-3">
                <Field id={`time-${draft.key}`} label={t('settings.reminders.time')}>
                  <TextInput
                    id={`time-${draft.key}`}
                    type="time"
                    value={draft.time_of_day}
                    onChange={(e) => update(draft.key, { time_of_day: e.target.value })}
                  />
                </Field>
              </div>

              <div className="col-span-6 sm:col-span-4">
                <Field id={`kind-${draft.key}`} label={t('settings.reminders.kind')}>
                  <Select
                    id={`kind-${draft.key}`}
                    value={draft.kind}
                    onChange={(e) => update(draft.key, { kind: e.target.value as ReminderKind })}
                  >
                    {KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`settings.reminders.kinds.${kind}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <Field
              id={`voice-${draft.key}`}
              label={t('settings.reminders.voiceNote')}
              hint={t('settings.reminders.voiceNoteHint')}
            >
              <VoiceNoteRecorder
                onRecorded={(blob) =>
                  setRecordings((current) =>
                    blob ? { ...current, [draft.key]: blob } : current,
                  )
                }
                disabled={busy}
              />
            </Field>

            <div className="flex items-center justify-between">
              <Checkbox
                id={`active-${draft.key}`}
                label={t('settings.reminders.active')}
                checked={draft.active}
                onChange={(next) => update(draft.key, { active: next })}
              />
              <SecondaryButton
                onClick={() => setDrafts((c) => c.filter((d) => d.key !== draft.key))}
              >
                {t('common.remove')}
              </SecondaryButton>
            </div>
          </div>
        ))}

        <div className="flex gap-3 border-t border-rule pt-6">
          <SecondaryButton onClick={add}>{t('settings.reminders.add')}</SecondaryButton>
          <PrimaryButton onClick={() => void save()} disabled={busy || !patient}>
            {busy ? t('common.loading') : t('common.save')}
          </PrimaryButton>
        </div>
      </CaregiverSection>
    </CaregiverAppShell>
  )
}
