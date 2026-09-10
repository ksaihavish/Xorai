/**
 * A lookahead scheduler. architecture.md 7.2.
 *
 * ─── Why this exists rather than setTimeout per note ───
 *
 * `setTimeout` is a main-thread timer. It is late by whatever the main thread is
 * doing — a React render, a layout, a garbage collection — and it is late by a
 * different amount every time. Notes fired from it jitter by tens of
 * milliseconds, which is the same order as the effect this game measures.
 *
 * `source.start(when)` is not. It hands the note to the audio thread, which
 * plays it at `when` on the audio clock with sample accuracy.
 *
 * So the loop below is deliberately imprecise and the scheduling is exact: a
 * coarse 25 ms interval wakes up, looks 100 ms ahead, and hands the audio thread
 * everything due in that window. The interval can be late by 20 ms without
 * moving a single onset, because the onsets were computed in advance and the
 * audio thread honours them regardless of when it was told.
 *
 * The returned onsets are the times the audio thread WILL play, and they are
 * what taps get compared against. Nothing re-derives them later.
 */

const LOOKAHEAD_MS = 100
const TICK_MS = 25

export type Note = {
  buffer: AudioBuffer
  /** Seconds after the pattern's start. */
  atOffset: number
  gain?: number
}

export type ScheduledNote = {
  index: number
  /** Absolute time on the audio clock. THE reference for asynchrony. */
  onset: number
}

export type PatternPlayback = {
  /** Every note's exact scheduled onset, known before the first one sounds. */
  onsets: ScheduledNote[]
  /** Audio-clock time the pattern starts. */
  startAt: number
  /** Audio-clock time the last note sounds. */
  endAt: number
  /** Fires as each note is handed to the audio thread — for the visual pulse. */
  onNote?: (note: ScheduledNote) => void
  stop: () => void
}

export type PlayPatternOptions = {
  /**
   * Head start before the first note, so the scheduler has time to run at least
   * one tick and the patient is not surprised by a beat landing on the same
   * frame the screen changed.
   */
  leadInSeconds?: number
  onNote?: (note: ScheduledNote) => void
  onFinished?: () => void
}

export function playPattern(
  ctx: AudioContext,
  destination: AudioNode,
  notes: Note[],
  options: PlayPatternOptions = {},
): PatternPlayback {
  const leadIn = options.leadInSeconds ?? 0.35
  const startAt = ctx.currentTime + leadIn

  // Computed up front, all of them. This array is the ground truth for the whole
  // trial: the game compares taps against these numbers and never recomputes an
  // expected onset from a timer or a frame.
  const onsets: ScheduledNote[] = notes.map((note, index) => ({
    index,
    onset: startAt + note.atOffset,
  }))

  const pending = notes.map((note, index) => ({ note, index }))
  const live: AudioBufferSourceNode[] = []
  let timer: number | null = null
  let finished = false

  const tick = () => {
    const horizon = ctx.currentTime + LOOKAHEAD_MS / 1000

    while (pending.length > 0) {
      const next = pending[0]
      const scheduled = next ? onsets[next.index] : undefined
      if (!next || !scheduled || scheduled.onset > horizon) break

      pending.shift()

      const source = ctx.createBufferSource()
      source.buffer = next.note.buffer

      if (next.note.gain !== undefined && next.note.gain !== 1) {
        const gainNode = ctx.createGain()
        gainNode.gain.value = next.note.gain
        source.connect(gainNode).connect(destination)
      } else {
        source.connect(destination)
      }

      // The only line that matters. An absolute audio-clock time, not a delay.
      source.start(scheduled.onset)
      live.push(source)

      options.onNote?.(scheduled)
    }

    if (pending.length === 0 && !finished) {
      const last = onsets[onsets.length - 1]
      if (!last || ctx.currentTime >= last.onset) {
        finished = true
        stop()
        options.onFinished?.()
      }
    }
  }

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  // One tick immediately: with a short lead-in the first note may already be
  // inside the lookahead window, and waiting 25 ms for the first interval would
  // schedule it late.
  tick()
  timer = window.setInterval(tick, TICK_MS)

  const lastOnset = onsets[onsets.length - 1]

  return {
    onsets,
    startAt,
    endAt: lastOnset ? lastOnset.onset : startAt,
    stop: () => {
      stop()
      for (const source of live) {
        try {
          source.stop()
        } catch {
          // Already ended. Stopping a finished source throws on some engines.
        }
      }
    },
  }
}

/**
 * One-shot, for the tap sound. Scheduled at `currentTime` rather than through
 * the lookahead loop: this note is a response to a touch that already happened,
 * so the earliest possible playback is the correct playback.
 */
export function playNow(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  gain = 1,
): void {
  const source = ctx.createBufferSource()
  source.buffer = buffer

  if (gain !== 1) {
    const gainNode = ctx.createGain()
    gainNode.gain.value = gain
    source.connect(gainNode).connect(destination)
  } else {
    source.connect(destination)
  }

  source.start()
}

/** Inter-onset intervals in MILLISECONDS, from audio-clock times in seconds. */
export function toIois(times: number[]): number[] {
  const iois: number[] = []
  for (let i = 1; i < times.length; i++) {
    const previous = times[i - 1]
    const current = times[i]
    if (previous === undefined || current === undefined) continue
    iois.push((current - previous) * 1000)
  }
  return iois
}
