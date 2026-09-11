import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameContext, GameSummary } from '@/core/telemetry/types'
import {
  DEMO_DECK,
  buildDeck,
  gridFor,
  layOutBoard,
  visibleMsFor,
  type DeckCard,
} from '@/patient/games/xorai-milan/deck'
import type { Game } from '@/patient/session/GameHost'

const NON_MATCHES_BEFORE_HINT = 3
const FLIP_MS = 250

type Slot = { key: string; card: DeckCard; matched: boolean }
type Flip = { slotKey: string; cardId: string; at: number }

/**
 * Xorai Milan — "Regional Memory Match". architecture.md 7.3.
 *
 * A card grid whose deck is weighted 60/40 toward 1950s-70s everyday objects,
 * and whose real purpose fires on a MATCH: the caption is spoken, and a
 * matching task becomes a reminiscence prompt. That is why this game exists —
 * "Kaziranga, the one-horned rhino" is recognition, but a hurricane lantern is
 * something they owned.
 *
 * ─── The inversion that matters ───
 *
 * A matched pair does NOT vanish. It stays face up and gains a thin brass
 * frame, so the board fills with what has been found rather than emptying out.
 * An emptying board is a record of what is gone; a filling one is a record of
 * what was remembered. Same mechanic, opposite feeling, and this population is
 * the one for whom that difference is not decoration.
 */
export function XoraiMilanGame({ ctx }: { ctx: GameContext }) {
  const { t } = useTranslation()
  const { clock, patient, level, speak, emit, onComplete } = ctx

  const grid = useMemo(() => gridFor(level, patient.severity), [level, patient.severity])
  const pairs = (grid.cols * grid.rows) / 2
  const visibleMs = visibleMsFor(level)

  const board = useMemo<Slot[]>(() => {
    const deck = buildDeck(DEMO_DECK, pairs, patient.id.length)
    return layOutBoard(deck, patient.id.length).map((card, i) => ({
      key: `${i}-${card.id}`,
      card,
      matched: false,
    }))
  }, [pairs, patient.id])

  const [slots, setSlots] = useState<Slot[]>(board)
  const [faceUp, setFaceUp] = useState<string[]>([])
  const [hintKey, setHintKey] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // ── Telemetry state ──
  const flipsRef = useRef<Flip[]>([])
  const seenCardsRef = useRef<Set<string>>(new Set())
  const revisitsRef = useRef(0)
  const nonMatchStreakRef = useRef(0)
  const hintsRef = useRef(0)
  const trialRef = useRef(0)
  const firstFlipAtRef = useRef<number | null>(null)
  const pairLatenciesRef = useRef<number[]>([])
  const lastNonMatchRef = useRef<string | null>(null)
  const perseverationsRef = useRef(0)
  const presentedAtRef = useRef(0)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    setSlots(board)
    presentedAtRef.current = clock.now()
  }, [board, clock])

  const resolvePair = useCallback(
    (first: Slot, second: Slot, touch: { x: number; y: number; r: number } | null) => {
      const matched = first.card.id === second.card.id
      const respondedAt = clock.now()

      // A signed pair key, order-independent, so A-then-B and B-then-A are the
      // same mistake. Repeating it is perseveration.
      const pairKey = [first.card.id, second.card.id].sort().join('|')
      const isPerseveration = !matched && lastNonMatchRef.current === pairKey
      if (isPerseveration) perseverationsRef.current += 1

      const latency =
        firstFlipAtRef.current === null ? null : respondedAt - firstFlipAtRef.current
      if (latency !== null) pairLatenciesRef.current.push(latency)

      emit({
        game_type: 'xorai_milan',
        domain: 'attention',
        trial_index: trialRef.current,
        difficulty_level: level,
        // The raw flip sequence for this pair, so the analysis can reconstruct
        // the board history without a second table.
        stimulus_id: `${first.card.id}>${second.card.id}`,
        presented_at_ms: presentedAtRef.current,
        first_touch_at_ms: firstFlipAtRef.current,
        responded_at_ms: respondedAt,
        correct: matched,
        error_type: isPerseveration ? 'perseveration' : matched ? 'none' : 'random',
        hints_used: hintsRef.current,
        retrieval_interval_s: null,
        hint_latency_ms: null,
        // Grid-position bias: where on the card the finger landed.
        touch_x: touch ? touch.x : null,
        touch_y: touch ? touch.y : null,
        target_radius_px: touch ? touch.r : null,
      })

      trialRef.current += 1
      firstFlipAtRef.current = null

      if (matched) {
        nonMatchStreakRef.current = 0
        lastNonMatchRef.current = null
        setSlots((current) =>
          current.map((s) => (s.card.id === first.card.id ? { ...s, matched: true } : s)),
        )
        setFaceUp([])
        // THE reason this game exists: the caption, spoken, in their language.
        void speak(first.card.item_name_key)
        busyRef.current = false
        return
      }

      lastNonMatchRef.current = pairKey
      nonMatchStreakRef.current += 1

      /**
       * Errorless. A non-match simply flips both back. No sound, no mark, no
       * red, nothing that says "no". The board looks exactly as it did.
       */
      window.setTimeout(() => {
        setFaceUp([])
        busyRef.current = false

        // Three in a row and the game helps rather than letting them grind: one
        // already-seen card is briefly re-revealed. The patient experiences a
        // success; the telemetry records the hint.
        if (nonMatchStreakRef.current >= NON_MATCHES_BEFORE_HINT) {
          nonMatchStreakRef.current = 0
          hintsRef.current += 1
          setSlots((current) => {
            const candidate = current.find((s) => !s.matched && seenCardsRef.current.has(s.card.id))
            if (candidate) {
              setHintKey(candidate.key)
              window.setTimeout(() => setHintKey(null), visibleMs)
            }
            return current
          })
        }
      }, visibleMs)
    },
    [clock, emit, level, speak, visibleMs],
  )

  // ── Flip capture: pointerdown, never click (architecture.md 6) ──
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    const onPointerDown = (event: PointerEvent) => {
      if (busyRef.current || done) return

      const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-slot-key]')
      const key = el?.dataset['slotKey']
      if (!key) return

      const slot = slots.find((s) => s.key === key)
      if (!slot || slot.matched || faceUp.includes(key)) return

      const at = clock.now()

      /**
       * Revisit rate: flipping a card that has already been seen. It is a direct
       * working-memory index — the patient looked at this exact object a moment
       * ago and is looking again because it did not stay.
       */
      if (seenCardsRef.current.has(slot.card.id)) revisitsRef.current += 1
      seenCardsRef.current.add(slot.card.id)
      flipsRef.current.push({ slotKey: key, cardId: slot.card.id, at })

      const next = [...faceUp, key]
      setFaceUp(next)

      if (next.length === 1) {
        firstFlipAtRef.current = at
        return
      }

      busyRef.current = true
      const firstSlot = slots.find((s) => s.key === next[0])
      if (!firstSlot) {
        busyRef.current = false
        return
      }

      const rect = el?.getBoundingClientRect()
      resolvePair(
        firstSlot,
        slot,
        rect
          ? {
              x: event.clientX - (rect.left + rect.width / 2),
              y: event.clientY - (rect.top + rect.height / 2),
              r: Math.round(Math.min(rect.width, rect.height) / 2),
            }
          : null,
      )
    }

    surface.addEventListener('pointerdown', onPointerDown, { passive: false })
    return () => surface.removeEventListener('pointerdown', onPointerDown)
  }, [slots, faceUp, clock, resolvePair, done])

  // ── Completion ──
  useEffect(() => {
    if (done) return
    if (slots.length > 0 && slots.every((s) => s.matched)) setDone(true)
  }, [slots, done])

  useEffect(() => {
    if (!done) return

    const lat = pairLatenciesRef.current
    const mean = lat.length > 0 ? lat.reduce((a, b) => a + b, 0) / lat.length : null
    const sd =
      mean !== null && lat.length > 1
        ? Math.sqrt(lat.reduce((s, v) => s + (v - mean) ** 2, 0) / (lat.length - 1))
        : null
    const totalFlips = flipsRef.current.length

    const summary: GameSummary = {
      game_type: 'xorai_milan',
      domain: 'attention',
      difficulty_level: level,
      trials_presented: trialRef.current,
      trials_completed: trialRef.current,
      mean_rt_ms: mean,
      sd_rt_ms: sd,
      cv_rt: mean !== null && sd !== null && mean > 0 ? sd / mean : null,
      accuracy_raw: trialRef.current > 0 ? pairs / trialRef.current : null,
      accuracy_hint_adjusted: null,
      hint_rate: trialRef.current > 0 ? hintsRef.current / trialRef.current : null,
    }

    // Emitted as a final summary row so revisit rate and perseveration count
    // survive into the analysis without a schema change. Both are per-game
    // derived values, which is exactly what `features` is for (migration 0004).
    emit({
      game_type: 'xorai_milan',
      domain: 'attention',
      trial_index: trialRef.current,
      difficulty_level: level,
      stimulus_id: 'summary',
      presented_at_ms: presentedAtRef.current,
      first_touch_at_ms: null,
      responded_at_ms: clock.now(),
      correct: null,
      error_type: null,
      hints_used: hintsRef.current,
      retrieval_interval_s: null,
      hint_latency_ms: null,
      touch_x: null,
      touch_y: null,
      target_radius_px: null,
      features: {
        revisit_rate: totalFlips > 0 ? revisitsRef.current / totalFlips : null,
        total_flips: totalFlips,
        revisits: revisitsRef.current,
        perseverations: perseverationsRef.current,
        grid_cols: grid.cols,
        grid_rows: grid.rows,
      },
    })

    onComplete(summary)
  }, [done, level, pairs, grid, clock, emit, onComplete])

  return (
    <div
      ref={surfaceRef}
      className="grid gap-4 [touch-action:none]"
      style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
    >
      {slots.map((slot) => {
        const open = slot.matched || faceUp.includes(slot.key) || hintKey === slot.key
        return (
          <button
            key={slot.key}
            type="button"
            data-slot-key={slot.key}
            aria-label={open ? t(slot.card.alt_text_key) : t('milan.cardBack')}
            style={{ transitionDuration: `${FLIP_MS}ms` }}
            className={
              'relative aspect-square w-[150px] overflow-hidden rounded-card border-[3px] ' +
              'transition-[border-color,box-shadow] outline-none ' +
              'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
              // A matched pair keeps a thin brass frame and stays on the board.
              (slot.matched ? 'border-brass shadow-[0_0_0_3px_var(--brass-soft)] ' : 'border-ink ')
            }
          >
            {open ? (
              <img
                src={slot.card.image_url}
                alt=""
                draggable={false}
                className="h-full w-full object-cover"
              />
            ) : (
              <CardBack />
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * The card back carries the gamosa diamond in brass-soft on terracotta —
 * design.md Part II 4. It is the same motif as the session border, so the board
 * reads as part of the same cloth.
 */
function CardBack() {
  return (
    <span
      aria-hidden="true"
      className="block h-full w-full"
      style={{
        backgroundColor: 'var(--terracotta)',
        backgroundImage:
          'repeating-linear-gradient(45deg, var(--brass-soft) 0 2px, transparent 2px 14px),' +
          'repeating-linear-gradient(-45deg, var(--brass-soft) 0 2px, transparent 2px 14px)',
      }}
    />
  )
}

export const xoraiMilanGame: Game = {
  id: 'xorai_milan',
  domains: ['attention', 'memory', 'perceptual_motor'],
  minSeverity: 'severe',
  Component: XoraiMilanGame,
}
