import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
// Side-effect import: initialises i18next before any component calls t().
// It lives here rather than in main.tsx because main.tsx was outside this
// phase's touch list; it belongs next to the other providers.
import '@/core/i18n'
import { CaregiverAppShell, CaregiverFlagCard, CaregiverSection } from '@/caregiver/AppShell'
import { CaregiverHome } from '@/caregiver/dashboard/CaregiverHome'
import type { LocalPatient } from '@/core/telemetry/types'
import { AuthProvider } from '@/caregiver/auth/AuthProvider'
import { RequireAuth } from '@/caregiver/auth/RequireAuth'
import { NewPassword, ResetPassword } from '@/caregiver/auth/ResetPassword'
import { SignIn } from '@/caregiver/auth/SignIn'
import { SignUp } from '@/caregiver/auth/SignUp'
import { OnboardingFlow } from '@/caregiver/onboarding/OnboardingFlow'
import { ConsentSettings } from '@/caregiver/settings/ConsentSettings'
import { SessionRunner } from '@/patient/session/SessionRunner'
import { PatientShell } from '@/patient/shell/PatientShell'
import { PatientButton } from '@/ui/PatientButton'
import { PatientCard } from '@/ui/PatientCard'
import { Prompt } from '@/ui/Prompt'
import { ReplayAudioButton } from '@/ui/ReplayAudioButton'

/**
 * Patient mode. Deliberately NOT wrapped in RequireAuth — architecture.md 3: the
 * patient never authenticates. The device is bound after the caregiver signs in,
 * and entering patient mode is tapping a large photo.
 *
 * The shell is real and so is the exit; the content is empty because Phase 4
 * owns SessionRunner. Wiring the shell now means the kiosk locks, the woven
 * frame and the exit hold are exercised on the real route rather than only in
 * the /demo harness.
 */
/**
 * Module scope, NOT inside the component.
 *
 * A fresh object literal per render gives every downstream `useMemo` and
 * `useEffect` a new dependency identity, which restarted the session on every
 * pass — an infinite render loop that locks the renderer rather than throwing.
 *
 * Phase 6 replaces this with the real profile from Dexie `local_profile`, cached
 * at onboarding. Until then the route runs a session against a minimal profile
 * so the clock, the emit path and the orientation warm-up are exercised on the
 * real surface rather than only in a test.
 */
const PLACEHOLDER_PATIENT: LocalPatient = {
  id: '00000000-0000-7000-8000-000000000000',
  display_name: 'Aita',
  birth_year: 1948,
  education_level: 'primary',
  severity: 'mild',
  language: 'en',
  photo_path: null,
  home_place: 'Jorhat',
  baseline_status: 'collecting',
}

function PatientRoute() {
  return <SessionRunner patient={PLACEHOLDER_PATIENT} onExit={() => window.location.assign('/')} />
}

/**
 * Two representative screens stacked, so the two design systems can be compared
 * on one page. They share the palette and nothing else, which is the point.
 *
 * This route is a design harness, not product surface: the strings here are
 * hardcoded English placeholders and no telemetry is emitted from it.
 */
function DemoRoute() {
  const [exitRequests, setExitRequests] = useState(0)

  return (
    <div className="min-h-screen bg-paperSunk">
      {/* PatientShell is `fixed inset-0` because in production it owns the whole
          viewport. A transform on this wrapper makes it the containing block for
          fixed descendants, which bounds the shell (and its fixed replay button)
          to this section without the shell knowing it is being framed. */}
      <section
        className="relative h-[640px] w-full overflow-hidden"
        style={{ transform: 'translateZ(0)' }}
      >
        <PatientShell progress={0.4} onExit={() => setExitRequests((n) => n + 1)}>
          <ReplayAudioButton />

          <Prompt>Which one is your daughter?</Prompt>

          <div className="flex items-start gap-8">
            <PatientCard
              imageSrc={PLACEHOLDER_PORTRAIT}
              imageAlt="A photograph of a woman in her forties"
              caption="Priya"
            />
            <PatientCard
              imageSrc={PLACEHOLDER_PORTRAIT}
              imageAlt="A photograph of a woman in her sixties"
              caption="Nomita"
            />
          </div>

          <PatientButton>I am not sure</PatientButton>
        </PatientShell>
      </section>

      {/* Harness readout, outside the shell. It exists so the exit contract can be
          exercised by hand: tap the bottom-left corner, double-tap it, hold it for
          two seconds — this must stay at zero. Only a full 3-second hold moves it. */}
      <p className="border-y border-rule bg-paper px-6 py-2 font-ui text-[13px] text-clay">
        ExitGuard fired: <span className="tabular font-medium">{exitRequests}</span>
      </p>

      <CaregiverAppShell
        title="Nirmala Das"
        actions={<span className="tabular text-[14px] text-clay">Last synced 2 hours ago</span>}
      >
        <CaregiverSection
          heading="Attention"
          hint="last 30 days"
          span="col-span-12 lg:col-span-8"
          divider={false}
        >
          <div className="flex h-[220px] items-center justify-center border border-rule bg-paperSunk text-[14px] text-clay">
            Trend chart — Phase 13
          </div>
        </CaregiverSection>

        <CaregiverSection heading="Sessions" span="col-span-12 lg:col-span-4" divider={false}>
          <dl className="grid grid-cols-2 gap-y-3 text-[14px]">
            <dt className="text-clay">Completed</dt>
            <dd className="tabular text-right font-medium">24</dd>
            <dt className="text-clay">Mean latency</dt>
            <dd className="tabular text-right font-medium">1,340 ms</dd>
            <dt className="text-clay">Hint rate</dt>
            <dd className="tabular text-right font-medium">0.18</dd>
          </dl>
        </CaregiverSection>

        <CaregiverSection heading="Needs a look">
          <CaregiverFlagCard
            level="amber"
            meta="12 Aug – 26 Aug"
            heading="Attention scores have moved away from the usual range"
            body="This is worth mentioning at the next visit. It is not a finding, and a short illness or a change in medication can produce the same pattern."
            actions={
              <>
                <button className="rounded-[6px] border border-rule px-3 py-2 text-[14px] font-medium">
                  Log a care event
                </button>
                <button className="rounded-[6px] border border-rule px-3 py-2 text-[14px] font-medium">
                  Acknowledge
                </button>
              </>
            }
          />
        </CaregiverSection>
      </CaregiverAppShell>
    </div>
  )
}

/** Inline so the harness needs no asset in public/. */
const PLACEHOLDER_PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
       <rect width="240" height="240" fill="#F4EEE2"/>
       <g fill="none" stroke="#5E5142" stroke-width="3" stroke-linecap="round">
         <circle cx="120" cy="96" r="34"/>
         <path d="M58 196c0-34 28-56 62-56s62 22 62 56"/>
       </g>
     </svg>`,
  )

const router = createBrowserRouter([
  // Patient mode. No guard, by design.
  { path: '/p', element: <PatientRoute /> },

  // Public caregiver surfaces: the only routes reachable without a session.
  { path: '/auth/sign-in', element: <SignIn /> },
  { path: '/auth/sign-up', element: <SignUp /> },
  { path: '/auth/reset', element: <ResetPassword /> },
  { path: '/auth/new-password', element: <NewPassword /> },

  // Design harness.
  { path: '/demo', element: <DemoRoute /> },

  // Guarded caregiver surfaces.
  {
    path: '/onboarding',
    element: (
      <RequireAuth>
        <OnboardingFlow />
      </RequireAuth>
    ),
  },
  {
    path: '/settings',
    element: (
      <RequireAuth>
        <ConsentSettings />
      </RequireAuth>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <CaregiverHome />
      </RequireAuth>
    ),
  },
])

export function AppRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
