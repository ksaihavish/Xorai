import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CaregiverAppShell, CaregiverFlagCard, CaregiverSection } from '@/caregiver/AppShell'
import { Field, FormError, PrimaryButton, SecondaryButton, Select, TextInput } from '@/caregiver/auth/Form'
import { ClockCompare } from '@/caregiver/dashboard/ClockCompare'
import { ComplianceCalendar } from '@/caregiver/dashboard/ComplianceCalendar'
import { SyncStatus } from '@/caregiver/dashboard/SyncStatus'
import { TrendChart } from '@/caregiver/dashboard/TrendChart'
import {
  acknowledgeFlag,
  fetchBaselines,
  fetchCalendar,
  fetchClockDrawings,
  fetchDaily,
  fetchFlags,
  fetchRetrieval,
  formatInterval,
  logCareEvent,
  runRollup,
  type Baseline,
  type CalendarDay,
  type ClockDrawing,
  type DailyScore,
  type DomainKey,
  type FlagRow,
  type RetrievalRow,
} from '@/caregiver/dashboard/queries'
import type { PatientRow } from '@/caregiver/onboarding/schema'

const BASELINE_NEEDED = 13

/**
 * The caregiver dashboard. design.md 2.1 and 4.
 *
 * Sections are divided by 1 px hairlines, NOT by cards. The SaaS card grid is
 * the default look and this is meant to read as a clinical instrument. The only
 * carded element in the whole mode is a flag, because a flag genuinely is a
 * discrete object that gets acknowledged and dismissed.
 *
 * ─── The scope boundary, enforced in the UI ───
 *
 * prd.md 2 draws the line and this screen stays behind it. Nothing here tells a
 * caregiver their relative is getting worse, names a severity band, or returns a
 * result. It shows a change against that person's own earlier results and hands
 * the reading to a doctor. The flag copy is fixed word for word in i18n (`flag.body`) for exactly
 * that reason — it is the sentence that was argued over, and paraphrasing it is
 * how "worth mentioning" turns into "something is wrong".
 */
export function Dashboard({ patient }: { patient: PatientRow }) {
  const { t } = useTranslation()

  const [daily, setDaily] = useState<DailyScore[]>([])
  const [baselines, setBaselines] = useState<Baseline[]>([])
  const [flags, setFlags] = useState<FlagRow[]>([])
  const [calendar, setCalendar] = useState<CalendarDay[]>([])
  const [retrieval, setRetrieval] = useState<RetrievalRow[]>([])
  const [clocks, setClocks] = useState<ClockDrawing[]>([])
  const [completedSessions, setCompletedSessions] = useState(0)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [logging, setLogging] = useState(false)

  const load = useCallback(async () => {
    // The rollup also runs on cron. Invoking it here is what makes the
    // dashboard reflect last night without waiting for the next one; it is
    // idempotent, so opening the page twice changes nothing.
    await runRollup(patient.id)

    const [d, b, f, c, r, k] = await Promise.all([
      fetchDaily(patient.id),
      fetchBaselines(patient.id),
      fetchFlags(patient.id),
      fetchCalendar(patient.id),
      fetchRetrieval(patient.id),
      fetchClockDrawings(patient.id),
    ])

    if (!d.ok) setErrorKey(d.messageKey)
    if (d.ok) setDaily(d.value)
    if (b.ok) setBaselines(b.value)
    if (f.ok) setFlags(f.value)
    if (c.ok) {
      setCalendar(c.value)
      setCompletedSessions(c.value.filter((day) => day.played).length)
    }
    if (r.ok) setRetrieval(r.value)
    if (k.ok) setClocks(k.value)
    setLoading(false)
  }, [patient.id])

  useEffect(() => {
    void load()
  }, [load])

  const collecting = patient.baseline_status !== 'established'
  const domains = [...new Set(daily.map((row) => row.domain))] as DomainKey[]
  const visibleFlags = flags.filter((flag) => !flag.acknowledged_at)

  return (
    <CaregiverAppShell title={patient.display_name} actions={<SyncStatus />}>
      {errorKey ? (
        <CaregiverSection heading={t('dashboard.title')} divider={false}>
          <FormError>{t(errorKey)}</FormError>
        </CaregiverSection>
      ) : null}

      {/**
       * Until the baseline is established, NOTHING is analysed and the dashboard
       * says so plainly. architecture.md 8: sessions 4-13 form the reference and
       * the first three are excluded because the patient is learning the
       * interface rather than being measured.
       *
       * Framed as "getting to know" rather than "not enough data", because the
       * within-person design is a deliberate choice and not a shortfall.
       */}
      {collecting ? (
        <CaregiverSection
          heading={t('dashboard.collecting', { name: patient.display_name })}
          divider={false}
        >
          <p className="max-w-[72ch] text-[15px] leading-[1.6] text-ink">
            {t('dashboard.collectingBody', {
              name: patient.display_name,
              done: completedSessions,
              needed: BASELINE_NEEDED,
            })}
          </p>
          <div className="mt-6">
            <ComplianceCalendar days={calendar} />
          </div>
        </CaregiverSection>
      ) : (
        <>
          <CaregiverSection heading={t('dashboard.flags')} divider={false}>
            {visibleFlags.length === 0 ? (
              <p className="text-[14px] text-clay">{t('dashboard.noFlags')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {visibleFlags.map((flag) => (
                  <FlagPanel
                    key={flag.id}
                    flag={flag}
                    patient={patient}
                    onDone={() => void load()}
                    logging={logging}
                    setLogging={setLogging}
                  />
                ))}
              </div>
            )}
          </CaregiverSection>

          <CaregiverSection heading={t('dashboard.trends')}>
            {loading ? (
              <p className="text-[14px] text-clay">{t('common.loading')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {domains.map((domain) => (
                  <TrendChart
                    key={domain}
                    domain={domain}
                    daily={daily}
                    baseline={baselines.find((b) => b.domain === domain)}
                    patientName={patient.display_name}
                  />
                ))}
              </div>
            )}
          </CaregiverSection>

          <CaregiverSection heading={t('dashboard.clocks')}>
            <ClockCompare drawings={clocks} />
          </CaregiverSection>

          <CaregiverSection heading={t('dashboard.calendar')} hint={t('dashboard.calendarHint')}>
            <ComplianceCalendar days={calendar} />
          </CaregiverSection>

          <CaregiverSection heading={t('dashboard.retrieval')}>
            <RetrievalList rows={retrieval} />
          </CaregiverSection>
        </>
      )}

      {/**
       * prd.md 2 requires this verbatim, and requires it VISIBLE — not folded
       * into an accordion someone has to open. It is the sentence that keeps
       * this product on the right side of the line it draws for itself.
       */}
      <CaregiverSection heading="">
        <p className="max-w-[72ch] text-[13px] leading-[1.6] text-clay">
          {t('legal.disclaimer')}
        </p>
      </CaregiverSection>
    </CaregiverAppShell>
  )
}

/**
 * One flag, carded — the only carded thing in caregiver mode.
 *
 * The body copy comes from `flag.body` unchanged, with only the domain name
 * substituted. architecture.md 8.2 gives that sentence word for word and says
 * not to paraphrase it.
 */
function FlagPanel({
  flag,
  patient,
  onDone,
  logging,
  setLogging,
}: {
  flag: FlagRow
  patient: PatientRow
  onDone: () => void
  logging: boolean
  setLogging: (next: boolean) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'illness' | 'medication_change' | 'hospital' | 'travel' | 'other'>('illness')
  const [startedOn, setStartedOn] = useState(flag.window_start)
  const [note, setNote] = useState('')

  const body =
    flag.level === 'effort'
      ? t('flag.effortBody', { name: patient.display_name })
      : t('flag.body', { domain: t(`dashboard.domains.${flag.domain}`) })

  const save = async () => {
    setLogging(true)
    await logCareEvent(patient.id, type, startedOn, note.trim() || null)
    setLogging(false)
    setOpen(false)
    onDone()
  }

  return (
    <div>
      <CaregiverFlagCard
        level={flag.level}
        meta={`${flag.window_start} – ${flag.window_end}`}
        heading={t(`dashboard.domains.${flag.domain}`)}
        body={
          flag.suppressed_reason
            ? `${body} ${t(`flag.suppressed.${flag.suppressed_reason}`)}`
            : body
        }
        actions={
          <>
            <button
              type="button"
              onClick={() => void acknowledgeFlag(flag.id).then(onDone)}
              className="rounded-[6px] border border-rule px-3 py-2 text-[14px] font-medium"
            >
              {t('dashboard.acknowledge')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="rounded-[6px] border border-rule px-3 py-2 text-[14px] font-medium"
            >
              {t('dashboard.logEvent')}
            </button>
          </>
        }
      />

      {open ? (
        <div className="mt-3 max-w-[520px] rounded-[8px] border border-rule bg-paperSunk p-5">
          <h4 className="mb-1 text-[15px] font-semibold">{t('dashboard.logEventTitle')}</h4>
          <p className="mb-4 text-[13px] leading-[1.6] text-clay">{t('dashboard.logEventBody')}</p>

          <Field id={`care-type-${flag.id}`} label={t('dashboard.logEventTitle')}>
            <Select
              id={`care-type-${flag.id}`}
              value={type}
              onChange={(e) => setType(e.target.value as typeof type)}
            >
              {(['illness', 'medication_change', 'hospital', 'travel', 'other'] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`dashboard.careTypes.${k}`)}
                </option>
              ))}
            </Select>
          </Field>

          <Field id={`care-date-${flag.id}`} label={t('dashboard.logEventSave')}>
            <TextInput
              id={`care-date-${flag.id}`}
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </Field>

          <Field id={`care-note-${flag.id}`} label={t('common.optional')}>
            <TextInput
              id={`care-note-${flag.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          <div className="flex gap-3">
            <SecondaryButton onClick={() => setOpen(false)}>{t('common.cancel')}</SecondaryButton>
            <PrimaryButton onClick={() => void save()} disabled={logging}>
              {logging ? t('common.loading') : t('dashboard.logEventSave')}
            </PrimaryButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Sustained retrieval interval, as a sentence rather than a number.
 *
 * "Holds Priya's name for 8 minutes, was 2 minutes in July" is a real
 * longitudinal metric that a family understands without anything being
 * explained to them. Printing "480s / 120s" would be the same data and would
 * mean nothing to the person reading it.
 */
function RetrievalList({ rows }: { rows: RetrievalRow[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return null

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.family_member_id} className="max-w-[72ch] text-[15px] text-ink">
          {row.longest_interval_s > row.current_interval_s
            ? t('dashboard.retrievalLine', {
                name: row.display_name,
                current: formatInterval(row.current_interval_s),
                previous: formatInterval(row.longest_interval_s),
              })
            : t('dashboard.retrievalFirst', {
                name: row.display_name,
                current: formatInterval(row.current_interval_s),
              })}
        </li>
      ))}
    </ul>
  )
}
