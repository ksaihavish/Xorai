import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import type { CalendarDay } from '@/caregiver/dashboard/queries'

/**
 * Played or missed, one square per day.
 *
 * The days come from `v_session_calendar`, which builds them with
 * generate_series and LEFT JOINs the sessions on. That matters: a calendar
 * assembled from the sessions a patient actually played can only render days
 * they played, so the missed days — the thing a caregiver most needs to see —
 * would silently not exist.
 *
 * Two states only, and neither is a judgement. A gap is a gap; it is not
 * "non-adherence" and it is certainly not a score. design.md 8 is the governing
 * idea here as much as on the patient side: a missed day takes nothing away.
 */
export function ComplianceCalendar({ days }: { days: CalendarDay[] }) {
  const { t } = useTranslation()
  if (days.length === 0) return null

  // Pad the front so columns line up as weeks, Monday first.
  const first = days[0]
  const lead = first ? (parseISO(first.day).getDay() + 6) % 7 : 0

  return (
    <div>
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: 'repeat(7, 16px)', gridAutoRows: '16px' }}
        role="img"
        aria-label={t('dashboard.calendar')}
      >
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}

        {days.map((day) => (
          <span
            key={day.day}
            title={`${format(parseISO(day.day), 'd MMM')} — ${
              day.played ? t('dashboard.played') : t('dashboard.missed')
            }`}
            className="rounded-[3px]"
            style={{
              // Played is tea, the affirmation colour. Missed is the plain
              // recessed surface — absence, not alarm. Never red.
              backgroundColor: day.played ? 'var(--tea)' : 'var(--paper-sunk)',
              border: day.played ? 'none' : '1px solid var(--rule)',
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[12px] text-clay">
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[12px] w-[12px] rounded-[3px]"
            style={{ backgroundColor: 'var(--tea)' }}
          />
          {t('dashboard.played')}
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-[12px] w-[12px] rounded-[3px]"
            style={{ backgroundColor: 'var(--paper-sunk)', border: '1px solid var(--rule)' }}
          />
          {t('dashboard.missed')}
        </span>
        <span className="tabular">
          {days.filter((d) => d.played).length} / {days.length}
        </span>
      </div>
    </div>
  )
}
