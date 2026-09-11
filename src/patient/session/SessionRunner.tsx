import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { v7 as uuidv7 } from 'uuid'
import { META_KEYS, db, readMeta, writeMeta } from '@/core/db/dexie'
import { createSessionClock } from '@/core/telemetry/clock'
import { emitSession } from '@/core/telemetry/emit'
import type {
  GameSummary,
  LocalFamilyMember,
  LocalPatient,
  SessionClock,
  SessionRecord,
  Severity,
} from '@/core/telemetry/types'
import { aponjonGame } from '@/patient/games/aponjon/AponjonGame'
import { DEMO_FAMILY } from '@/patient/games/aponjon/demoFamily'
import { dholBatorGame } from '@/patient/games/dhol-bator/DholBatorGame'
import { ghorirChobiGame } from '@/patient/games/ghorir-chobi/GhorirChobiGame'
import { xoraiMilanGame } from '@/patient/games/xorai-milan/XoraiMilanGame'
import { orientationGame } from '@/patient/orientation/OrientationGame'
import { CloseScreen } from '@/patient/session/CloseScreen'
import { GameHost, createSpeakStub, type Game } from '@/patient/session/GameHost'
import { SESSION_PHASES, useSessionStore, type SessionPhase } from '@/patient/session/store'
import { PatientShell } from '@/patient/shell/PatientShell'
import { Prompt } from '@/ui/Prompt'

/**
 * Hard limit. architecture.md 7.5: better to end while they are still willing.
 *
 * It is a cap on the whole session, not a per-game timer, and crossing it goes
 * straight to the close screen — which is a grove, not a failure. There is no
 * countdown anywhere on screen: design.md 4 bans any timer that loses progress,
 * and a visible clock on a task like this manufactures the anxiety the product
 * exists to avoid.
 */
const HARD_CAP_MS = 15 * 60 * 1_000

const MUSIC_CUE_MS = 30 * 1_000

const LAST_PLAYED_KEY = 'games_last_played'
const LAST_PAIR_KEY = 'games_last_pair'

const SEVERITY_RANK: Record<Severity, number> = { mild: 0, moderate: 1, severe: 2 }

/** All four games, real. The selection rules below choose two of them. */
const GAME_REGISTRY: Game[] = [
  dholBatorGame,
  aponjonGame,
  ghorirChobiGame,
  xoraiMilanGame,
]

/**
 * Pick 2 of 4. architecture.md 7.5, in the order the rules are given there:
 *
 *   (a) longest time since last played
 *   (b) severity gate — some games hide at 'severe'
 *   (c) never the same pair twice running
 *
 * The gate is applied first because it is a hard constraint and the other two
 * are preferences: a game the patient cannot play is not a candidate at all.
 * Rule (c) then breaks the tie that (a) would otherwise produce every session
 * once the least-recently-played pair stabilises, which is what stops the same
 * two games appearing every day for a week.
 *
 * Pure, so it can be reasoned about without a database.
 */
export function selectGames(
  registry: Game[],
  severity: Severity | null,
  lastPlayed: Record<string, number>,
  lastPair: string[],
): Game[] {
  const rank = SEVERITY_RANK[severity ?? 'mild']
  const eligible = registry.filter((game) => SEVERITY_RANK[game.minSeverity] >= rank)

  const byStaleness = [...eligible].sort(
    (a, b) => (lastPlayed[a.id] ?? 0) - (lastPlayed[b.id] ?? 0),
  )

  const chosen = byStaleness.slice(0, 2)
  const isRepeatPair =
    chosen.length === 2 &&
    lastPair.length === 2 &&
    chosen.every((game) => lastPair.includes(game.id))

  if (isRepeatPair && byStaleness.length > 2) {
    // Swap the fresher of the two for the next stalest game. Keeps the staler
    // one, which is the whole point of rule (a), while breaking the repeat.
    const replacement = byStaleness[2]
    if (replacement) return [byStaleness[0], replacement].filter(isGame)
  }

  return chosen
}

function isGame(game: Game | undefined): game is Game {
  return game !== undefined
}

export function SessionRunner({
  patient,
  onExit,
}: {
  patient: LocalPatient
  onExit: () => void
}) {
  const { t } = useTranslation()
  const store = useSessionStore()
  const [clock, setClock] = useState<SessionClock | null>(null)
  const [games, setGames] = useState<Game[]>([])
  // Phase 6 caches the real family in Dexie local_profile at onboarding. Until
  // then Aponjon runs against the marked fixture rather than not running.
  const [family] = useState<LocalFamilyMember[]>(DEMO_FAMILY)
  const sessionRef = useRef<SessionRecord | null>(null)
  const summariesRef = useRef<GameSummary[]>([])
  const speak = useMemo(() => createSpeakStub(), [])

  const { begin, setPhase, setGameIndex, setProgress, end } = store

  /**
   * Ends the session. Idempotent — the hard cap and a natural finish can race,
   * and writing the session record twice with different `completed` values would
   * make the dashboard disagree with itself.
   */
  const finish = useCallback(
    (reason: 'completed' | 'capped') => {
      const session = sessionRef.current
      if (!session || session.ended_at !== null) return

      const ended: SessionRecord = {
        ...session,
        // ISO wall clock, from the value captured once at session start. No
        // second Date.now() — see clock.ts.
        ended_at: new Date(
          new Date(session.started_at).getTime() + (clock?.now() ?? 0),
        ).toISOString(),
        completed: reason === 'completed',
        abandoned_at_game: reason === 'capped' ? (games[store.gameIndex]?.id ?? null) : null,
        pointer_sample_interval_ms: clock?.pointerSampleIntervalMs ?? null,
      }

      sessionRef.current = ended
      emitSession(ended)
      setPhase('close')
      setProgress(1)
    },
    [clock, games, store.gameIndex, setPhase, setProgress],
  )

  // ── Session start ──
  useEffect(() => {
    let active = true

    const start = async () => {
      const handle = createSessionClock()
      const sessionId = uuidv7()

      let lastPlayed: Record<string, number> = {}
      let lastPair: string[] = []
      try {
        lastPlayed = parseRecord(await readMeta(LAST_PLAYED_KEY, db))
        lastPair = parseList(await readMeta(LAST_PAIR_KEY, db))
      } catch {
        // No history is a valid state: it is the first session on this device.
      }
      if (!active) return

      const selected = selectGames(GAME_REGISTRY, patient.severity, lastPlayed, lastPair)

      const record: SessionRecord = {
        id: sessionId,
        patient_id: patient.id,
        started_at: handle.startedAt,
        ended_at: null,
        completed: false,
        abandoned_at_game: null,
        device_id: await deviceId(),
        app_version: String(import.meta.env.VITE_APP_VERSION ?? 'dev'),
        tz_offset_min: -new Date().getTimezoneOffset(),
        pointer_sample_interval_ms: null,
      }

      // Written at START as well as at end. A force-quit halfway through must
      // still leave a session row for its attempts to reference — otherwise the
      // whole session's telemetry is orphaned and every flush fails on the
      // foreign key, forever.
      sessionRef.current = record
      emitSession(record)

      setClock(handle.clock)
      setGames(selected)
      begin({
        sessionId,
        clock: handle.clock,
        patient,
        selectedGames: selected.map((game) => game.id),
      })
    }

    void start()
    return () => {
      active = false
      end()
    }
  }, [patient, begin, end])

  // ── The hard cap ──
  useEffect(() => {
    if (!clock) return
    const timer = window.setTimeout(() => finish('capped'), HARD_CAP_MS)
    return () => window.clearTimeout(timer)
  }, [clock, finish])

  // ── The music cue ──
  useEffect(() => {
    if (store.phase !== 'music') return
    const timer = window.setTimeout(() => setPhase('gameA'), MUSIC_CUE_MS)
    return () => window.clearTimeout(timer)
  }, [store.phase, setPhase])

  // ── Progress, which exists only to drive the woven border ──
  useEffect(() => {
    const position = SESSION_PHASES.indexOf(store.phase)
    if (position < 0) return
    setProgress(position / (SESSION_PHASES.length - 1))
  }, [store.phase, setProgress])

  const advance = useCallback(
    (summary: GameSummary) => {
      summariesRef.current.push(summary)

      const next: Record<SessionPhase, SessionPhase> = {
        idle: 'orientation',
        orientation: 'music',
        music: 'gameA',
        gameA: 'gameB',
        gameB: 'close',
        close: 'close',
      }

      const target = next[store.phase]
      if (target === 'close') {
        void recordPlayed(games)
        finish('completed')
        return
      }
      if (target === 'gameB') setGameIndex(1)
      setPhase(target)
    },
    [store.phase, games, finish, setPhase, setGameIndex],
  )

  const activeGame = store.phase === 'gameA' ? games[0] : store.phase === 'gameB' ? games[1] : null

  return (
    <PatientShell progress={store.progress} onExit={onExit}>
      {!clock || !store.sessionId ? null : store.phase === 'orientation' ? (
        <GameHost
          game={orientationGame}
          patient={patient}
          family={family}
          clock={clock}
          level={1}
          speak={speak}
          onComplete={advance}
          sessionId={store.sessionId}
        />
      ) : store.phase === 'music' ? (
        <MusicCue />
      ) : store.phase === 'close' ? (
        <CloseScreen patient={patient} />
      ) : activeGame ? (
        <GameHost
          game={activeGame}
          patient={patient}
          family={family}
          clock={clock}
          // Phase 10 reads this from difficulty_state. Until the staircase
          // exists, every game starts at its own level 1.
          level={1}
          speak={speak}
          onComplete={advance}
          sessionId={store.sessionId}
        />
      ) : (
        <Prompt>{t('session.stub.unavailable')}</Prompt>
      )}
    </PatientShell>
  )
}

/**
 * Thirty seconds of the patient's own music before the first task. It is not
 * filler: it is the transition that makes the tablet feel like something being
 * offered rather than something being administered.
 *
 * The player itself arrives in Phase 6 with the rest of the assistance layer.
 */
function MusicCue() {
  const { t } = useTranslation()
  return <Prompt>{t('session.music.cue')}</Prompt>
}

async function recordPlayed(games: Game[]): Promise<void> {
  try {
    const previous = parseRecord(await readMeta(LAST_PLAYED_KEY, db))
    // A counter, not a timestamp: this only ever needs an ordering, and a
    // wall-clock value here would be one more thing an NTP correction can move.
    const tick = Object.values(previous).reduce((max, value) => Math.max(max, value), 0) + 1
    const next = { ...previous }
    for (const game of games) next[game.id] = tick

    await writeMeta(LAST_PLAYED_KEY, JSON.stringify(next), db)
    await writeMeta(LAST_PAIR_KEY, JSON.stringify(games.map((game) => game.id)), db)
  } catch {
    // Losing the history costs one repeated pair, not a session.
  }
}

async function deviceId(): Promise<string> {
  try {
    const existing = await readMeta(META_KEYS.deviceId, db)
    if (typeof existing === 'string' && existing.length > 0) return existing
    const fresh = uuidv7()
    await writeMeta(META_KEYS.deviceId, fresh, db)
    return fresh
  } catch {
    return 'unknown-device'
  }
}

function parseRecord(value: unknown): Record<string, number> {
  if (typeof value !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (parsed === null || typeof parsed !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [key, entry] of Object.entries(parsed)) {
      if (typeof entry === 'number') out[key] = entry
    }
    return out
  } catch {
    return {}
  }
}

function parseList(value: unknown): string[] {
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

