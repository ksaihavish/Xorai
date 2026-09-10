import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ExitGuard } from '@/patient/shell/ExitGuard'
import { WovenSessionBorder } from '@/patient/shell/WovenSessionBorder'
import { useKioskLocks } from '@/patient/shell/useKioskLocks'

const MIN_LANDSCAPE_WIDTH = 1024

/**
 * design.md 10: patient mode is designed at 1024x600 — a 7" tablet in landscape,
 * the tightest real target — and says so if launched smaller.
 */
function useIsWideEnough(): boolean {
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= MIN_LANDSCAPE_WIDTH,
  )

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${MIN_LANDSCAPE_WIDTH}px)`)
    const update = () => setWide(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return wide
}

export function PatientShell({
  children,
  progress,
  onExit,
}: {
  children: ReactNode
  /** 0..1. The woven frame is the only indicator; there is no bar and no number. */
  progress: number
  onExit: () => void
}) {
  const wideEnough = useIsWideEnough()
  useKioskLocks(wideEnough)

  return (
    <div
      data-mode="patient"
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 select-none overflow-hidden bg-paper font-sans text-ink [overscroll-behavior:none] [touch-action:manipulation]"
      style={{
        // Responsive rather than fixed: design.md 10 makes height the binding
        // constraint, and a 40 px prompt plus 72 px buttons plus 240 px cards
        // leaves very little of a 600 px-tall viewport to give away to a frame.
        ['--woven-w' as string]: 'clamp(12px, 2.6vh, 16px)',
      }}
    >
      {wideEnough ? (
        <>
          <WovenSessionBorder progress={progress} />

          <main
            className="absolute flex flex-col items-center justify-center gap-8 overflow-hidden px-8 py-8"
            style={{
              top: 'var(--woven-w)',
              right: 'var(--woven-w)',
              bottom: 'var(--woven-w)',
              left: 'var(--woven-w)',
            }}
          >
            {children}
          </main>

          <ExitGuard onExit={onExit} />
        </>
      ) : (
        <RotateNotice />
      )}
    </div>
  )
}

/**
 * Not an error state — design.md 6 forbids those in patient mode entirely. It is
 * an instruction, phrased as one, and it never implies the patient did anything.
 *
 */
function RotateNotice() {
  const { t } = useTranslation()

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-10 text-center">
      <RotateMark />
      <p className="max-w-patient text-prompt text-ink">{t('patient.rotate.title')}</p>
      <p className="max-w-patient text-body text-clay">{t('patient.rotate.body')}</p>
    </div>
  )
}

function RotateMark() {
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      fill="none"
      stroke="var(--madder)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="30" y="14" width="36" height="58" rx="6" />
      <path d="M20 66a34 34 0 0 0 12 12" />
      <path d="M18 56v10h10" />
    </svg>
  )
}
