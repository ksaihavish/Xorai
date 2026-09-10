import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES } from '@/core/i18n/languages'
import {
  Field,
  FormError,
  PrimaryButton,
  Select,
  TextInput,
} from '@/caregiver/auth/Form'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { BUCKETS, savePatientProfile, setPatientPhoto, uploadObject } from '@/caregiver/onboarding/api'
import { educationLevel, type EducationLevel } from '@/caregiver/onboarding/schema'

const EDUCATION_VALUES: EducationLevel[] = ['none', 'primary', 'middle', 'secondary', 'higher']

export function Step1Profile({ caregiverId, patient, onPatientChange, onNext }: StepProps) {
  const { t } = useTranslation()

  const [displayName, setDisplayName] = useState(patient?.display_name ?? '')
  const [birthYear, setBirthYear] = useState(patient?.birth_year?.toString() ?? '')
  const [education, setEducation] = useState<string>(patient?.education_level ?? '')
  const [language, setLanguage] = useState(patient?.language ?? 'en')
  const [homePlace, setHomePlace] = useState(patient?.home_place ?? '')
  const [photo, setPhoto] = useState<File | null>(null)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const parsedEducation = educationLevel.safeParse(education)
    if (!parsedEducation.success) {
      setErrorKey('common.required')
      return
    }

    setBusy(true)
    setErrorKey(null)

    const saved = await savePatientProfile(caregiverId, patient?.id ?? null, {
      display_name: displayName.trim(),
      birth_year: birthYear ? Number(birthYear) : null,
      education_level: parsedEducation.data,
      language,
      home_place: homePlace.trim() || null,
    })

    if (!saved.ok) {
      setBusy(false)
      setErrorKey(saved.messageKey)
      return
    }

    let current = saved.value

    // Uploaded after the row exists, because the storage policy in 0002 matches
    // on a <patient_id>/ prefix that does not exist until then.
    if (photo) {
      const upload = await uploadObject(BUCKETS.patientPhotos, current.id, photo, photo.name)
      if (upload.ok) {
        await setPatientPhoto(current.id, upload.value)
        current = { ...current, photo_path: upload.value }
      }
    }

    setBusy(false)
    onPatientChange(current)
    onNext()
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="mb-6 text-[24px] font-semibold tracking-[-0.01em]">
        {t('onboarding.profile.title')}
      </h2>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      <Field
        id="displayName"
        label={t('onboarding.profile.displayName')}
        hint={t('onboarding.profile.displayNameHint')}
        required
      >
        <TextInput
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </Field>

      <Field
        id="birthYear"
        label={t('onboarding.profile.birthYear')}
        hint={t('onboarding.profile.birthYearHint')}
      >
        <TextInput
          id="birthYear"
          inputMode="numeric"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, ''))}
        />
      </Field>

      {/* The "why" is on screen, not in a tooltip. Asking someone how far their
          parent went in school is intrusive unless the reason is given. */}
      <Field
        id="education"
        label={t('onboarding.profile.education')}
        hint={t('onboarding.profile.educationWhy')}
        required
      >
        <Select
          id="education"
          value={education}
          onChange={(e) => setEducation(e.target.value)}
          required
        >
          <option value="" disabled>
            —
          </option>
          {EDUCATION_VALUES.map((value) => (
            <option key={value} value={value}>
              {t(`onboarding.profile.educationOptions.${value}`)}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="language"
        label={t('onboarding.profile.language')}
        hint={t('onboarding.profile.languageHint')}
        required
      >
        <Select id="language" value={language} onChange={(e) => setLanguage(e.target.value)} required>
          {LANGUAGES.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.endonym}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        id="homePlace"
        label={t('onboarding.profile.homePlace')}
        hint={t('onboarding.profile.homePlaceHint')}
      >
        <TextInput
          id="homePlace"
          value={homePlace}
          onChange={(e) => setHomePlace(e.target.value)}
        />
      </Field>

      <Field
        id="photo"
        label={t('onboarding.profile.photo')}
        hint={t('onboarding.profile.photoHint')}
      >
        <input
          id="photo"
          type="file"
          accept="image/*"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
          className="block w-full text-[14px] text-clay file:mr-3 file:rounded-[6px] file:border file:border-rule file:bg-paperSunk file:px-3 file:py-2 file:text-[14px] file:text-ink"
        />
      </Field>

      <PrimaryButton type="submit" disabled={busy}>
        {busy ? t('common.loading') : t('common.continue')}
      </PrimaryButton>
    </form>
  )
}
