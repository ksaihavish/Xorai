import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  LocalFamilyMember,
  LocalMusicTrack,
  LocalPatient,
  LocalReminder,
} from '@/core/telemetry/types'
import { ContactsGrid, SosButton } from '@/patient/assist/ContactsAndSos'
import { MusicPlayer } from '@/patient/assist/MusicPlayer'
import { OrientationCard } from '@/patient/assist/OrientationCard'
import { ReminderTakeover } from '@/patient/assist/ReminderTakeover'
import { catchUp, msUntil, nextDue, notify, type DueReminder } from '@/patient/assist/reminders'
import { PatientShell } from '@/patient/shell/PatientShell'
import { PatientButton } from '@/ui/PatientButton'
import { Prompt } from '@/ui/Prompt'

type View = 'home' | 'people' | 'music' | 'today'

/**
 * The patient home, and the assistance layer around it.
 *
 * This is half of what the problem statement asks for and the half most teams
 * omit — and it is the cheaper half. A person using this product uses the
 * reminders and the contact cards every day; they use the games for fifteen
 * minutes.
 *
 * Everything here works fully offline and nothing here shows the patient a
 * number. Four destinations, each one tap away, each a single big target.
 */
export function AssistHome({
  patient,
  family,
  tracks,
  reminders,
  speak,
  onStartSession,
  onExit,
}: {
  patient: LocalPatient
  family: LocalFamilyMember[]
  tracks: LocalMusicTrack[]
  reminders: LocalReminder[]
  speak: (key: string) => Promise<void>
  onStartSession: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  const [view, setView] = useState<View>('home')
  const [due, setDue] = useState<DueReminder | null>(null)

  /**
   * Catch-up on open, then an armed timer for the next one.
   *
   * Catch-up is what makes reminders worth having in a PWA at all: a reminder
   * whose time passed while the app was closed still surfaces, once, with its
   * real due time. Without it, closing the tablet means the medicine reminder
   * silently never happened.
   */
  const check = useCallback(async () => {
    const missed = await catchUp(reminders, new Date())
    if (missed.length > 0) setDue(missed[missed.length - 1] ?? null)
  }, [reminders])

  useEffect(() => {
    void check()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [check])

  // Arm a timer for the next occurrence while the app stays open.
  useEffect(() => {
    if (due) return
    const next = nextDue(reminders, new Date())
    if (!next) return

    const delay = msUntil(next.dueAt)
    // setTimeout saturates past ~24.8 days; anything beyond a day is re-armed
    // by the visibilitychange check instead.
    if (delay <= 0 || delay > 24 * 3600_000) return

    const timer = window.setTimeout(() => {
      setDue(next)
      notify(next.reminder)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [reminders, due])

  return (
    <PatientShell progress={0} onExit={onExit}>
      {due ? (
        <ReminderTakeover due={due} speak={speak} onDone={() => setDue(null)} />
      ) : null}

      {view === 'home' ? (
        <div className="flex w-full flex-col items-center gap-10">
          <Prompt>{t('assist.home.greeting', { name: patient.display_name })}</Prompt>

          {/* design.md 4: primary action upper and right, never bottom. The
              research on this population contradicts mobile convention, and we
              follow the research. */}
          <div className="flex flex-wrap items-center justify-center gap-6">
            <PatientButton onClick={onStartSession}>{t('assist.home.play')}</PatientButton>
            <PatientButton onClick={() => setView('today')}>
              {t('assist.home.today')}
            </PatientButton>
            <PatientButton onClick={() => setView('people')}>
              {t('assist.home.people')}
            </PatientButton>
            <PatientButton onClick={() => setView('music')}>
              {t('assist.home.music')}
            </PatientButton>
          </div>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-8">
          {view === 'people' ? <ContactsGrid family={family} /> : null}
          {view === 'music' ? <MusicPlayer tracks={tracks} /> : null}
          {view === 'today' ? <OrientationCard patient={patient} speak={speak} /> : null}

          {/* Navigation is identical on every screen: one persistent Home, in
              the same place, always (design.md 4). */}
          <PatientButton onClick={() => setView('home')}>
            {t('assist.home.greeting', { name: patient.display_name })}
          </PatientButton>
        </div>
      )}

      {/* Persistent, on every assist screen. The one red thing in the product. */}
      <SosButton family={family} />
    </PatientShell>
  )
}
