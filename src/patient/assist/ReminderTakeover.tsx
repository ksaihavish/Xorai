import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { speak as speakKey } from '@/core/audio/speak'
import type { LocalReminder } from '@/core/telemetry/types'
import { acknowledge, type DueReminder } from '@/patient/assist/reminders'
import { PatientButton } from '@/ui/PatientButton'
import { Prompt } from '@/ui/Prompt'

/**
 * The reminder, as a full-screen takeover.
 *
 * It covers everything, because a reminder that shares a screen with anything
 * else is a reminder that can be missed. One instruction, one action, nothing
 * to decide.
 *
 * ─── No snooze ───
 *
 * There is exactly one button. A snooze button is a decision, and decisions are
 * expensive here: "remind me later" asks the person to hold an intention, which
 * is precisely the faculty this product supports rather than taxes. Done, or the
 * reminder stays.
 */
export function ReminderTakeover({
  due,
  onDone,
  speak,
}: {
  due: DueReminder
  onDone: () => void
  speak: (key: string) => Promise<void>
}) {
  const { t } = useTranslation()

  useEffect(() => {
    void play(due.reminder)
  }, [due, speak])

  const done = async () => {
    await acknowledge(due.reminder, due.dueAt)
    onDone()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 bg-paper px-10 [touch-action:manipulation]"
    >
      <KindMark kind={due.reminder.kind} />

      {/* The label the caregiver wrote, in their own words, at prompt size. */}
      <Prompt>{due.reminder.label}</Prompt>

      <div className="flex items-center gap-6">
        <PatientButton onClick={() => void done()}>{t('assist.reminder.done')}</PatientButton>

        {/* Icon plus word, as every patient-mode control must be. */}
        <PatientButton onClick={() => void play(due.reminder)}>
          {t('assist.reminder.replay')}
        </PatientButton>
      </div>
    </div>
  )
}

/**
 * The caregiver's own recording first, ALWAYS, falling back to generated speech.
 *
 * design.md 9: a family voice note takes priority over synthesised speech
 * everywhere it exists. A grandchild saying "Aita, it's time for your medicine"
 * is better clinically and better emotionally than anything we can generate, and
 * it removes the last runtime TTS dependency.
 */
async function play(reminder: LocalReminder): Promise<void> {
  // speakKey applies the priority itself: a caregiver recording for THIS
  // reminder wins over the generated file, always (design.md 9). Passing the
  // voice note through rather than branching here keeps that rule in one place.
  await speakKey(`reminder.${reminder.kind}`, { voiceNoteUrl: reminder.audio_url })
}

/**
 * A drawn mark rather than a word alone, so the kind of reminder is legible
 * without reading. Icon AND word — the word is the label above.
 */
function KindMark({ kind }: { kind: LocalReminder['kind'] }) {
  return (
    <svg
      width="120"
      height="120"
      viewBox="0 0 120 120"
      fill="none"
      stroke="var(--madder)"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'medication' ? (
        <>
          <rect x="26" y="44" width="68" height="32" rx="16" />
          <path d="M60 44v32" />
        </>
      ) : kind === 'meal' ? (
        <>
          <circle cx="60" cy="60" r="30" />
          <path d="M30 44h60" />
          <path d="M22 34v20M98 34v20" />
        </>
      ) : (
        <>
          <circle cx="60" cy="60" r="34" />
          <path d="M60 38v24l16 10" />
        </>
      )}
    </svg>
  )
}
