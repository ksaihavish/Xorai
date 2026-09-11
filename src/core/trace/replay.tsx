import { useEffect, useRef, useState } from 'react'
import type { CapturedStroke } from '@/core/trace/capture'

/**
 * Stroke replay. architecture.md 7.4.
 *
 * The stroke path drawing itself at recorded speed, WITH THE PAUSES PRESERVED.
 * The pauses are the whole point: the longitudinal evidence says the signal
 * lives in the hesitations, not in the finished drawing. A replay that skipped
 * the gaps would animate away the only part that means anything.
 *
 * Two clocks a month apart, replaying side by side, is a more persuasive thing
 * to put in front of a family than any number — and it is entirely honest,
 * because it is a recording rather than a judgement.
 *
 * Shared: the caregiver dashboard reuses this component unchanged.
 */

export type ReplayProps = {
  strokes: CapturedStroke[]
  width: number
  height: number
  /** 1 = recorded speed. The dashboard offers 2x for a long drawing. */
  speed?: number
  loop?: boolean
  strokeColor?: string
}

export function TraceReplay({
  strokes,
  width,
  height,
  speed = 1,
  loop = false,
  strokeColor = 'var(--ink)',
}: ReplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    context.scale(dpr, dpr)

    const paint = (upTo: number) => {
      context.clearRect(0, 0, width, height)
      context.strokeStyle = strokeColor
      context.lineWidth = 6
      context.lineCap = 'round'
      context.lineJoin = 'round'

      for (const stroke of strokes) {
        const visible = stroke.points.filter((p) => p.t <= upTo)
        if (visible.length < 2) continue
        context.beginPath()
        const start = visible[0]
        if (!start) continue
        context.moveTo(start.x, start.y)
        for (let i = 1; i < visible.length; i++) {
          const point = visible[i]
          if (point) context.lineTo(point.x, point.y)
        }
        context.stroke()
      }
    }

    const first = strokes[0]
    const last = strokes[strokes.length - 1]
    if (!first || !last) return

    /**
     * design.md 7: prefers-reduced-motion disables the replay and shows the
     * final trace with the pause durations annotated instead. The information
     * is not removed for a reader who cannot take the animation — it changes
     * form, from time to text.
     */
    if (reducedMotion) {
      paint(Number.POSITIVE_INFINITY)
      return
    }

    let raf = 0
    let startedAt = 0

    const step = (now: number) => {
      if (startedAt === 0) startedAt = now
      const elapsed = (now - startedAt) * speed
      const upTo = first.stroke_start_ms + elapsed

      paint(upTo)

      if (upTo < last.stroke_end_ms) {
        raf = requestAnimationFrame(step)
      } else if (loop) {
        startedAt = 0
        raf = requestAnimationFrame(step)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [strokes, width, height, speed, loop, strokeColor, reducedMotion])

  return (
    <div className="relative" style={{ width, height }}>
      <canvas ref={canvasRef} style={{ width, height }} />
      {reducedMotion ? <PauseAnnotations strokes={strokes} /> : null}
    </div>
  )
}

/**
 * The reduced-motion substitute: every pause over a third of a second, listed
 * with where it fell. Longer than that and it is a hesitation rather than the
 * ordinary time it takes to move a finger.
 */
function PauseAnnotations({ strokes }: { strokes: CapturedStroke[] }) {
  const pauses = strokes
    .map((stroke, index) => ({ index, ms: stroke.air_time_before_ms }))
    .filter((entry) => entry.index > 0 && entry.ms >= 300)

  if (pauses.length === 0) return null

  return (
    <ul className="tabular absolute right-0 top-0 space-y-1 text-[12px] text-clay">
      {pauses.map((pause) => (
        <li key={pause.index}>
          {`before stroke ${pause.index + 1}: ${(pause.ms / 1000).toFixed(1)}s`}
        </li>
      ))}
    </ul>
  )
}

/** Live view of a drawing in progress. No replay, no animation — just the ink. */
export function TraceCanvasView({
  strokes,
  current,
  width,
  height,
}: {
  strokes: CapturedStroke[]
  current: { x: number; y: number }[]
  width: number
  height: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    const dpr = window.devicePixelRatio || 1
    if (canvas.width !== width * dpr) {
      canvas.width = width * dpr
      canvas.height = height * dpr
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    context.clearRect(0, 0, width, height)

    // design.md Part II 4: the drawn stroke renders in ink at 6 px.
    context.strokeStyle = 'var(--ink)'
    context.strokeStyle = getComputedStyle(canvas).getPropertyValue('--ink') || '#2A211A'
    context.lineWidth = 6
    context.lineCap = 'round'
    context.lineJoin = 'round'

    const paths = [...strokes.map((s) => s.points), current]
    for (const path of paths) {
      if (path.length < 2) continue
      context.beginPath()
      const start = path[0]
      if (!start) continue
      context.moveTo(start.x, start.y)
      for (let i = 1; i < path.length; i++) {
        const point = path[i]
        if (point) context.lineTo(point.x, point.y)
      }
      context.stroke()
    }
  }, [strokes, current, width, height])

  return <canvas ref={canvasRef} style={{ width, height }} className="absolute inset-0" />
}
