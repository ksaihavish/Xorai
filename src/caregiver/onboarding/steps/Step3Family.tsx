import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Checkbox,
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextInput,
} from '@/caregiver/auth/Form'
import { KINSHIP_TABLE } from '@/core/i18n/kinship'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { VoiceNoteRecorder } from '@/caregiver/onboarding/VoiceNoteRecorder'
import {
  BUCKETS,
  addFamilyMember,
  listFamily,
  removeFamilyMember,
  uploadObject,
} from '@/caregiver/onboarding/api'
import type { FamilyMemberRow } from '@/caregiver/onboarding/schema'

export function Step3Family({ patient, onNext, onBack }: StepProps) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<FamilyMemberRow[]>([])
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const [name, setName] = useState('')
  const [kinshipTerm, setKinshipTerm] = useState('')
  const [relationship, setRelationship] = useState('')
  const [phone, setPhone] = useState('')
  const [isEmergency, setIsEmergency] = useState(false)
  const [photo, setPhoto] = useState<File | null>(null)
  const [voiceNote, setVoiceNote] = useState<Blob | null>(null)

  useEffect(() => {
    if (!patient) return
    let active = true
    void listFamily(patient.id).then((result) => {
      if (!active) return
      if (result.ok) setMembers(result.value)
      else setErrorKey(result.messageKey)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [patient])

  const reset = () => {
    setName('')
    setKinshipTerm('')
    setRelationship('')
    setPhone('')
    setIsEmergency(false)
    setPhoto(null)
    setVoiceNote(null)
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!patient || !name.trim()) return

    setBusy(true)
    setErrorKey(null)

    let photoPath: string | null = null
    if (photo) {
      const upload = await uploadObject(BUCKETS.familyPhotos, patient.id, photo, photo.name)
      if (upload.ok) photoPath = upload.value
    }

    let voicePath: string | null = null
    if (voiceNote) {
      const upload = await uploadObject(BUCKETS.voiceNotes, patient.id, voiceNote, 'note.webm')
      if (upload.ok) voicePath = upload.value
    }

    const result = await addFamilyMember(patient.id, {
      display_name: name.trim(),
      // Stored as an i18n key, not as a word: the kinship table is per language
      // and Khasi, Assamese and Mizo encode relationships English cannot.
      kinship_term_key: kinshipTerm.trim() || null,
      relationship_en: relationship.trim() || null,
      phone: phone.trim() || null,
      is_emergency: isEmergency,
      photo_path: photoPath,
      voice_note_path: voicePath,
      sort_order: members.length,
    })

    setBusy(false)
    if (!result.ok) {
      setErrorKey(result.messageKey)
      return
    }

    setMembers((current) => [...current, result.value])
    reset()
  }

  const remove = async (id: string) => {
    const result = await removeFamilyMember(id)
    if (result.ok) setMembers((current) => current.filter((m) => m.id !== id))
    else setErrorKey(result.messageKey)
  }

  const canContinue = members.length > 0

  return (
    <div>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.01em]">
        {t('onboarding.family.title')}
      </h2>
      <p className="mb-8 max-w-[72ch] text-[15px] leading-[1.6] text-clay">
        {t('onboarding.family.intro')}
      </p>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      {loading ? <p className="text-[14px] text-clay">{t('common.loading')}</p> : null}

      {members.length > 0 ? (
        <ul className="mb-8 divide-y divide-rule border-y border-rule">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-4 py-3">
              <span className="text-[15px]">
                <span className="font-medium">{member.display_name}</span>
                {member.relationship_en ? (
                  <span className="text-clay"> · {member.relationship_en}</span>
                ) : null}
                {member.is_emergency ? (
                  <span className="ml-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-madder">
                    {t('onboarding.family.isEmergency')}
                  </span>
                ) : null}
              </span>
              <SecondaryButton onClick={() => void remove(member.id)}>
                {t('common.remove')}
              </SecondaryButton>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={add} noValidate className="mb-8 border-t border-rule pt-6">
        <h3 className="mb-4 text-[14px] font-semibold uppercase tracking-[0.08em] text-clay">
          {t('onboarding.family.addAnother')}
        </h3>

        <Field id="fm-name" label={t('onboarding.family.name')} required>
          <TextInput id="fm-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>

        <Field
          id="fm-kinship"
          label={t('onboarding.family.kinshipTerm')}
          hint={t('onboarding.family.kinshipHint')}
        >
          <Select
            id="fm-kinship"
            value={kinshipTerm}
            onChange={(e) => setKinshipTerm(e.target.value)}
          >
            <option value="">&#8212;</option>
            {KINSHIP_TABLE.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {t(entry.key, { defaultValue: entry.gloss })}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="fm-relationship"
          label={t('onboarding.family.relationship')}
          hint={t('onboarding.family.relationshipHint')}
        >
          <TextInput
            id="fm-relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </Field>

        <Field id="fm-phone" label={t('onboarding.family.phone')} hint={t('onboarding.family.phoneHint')}>
          <TextInput
            id="fm-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>

        <div className="mb-5">
          <Checkbox
            id="fm-emergency"
            label={t('onboarding.family.isEmergency')}
            checked={isEmergency}
            onChange={setIsEmergency}
          />
        </div>

        <Field id="fm-photo" label={t('onboarding.family.photo')}>
          <input
            id="fm-photo"
            type="file"
            accept="image/*"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="block w-full text-[14px] text-clay file:mr-3 file:rounded-[6px] file:border file:border-rule file:bg-paperSunk file:px-3 file:py-2 file:text-[14px] file:text-ink"
          />
        </Field>

        <Field
          id="fm-voice"
          label={t('onboarding.family.voiceNote')}
          hint={t('onboarding.family.voiceNoteHint')}
        >
          <VoiceNoteRecorder onRecorded={setVoiceNote} disabled={busy} />
        </Field>

        <PrimaryButton type="submit" disabled={busy || !name.trim()}>
          {busy ? t('common.loading') : t('common.add')}
        </PrimaryButton>
      </form>

      {!canContinue ? (
        <p className="mb-4 text-[14px] text-clay">{t('onboarding.family.atLeastOne')}</p>
      ) : null}

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t('common.back')}</SecondaryButton>
        <PrimaryButton onClick={onNext} disabled={!canContinue}>
          {t('common.continue')}
        </PrimaryButton>
      </div>
    </div>
  )
}
