import { useMemo, type ReactNode } from 'react'
import { createSpeaker } from '@/core/audio/speak'
import { emitAttempt, emitRhythmTrial, emitStroke, type AttemptInput } from '@/core/telemetry/emit'
import type {
  Domain,
  GameContext,
  GameSummary,
  GameType,
  LocalFamilyMember,
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
  family,
  clock,
  level,
  speak,
  onComplete,
  sessionId,
}: {
  game: Game
  patient: LocalPatient
  family: LocalFamilyMember[]
  clock: SessionClock
  level: number
  speak: (key: string) => Promise<void>
  onComplete: (summary: GameSummary) => void
  sessionId: string
}) {
  const ctx = useMemo<GameContext>(
    () => ({
      patient,
      family,
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

      emitRhythm: (event) => {
        emitRhythmTrial(clock, { ...event, session_id: sessionId, patient_id: patient.id })
      },

      emitStroke: (event) => {
        emitStroke(clock, { ...event, session_id: sessionId, patient_id: patient.id })
      },
    }),
    [patient, family, level, speak, clock, onComplete, sessionId],
  )

  return <game.Component ctx={ctx} />
}

/**
 * The real speaker. Phase 5 replaced the Phase 4 stub.
 *
 * Plays `public/audio/{lang}/{key}.mp3` from the precache with zero network. A
 * missing file logs in development and plays nothing — design.md 6 forbids any
 * patient-facing error, including a silent one.
 */
export function createSpeakStub(language = 'en'): (key: string) => Promise<void> {
  return createSpeaker(language)
}
