import { useEffect } from 'react'
import { format } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { LocalPatient } from '@/core/telemetry/types'
import { seasonFor } from '@/patient/orientation/questions'
import { SeasonMark } from '@/patient/orientation/SeasonMark'

/**
 * The reality-orientation board, always reachable from the patient home.
 *
 * This is not the orientation GAME. Nothing here is asked, nothing is scored and
 * no attempt row is written — it simply tells them. A person who is disoriented
 * at four in the afternoon needs an answer, not a quiz, and the board on the
 * wall of every day-care unit in the world exists for exactly that reason.
 *
 * 56 px type throughout, the promptLg rung: this is the one screen in the
 * product read from across a room rather than from arm's length.
 *
 * It costs almost nothing to build and it is used more than anything else here.
 */
export function OrientationCard({
  patient,
  speak,
}: {
  patient: LocalPatient
  speak: (key: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const today = new Date()
  const season = seasonFor(today)

  // Spoken on open, every time. Literacy is not assumable, and this is the
  // screen where that matters most.
  useEffect(() => {
    void speak('assist.orientation.title')
  }, [speak])

  return (
    <div className="flex w-full flex-col items-center gap-6 text-center">
      <p className="text-promptLg text-ink">{format(today, 'EEEE')}</p>
      <p className="text-promptLg text-ink">{format(today, 'd MMMM yyyy')}</p>

      <div className="flex flex-col items-center gap-2 text-ink">
        <SeasonMark season={season} />
        <p className="text-promptLg">{t(`orientation.seasons.${season}`)}</p>
      </div>

      {/* Skipped entirely when home_place is unset, rather than guessed — the
          same rule the orientation game follows. */}
      {patient.home_place ? (
        <p className="text-promptLg text-ink">
          {t('assist.orientation.at', { place: patient.home_place })}
        </p>
      ) : null}
    </div>
  )
}
