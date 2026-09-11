import type { SessionClock } from '@/core/telemetry/types'

/**
 * Stroke capture. architecture.md 6, and it is the most silently-breakable
 * thing in the product.
 *
 * ─── The ladder, and why it is not "use both" ───
 *
 *   1. `pointerrawupdate` ALONE where it exists (Chromium, secure context).
 *      It is ALREADY the un-coalesced stream — every sample the digitiser
 *      produced, delivered as its own event.
 *   2. Otherwise `pointermove` WITH `getCoalescedEvents()`.
 *
 * Never both on the same event. `getCoalescedEvents()` called on a
 * `pointerrawupdate` returns only that single event, so combining them captures
 * FEWER points than the plain fallback would have — and nothing reports it. The
 * trace still looks like a clock. It just has five times too few points and the
 * fine timing, which is the entire clinical signal, is gone.
 *
 * That is why this file picks one branch at subscribe time and records which
 * one it took.
 *
 * ─── Why the timing matters more than the drawing ───
 *
 * Longitudinal work on the digital clock-drawing test found the associations
 * with amyloid and tau burden were driven specifically by LATENCY features —
 * the hesitations — not by the finished drawing. The picture is the part a
 * caregiver understands; the pauses are the part that carries the signal.
 */

export type TracePoint = { x: number; y: number; t: number }

export type CapturedStroke = {
  points: TracePoint[]
  stroke_start_ms: number
  stroke_end_ms: number
  /** Gap since the previous stroke ENDED. The pen-up time, which is the pause. */
  air_time_before_ms: number
}

export type CaptureMode = 'pointerrawupdate' | 'pointermove-coalesced'

export type TraceCapture = {
  mode: CaptureMode
  strokes: CapturedStroke[]
  /** Live points of the stroke in progress, for rendering. */
  current: TracePoint[]
  stop: () => void
}

export type CaptureHandlers = {
  onStrokeStart?: () => void
  onPoint?: (point: TracePoint) => void
  onStrokeEnd?: (stroke: CapturedStroke) => void
}

/**
 * `pointerrawupdate` requires a secure context. On http it is simply absent, so
 * feature-detecting the event name is the correct test rather than sniffing.
 */
export function detectCaptureMode(): CaptureMode {
  return typeof window !== 'undefined' && 'onpointerrawupdate' in window
    ? 'pointerrawupdate'
    : 'pointermove-coalesced'
}

export function startCapture(
  canvas: HTMLElement,
  clock: SessionClock,
  handlers: CaptureHandlers = {},
): TraceCapture {
  const mode = detectCaptureMode()

  const state: TraceCapture = {
    mode,
    strokes: [],
    current: [],
    stop: () => undefined,
  }

  let drawing = false
  let strokeStart = 0
  let previousStrokeEnd: number | null = null
  // De-duplicated by timestamp: a raw stream can repeat one, and a duplicated
  // point with a zero interval would read as infinitely fast movement.
  let lastT = -1

  const toPoint = (event: PointerEvent): TracePoint => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // The session clock, always. Never Date.now(), and never event.timeStamp,
      // whose origin differs between engines.
      t: clock.now(),
    }
  }

  const push = (point: TracePoint) => {
    if (point.t <= lastT) return
    lastT = point.t
    state.current.push(point)
    handlers.onPoint?.(point)
  }

  const onDown = (event: PointerEvent) => {
    drawing = true
    lastT = -1
    state.current = []
    strokeStart = clock.now()
    try {
      canvas.setPointerCapture?.(event.pointerId)
    } catch {
      // Throws InvalidPointerId if the browser no longer tracks this pointer.
      // Capture is an optimisation — it keeps the stream coming if the finger
      // slides off the canvas — and losing it must not cost the whole stroke.
      // An exception here would abort onDown and the drawing would never start.
    }
    push(toPoint(event))
    handlers.onStrokeStart?.()
  }

  /**
   * The one branch that matters. Which handler is attached is decided once, at
   * subscribe time, by `mode`.
   */
  const onRawUpdate = (event: PointerEvent) => {
    if (!drawing) return
    // NO getCoalescedEvents() here. This stream is already un-coalesced, and
    // asking would return just this one event — losing the rest.
    push(toPoint(event))
  }

  const onMove = (event: PointerEvent) => {
    if (!drawing) return
    // Browsers batch pointer events to the frame rate. Without this the trace
    // keeps roughly one point per frame and loses everything between.
    const coalesced = event.getCoalescedEvents?.() ?? []
    if (coalesced.length > 0) {
      for (const sample of coalesced) push(toPoint(sample))
    } else {
      push(toPoint(event))
    }
  }

  const onUp = () => {
    if (!drawing) return
    drawing = false

    const end = clock.now()
    const stroke: CapturedStroke = {
      points: [...state.current],
      stroke_start_ms: strokeStart,
      stroke_end_ms: end,
      air_time_before_ms: previousStrokeEnd === null ? 0 : strokeStart - previousStrokeEnd,
    }
    previousStrokeEnd = end

    state.strokes.push(stroke)
    state.current = []
    handlers.onStrokeEnd?.(stroke)
  }

  // { passive: false } on a touch-action: none surface. Without both, a scroll
  // or zoom gesture steals the pointer stream mid-stroke.
  const options: AddEventListenerOptions = { passive: false }

  canvas.addEventListener('pointerdown', onDown as EventListener, options)
  if (mode === 'pointerrawupdate') {
    canvas.addEventListener('pointerrawupdate', onRawUpdate as EventListener, options)
  } else {
    canvas.addEventListener('pointermove', onMove as EventListener, options)
  }
  canvas.addEventListener('pointerup', onUp as EventListener, options)
  canvas.addEventListener('pointercancel', onUp as EventListener, options)
  canvas.addEventListener('pointerleave', onUp as EventListener, options)

  state.stop = () => {
    canvas.removeEventListener('pointerdown', onDown as EventListener)
    canvas.removeEventListener('pointerrawupdate', onRawUpdate as EventListener)
    canvas.removeEventListener('pointermove', onMove as EventListener)
    canvas.removeEventListener('pointerup', onUp as EventListener)
    canvas.removeEventListener('pointercancel', onUp as EventListener)
    canvas.removeEventListener('pointerleave', onUp as EventListener)
  }

  return state
}

/**
 * The derived timing features. architecture.md 7.4.
 *
 * Every one of these is a LATENCY, not a shape measurement. Nothing here looks
 * at whether the clock is correct, and nothing ever should — see the header of
 * GhorirChobiGame.
 */
export type TraceFeatures = {
  /** Hesitation before the pen ever touched down. */
  pre_first_stroke_latency: number | null
  /** Pause after the outer circle, before whatever came next. */
  post_clock_face_latency: number | null
  /** Pause before the hands were drawn — the last third of the task. */
  pre_first_hand_latency: number | null
  /** Total pen-up time across the whole drawing. */
  total_air_time: number
  longest_latency: number
  /** SD of the between-stroke pauses. The variability, not the mean. */
  latency_variability: number | null
  total_time: number
  stroke_count: number
}

export function deriveFeatures(
  strokes: CapturedStroke[],
  presentedAtMs: number,
): TraceFeatures {
  if (strokes.length === 0) {
    return {
      pre_first_stroke_latency: null,
      post_clock_face_latency: null,
      pre_first_hand_latency: null,
      total_air_time: 0,
      longest_latency: 0,
      latency_variability: null,
      total_time: 0,
      stroke_count: 0,
    }
  }

  const first = strokes[0]
  const last = strokes[strokes.length - 1]
  const gaps = strokes.slice(1).map((s) => s.air_time_before_ms)

  const mean = gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null
  const sd =
    mean !== null && gaps.length > 1
      ? Math.sqrt(gaps.reduce((s, v) => s + (v - mean) ** 2, 0) / (gaps.length - 1))
      : null

  return {
    pre_first_stroke_latency: first ? first.stroke_start_ms - presentedAtMs : null,
    // The face is taken to be the first stroke: it is the largest and is drawn
    // first in essentially every protocol. This is a heuristic and is labelled
    // as one — it is NOT shape recognition, which 7.4 forbids.
    post_clock_face_latency: strokes[1]?.air_time_before_ms ?? null,
    /**
     * "Hands" is approximated as the last two strokes. Again a heuristic, and
     * deliberately a crude one: identifying the hands properly means deciding
     * what the drawing depicts, and that is scoring by another name.
     */
    pre_first_hand_latency:
      strokes.length >= 3 ? (strokes[strokes.length - 2]?.air_time_before_ms ?? null) : null,
    total_air_time: gaps.reduce((a, b) => a + b, 0),
    longest_latency: gaps.length > 0 ? Math.max(...gaps) : 0,
    latency_variability: sd,
    total_time: first && last ? last.stroke_end_ms - first.stroke_start_ms : 0,
    stroke_count: strokes.length,
  }
}

/** Points captured per second — the check that coalescing is actually working. */
export function pointRate(strokes: CapturedStroke[]): number {
  const points = strokes.reduce((n, s) => n + s.points.length, 0)
  const drawingMs = strokes.reduce((ms, s) => ms + (s.stroke_end_ms - s.stroke_start_ms), 0)
  return drawingMs > 0 ? (points / drawingMs) * 1000 : 0
}
