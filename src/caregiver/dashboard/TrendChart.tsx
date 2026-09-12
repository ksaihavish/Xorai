import { useTranslation } from 'react-i18next'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import type { Baseline, DailyScore, DomainKey } from '@/caregiver/dashboard/queries'

/**
 * One domain's trend against that person's own baseline band.
 *
 * ─── What the band is, and what it is not ───
 *
 * The shaded region is THIS PATIENT'S usual range — baseline mean ± 1 SD, taken
 * from their own sessions 4-13. It is not a population norm, because there is no
 * population to norm against: no published norms exist for these games in these
 * languages, and Indian digital-clock data shows strong education and age
 * effects. Every comparison here is within-person by design.
 *
 * design.md 2.1 fixes the palette: series in tea, the baseline band in
 * brass-soft at 40%. Never a traffic light — this product does not say "good" or
 * "bad" about a person, and a green-to-red axis says exactly that.
 */
export function TrendChart({
  domain,
  daily,
  baseline,
  patientName,
}: {
  domain: DomainKey
  daily: DailyScore[]
  baseline: Baseline | undefined
  patientName: string
}) {
  const { t } = useTranslation()

  const series = daily
    .filter((row) => row.domain === domain)
    .map((row) => ({ day: row.day, value: Math.round(row.accuracy * 100) }))

  if (series.length === 0) return null

  const bandLow = baseline ? Math.round((baseline.baseline_mean - baseline.baseline_sd) * 100) : null
  const bandHigh = baseline ? Math.round((baseline.baseline_mean + baseline.baseline_sd) * 100) : null

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-3">
        <h3 className="text-[16px] font-semibold text-ink">
          {t(`dashboard.domains.${domain}`)}
        </h3>
        <span className="text-[13px] text-clay">
          {t('dashboard.trendsHint', { name: patientName })}
        </span>
      </div>

      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />

            {/* The personal baseline band. Drawn first so the line sits on top. */}
            {bandLow !== null && bandHigh !== null ? (
              <ReferenceArea
                y1={bandLow}
                y2={bandHigh}
                fill="var(--brass-soft)"
                fillOpacity={0.4}
                stroke="none"
              />
            ) : null}

            <XAxis
              dataKey="day"
              tickFormatter={(value: string) => format(parseISO(value), 'd MMM')}
              tick={{ fontSize: 12, fill: 'var(--clay)' }}
              // Tabular numerals on every axis. Misaligned digits in a trend
              // table is the fastest way to look amateur (design.md 3).
              className="tabular"
              stroke="var(--rule)"
              minTickGap={28}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--clay)' }}
              className="tabular"
              stroke="var(--rule)"
              width={44}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--paper-sunk)',
                border: '1px solid var(--rule)',
                borderRadius: 6,
                fontSize: 13,
              }}
              labelFormatter={(label) =>
                typeof label === 'string' ? format(parseISO(label), 'd MMMM') : ''
              }
              formatter={(value) => [`${String(value)}%`, t(`dashboard.domains.${domain}`)]}
            />

            {/* First in the chart series order: tea. design.md 2.1. */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--tea)"
              strokeWidth={2.5}
              dot={false}
              // design.md 7: caregiver mode is static apart from the clock
              // replay. The chart does not animate itself in.
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {baseline ? (
        <p className="tabular mt-1 text-[12px] text-clay">
          {t('dashboard.baselineBand')}: {bandLow}–{bandHigh}%
        </p>
      ) : null}
    </div>
  )
}
