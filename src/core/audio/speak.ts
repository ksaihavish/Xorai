import { DEFAULT_LANGUAGE } from '@/core/i18n/languages'

/**
 * speak(key) — plays a pre-generated file. architecture.md 10.
 *
 * ─── THE architectural rule ───
 *
 * No Bhashini call ever happens at runtime. Not on a slow connection, not as a
 * fallback, not once. Every string was rendered to `public/audio/{lang}/{key}.mp3`
 * at build time by `scripts/generate-audio.ts` and precached by the service
 * worker, so a full session runs with the network off and ZERO requests.
 *
 * That is not an optimisation. The tablet this runs on is in a house in Jorhat
 * with intermittent signal, and a voice-led product whose voice needs a network
 * is a product that goes silent exactly when it is being used.
 *
 * rules.md 3 bans any runtime translation or TTS API for the same reason.
 *
 * ─── A real voice beats a generated one, always ───
 *
 * Where a caregiver has recorded something — a family voice note, a reminder in
 * a grandchild's voice — that recording takes priority over the generated file.
 * design.md 9: it is better clinically and better emotionally, and it removes
 * the last runtime TTS dependency for dynamic content that was never in
 * `en.json` to begin with (a family member's name, a custom reminder label).
 *
 * ─── Failure is silent ───
 *
 * A missing file logs in development and plays nothing. design.md 6 forbids any
 * patient-facing error, including this one: audio fails, the text stays on
 * screen, and the session continues.
 */

let currentLanguage: string = DEFAULT_LANGUAGE
let playing: HTMLAudioElement | null = null

/** Keys already known to be absent, so one missing file is not a repeated fetch. */
const missing = new Set<string>()

export function setSpeechLanguage(code: string): void {
  currentLanguage = code
}

export function audioUrlFor(key: string, language = currentLanguage): string {
  // The key IS the filename. That one-to-one mapping is why i18n keys are flat.
  return `/audio/${language}/${key}.mp3`
}

export type SpeakOptions = {
  /**
   * A caregiver recording for this exact content. Takes priority over the
   * generated file whenever it exists.
   */
  voiceNoteUrl?: string | null
  /** Resolve as soon as playback starts rather than when it ends. */
  dontWait?: boolean
}

/**
 * Resolves when the utterance finishes, so a caller can sequence speech against
 * what is on screen. Never rejects — every failure path resolves quietly.
 */
export async function speak(key: string, options: SpeakOptions = {}): Promise<void> {
  stop()

  const url = options.voiceNoteUrl ?? (missing.has(key) ? null : audioUrlFor(key))
  if (!url) {
    logMissing(key)
    return
  }

  try {
    const audio = new Audio(url)
    playing = audio

    const finished = new Promise<void>((resolve) => {
      audio.onended = () => resolve()
      audio.onerror = () => {
        // A 404 here means generate-audio.ts has not run for this key. Recorded
        // so the next call skips straight past it rather than re-fetching.
        if (!options.voiceNoteUrl) missing.add(key)
        logMissing(key)
        resolve()
      }
    })

    await audio.play()
    if (options.dontWait) return
    await finished
  } catch {
    // Autoplay policy, a decode failure, or the file is not there. The patient
    // sees the screen unchanged, which is the correct behaviour.
    logMissing(key)
  }
}

export function stop(): void {
  if (!playing) return
  try {
    playing.pause()
  } catch {
    // Already ended.
  }
  playing = null
}

function logMissing(key: string): void {
  if (import.meta.env.DEV) {
    console.info(`[speak] no audio for "${key}" in ${currentLanguage}`)
  }
}

/**
 * The factory the session runner and the assistance layer use.
 *
 * Signature-compatible with the Phase 4 stub it replaces, so nothing that calls
 * `speak(key)` had to change.
 */
export function createSpeaker(language: string): (key: string) => Promise<void> {
  setSpeechLanguage(language)
  return (key: string) => speak(key)
}
