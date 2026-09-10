import { useCallback, useEffect, useRef, useState } from 'react'
import { drumBuffer, ensureAudio } from '@/core/audio/context'
import { playNow, playPattern, toIois, type Note } from '@/core/audio/scheduler'
import type { GameContext, GameSummary } from '@/core/telemetry/types'
import { DholHead, TapRipple } from '@/patient/games/dhol-bator/DholHead'
import {
  TIMBRE_SAMPLES,
  offsetsFromIois,
  patternFor,
  spanForLevel,
  timbreForLevel,
  toleranceMs,
} from '@/patient/games/dhol-bator/patterns'
import type { Game } from '@/patient/session/GameHost'

const TRIALS_PER_GAME = 5
/** How long after the last tap we accept that they have finished. */
const RESPONSE_IDLE_MS = 3_500
/** One errorless replay per trial, then move on regardless. */
const MAX_REPLAYS = 1

type Phase = 'idle' | 'listen' | 'respond' | 'replay' | 'done'

type Ripple = { id: number; x: number; y: number }

/**
 * Dhol Bator — "Rhythm Echo". architecture.md 7.2.
 *
 * ─── The one rule this whole file exists to obey ───
 *
 * Beats are scheduled on `audioCtx.currentTime`. Taps are recorded as
 * `audioCtx.currentTime`. Nothing here ever touches `performance.now()`.
 *
 * The two clocks drift against each other. A tap read from one and compared to a
 * beat scheduled on the other produces an asynchrony that is the drift plus the
 * error, and there is no way to tell those apart afterwards. The numbers look
 * completely plausible and mean nothing. This is the single most likely bug in
 * the entire build, per buildbook.md, and it is silent.
 *
 * The `attempts` row this game also emits DOES carry performance-clock offsets,
 * because every other game's rows do and the summary pipeline is shared. Those
 * come from `ctx.clock`, converted nowhere — see the emit call at the bottom.
 *
 * ─── Why this game matters most ───
 *
 * Musical memory is preserved differently in dementia; people who can no longer
 * follow a conversation still reproduce rhythm. It is a digit-span task in
 * cultural clothing, it needs no literacy, language or visual acuity, and it is
 * the cleanest inter-individual-variability measurement in the app because there
 * is no cognitive task layered on top of the timing.
 */
export function DholBatorGame({ ctx }: { ctx: GameContext }) {
  const { clock, level, emit, emitRhythm, onComplete } = ctx

  const [phase, setPhase] = useState<Phase>('idle')
  const [pulsing, setPulsing] = useState(false)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [trialIndex, setTrialIndex] = useState(0)

  const headRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const tapsRef = useRef<number[]>([])
  const modelIoisRef = useRef<number[]>([])
  const presentedAtRef = useRef(0)
  const firstTouchAtRef = useRef<number | null>(null)
  const replaysRef = useRef(0)
  const idleTimerRef = useRef<number | null>(null)
  const rippleIdRef = useRef(0)
  const resultsRef = useRef<{ correct: boolean; meanAbsAsync: number }[]>([])
  const phaseRef = useRef<Phase>('idle')

  phaseRef.current = phase

  const span = spanForLevel(level)
  const timbre = timbreForLevel(level)

  const clearIdle = () => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = null
    }
  }

  /** Plays the model pattern and returns once it has finished sounding. */
  const playModel = useCallback(
    async (iois: number[], glowWithTaps: number[] | null): Promise<void> => {
      const handle = await ensureAudio()
      audioRef.current = handle.ctx

      const samples = TIMBRE_SAMPLES[timbre]
      const accent = drumBuffer(samples.accent)
      const plain = drumBuffer(samples.plain)
      if (!accent) return

      const offsets = offsetsFromIois(iois)
      const notes: Note[] = offsets.map((atOffset, index) => ({
        // First note accented, the rest on the treble side — that is what makes
        // the pattern hearable as a phrase rather than a row of identical hits.
        buffer: index === 0 ? accent : (plain ?? accent),
        atOffset,
        gain: index === 0 ? 1 : 0.85,
      }))

      return new Promise<void>((resolve) => {
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          setPulsing(false)
          resolve()
        }

        const playback = playPattern(handle.ctx, handle.ctx.destination, notes, {
          onFinished: done,
        })

        /**
         * Watchdog, and it is not paranoia — it fires in a real, reachable case.
         *
         * Playback reports finishing by comparing `ctx.currentTime` to the last
         * scheduled onset. A SUSPENDED context's currentTime does not advance,
         * so that comparison is never true and this promise never settles. The
         * patient is then left in front of a drum that will not respond, with no
         * error on screen, because design.md 6 forbids showing one.
         *
         * A context can be suspended by an autoplay policy that was never
         * satisfied, or by the tab having been backgrounded mid-session.
         *
         * So the trial proceeds on a wall-independent timer regardless. The game
         * degrades to a silent, visual-only round — which is a real fallback for
         * a hard-of-hearing patient anyway — instead of degrading to a dead end.
         */
        const patternMs = (offsets[offsets.length - 1] ?? 0) * 1000
        const watchdog = window.setTimeout(() => {
          playback.stop()
          done()
        }, patternMs + 2_500)

        void Promise.resolve().then(() => {
          if (settled) window.clearTimeout(watchdog)
        })

        /**
         * The visual pulse runs off the AUDIO clock, not off the note-scheduling
         * callback. The scheduler hands a note to the audio thread up to 100 ms
         * before it sounds; flashing then would put the light consistently ahead
         * of the beat, which for a patient relying on the pulse is worse than no
         * pulse at all.
         */
        let next = 0
        const watch = () => {
          const now = handle.ctx.currentTime
          const onset = playback.onsets[next]
          if (onset && now >= onset.onset) {
            next += 1
            setPulsing(true)
            window.setTimeout(() => setPulsing(false), 110)
          }
          if (next < playback.onsets.length) requestAnimationFrame(watch)
        }
        requestAnimationFrame(watch)

        if (glowWithTaps) {
          // Errorless replay: the patient's own tap points light up in sequence
          // alongside the model, so the correction is a demonstration rather
          // than a verdict.
          for (const tapAt of glowWithTaps) {
            const delay = Math.max(0, (tapAt - handle.ctx.currentTime) * 1000)
            window.setTimeout(() => {
              setPulsing(true)
              window.setTimeout(() => setPulsing(false), 90)
            }, delay)
          }
        }
      })
    },
    [timbre],
  )

  const startTrial = useCallback(
    async (index: number, isReplay: boolean) => {
      const iois = patternFor(span, index)
      modelIoisRef.current = iois

      if (!isReplay) {
        tapsRef.current = []
        firstTouchAtRef.current = null
        replaysRef.current = 0
      }

      setPhase('listen')
      presentedAtRef.current = clock.now()

      await playModel(iois, isReplay ? [...tapsRef.current] : null)

      tapsRef.current = []
      firstTouchAtRef.current = null
      setPhase('respond')
    },
    [span, clock, playModel],
  )

  /** Grades the trial, writes both rows, and moves on. */
  const finishTrial = useCallback(
    (completed: boolean) => {
      clearIdle()

      const taps = [...tapsRef.current]
      const modelIois = modelIoisRef.current
      const expectedCount = modelIois.length + 1

      /**
       * If the audio clock is not running, every tap read the SAME frozen
       * `currentTime` — so the inter-tap intervals come out as zero and the
       * asynchronies as a tidy, entirely fictional set of numbers.
       *
       * They would be indistinguishable from real ones by Phase 12. So the
       * trial is recorded as not completed and the timing arrays are left
       * EMPTY rather than filled with fabrications. The same principle as the
       * stub games emitting no telemetry: better a gap than a lie in the table
       * the clinical claim is computed from.
       */
      const clockRunning = audioRef.current?.state === 'running'

      /**
       * Asynchrony is measured against the pattern anchored at the patient's
       * FIRST tap, not against the model's absolute onsets — those are already
       * in the past by the time the response phase begins, and the patient
       * chooses when to start.
       *
       * So asynchronies[0] is 0 by construction and every later value is the
       * error in reproducing the interval, which is the quantity of interest.
       * All of it on the audio clock, in milliseconds.
       */
      const firstTap = taps[0]
      const cumulative = offsetsFromIois(modelIois)
      const asynchronies =
        firstTap === undefined || !clockRunning
          ? []
          : taps.map((tap, i) => {
              const offset = cumulative[i]
              if (offset === undefined) return 0
              return (tap - (firstTap + offset)) * 1000
            })

      const responseIois = clockRunning ? toIois(taps) : []

      const withinTolerance =
        completed &&
        clockRunning &&
        taps.length === expectedCount &&
        asynchronies.every((async_, i) => {
          const ioi = modelIois[Math.max(0, i - 1)] ?? 600
          return Math.abs(async_) <= toleranceMs(ioi)
        })

      const meanAbsAsync =
        asynchronies.length > 0
          ? asynchronies.reduce((sum, v) => sum + Math.abs(v), 0) / asynchronies.length
          : 0

      emitRhythm({
        trial_index: trialIndex,
        span,
        model_iois: modelIois,
        response_iois: responseIois,
        asynchronies,
        // Not completed when the clock was frozen: nothing measurable happened,
        // whatever the screen showed.
        completed: completed && clockRunning,
      })

      // The attempts row, so this game flows through the same summary pipeline
      // as everything else. These offsets are on the PERFORMANCE clock, from
      // ctx.clock — never converted from the audio times above.
      emit({
        game_type: 'dhol_bator',
        domain: 'attention',
        trial_index: trialIndex,
        difficulty_level: level,
        stimulus_id: `span${span}-${timbre}`,
        presented_at_ms: presentedAtRef.current,
        first_touch_at_ms: firstTouchAtRef.current,
        responded_at_ms: clock.now(),
        correct: withinTolerance,
        error_type: completed ? (withinTolerance ? 'none' : 'random') : 'omission',
        hints_used: replaysRef.current,
        retrieval_interval_s: null,
        hint_latency_ms: null,
        touch_x: null,
        touch_y: null,
        target_radius_px: 210,
      })

      resultsRef.current.push({ correct: withinTolerance, meanAbsAsync })

      /**
       * Errorless. A miss is not a failure state: the dhol simply plays the
       * pattern again with the tap points glowing, and offers it once more.
       * There is no wrong sound in the bundle, and none is ever added.
       */
      if (!withinTolerance && replaysRef.current < MAX_REPLAYS) {
        replaysRef.current += 1
        setPhase('replay')
        void startTrial(trialIndex, true)
        return
      }

      const nextIndex = trialIndex + 1
      if (nextIndex >= TRIALS_PER_GAME) {
        setPhase('done')
        return
      }
      setTrialIndex(nextIndex)
      void startTrial(nextIndex, false)
    },
    [emit, emitRhythm, clock, level, span, timbre, trialIndex, startTrial],
  )

  // ── Tap capture ──
  useEffect(() => {
    const head = headRef.current
    if (!head) return

    const onPointerDown = (event: PointerEvent) => {
      if (phaseRef.current !== 'respond') return

      const audio = audioRef.current
      if (!audio) return

      // THE line. The tap time is read from the audio clock, in pointerdown —
      // never from performance.now(), and never from `click`.
      const tapAt = audio.currentTime
      tapsRef.current.push(tapAt)

      if (firstTouchAtRef.current === null) firstTouchAtRef.current = clock.now()

      const samples = TIMBRE_SAMPLES[timbre]
      const buffer = drumBuffer(samples.accent)
      if (buffer) playNow(audio, audio.destination, buffer, 0.9)

      const rect = head.getBoundingClientRect()
      const id = rippleIdRef.current++
      setRipples((current) => [
        ...current,
        { id, x: event.clientX - rect.left, y: event.clientY - rect.top },
      ])
      window.setTimeout(() => setRipples((c) => c.filter((r) => r.id !== id)), 260)

      const expected = modelIoisRef.current.length + 1
      if (tapsRef.current.length >= expected) {
        finishTrial(true)
        return
      }

      clearIdle()
      idleTimerRef.current = window.setTimeout(() => finishTrial(false), RESPONSE_IDLE_MS)
    }

    head.addEventListener('pointerdown', onPointerDown, { passive: false })
    return () => head.removeEventListener('pointerdown', onPointerDown)
  }, [clock, timbre, finishTrial])

  // ── Start ──
  //
  // Guarded by a ref rather than an empty dep array. startTrial's identity
  // changes with trialIndex, so an honest dep list would restart the game from
  // trial 0 partway through; the ref says "once" without lying about the deps.
  const startedRef = useRef(false)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void startTrial(0, false)
    return clearIdle
  }, [startTrial])

  // ── Completion ──
  useEffect(() => {
    if (phase !== 'done') return

    const results = resultsRef.current
    const correct = results.filter((r) => r.correct).length
    const asyncs = results.map((r) => r.meanAbsAsync)
    const mean = asyncs.length > 0 ? asyncs.reduce((a, b) => a + b, 0) / asyncs.length : null
    const sd =
      mean !== null && asyncs.length > 1
        ? Math.sqrt(asyncs.reduce((s, v) => s + (v - mean) ** 2, 0) / (asyncs.length - 1))
        : null

    const summary: GameSummary = {
      game_type: 'dhol_bator',
      domain: 'attention',
      difficulty_level: level,
      trials_presented: results.length,
      trials_completed: results.length,
      // Mean absolute asynchrony IS the reaction-time-like measure here, and it
      // is already a timing error rather than a latency. Reported as such.
      mean_rt_ms: mean,
      sd_rt_ms: sd,
      cv_rt: mean !== null && sd !== null && mean > 0 ? sd / mean : null,
      accuracy_raw: results.length > 0 ? correct / results.length : null,
      accuracy_hint_adjusted: null,
      hint_rate: results.length > 0 ? replaysRef.current / results.length : null,
    }

    onComplete(summary)
  }, [phase, level, onComplete])

  return (
    <div className="flex flex-col items-center">
      {/* Scoped here rather than in tokens.css, which this phase does not touch. */}
      <style>{`@keyframes xorai-ripple {
        from { width: 0; height: 0; opacity: 0.9; }
        to   { width: 280px; height: 280px; opacity: 0; }
      }`}</style>

      {/* No prompt, no word, no count. The state IS the instruction: the head
          glows brass when it is the patient's turn. design.md 4 caps a patient
          screen at one thing, and here the one thing is the drum. */}
      <DholHead ref={headRef} pulsing={pulsing} listening={phase === 'respond'}>
        {ripples.map((r) => (
          <TapRipple key={r.id} x={r.x} y={r.y} />
        ))}
      </DholHead>
    </div>
  )
}

export const dholBatorGame: Game = {
  id: 'dhol_bator',
  domains: ['attention', 'memory', 'perceptual_motor'],
  // All severities. This is the game that stays playable deepest into
  // progression — no literacy, no language, no visual acuity requirement.
  minSeverity: 'severe',
  Component: DholBatorGame,
}
