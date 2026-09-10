import { create } from 'zustand'
import type { GameType, LocalPatient, SessionClock } from '@/core/telemetry/types'

/**
 * Session state, and nothing else.
 *
 * rules.md 3: Zustand plus TanStack Query cover state between them, and the
 * split is not arbitrary. Anything the server owns — the patient profile as
 * stored, family members, reminders — is server state and belongs to TanStack
 * Query or to Dexie. What lives here is the ephemeral shape of the session
 * currently on screen, which no server knows about and which is gone when the
 * tablet is handed back.
 *
 * Deliberately absent: telemetry rows (they go straight to the outbox), sync
 * status (caregiver mode reads Dexie for that), and anything a game computes for
 * itself. A store that accumulates those becomes a second source of truth for
 * data that already has one.
 */

export type SessionPhase = 'idle' | 'orientation' | 'music' | 'gameA' | 'gameB' | 'close'

/** The ordered spine of a session. architecture.md 7.5. */
export const SESSION_PHASES: SessionPhase[] = ['orientation', 'music', 'gameA', 'gameB', 'close']

export type SessionState = {
  sessionId: string | null
  clock: SessionClock | null
  patient: LocalPatient | null

  phase: SessionPhase
  /** Index into the two selected games; 0 = game A, 1 = game B. */
  gameIndex: number
  /** The two games chosen for this session, in order. */
  selectedGames: GameType[]

  /** 0..1. Drives the woven border and nothing else — never shown as a number. */
  progress: number

  begin: (input: {
    sessionId: string
    clock: SessionClock
    patient: LocalPatient
    selectedGames: GameType[]
  }) => void
  setPhase: (phase: SessionPhase) => void
  setGameIndex: (index: number) => void
  setProgress: (progress: number) => void
  end: () => void
}

const IDLE = {
  sessionId: null,
  clock: null,
  patient: null,
  phase: 'idle' as const,
  gameIndex: 0,
  selectedGames: [] as GameType[],
  progress: 0,
}

export const useSessionStore = create<SessionState>((set) => ({
  ...IDLE,

  begin: ({ sessionId, clock, patient, selectedGames }) =>
    set({ ...IDLE, sessionId, clock, patient, selectedGames, phase: 'orientation' }),

  setPhase: (phase) => set({ phase }),
  setGameIndex: (gameIndex) => set({ gameIndex }),

  // Clamped here rather than at every call site: the woven border reads this
  // directly, and a value outside 0..1 would render a frame that is impossible
  // to interpret rather than an obviously wrong number.
  setProgress: (progress) => set({ progress: Math.min(1, Math.max(0, progress)) }),

  end: () => set({ ...IDLE }),
}))
