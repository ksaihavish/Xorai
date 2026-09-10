/**
 * The one AudioContext, and the decoded sample cache.
 *
 * ─── Why a context has to be created on a gesture ───
 *
 * Every browser blocks audio until the user has interacted with the page. A
 * context created at module load starts `suspended`, and a suspended context's
 * `currentTime` DOES NOT ADVANCE. Dhol Bator schedules beats against that clock
 * and records taps against it, so a suspended context does not produce quiet
 * audio — it produces asynchronies computed against a frozen clock, which is a
 * number that looks fine and means nothing.
 *
 * So: created on the first gesture, resumed explicitly, and every caller goes
 * through `ensureAudio()`.
 *
 * rules.md 3 bans Tone.js and anything else that sits between us and
 * `AudioContext.currentTime`. A library there is a measurement liability.
 */

/**
 * The sample set. Listed rather than discovered: a directory cannot be read at
 * runtime from the browser, and a missing file must be a build-time problem
 * rather than a silent gap in the middle of a session.
 */
export const DRUM_SAMPLES = {
  dholLow: '/audio/drums/dhol-low.wav',
  dholHigh: '/audio/drums/dhol-high.wav',
  gogona: '/audio/drums/gogona.wav',
  pepa: '/audio/drums/pepa.wav',
} as const

export type DrumSampleName = keyof typeof DRUM_SAMPLES

type AudioHandle = {
  ctx: AudioContext
  buffers: Map<DrumSampleName, AudioBuffer>
}

let handle: AudioHandle | null = null
let loading: Promise<AudioHandle> | null = null

/**
 * Creates the context if needed, resumes it, and decodes every sample once.
 *
 * Must be called from inside a user-gesture handler the first time. Safe to call
 * repeatedly — the decode happens once and later calls only re-resume, which is
 * needed because a context can be suspended again when the tab is backgrounded.
 */
export function ensureAudio(): Promise<AudioHandle> {
  if (handle) {
    // A backgrounded tab suspends the context. Resuming is cheap; not resuming
    // means the clock stops and every subsequent measurement is wrong.
    // Deliberately not awaited — see resumeWithTimeout.
    if (handle.ctx.state === 'suspended') void handle.ctx.resume()
    return Promise.resolve(handle)
  }

  loading ??= load()
  return loading
}

/**
 * `resume()` returns a promise that a browser is under no obligation to settle.
 * When audio is still blocked — no qualifying gesture yet, an autoplay policy
 * that has not been satisfied — Chrome leaves it PENDING, forever.
 *
 * Awaiting it directly hangs whatever called it. In this product that is a game
 * awaiting `ensureAudio()`, which means a patient looking at a screen that never
 * changes and no error anywhere, because design.md 6 forbids showing one.
 *
 * So it is raced against a timeout and the result is advisory. Decoding does not
 * need a running context, and the context resumes by itself on the next real
 * gesture.
 */
async function resumeWithTimeout(ctx: AudioContext, ms: number): Promise<void> {
  if (ctx.state !== 'suspended') return
  await Promise.race([
    ctx.resume().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ])
}

async function load(): Promise<AudioHandle> {
  const ctx = new AudioContext({ latencyHint: 'interactive' })
  await resumeWithTimeout(ctx, 1_000)

  const buffers = new Map<DrumSampleName, AudioBuffer>()

  // Decoded in parallel, at app start rather than at first beat. Decoding a WAV
  // takes single-digit milliseconds, but doing it lazily would put that cost
  // inside the first scheduled note of the first trial — which is exactly the
  // note the patient's first tap is measured against.
  await Promise.all(
    (Object.keys(DRUM_SAMPLES) as DrumSampleName[]).map(async (name) => {
      try {
        const response = await fetch(DRUM_SAMPLES[name])
        if (!response.ok) return
        buffers.set(name, await ctx.decodeAudioData(await response.arrayBuffer()))
      } catch {
        // A missing sample degrades that timbre silently. design.md 6: audio
        // failure never surfaces to the patient — the session continues.
      }
    }),
  )

  handle = { ctx, buffers }
  return handle
}

/** null before the first gesture. Callers must handle that rather than assume. */
export function audioContext(): AudioContext | null {
  return handle?.ctx ?? null
}

export function drumBuffer(name: DrumSampleName): AudioBuffer | null {
  return handle?.buffers.get(name) ?? null
}

export function loadedSampleCount(): number {
  return handle?.buffers.size ?? 0
}

/**
 * THE clock for anything rhythmic.
 *
 * rules.md 2: rhythm timing lives entirely on the audio clock. Beats are
 * scheduled with `currentTime + lookahead` and taps are recorded as
 * `currentTime`. Comparing a tap on this clock to a beat on `performance.now()`
 * produces garbage asynchrony, because the two drift against each other.
 *
 * Returns NaN rather than 0 when there is no context. Zero is a plausible time
 * and would silently poison a trial; NaN propagates visibly.
 */
export function audioNow(): number {
  return handle?.ctx.currentTime ?? Number.NaN
}

/** Test-only. Lets a suite start from a clean cache. */
export function resetAudioForTests(): void {
  handle = null
  loading = null
}
