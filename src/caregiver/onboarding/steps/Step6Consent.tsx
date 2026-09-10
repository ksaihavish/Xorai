import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Checkbox,
  Field,
  FormError,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  Toggle,
} from '@/caregiver/auth/Form'
import type { StepProps } from '@/caregiver/onboarding/OnboardingFlow'
import { recordConsent } from '@/caregiver/onboarding/api'
import { NOTICE_VERSION, type ConsentScopes } from '@/caregiver/onboarding/schema'

type OptionalCategory = 'photos' | 'audio' | 'analytics'
const OPTIONAL: OptionalCategory[] = ['photos', 'audio', 'analytics']

/**
 * DPDP Act 2023, s.6 and the Rules 2025.
 *
 * Consent must be free, specific, informed, unconditional, unambiguous, given by
 * clear affirmative action, and limited to what the stated purpose needs. Where
 * the data principal cannot consent for themselves, it comes from their lawful
 * guardian and the fiduciary must obtain verifiable guardian consent. The Fourth
 * Schedule exempts clinical establishments and registered practitioners from the
 * verifiability requirement; prd.md 9 is explicit that we are not one of those,
 * so we implement guardian consent properly rather than lean on an exemption we
 * do not have.
 *
 * What that means concretely on this screen:
 * - a plain-language purpose per category, not one blanket paragraph
 * - four separate toggles, three of which genuinely turn something off
 * - every toggle starts OFF except the one the product cannot run without,
 *   because a pre-ticked box is not a clear affirmative action
 * - an attestation the guardian actively ticks, in the first person
 * - the notice version and locale stored with the record, so we can always say
 *   which words were on screen when permission was given
 */
export function Step6Consent({
  caregiverId,
  patient,
  onNext,
  onBack,
  noticeLocale,
}: StepProps & { noticeLocale: string }) {
  const { t } = useTranslation()

  // Off by default. Pre-ticking would make this a notice, not a consent.
  const [photos, setPhotos] = useState(false)
  const [audio, setAudio] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  const [relationship, setRelationship] = useState('')
  const [attested, setAttested] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const values: Record<OptionalCategory, boolean> = { photos, audio, analytics }
  const setters: Record<OptionalCategory, (next: boolean) => void> = {
    photos: setPhotos,
    audio: setAudio,
    analytics: setAnalytics,
  }

  const submit = async () => {
    if (!patient) return
    if (!attested) {
      setErrorKey('consent.guardian.attestationRequired')
      return
    }
    if (!relationship.trim()) {
      setErrorKey('common.required')
      return
    }

    setBusy(true)
    setErrorKey(null)

    const scopes: ConsentScopes = { gameplay: true, photos, audio, analytics }
    const result = await recordConsent(
      patient.id,
      caregiverId,
      relationship.trim(),
      scopes,
      noticeLocale,
    )

    setBusy(false)
    if (result.ok) onNext()
    else setErrorKey(result.messageKey)
  }

  return (
    <div>
      <h2 className="mb-4 text-[24px] font-semibold tracking-[-0.01em]">{t('consent.title')}</h2>
      <p className="mb-8 max-w-[72ch] text-[15px] leading-[1.6] text-ink">{t('consent.intro')}</p>

      {errorKey ? <FormError>{t(errorKey)}</FormError> : null}

      {/* Required category. Rendered as a statement rather than a disabled
          toggle: a switch that cannot move invites someone to try to move it. */}
      <section className="mb-6 border-t border-rule pt-6">
        <h3 className="mb-1 text-[16px] font-semibold">{t('consent.categories.gameplay.name')}</h3>
        <p className="mb-3 max-w-[72ch] text-[14px] leading-[1.6] text-clay">
          {t('consent.categories.gameplay.purpose')}
        </p>
        <p className="text-[14px] font-medium text-ink">
          {t('consent.categories.gameplay.requiredNote')}
        </p>
      </section>

      {OPTIONAL.map((category) => (
        <section key={category} className="mb-6 border-t border-rule pt-6">
          <h3 className="mb-1 text-[16px] font-semibold">
            {t(`consent.categories.${category}.name`)}
          </h3>
          <p
            id={`consent-${category}-purpose`}
            className="mb-2 max-w-[72ch] text-[14px] leading-[1.6] text-clay"
          >
            {t(`consent.categories.${category}.purpose`)}
          </p>
          <p className="mb-3 max-w-[72ch] text-[14px] leading-[1.6] text-ink">
            {t(`consent.categories.${category}.offNote`)}
          </p>
          <Toggle
            id={`consent-${category}`}
            checked={values[category]}
            onChange={setters[category]}
            onLabel={t('consent.toggleOn')}
            offLabel={t('consent.toggleOff')}
            describedBy={`consent-${category}-purpose`}
          />
        </section>
      ))}

      <section className="mb-6 border-t border-rule pt-6">
        <h3 className="mb-4 text-[16px] font-semibold">{t('consent.guardian.heading')}</h3>

        <Field
          id="guardian-relationship"
          label={t('consent.guardian.relationship')}
          hint={t('consent.guardian.relationshipHint')}
          required
        >
          <TextInput
            id="guardian-relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            required
          />
        </Field>

        <Checkbox
          id="guardian-attest"
          checked={attested}
          onChange={setAttested}
          label={t('consent.guardian.attestation')}
        />
      </section>

      <p className="mb-2 max-w-[72ch] text-[14px] text-clay">{t('consent.residency')}</p>
      <p className="mb-8 tabular text-[13px] text-clay">
        {t('consent.noticeVersionLabel')}: {NOTICE_VERSION} · {noticeLocale}
      </p>

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>{t('common.back')}</SecondaryButton>
        <PrimaryButton onClick={() => void submit()} disabled={busy || !attested || !relationship.trim()}>
          {busy ? t('common.loading') : t('consent.submit')}
        </PrimaryButton>
      </div>
    </div>
  )
}
