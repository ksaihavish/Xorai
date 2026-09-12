import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalFamilyMember } from '@/core/telemetry/types'
import { kinshipEntry } from '@/core/i18n/kinship'
import { PatientButton } from '@/ui/PatientButton'
import { Prompt } from '@/ui/Prompt'

/**
 * Family contact cards. prd.md 5.1.
 *
 * A grid of photographs. One tap dials. There is no dial pad, no contact list,
 * no search field and no scrolling beyond the grid — every one of those is a
 * learned convention this audience has no reason to know, and each is a place
 * to get lost.
 *
 * The card shows the KINSHIP TERM under the name, in madder, at 28 px
 * (design.md Part II 4). That word is the culturally loaded one — the one they
 * have been called by for sixty years — and it is what the voice speaks.
 */
export function ContactsGrid({ family }: { family: LocalFamilyMember[] }) {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <Prompt>{t('assist.contacts.title')}</Prompt>

      <div className="flex flex-wrap items-stretch justify-center gap-6">
        {family.map((member) => {
          const kin = kinshipEntry(member.kinship_term_key)
          const callable = Boolean(member.phone)

          return (
            <a
              key={member.id}
              // A plain tel: link. The OS dialer is the one piece of this the
              // patient may already know how to use, so we hand off to it
              // rather than building a phone inside a memory app.
              href={callable ? `tel:${member.phone ?? ''}` : undefined}
              aria-disabled={!callable}
              className={
                'flex min-w-[240px] flex-col items-center gap-3 rounded-card border-[3px] bg-paper p-4 ' +
                'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
                (callable ? 'border-ink' : 'border-clay opacity-60')
              }
            >
              <div className="h-[200px] w-[200px] overflow-hidden rounded-[12px] border-2 border-clay bg-paperSunk">
                {member.photo_url ? (
                  <img
                    src={member.photo_url}
                    alt={t('aponjon.photoAlt', { name: member.display_name })}
                    draggable={false}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>

              <span className="text-name text-ink">{member.display_name}</span>
              {kin ? (
                <span className="text-[28px] font-semibold text-madder">{kin.gloss}</span>
              ) : null}
              <span className="text-body text-clay">
                {callable ? t('assist.contacts.call') : t('assist.contacts.noPhone')}
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/**
 * SOS. One persistent, unmistakable control.
 *
 * Madder fill with white text — the ONE place in patient mode where madder
 * carries text, which design.md 2 permits because white on a madder fill passes
 * comfortably while madder text on paper does not. Icon plus the word, like
 * every other patient control.
 *
 * It is the only red thing the patient ever sees, which is what makes it
 * unmistakable: the errorless contract means nothing else in the product is ever
 * marked in red.
 */
export function SosButton({ family }: { family: LocalFamilyMember[] }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)

  const contact = family.find((m) => m.is_emergency && m.phone) ?? family.find((m) => m.phone)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          'fixed bottom-[calc(var(--woven-w,16px)+20px)] right-[calc(var(--woven-w,16px)+20px)] z-30 ' +
          'inline-flex min-h-touchLg items-center gap-3 rounded-patient border-[3px] border-madderDeep ' +
          'bg-madder px-8 text-btn font-semibold text-paper ' +
          'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus'
        }
      >
        <SosMark />
        {t('assist.sos.button')}
      </button>

      {confirming ? (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-10 bg-paper px-10"
        >
          <Prompt>
            {contact
              ? t('assist.sos.confirmTitle', { name: contact.display_name })
              : t('assist.sos.noContact')}
          </Prompt>

          {/* EXACTLY two options, both 72 px. Not three, and no dismiss-by-
              tapping-outside: an accidental dismissal of an emergency control
              is worse than an accidental call. */}
          <div className="flex items-center gap-6">
            {contact ? (
              <a
                href={`tel:${contact.phone ?? ''}`}
                className={
                  'inline-flex min-h-touchLg items-center rounded-patient border-[3px] border-madderDeep ' +
                  'bg-madder px-8 text-btn font-semibold text-paper ' +
                  'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus'
                }
              >
                {t('assist.sos.call')}
              </a>
            ) : null}

            <PatientButton onClick={() => setConfirming(false)}>
              {t('assist.sos.back')}
            </PatientButton>
          </div>
        </div>
      ) : null}
    </>
  )
}

function SosMark() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 30 30"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8c0-1 1-2 2-2h3l2 5-2 2a14 14 0 0 0 6 6l2-2 5 2v3c0 1-1 2-2 2A18 18 0 0 1 6 8z" />
    </svg>
  )
}
