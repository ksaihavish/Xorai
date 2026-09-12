import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { Select } from '@/caregiver/auth/Form'
import type { ClockDrawing } from '@/caregiver/dashboard/queries'
import { TraceReplay } from '@/core/trace/replay'

/**
 * Two clock drawings from different months, replaying side by side at the speed
 * they were drawn, with the pauses preserved.
 *
 * ─── Why this is the centrepiece ───
 *
 * architecture.md 7.4 is blunt about it: do NOT attempt automated clock scoring.
 * Store the trace, compute the timing, and render it as a replayable animation.
 * Two clocks a month apart, replaying together, is more powerful than any number
 * — and it is entirely honest, because it is a recording rather than a verdict.
 *
 * The persuasive part is not the finished drawing. It is watching the second one
 * stall in the same place the first one did not. The longitudinal evidence says
 * the signal lives in the latency features, not the picture, and this is the one
 * place where a family can SEE that without being told a number.
 *
 * design.md 7 allows exactly one orchestrated moment in caregiver mode, and this
 * is it. Everything else on the dashboard is static.
 */
export function ClockCompare({ drawings }: { drawings: ClockDrawing[] }) {
  const { t } = useTranslation()

  const [leftId, setLeftId] = useState<string>(drawings[0]?.session_id ?? '')
  const [rightId, setRightId] = useState<string>(
    drawings[drawings.length - 1]?.session_id ?? '',
  )
  // Remounting the replay restarts it. A key that changes on demand is the
  // whole "play again" mechanism — no transport controls needed.
  const [runId, setRunId] = useState(0)

  if (drawings.length < 2) {
    return <p className="max-w-[72ch] text-[14px] text-clay">{t('dashboard.clocksEmpty')}</p>
  }

  const left = drawings.find((d) => d.session_id === leftId) ?? drawings[0]
  const right = drawings.find((d) => d.session_id === rightId) ?? drawings[drawings.length - 1]

  return (
    <div>
      <p className="mb-4 max-w-[72ch] text-[14px] text-clay">{t('dashboard.clocksHint')}</p>

      <div className="flex flex-wrap gap-8">
        <ClockPane
          label={t('dashboard.clocks')}
          drawings={drawings}
          selectedId={left?.session_id ?? ''}
          onSelect={setLeftId}
          drawing={left}
          runId={runId}
          side="left"
        />
        <ClockPane
          label={t('dashboard.clocks')}
          drawings={drawings}
          selectedId={right?.session_id ?? ''}
          onSelect={setRightId}
          drawing={right}
          runId={runId}
          side="right"
        />
      </div>

      <button
        type="button"
        onClick={() => setRunId((n) => n + 1)}
        className="mt-4 rounded-[6px] border border-rule bg-paperSunk px-4 py-2 text-[14px] font-medium text-ink"
      >
        {t('common.retry')}
      </button>
    </div>
  )
}

function ClockPane({
  drawings,
  selectedId,
  onSelect,
  drawing,
  runId,
  side,
}: {
  label: string
  drawings: ClockDrawing[]
  selectedId: string
  onSelect: (id: string) => void
  drawing: ClockDrawing | undefined
  runId: number
  side: 'left' | 'right'
}) {
  if (!drawing) return null

  return (
    <div className="flex flex-col gap-2">
      <Select
        id={`clock-${side}`}
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
      >
        {drawings.map((d) => (
          <option key={d.session_id} value={d.session_id}>
            {d.started_at ? format(parseISO(d.started_at), 'MMMM yyyy') : d.session_id.slice(0, 8)}
          </option>
        ))}
      </Select>

      <div className="rounded-[8px] border border-rule bg-paperSunk p-2">
        <TraceReplay
          // Remount on either the drawing or the replay counter changing.
          key={`${drawing.session_id}-${runId}`}
          strokes={drawing.strokes}
          width={300}
          height={300}
        />
      </div>

      <p className="tabular text-[12px] text-clay">
        {drawing.strokes.length} strokes ·{' '}
        {Math.round(
          drawing.strokes.reduce((ms, s) => ms + s.air_time_before_ms, 0) / 100,
        ) / 10}
        s paused
      </p>
    </div>
  )
}
