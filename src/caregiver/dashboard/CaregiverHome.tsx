import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CaregiverAppShell, CaregiverSection } from '@/caregiver/AppShell'
import { useCaregiverId } from '@/caregiver/auth/AuthProvider'
import { signOut } from '@/caregiver/auth/api'
import { SyncStatus } from '@/caregiver/dashboard/SyncStatus'
import { loadDraftPatient } from '@/caregiver/onboarding/api'
import type { PatientRow } from '@/caregiver/onboarding/schema'
import { isSupabaseConfigured } from '@/core/supabase/client'

/**
 * The caregiver landing screen. Deliberately thin: Phase 13 owns the dashboard
 * proper — trends, the compliance calendar, flag cards, the clock replay and the
 * PDF export all land there.
 *
 * What it does today is the part that has to exist for the app to be coherent
 * rather than a set of routes: say who is set up, show whether anything is
 * waiting to sync, and provide the one door into patient mode.
 */
export function CaregiverHome() {
  const { t } = useTranslation()
  const caregiverId = useCaregiverId()
  const [patient, setPatient] = useState<PatientRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!caregiverId || !isSupabaseConfigured()) {
      setLoading(false)
      return
    }
    let active = true

    void loadDraftPatient(caregiverId).then((result) => {
      if (!active) return
      if (result.ok) setPatient(result.value)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [caregiverId])

  return (
    <CaregiverAppShell
      title={patient?.display_name ?? t('caregiver.home.title')}
      actions={<SyncStatus />}
    >
      {!isSupabaseConfigured() ? (
        <CaregiverSection heading={t('caregiver.home.setupNeeded')} divider={false}>
          <p className="max-w-[72ch] text-[14px] leading-[1.6] text-ink">
            {t('caregiver.home.setupNeededBody')}
          </p>
        </CaregiverSection>
      ) : null}

      <CaregiverSection heading={t('caregiver.home.title')} divider={false}>
        {loading ? (
          <p className="text-[14px] text-clay">{t('common.loading')}</p>
        ) : patient ? (
          <div className="flex flex-wrap gap-3">
            {/* A plain link, not a router navigation: patient mode wants a fresh
                document so the wake lock and orientation lock are requested from
                a top-level load rather than mid-session. */}
            <a
              href="/p"
              className="rounded-[6px] border border-ink bg-ink px-4 py-2 text-[14px] font-semibold text-paper"
            >
              {t('caregiver.home.openPatientMode')}
            </a>
            <Link
              to="/settings"
              className="rounded-[6px] border border-rule bg-paperSunk px-4 py-2 text-[14px] font-medium text-ink"
            >
              {t('caregiver.home.settings')}
            </Link>
          </div>
        ) : (
          <div>
            <p className="mb-4 max-w-[72ch] text-[14px] text-clay">
              {t('caregiver.home.noPatient')}
            </p>
            <Link
              to="/onboarding"
              className="inline-block rounded-[6px] border border-ink bg-ink px-4 py-2 text-[14px] font-semibold text-paper"
            >
              {t('caregiver.home.startOnboarding')}
            </Link>
          </div>
        )}

        {patient ? (
          <p className="mt-3 max-w-[72ch] text-[13px] text-clay">
            {t('caregiver.home.openPatientModeHint')}
          </p>
        ) : null}
      </CaregiverSection>

      <CaregiverSection heading={t('settings.title')}>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-[6px] border border-rule bg-paperSunk px-4 py-2 text-[14px] font-medium text-ink"
        >
          {t('auth.signOut')}
        </button>
      </CaregiverSection>
    </CaregiverAppShell>
  )
}
