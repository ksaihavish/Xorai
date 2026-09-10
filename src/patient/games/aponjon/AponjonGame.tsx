import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  advance,
  initialState,
  loadStates,
  saveState,
  selectDueFace,
  type RetrievalState,
} from '@/core/difficulty/spaced-retrieval'
import type {
  ErrorType,
  GameContext,
  GameSummary,
  LocalFamilyMember,
} from '@/core/telemetry/types'
import { isSemanticallyNear, kinshipEntry } from '@/patient/games/aponjon/kinship'
import type { Game } from '@/patient/session/GameHost'
import { Prompt } from '@/ui/Prompt'

const HINT_AFTER_MS = 5_000
const FADE_MS = 400
const ADVANCE_AFTER_MS = 1_800
const STUDY_MS = 4_500
const TRIALS = 6
/** Level 5's free-recall window before options appear. */
const FREE_RECALL_MS = 5_000

type Phase = 'study' | 'recall' | 'test' | 'resolved' | 'done'

/**
 * Aponjon — "Our Own People". architecture.md 7.1.
 *
 * Face-name recall on an expanding-interval schedule, with errorless correction.
 *
 * ─── The part no competing team will have ───
 *
 * The prompt speaks the LOCAL KINSHIP TERM, not "aunt". Assamese, Khasi and Mizo
 * encode relationships far more specifically than English — paternal versus
 * maternal, elder versus younger — and Khasi being matrilineal makes the
 * maternal uncle structurally central to a household. `kinship_term_key` maps
 * into the table in kinship.ts. This is a real localisation, not a string swap.
 *
 * ─── Error typing is required, not decorative ───
 *
 * Choosing a sibling's name for a spouse is a different clinical signal from a
 * random pick. Both are "incorrect" and only one of them means anything, so the
 * distinction is stored per attempt. See classifyError at the bottom.
 */
export function AponjonGame({ ctx }: { ctx: GameContext }) {
  const { t } = useTranslation()
  const { clock, patient, family, level, speak, emit, onComplete } = ctx

  const [phase, setPhase] = useState<Phase>('study')
  const [trial, setTrial] = useState(0)
  const [hinted, setHinted] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)

  const statesRef = useRef<Map<string, RetrievalState>>(new Map())
  const presentedAtRef = useRef(0)
  const firstTouchAtRef = useRef<number | null>(null)
  const hintAtRef = useRef<number | null>(null)
  const latenciesRef = useRef<number[]>([])
  const correctRef = useRef(0)
  const hintsRef = useRef(0)
  const seenTargetsRef = useRef<Set<string>>(new Set())
  const lastWrongRef = useRef<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('study')
  phaseRef.current = phase

  const optionCount = optionsForLevel(level)

  // ── Load retrieval history once ──
  useEffect(() => {
    let active = true
    void loadStates(patient.id).then((rows) => {
      if (!active) return
      const map = new Map<string, RetrievalState>()
      for (const member of family) {
        map.set(
          member.id,
          rows.find((r) => r.family_member_id === member.id) ??
            initialState(patient.id, member.id),
        )
      }
      statesRef.current = map
    })
    return () => {
      active = false
    }
  }, [patient.id, family])

  /**
   * Which face this trial tests: the most overdue on the schedule.
   *
   * Level 6 is cross-session delayed recall, so it prefers a face that already
   * carries history from a previous session — a face tested for the first time
   * today cannot be a delayed recall of anything.
   */
  const target = useMemo<LocalFamilyMember | null>(() => {
    if (family.length === 0) return null

    const states = [...statesRef.current.values()]
    if (level >= 6) {
      const withHistory = states.filter((s) => s.longest_interval_s > 0)
      const due = selectDueFace(withHistory.length > 0 ? withHistory : states, clock.now())
      const found = family.find((m) => m.id === due?.family_member_id)
      if (found) return found
    }

    const due = selectDueFace(states, clock.now())
    return family.find((m) => m.id === due?.family_member_id) ?? family[trial % family.length] ?? null
  }, [family, level, trial, clock])

  /** Distractors: other family members, so every wrong answer is a real person. */
  const options = useMemo<LocalFamilyMember[]>(() => {
    if (!target) return []
    const others = family.filter((m) => m.id !== target.id)
    const picked = others.slice(0, Math.max(0, optionCount - 1))
    const all = [target, ...picked]
    // Deterministic order per trial so nothing reshuffles under a moving finger.
    return all
      .map((m, i) => ({ m, k: (i + trial * 7 + m.id.length) % all.length }))
      .sort((a, b) => a.k - b.k)
      .map((e) => e.m)
  }, [target, family, optionCount, trial])

  // ── Study phase ──
  useEffect(() => {
    if (phase !== 'study' || !target) return

    const kin = kinshipEntry(target.kinship_term_key)
    // The kinship term is spoken, not the English relationship word. That word
    // is the culturally loaded one and the one they have been called by.
    if (kin) void speak(kin.key)
    else void speak('aponjon.study')

    const timer = window.setTimeout(
      () => setPhase(level >= 5 ? 'recall' : 'test'),
      STUDY_MS,
    )
    return () => window.clearTimeout(timer)
  }, [phase, target, speak, level])

  /**
   * Level 5, free recall with an initial-letter cue.
   *
   * The ladder in architecture.md 7.1 calls this "free recall". With tap-only
   * input and no keyboard there is nothing to type into, so the honest tap
   * adaptation is a silent retrieval window: the photo and the first letter, no
   * options, for five seconds — then the options appear. The patient gets the
   * retrieval attempt; the telemetry records that the window elapsed.
   */
  useEffect(() => {
    if (phase !== 'recall') return
    const timer = window.setTimeout(() => setPhase('test'), FREE_RECALL_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // ── Test phase ──
  useEffect(() => {
    if (phase !== 'test' || !target) return

    presentedAtRef.current = clock.now()
    firstTouchAtRef.current = null
    hintAtRef.current = null
    setHinted(false)
    setChosenId(null)

    void speak('aponjon.whoIsThis')

    const timer = window.setTimeout(() => {
      if (firstTouchAtRef.current === null) {
        hintAtRef.current = clock.now()
        hintsRef.current += 1
        setHinted(true)
      }
    }, HINT_AFTER_MS)

    return () => window.clearTimeout(timer)
  }, [phase, target, clock, speak])

  const answer = useCallback(
    (chosen: LocalFamilyMember) => {
      if (!target || phaseRef.current !== 'test') return

      const respondedAt = clock.now()
      const correct = chosen.id === target.id
      const state = statesRef.current.get(target.id) ?? initialState(patient.id, target.id)

      const errorType = classifyError({
        correct,
        chosen,
        target,
        seenTargets: seenTargetsRef.current,
        lastWrongId: lastWrongRef.current,
      })

      if (correct) correctRef.current += 1
      else lastWrongRef.current = chosen.id
      latenciesRef.current.push(respondedAt - presentedAtRef.current)

      emit({
        game_type: 'aponjon',
        domain: 'memory',
        trial_index: trial,
        difficulty_level: level,
        stimulus_id: target.id,
        presented_at_ms: presentedAtRef.current,
        first_touch_at_ms: firstTouchAtRef.current,
        responded_at_ms: respondedAt,
        correct,
        error_type: errorType,
        hints_used: hintAtRef.current !== null ? 1 : 0,
        // The interval this face was tested AT — makes the longitudinal
        // retrieval claim a real series rather than one current row.
        retrieval_interval_s: state.current_interval_s,
        hint_latency_ms:
          hintAtRef.current === null ? null : hintAtRef.current - presentedAtRef.current,
        touch_x: null,
        touch_y: null,
        target_radius_px: null,
      })

      const next = advance(state, correct, respondedAt)
      statesRef.current.set(target.id, next)
      void saveState(next)
      seenTargetsRef.current.add(target.id)

      setChosenId(chosen.id)
      setPhase('resolved')

      // Errorless: the correct name and kinship term are spoken whether or not
      // they got it, so the screen never has to say which happened.
      const kin = kinshipEntry(target.kinship_term_key)
      void speak(kin ? kin.key : 'aponjon.study')

      window.setTimeout(() => {
        const nextTrial = trial + 1
        if (nextTrial >= TRIALS) setPhase('done')
        else {
          setTrial(nextTrial)
          setPhase('study')
        }
      }, ADVANCE_AFTER_MS)
    },
    [target, clock, patient.id, emit, trial, level, speak],
  )

  // ── Pointer capture: pointerdown, never click (architecture.md 6) ──
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const onPointerDown = (event: PointerEvent) => {
      if (phaseRef.current !== 'test') return
      if (firstTouchAtRef.current === null) firstTouchAtRef.current = clock.now()

      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-member-id]')
      const id = el?.dataset['memberId']
      const chosen = options.find((m) => m.id === id)
      if (chosen) answer(chosen)
    }

    surface.addEventListener('pointerdown', onPointerDown, { passive: false })
    return () => surface.removeEventListener('pointerdown', onPointerDown)
  }, [answer, clock, options])

  // ── Completion ──
  useEffect(() => {
    if (phase !== 'done') return

    const lat = latenciesRef.current
    const mean = lat.length > 0 ? lat.reduce((a, b) => a + b, 0) / lat.length : null
    const sd =
      mean !== null && lat.length > 1
        ? Math.sqrt(lat.reduce((s, v) => s + (v - mean) ** 2, 0) / (lat.length - 1))
        : null

    const summary: GameSummary = {
      game_type: 'aponjon',
      domain: 'memory',
      difficulty_level: level,
      trials_presented: TRIALS,
      trials_completed: lat.length,
      mean_rt_ms: mean,
      sd_rt_ms: sd,
      cv_rt: mean !== null && sd !== null && mean > 0 ? sd / mean : null,
      accuracy_raw: TRIALS > 0 ? correctRef.current / TRIALS : null,
      accuracy_hint_adjusted:
        TRIALS - hintsRef.current > 0
          ? (correctRef.current - hintsRef.current) / (TRIALS - hintsRef.current)
          : null,
      hint_rate: TRIALS > 0 ? hintsRef.current / TRIALS : null,
    }
    onComplete(summary)
  }, [phase, level, onComplete])

  if (!target) return <Prompt>{t('aponjon.noFamily')}</Prompt>

  const kin = kinshipEntry(target.kinship_term_key)
  const showOptions = phase === 'test' || phase === 'resolved'

  return (
    <div ref={surfaceRef} className="flex w-full flex-col items-center gap-8 [touch-action:none]">
      {phase === 'study' ? (
        <>
          <FacePhoto member={target} size={420} />
          <p className="text-promptLg text-ink">{target.display_name}</p>
          {/* The kinship term sits BELOW the name, in madder, at 28px —
              design.md Part II 4. It is the word the voice speaks. */}
          {kin ? <p className="text-[28px] font-semibold text-madder">{kin.gloss}</p> : null}
        </>
      ) : (
        <>
          <FacePhoto member={target} size={340} />

          {phase === 'recall' ? (
            <Prompt>
              {t('aponjon.initialCue', { letter: target.display_name.slice(0, 1) })}
            </Prompt>
          ) : (
            <Prompt>{t('aponjon.whoIsThis')}</Prompt>
          )}

          {showOptions ? (
            <div className="flex flex-wrap items-stretch justify-center gap-6">
              {options.map((member) => {
                const isTarget = member.id === target.id
                const faded = phase === 'resolved' && chosenId === member.id && !isTarget
                const glow =
                  (phase === 'resolved' && isTarget) ||
                  // Level 1: the correct option pre-glows. The first rung of the
                  // ladder is recognition with the answer already indicated.
                  (level <= 1 && phase === 'test' && isTarget)
                const dim = hinted && !isTarget && phase === 'test'

                return (
                  <button
                    key={member.id}
                    type="button"
                    data-member-id={member.id}
                    style={{ transitionDuration: `${FADE_MS}ms` }}
                    className={
                      'min-h-touchLg min-w-[240px] rounded-card border-[3px] px-8 py-5 text-name ' +
                      'transition-[opacity,border-color,background-color,box-shadow] outline-none ' +
                      'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
                      (glow
                        ? 'border-brass bg-brassSoft text-ink shadow-[0_0_0_6px_var(--brass-soft)] '
                        : 'border-ink bg-paper text-ink ') +
                      (faded ? 'opacity-30 ' : dim ? 'opacity-25 ' : 'opacity-100 ')
                    }
                  >
                    {member.display_name}
                  </button>
                )
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

function FacePhoto({ member, size }: { member: LocalFamilyMember; size: number }) {
  const { t } = useTranslation()
  return (
    <div
      // A paper-sunk well with a 2px clay frame — design.md Part II 4.
      className="overflow-hidden rounded-card border-2 border-clay bg-paperSunk"
      style={{ width: size, height: size }}
    >
      {member.photo_url ? (
        <img
          src={member.photo_url}
          alt={t('aponjon.photoAlt', { name: member.display_name })}
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : null}
    </div>
  )
}

/** architecture.md 7.1 difficulty ladder. Levels 5 and 6 still show 4 options. */
function optionsForLevel(level: number): number {
  if (level <= 2) return 2
  if (level === 3) return 3
  return 4
}

/**
 * Error typing. architecture.md 7.1 — this is required, not optional.
 *
 * Order matters, most specific first. A wrong answer can satisfy several of
 * these at once, and the most informative label is the one worth keeping:
 * repeating the same wrong name twice running says more than that name having
 * appeared earlier in the session, which in turn says more than the two people
 * being the same generation.
 */
export function classifyError(input: {
  correct: boolean
  chosen: LocalFamilyMember | null
  target: LocalFamilyMember
  seenTargets: Set<string>
  lastWrongId: string | null
}): ErrorType {
  const { correct, chosen, target, seenTargets, lastWrongId } = input

  if (correct) return 'none'
  // No response before the trial ended.
  if (!chosen) return 'omission'

  // The same wrong name chosen on consecutive trials — the person is stuck on
  // it rather than guessing anew each time.
  if (lastWrongId !== null && chosen.id === lastWrongId) return 'perseveration'

  // A name that was the answer to an EARLIER trial this session, bleeding
  // forward into this one.
  if (seenTargets.has(chosen.id)) return 'intrusion'

  // Same generation: a sibling named for a spouse, a daughter for a niece.
  if (isSemanticallyNear(chosen.kinship_term_key, target.kinship_term_key)) return 'semantic_near'

  return 'random'
}

export const aponjonGame: Game = {
  id: 'aponjon',
  domains: ['memory', 'language'],
  minSeverity: 'severe',
  Component: AponjonGame,
}
