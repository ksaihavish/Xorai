import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SecondaryButton } from '@/caregiver/auth/Form'

/**
 * MediaRecorder, wrapped so a step never touches it directly.
 *
 * design.md 9: a family voice note takes priority over generated speech
 * everywhere it exists. It is better clinically and better emotionally, and it
 * removes the last runtime TTS dependency — which is why this control sits on
 * the family step rather than in a settings screen nobody opens.
 *
 * Permission refusal is a caregiver-mode error and gets a caregiver-mode
 * message: what happened, and what to do instead. Nothing about this component
 * is ever rendered in patient mode.
 */
export function VoiceNoteRecorder({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob | null) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const [recording, setRecording] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    return () => {
      releaseStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const start = async () => {
    setDenied(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        releaseStream()
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        onRecorded(blob)
      }

      recorder.start()
      recorderRef.current = recorder
      setRecording(true)
    } catch {
      setDenied(true)
      onRecorded(null)
    }
  }

  const stop = () => {
    recorderRef.current?.stop()
    recorderRef.current = null
    setRecording(false)
  }

  if (denied) {
    return <p className="text-[14px] text-clay">{t('onboarding.family.micDenied')}</p>
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {recording ? (
        <SecondaryButton onClick={stop}>{t('onboarding.family.stopRecording')}</SecondaryButton>
      ) : (
        <SecondaryButton onClick={() => void start()} disabled={disabled}>
          {previewUrl ? t('onboarding.family.reRecord') : t('onboarding.family.record')}
        </SecondaryButton>
      )}

      {previewUrl && !recording ? (
        <audio controls src={previewUrl} className="h-[36px]">
          <track kind="captions" />
        </audio>
      ) : null}
    </div>
  )
}
