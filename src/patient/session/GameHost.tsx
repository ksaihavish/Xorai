import { useMemo, type ReactNode } from 'react'
import { emitAttempt, type AttemptInput } from '@/core/telemetry/emit'
import type {
  Domain,
  GameContext,
  GameSummary,
  GameType,
  LocalPatient,
  SessionClock,
  Severity,
} from '@/core/telemetry/types'

/**
 * A game, as this codebase defines one.
 *
 * architecture.md 7 writes the interface imperatively — `mount(ctx)` / `unmount()`
 * — because it predates the decision to build the patient surfaces in React.
 * `Component` is the same contract expressed the way the rest of the app is
 * written: React owns the mounting and unmounting, and a game gets exactly one
 * argument, exactly as specified. The important half of that interface is
 * unchanged and is the reason it exists at all: a game receives `GameContext`
 * and nothing else.
 */
export type Game = {
  id: GameType
  domains: Domain[]
  /** Gate. Some games hide at 'severe'. */
  minSeverity: Severity
  Component: (props: { ctx: GameContext }) => ReactNode
}

/**
 * The only door between a game and the rest of the system.
 *
 * rules.md 2: games import from `src/core/**` only through `GameContext`. A game
 * that reaches into Dexie or Supabase directly is wrong — not stylistically, but
 * because the offline guarantee, the idempotency key and the session clock all
 * live behind this boundary. A game that writes its own rows will eventually
 * write them with the wrong clock, and nothing will report it.
 *
 * Note what is NOT on the context: no Supabase client, no Dexie handle, no fetch,
 * no `Date`. If a game needs something that is not here, the answer is to add it
 * here deliberately, not to import around it.
 */
export function GameHost({
  game,
  patient,
  clock,
  level,
  speak,
  onComplete,
  sessionId,
}: {
  game: Game
  patient: LocalPatient
  clock: SessionClock
  level: number
  speak: (key: string) => Promise<void>
  onComplete: (summary: GameSummary) => void
  sessionId: string
}) {
  const ctx = useMemo<GameContext>(
    () => ({
      patient,
      level,
      speak,
      clock,
      onComplete,

      // Wraps emitAttempt so a game never has to know the session id, its own
      // game_type, or which clock it is on. Three fewer things to get wrong in
      // four games, and the ones that would fail silently.
      emit: (event) => {
        const input: AttemptInput = {
          ...event,
          session_id: sessionId,
          patient_id: patient.id,
        }
        emitAttempt(clock, input)
      },
    }),
    [patient, level, speak, clock, onComplete, sessionId],
  )

  return <game.Component ctx={ctx} />
}

/**
 * Speech, stubbed. Phase 5 replaces this with `src/core/audio/speak.ts` playing
 * a pre-generated file for the patient's language.
 *
 * It resolves after a short delay rather than immediately, because every caller
 * is written to await it before revealing options, and a stub that resolves in
 * zero milliseconds would hide any ordering bug in that sequence until real
 * audio arrived and the bug appeared as a race in four finished games.
 *
 * No file is fetched. There is no silent asset in public/audio yet, and a 404 on
 * the patient path is a network error on a surface that must never show one.
 */
export function createSpeakStub(): (key: string) => Promise<void> {
  return (key: string) => {
    if (import.meta.env.DEV) {
      console.info(`[speak] ${key}`)
    }
    return new Promise((resolve) => setTimeout(resolve, 350))
  }
}
