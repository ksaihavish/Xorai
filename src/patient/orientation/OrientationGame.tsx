import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ErrorType, GameContext, GameSummary } from '@/core/telemetry/types'
import type { Game } from '@/patient/session/GameHost'
import { SeasonMark } from '@/patient/orientation/SeasonMark'
import {
  buildOrientationQuestions,
  type OrientationOption,
  type OrientationQuestion,
  type Season,
} from '@/patient/orientation/questions'
import { Prompt } from '@/ui/Prompt'

/** design.md 6: dim the distractors before the patient can fail, not after. */
const HINT_AFTER_MS = 8_000
/** design.md 7: fade-out is 400 ms. That is the whole motion budget here. */
const FADE_MS = 400
/** Long enough to hear the answer spoken, short enough not to feel like a pause. */
const ADVANCE_AFTER_MS = 1_600

type Resolution = {
  chosenId: string
  correct: boolean
}

/**
 * The reality-orientation warm-up.
 *
 * ─── The errorless contract, which overrides everything else here ───
 *
 * design.md 6: no patient-facing surface may ever indicate the patient was
 * wrong. There is no red, no X, no buzzer, no shake, no score, no message.
 *
 * What happens on an incorrect tap is exactly this: the chosen option fades to
 * 30% over 400 ms, the correct option gains a soft brass glow, the correct
 * answer is spoken, and we move on. A person watching over the patient's
 * shoulder cannot tell whether they got it right.
 *
 * And before that — when hesitation passes 8 seconds, the distractors dim so the
 * answer becomes obvious. The patient experiences success; the telemetry records
 * `hints_used += 1`. This is why hint rate, not accuracy, is the difficulty
 * signal, and why accuracy in this product is inflated BY DESIGN. We state that
 * openly rather than hide it.
 */
export function OrientationGame({ ctx }: { ctx: GameContext }) {
  const { t } = useTranslation()
  const { clock, patient, speak, emit, onComplete } = ctx

  // Keyed on the fields actually used rather than on object identity. A caller
  // that rebuilds the patient object each render would otherwise reshuffle the
  // options under a finger already moving toward one — and the hint that dims
  // distractors makes that worse, not better.
  const patientId = patient.id
  const homePlace = patient.home_place
  const questions = useMemo(
    () => buildOrientationQuestions({ home_place: homePlace }, new Date(), patientId.length),
    [patientId, homePlace],
  )

  const [index, setIndex] = useState(0)
  const [hinted, setHinted] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)

  const presentedAtRef = useRef(0)
  const firstTouchAtRef = useRef<number | null>(null)
  const hintAtRef = useRef<number | null>(null)
  const latenciesRef = useRef<number[]>([])
  const correctCountRef = useRef(0)
  const hintCountRef = useRef(0)
  const surfaceRef = useRef<HTMLDivElement>(null)

  const question = questions[index]
  const finished = index >= questions.length

  // ── Presenting a question ──
  useEffect(() => {
    if (!question) return

    presentedAtRef.current = clock.now()
    firstTouchAtRef.current = null
    hintAtRef.current = null
    setHinted(false)
    setResolution(null)

    void speak(question.promptKey)

    const hintTimer = window.setTimeout(() => {
      // Only a hint if they have not touched anything yet. Someone mid-reach is
      // not hesitating, and dimming under their finger would be the worst
      // possible moment to change the screen.
      if (firstTouchAtRef.current === null) {
        hintAtRef.current = clock.now()
        hintCountRef.current += 1
        setHinted(true)
      }
    }, HINT_AFTER_MS)

    return () => window.clearTimeout(hintTimer)
  }, [question, clock, speak])

  const answer = useCallback(
    (option: OrientationOption, touch: { x: number; y: number; radius: number } | null) => {
      if (!question || resolution) return

      const respondedAtMs = clock.now()
      const presentedAtMs = presentedAtRef.current
      const firstTouchAtMs = firstTouchAtRef.current ?? respondedAtMs
      const hintUsed = hintAtRef.current !== null

      if (option.correct) correctCountRef.current += 1
      latenciesRef.current.push(respondedAtMs - presentedAtMs)

      emit({
        game_type: 'orientation',
        domain: 'orientation',
        trial_index: index,
        difficulty_level: 1,
        stimulus_id: question.id,
        presented_at_ms: presentedAtMs,
        first_touch_at_ms: firstTouchAtMs,
        responded_at_ms: respondedAtMs,
        correct: option.correct,
        error_type: classifyError(question, option),
        hints_used: hintUsed ? 1 : 0,
        retrieval_interval_s: null,
        hint_latency_ms: hintAtRef.current === null ? null : hintAtRef.current - presentedAtMs,
        touch_x: touch ? touch.x : null,
        touch_y: touch ? touch.y : null,
        target_radius_px: touch ? touch.radius : null,
      })

      setResolution({ chosenId: option.id, correct: option.correct })

      // The correct answer is spoken whether or not they got it, so the screen
      // never has to say which of those happened.
      const correctOption = question.options.find((o) => o.correct)
      if (correctOption) {
        void speak(`orientation.answers.${question.id}`)
      }

      window.setTimeout(() => setIndex((i) => i + 1), ADVANCE_AFTER_MS)
    },
    [question, resolution, clock, emit, index, speak],
  )

  // ── Pointer capture ──
  //
  // architecture.md 6: first touch is captured in `pointerdown`, never `click`.
  // `click` fires after a delay and after the browser has resolved gestures, so
  // a hesitation measured from it is a hesitation plus an unknown constant.
  //
  // Registered by hand rather than through React's props so it can be
  // `{ passive: false }` on a `touch-action: none` surface, which is what stops
  // a scroll or a zoom from stealing or delaying the event.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const onPointerDown = (event: PointerEvent) => {
      if (firstTouchAtRef.current === null) firstTouchAtRef.current = clock.now()

      const target = event.target as HTMLElement | null
      const optionEl = target?.closest<HTMLElement>('[data-option-id]')
      if (!optionEl || !question) return

      const optionId = optionEl.dataset['optionId']
      const option = question.options.find((o) => o.id === optionId)
      if (!option) return

      const rect = optionEl.getBoundingClientRect()
      answer(option, {
        // Relative to target centre, px — the offset a tremoring hand produces.
        x: event.clientX - (rect.left + rect.width / 2),
        y: event.clientY - (rect.top + rect.height / 2),
        radius: Math.round(Math.min(rect.width, rect.height) / 2),
      })
    }

    surface.addEventListener('pointerdown', onPointerDown, { passive: false })
    return () => surface.removeEventListener('pointerdown', onPointerDown)
  }, [answer, clock, question])

  // ── Completion ──
  useEffect(() => {
    if (!finished) return

    const latencies = latenciesRef.current
    const presented = questions.length
    const mean = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null
    const sd =
      mean !== null && latencies.length > 1
        ? Math.sqrt(
            latencies.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (latencies.length - 1),
          )
        : null

    const summary: GameSummary = {
      game_type: 'orientation',
      domain: 'orientation',
      difficulty_level: 1,
      trials_presented: presented,
      trials_completed: latencies.length,
      mean_rt_ms: mean,
      sd_rt_ms: sd,
      // cv_rt is per game_type by decision (buildbook amendment 7). Pooling
      // reaction times across games measures which games were played.
      cv_rt: mean !== null && sd !== null && mean > 0 ? sd / mean : null,
      accuracy_raw: presented > 0 ? correctCountRef.current / presented : null,
      // Hinted trials are excluded rather than counted as failures: the hint
      // exists to produce a success, so scoring it as one would inflate accuracy
      // twice over.
      accuracy_hint_adjusted:
        presented - hintCountRef.current > 0
          ? (correctCountRef.current - hintCountRef.current) / (presented - hintCountRef.current)
          : null,
      hint_rate: presented > 0 ? hintCountRef.current / presented : null,
    }

    onComplete(summary)
  }, [finished, questions.length, onComplete])

  if (!question) return null

  return (
    <div
      ref={surfaceRef}
      className="flex w-full flex-col items-center gap-10 [touch-action:none]"
    >
      <Prompt>{t(question.promptKey)}</Prompt>

      <div className="flex flex-wrap items-stretch justify-center gap-6">
        {question.options.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            render={question.render}
            label={
              option.label === 'ORIENTATION_ELSEWHERE'
                ? t('orientation.somewhereElse')
                : question.render === 'season'
                  ? t(`orientation.seasons.${option.label}`)
                  : option.label
            }
            dimmed={hinted && !option.correct && !resolution}
            faded={resolution !== null && resolution.chosenId === option.id && !resolution.correct}
            glowing={resolution !== null && option.correct}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * A single option.
 *
 * Three visual states, and none of them says "wrong":
 *  - dimmed:  the hint. Distractors recede so the answer stands out.
 *  - faded:   what was chosen, at 30%, on the way out.
 *  - glowing: the correct answer, in brass-soft.
 *
 * No scale transform on press, here as everywhere: scale moves the target out
 * from under a tremoring finger (design.md 5).
 */
function OptionCard({
  option,
  render,
  label,
  dimmed,
  faded,
  glowing,
}: {
  option: OrientationOption
  render: 'text' | 'season'
  label: string
  dimmed: boolean
  faded: boolean
  glowing: boolean
}) {
  return (
    <button
      type="button"
      data-option-id={option.id}
      aria-label={label}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      className={
        'flex min-h-touchLg min-w-[240px] flex-col items-center justify-center gap-3 ' +
        'rounded-card border-[3px] px-8 py-6 text-name text-ink ' +
        'transition-[opacity,border-color,background-color,box-shadow] ' +
        'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
        (glowing
          ? 'border-brass bg-brassSoft shadow-[0_0_0_6px_var(--brass-soft)] '
          : 'border-ink bg-paper ') +
        (faded ? 'opacity-30 ' : dimmed ? 'opacity-25 ' : 'opacity-100 ')
      }
    >
      {render === 'season' ? (
        <span className="text-ink">
          <SeasonMark season={option.label as Season} />
        </span>
      ) : null}
      <span>{label}</span>
    </button>
  )
}

/**
 * An adjacent date is a different signal from a random pick: a person who is two
 * days out is oriented and drifting, a person choosing at random is not. The
 * distinction only survives if the near misses are recorded as near.
 */
function classifyError(question: OrientationQuestion, chosen: OrientationOption): ErrorType {
  if (chosen.correct) return 'none'

  if (question.id === 'date') {
    const correct = question.options.find((o) => o.correct)
    const correctValue = Number(correct?.label)
    const chosenValue = Number(chosen.label)
    if (Number.isFinite(correctValue) && Number.isFinite(chosenValue)) {
      if (Math.abs(correctValue - chosenValue) <= 2) return 'semantic_near'
    }
  }

  return 'random'
}

export const orientationGame: Game = {
  id: 'orientation',
  domains: ['orientation'],
  // Runs at every severity: it is the reality-orientation board, and the people
  // who need it most are the ones furthest along.
  minSeverity: 'severe',
  Component: OrientationGame,
}
