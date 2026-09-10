import type { SessionClock } from '@/core/telemetry/types'

/**
 * The session clock. architecture.md 6, which that document tells you to read
 * twice — this is the most bug-prone part of the system.
 *
 * ─── The rule ───
 *
 * `Date.now()` appears in this file EXACTLY ONCE, on the line marked below, and
 * nowhere else in the product's telemetry path.
 *
 * `Date.now()` is wall clock. It gets NTP-corrected mid-session, and a phone or
 * tablet that has been off for a week can jump by seconds the moment it finds a
 * network. The product's headline claim is reaction-time *variability*: one
 * correction lands inside one inter-trial interval, that interval is wrong by
 * more than the effect being measured, and the variability metric the entire
 * pitch rests on is quietly poisoned. Nothing looks broken. The numbers are just
 * no longer about the person.
 *
 * So: `performance.now()` for every `*_ms` value, all of them offsets from one
 * origin captured here, and `sessions.started_at` as the single wall-clock value
 * in the schema — because a caregiver needs to know a session happened on
 * Tuesday morning, and that is the only thing wall clock is for.
 *
 * tests/clock.test.ts greps for violations of this and prints its allowlist.
 */

export type CreateSessionClockOptions = {
  /**
   * Required by Dhol Bator, ignored by everything else. Passing it captures the
   * audio↔performance anchor; without it `fromAudio` has nothing to convert
   * against and throws rather than guessing.
   */
  audioContext?: AudioContext
  /** Overridable so tests do not spend half a second measuring. */
  sampleWindowMs?: number
}

export type SessionClockHandle = {
  clock: SessionClock
  /** Wall clock, ISO. Goes to `sessions.started_at` and nowhere else. */
  startedAt: string
  /** Stops the pointer-interval measurement early. Idempotent. */
  dispose: () => void
}

/**
 * Fallback when nothing can be measured: 60 Hz, the floor essentially every
 * tablet meets. Recorded as a real value rather than null so the analysis has
 * something to normalise by; it is an upper bound on the true interval, and
 * over-estimating the interval under-estimates the sample rate, which is the
 * safe direction.
 */
const DEFAULT_SAMPLE_INTERVAL_MS = 16.7

const DEFAULT_SAMPLE_WINDOW_MS = 500

export function createSessionClock(options: CreateSessionClockOptions = {}): SessionClockHandle {
  // ── The origin. Everything in the session is measured from this one value. ──
  const perfOrigin = performance.now()

  // ── The one permitted Date.now() in the product. sessions.started_at only. ──
  const startedAt = new Date(Date.now()).toISOString()

  const audioAnchor = captureAudioAnchor(options.audioContext)

  let sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS
  const stopMeasuring = measurePointerSampleInterval(
    options.sampleWindowMs ?? DEFAULT_SAMPLE_WINDOW_MS,
    (measured) => {
      sampleIntervalMs = measured
    },
  )

  const clock: SessionClock = {
    now() {
      return performance.now() - perfOrigin
    },

    /**
     * Converts an `AudioContext.currentTime` value onto the `now()` timeline.
     *
     * This exists so that NO GAME does this arithmetic itself. Dhol Bator needs
     * both clocks — asynchronies live on the audio clock, its `attempts` rows
     * need `first_touch_at_ms` on the performance clock — and the two drift
     * against each other. Getting the conversion wrong makes both the attempt
     * offsets and the asynchronies wrong, and both still look plausible.
     */
    fromAudio(audioTime: number): number {
      if (!audioAnchor) {
        throw new Error(
          'SessionClock.fromAudio() was called without an audio anchor. Pass an AudioContext to createSessionClock() at session start — one anchor per session, captured once (architecture.md 6).',
        )
      }
      // audioTime is seconds, the performance timeline is milliseconds.
      return (audioTime - audioAnchor.audioOrigin) * 1000 + audioAnchor.perfAtAnchor - perfOrigin
    },

    perfOrigin,
    audioOrigin: audioAnchor?.audioOrigin ?? 0,

    // A getter, not a captured value: the measurement finishes ~500 ms after the
    // session starts, and the session record is written at the end as well as
    // the start. Reading it late gets the measured figure, not the default.
    get pointerSampleIntervalMs() {
      return sampleIntervalMs
    },
  }

  return { clock, startedAt, dispose: stopMeasuring }
}

/**
 * One anchor per session, captured once.
 *
 * `getOutputTimestamp()` is the accurate form — it pairs a context time with the
 * performance time that audio was actually heard, accounting for output latency.
 * Where it is unavailable or returns nothing usable, `currentTime` paired with a
 * fresh `performance.now()` is close enough to keep asynchronies in tens of ms.
 */
function captureAudioAnchor(
  audioContext: AudioContext | undefined,
): { audioOrigin: number; perfAtAnchor: number } | null {
  if (!audioContext) return null

  try {
    const timestamp = audioContext.getOutputTimestamp?.()
    if (
      timestamp &&
      typeof timestamp.contextTime === 'number' &&
      typeof timestamp.performanceTime === 'number' &&
      timestamp.contextTime > 0
    ) {
      return { audioOrigin: timestamp.contextTime, perfAtAnchor: timestamp.performanceTime }
    }
  } catch {
    // Safari has shipped this throwing on a suspended context. Fall through.
  }

  return { audioOrigin: audioContext.currentTime, perfAtAnchor: performance.now() }
}

/**
 * The device's real pointer sampling interval, so the analysis can normalise
 * across tablets (architecture.md 6). A 60 Hz screen and a 120 Hz one produce
 * different stroke-point counts for the same gesture, and comparing them without
 * this measures the hardware rather than the person.
 *
 * Two sources, in order of trust:
 *
 *  1. Real pointer events, if the patient happens to touch the screen during the
 *     window. This is the actual quantity; nothing synthetic can substitute for
 *     it, because the sampling rate is a property of the digitiser.
 *  2. Otherwise the animation-frame interval, which is an upper bound — pointer
 *     events are delivered at least once per frame, often more. Marked as such
 *     by being a fallback rather than a measurement.
 *
 * Listeners are passive here, deliberately: this is observation, never capture,
 * and it must not interfere with the game surfaces that use `{ passive: false }`.
 */
function measurePointerSampleInterval(
  windowMs: number,
  onMeasured: (intervalMs: number) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const pointerDeltas: number[] = []
  const frameDeltas: number[] = []
  let lastPointerAt: number | null = null
  let lastFrameAt: number | null = null
  let frameHandle: number | null = null
  let stopped = false

  const onPointer = (event: PointerEvent) => {
    const at = event.timeStamp
    if (lastPointerAt !== null) {
      const delta = at - lastPointerAt
      // Discard zero and absurd gaps: a duplicate timestamp says nothing, and a
      // gap means the finger left the screen rather than that sampling slowed.
      if (delta > 0 && delta < 100) pointerDeltas.push(delta)
    }
    lastPointerAt = at
  }

  // The same ladder as stroke capture (architecture.md 6): pointerrawupdate
  // ALONE where it exists, otherwise pointermove. Never both — subscribing to
  // both here would double-count and halve the apparent interval.
  const rawSupported = 'onpointerrawupdate' in window
  const eventName = rawSupported ? 'pointerrawupdate' : 'pointermove'
  window.addEventListener(eventName, onPointer as EventListener, { passive: true })

  const onFrame = (at: number) => {
    if (lastFrameAt !== null) frameDeltas.push(at - lastFrameAt)
    lastFrameAt = at
    if (!stopped) frameHandle = requestAnimationFrame(onFrame)
  }
  frameHandle = requestAnimationFrame(onFrame)

  const finish = () => {
    if (stopped) return
    stopped = true

    window.removeEventListener(eventName, onPointer as EventListener)
    if (frameHandle !== null) cancelAnimationFrame(frameHandle)
    window.clearTimeout(timeoutHandle)

    // Median, not mean: one long gap from a paused main thread would drag a mean
    // upwards and misreport the device as slower than it is.
    const measured = median(pointerDeltas) ?? median(frameDeltas)
    if (measured !== null && measured > 0) onMeasured(measured)
  }

  const timeoutHandle = window.setTimeout(finish, windowMs)
  return finish
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const low = sorted[middle - 1]
  const high = sorted[middle]
  if (low === undefined || high === undefined) return null
  return (low + high) / 2
}
