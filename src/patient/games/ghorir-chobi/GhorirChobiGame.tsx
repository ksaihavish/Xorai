import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameContext, GameSummary } from '@/core/telemetry/types'
import {
  deriveFeatures,
  pointRate,
  startCapture,
  type CapturedStroke,
  type TraceCapture,
} from '@/core/trace/capture'
import { TraceCanvasView } from '@/core/trace/replay'
import { ReferenceFigure, traceShapeFor, type TraceShape } from '@/patient/games/ghorir-chobi/shapes'
import type { Game } from '@/patient/session/GameHost'
import { PatientButton } from '@/ui/PatientButton'
import { Prompt } from '@/ui/Prompt'

const CANVAS = 460

type Condition = 'command' | 'copy' | 'trace'

/**
 * Ghorir Chobi — "Clock & Trace". architecture.md 7.4.
 *
 * ─── THE CLOCK IS NOT SCORED. Not now, not later. ───
 *
 * There is no shape recognition in this file, no "correct", no accuracy, and
 * nothing that decides whether the drawing is a good clock. 7.4 is explicit
 * about it, and the reason is not caution — it is that automated clock scoring
 * is the part that would make this a screening instrument, which prd.md 2 says
 * we never build.
 *
 * What is stored is the trace and the timing. Two clocks a month apart,
 * replaying side by side with their pauses intact, is more persuasive to a
 * family than any number, and it is a recording rather than a judgement.
 *
 * The evidence supports the choice: longitudinal work found the associations
 * with amyloid and tau burden were driven specifically by LATENCY features, not
 * by the finished drawing. The picture is what the caregiver understands. The
 * hesitations are what carries the signal.
 *
 * Grounding worth having ready: the digital CDT has been piloted in India — the
 * CARRS cohort, 303 adults aged 50+, under four minutes to administer, and
 * 99.3% of tests produced analysable data. Education was a strong confounder,
 * which is exactly why `patients.education_level` is collected at onboarding
 * and why every comparison in this product is within-person.
 */
export function GhorirChobiGame({ ctx }: { ctx: GameContext }) {
  const { t } = useTranslation()
  const { clock, patient, level, speak, emit, emitStroke, onComplete } = ctx

  // Severity decides the task. mild/moderate draw a clock; severe traces a
  // shape, where failure is impossible and the signal is identical.
  const conditions: Condition[] =
    patient.severity === 'severe' ? ['trace'] : ['command', 'copy']
  const traceShape: TraceShape = traceShapeFor(patient.id.length)

  const [index, setIndex] = useState(0)
  const [strokes, setStrokes] = useState<CapturedStroke[]>([])
  const [live, setLive] = useState<{ x: number; y: number }[]>([])
  const [done, setDone] = useState(false)

  const canvasRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<TraceCapture | null>(null)
  const presentedAtRef = useRef(0)
  const summariesRef = useRef<{ total: number; strokes: number }[]>([])

  const condition = conditions[index]

  // ── Capture ──
  useEffect(() => {
    const surface = canvasRef.current
    if (!surface || !condition) return

    presentedAtRef.current = clock.now()
    setStrokes([])
    setLive([])

    void speak(
      condition === 'command'
        ? 'ghorir.command'
        : condition === 'copy'
          ? 'ghorir.copy'
          : 'ghorir.trace',
    )

    const capture = startCapture(surface, clock, {
      onPoint: (point) => setLive((current) => [...current, point]),
      onStrokeEnd: (stroke) => {
        setStrokes((current) => [...current, stroke])
        setLive([])

        // Written per stroke rather than batched at the end. A session that is
        // force-quit mid-drawing then still has everything drawn so far, which
        // is the whole reason the outbox exists.
        emitStroke({
          stroke_index: capture.strokes.length - 1,
          condition,
          points: stroke.points,
          stroke_start_ms: stroke.stroke_start_ms,
          stroke_end_ms: stroke.stroke_end_ms,
          air_time_before_ms: stroke.air_time_before_ms,
        })
      },
    })

    captureRef.current = capture
    return () => capture.stop()
  }, [condition, clock, speak, emitStroke])

  const finishCondition = () => {
    if (!condition) return

    const captured = captureRef.current?.strokes ?? []
    const features = deriveFeatures(captured, presentedAtRef.current)

    emit({
      game_type: 'ghorir_chobi',
      domain: 'perceptual_motor',
      trial_index: index,
      difficulty_level: level,
      stimulus_id: condition === 'trace' ? `trace:${traceShape}` : condition,
      presented_at_ms: presentedAtRef.current,
      first_touch_at_ms: captured[0]?.stroke_start_ms ?? null,
      responded_at_ms: clock.now(),
      // NULL, not false. There is no right answer to record, and writing
      // `false` here would be scoring the clock by the back door.
      correct: null,
      error_type: captured.length === 0 ? 'omission' : null,
      hints_used: 0,
      retrieval_interval_s: null,
      hint_latency_ms: null,
      touch_x: null,
      touch_y: null,
      target_radius_px: null,
      // Migration 0004. Latency features only — nothing here judges the shape.
      features: {
        ...features,
        // Recorded so the analysis can tell a sparse trace from a slow hand.
        // A device on the pointermove fallback captures fewer points for the
        // same gesture, and comparing the two without this measures the
        // browser rather than the person.
        point_rate_hz: Math.round(pointRate(captured)),
        points_captured: captured.reduce((n, s) => n + s.points.length, 0),
        raw_capture: captureRef.current?.mode === 'pointerrawupdate' ? 1 : 0,
      },
    })

    summariesRef.current.push({ total: features.total_time, strokes: features.stroke_count })

    if (index + 1 >= conditions.length) setDone(true)
    else setIndex(index + 1)
  }

  // ── Completion ──
  useEffect(() => {
    if (!done) return

    const totals = summariesRef.current.map((s) => s.total)
    const mean = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : null
    const sd =
      mean !== null && totals.length > 1
        ? Math.sqrt(totals.reduce((s, v) => s + (v - mean) ** 2, 0) / (totals.length - 1))
        : null

    const summary: GameSummary = {
      game_type: 'ghorir_chobi',
      domain: 'perceptual_motor',
      difficulty_level: level,
      trials_presented: conditions.length,
      trials_completed: summariesRef.current.length,
      mean_rt_ms: mean,
      sd_rt_ms: sd,
      cv_rt: mean !== null && sd !== null && mean > 0 ? sd / mean : null,
      // No accuracy. There is nothing to be accurate about, by design.
      accuracy_raw: null,
      accuracy_hint_adjusted: null,
      hint_rate: null,
    }
    onComplete(summary)
  }, [done, level, conditions.length, onComplete])

  if (!condition) return null

  return (
    <div className="flex flex-col items-center gap-6">
      <Prompt>
        {condition === 'command'
          ? t('ghorir.command')
          : condition === 'copy'
            ? t('ghorir.copy')
            : t('ghorir.trace')}
      </Prompt>

      <div className="flex items-start gap-8">
        {/* The copy condition shows the reference beside the canvas, not behind
            it: reproducing something is a different task from tracing it. */}
        {condition === 'copy' ? (
          <div className="relative rounded-card border-2 border-clay bg-paperSunk" style={{ width: 300, height: 300 }}>
            <ReferenceFigure shape="clock" size={300} />
          </div>
        ) : null}

        <div
          ref={canvasRef}
          // touch-action: none plus { passive: false } listeners inside
          // startCapture. Without both, a scroll gesture steals the stroke.
          className="relative rounded-card border-2 border-clay bg-paper [touch-action:none]"
          style={{ width: CANVAS, height: CANVAS }}
        >
          {condition === 'trace' ? <ReferenceFigure shape={traceShape} size={CANVAS} /> : null}
          <TraceCanvasView strokes={strokes} current={live} width={CANVAS} height={CANVAS} />
        </div>
      </div>

      {/* No timer, no countdown, no timeout. design.md 4: no timeouts that lose
          progress, ever. The patient decides when they are finished. */}
      <PatientButton onClick={finishCondition}>{t('ghorir.done')}</PatientButton>
    </div>
  )
}

export const ghorirChobiGame: Game = {
  id: 'ghorir_chobi',
  domains: ['perceptual_motor', 'executive'],
  // Severe still plays, via the trace variant.
  minSeverity: 'severe',
  Component: GhorirChobiGame,
}
