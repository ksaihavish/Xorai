import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalMusicTrack } from '@/core/telemetry/types'
import { PatientButton } from '@/ui/PatientButton'
import { Prompt } from '@/ui/Prompt'

/**
 * The patient's own music.
 *
 * ─── Why this is reachable outside a session ───
 *
 * Personalised music is used during AGITATION, not only during play. A caregiver
 * at six in the evening with a distressed relative needs one tap to the song
 * that settles them, and requiring them to start a cognitive session first would
 * make the most useful thing in the product unreachable at the moment it is most
 * needed.
 *
 * Music from a person's teens and twenties survives long after much else has
 * gone, which is why onboarding pushes so hard to collect it.
 *
 * One big play/pause and a list of cards. No scrubber, no volume slider, no
 * shuffle, no repeat — each is a decision, and none of them is worth its cost.
 */
export function MusicPlayer({ tracks }: { tracks: LocalMusicTrack[] }) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(tracks[0]?.id ?? null)
  const [playing, setPlaying] = useState(false)

  const current = tracks.find((track) => track.id === currentId) ?? null

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const toggle = async (track: LocalMusicTrack | null) => {
    if (!track?.audio_url) return

    if (audioRef.current && currentId === track.id && playing) {
      audioRef.current.pause()
      setPlaying(false)
      return
    }

    try {
      audioRef.current?.pause()
      const audio = new Audio(track.audio_url)
      audio.onended = () => setPlaying(false)
      audioRef.current = audio
      setCurrentId(track.id)
      await audio.play()
      setPlaying(true)
    } catch {
      // Autoplay refused or the file is missing. The patient sees the button
      // simply not change — never an error (design.md 6).
      setPlaying(false)
    }
  }

  if (tracks.length === 0) {
    return <Prompt>{t('assist.music.empty')}</Prompt>
  }

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <Prompt>{current?.title ?? t('assist.music.title')}</Prompt>

      <PatientButton onClick={() => void toggle(current)}>
        <PlayMark playing={playing} />
        {playing ? t('assist.music.pause') : t('assist.music.play')}
      </PatientButton>

      <div className="flex flex-wrap items-stretch justify-center gap-4">
        {tracks.map((track) => (
          <button
            key={track.id}
            type="button"
            onClick={() => void toggle(track)}
            className={
              'min-h-touchLg min-w-[240px] rounded-card border-[3px] px-6 py-4 text-name ' +
              'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
              (track.id === currentId
                ? 'border-brass bg-brassSoft text-ink'
                : 'border-ink bg-paper text-ink')
            }
          >
            {track.title}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Icon plus word, like every patient control. Never icon alone. */
function PlayMark({ playing }: { playing: boolean }) {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {playing ? <path d="M11 7v18M21 7v18" /> : <path d="M9 6l17 10L9 26z" />}
    </svg>
  )
}
