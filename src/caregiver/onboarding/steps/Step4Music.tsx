import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/caregiver/auth/Form'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { VoiceNoteRecorder } from '@/caregiver/onboarding/VoiceNoteRecorder'
import {
  BUCKETS,
  addMusicTrack,
  listMusic,
  removeMusicTrack,
  uploadObject,
} from '@/caregiver/onboarding/api'
import type { MusicTrackRow } from '@/caregiver/onboarding/schema'

/**
 * Optional, and the copy says plainly that we would not skip it. Musical memory
 * survives differently: people who can no longer follow a conversation still
 * recognise the songs of their twenties. Two minutes here is worth more later
 * than most of the rest of onboarding.
 */
export function Step4Music({ patient, onNext, onBack }: StepProps) {
  const { t } = useTranslation()
  const [tracks, setTracks] = useState<MusicTrackRow[]>([])
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [recording, setRecording] = useState<Blob | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!patient) return
    let active = true
    void listMusic(patient.id).then((result) => {
      if (!active) return
      if (result.ok) setTracks(result.value)
      else setErrorKey(result.messageKey)
    })
    return () => {
      active = false
    }
  }, [patient])

  const add = async () => {
    if (!patient) return
    const blob: Blob | null = file ?? recording
    if (!blob || !title.trim()) return

    setBusy(true)
    setErrorKey(null)

    const fileName = file ? file.name : 'recording.webm'
    const upload = await uploadObject(BUCKETS.music, patient.id, blob, fileName)
    if (!upload.ok) {
      setBusy(false)
      setErrorKey(upload.messageKey)
      return
    }

    const result = await addMusicTrack(
      patient.id,
      title.trim(),
      upload.value,
      file ? 'upload' : 'recorded',
    )
    setBusy(false)

    if (!result.ok) {
      setErrorKey(result.messageKey)
      return
    }

    setTracks((current) => [...current, result.value])
    setTitle('')
    setFile(null)
    setRecording(null)
  }

  const remove = async (track: MusicTrackRow) => {
    const result = await removeMusicTrack(track.id, track.audio_path)
    if (result.ok) setTracks((current) => current.filter((item) => item.id !== track.id))
    else setErrorKey(result.messageKey)
  }

  return (
    <div>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.01em]">
        {t('onboarding.music.title')}
      </h2>
      <p className="mb-2 max-w-[72ch] text-[15px] leading-[1.6] text-ink">
        {t('onboarding.music.intro')}
      </p>
      <p className="mb-8 max-w-[72ch] text-[14px] font-medium text-clay">
        {t('onboarding.music.encouraged')}
      </p>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      {tracks.length > 0 ? (
        <ul className="mb-8 divide-y divide-rule border-y border-rule">
          {tracks.map((track) => (
            <li key={track.id} className="flex items-center justify-between gap-4 py-3">
              <span className="text-[15px]">{track.title}</span>
              <SecondaryButton onClick={() => void remove(track)}>
                {t('common.remove')}
              </SecondaryButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-8 text-[14px] text-clay">{t('onboarding.music.empty')}</p>
      )}

      <div className="mb-8 border-t border-rule pt-6">
        <Field id="track-title" label={t('onboarding.music.trackTitle')}>
          <TextInput id="track-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <Field id="track-file" label={t('onboarding.music.upload')}>
          <input
            id="track-file"
            type="file"
            accept="audio/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setRecording(null)
            }}
            className="block w-full text-[14px] text-clay file:mr-3 file:rounded-[6px] file:border file:border-rule file:bg-paperSunk file:px-3 file:py-2 file:text-[14px] file:text-ink"
          />
        </Field>

        <Field id="track-record" label={t('onboarding.music.record')}>
          <VoiceNoteRecorder
            onRecorded={(blob) => {
              setRecording(blob)
              setFile(null)
            }}
            disabled={busy}
          />
        </Field>

        <PrimaryButton
          onClick={() => void add()}
          disabled={busy || !title.trim() || (!file && !recording)}
        >
          {busy ? t('common.loading') : t('common.add')}
        </PrimaryButton>
      </div>

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t('common.back')}</SecondaryButton>
        <PrimaryButton onClick={onNext}>
          {tracks.length > 0 ? t('common.continue') : t('common.skip')}
        </PrimaryButton>
      </div>
    </div>
  )
}
