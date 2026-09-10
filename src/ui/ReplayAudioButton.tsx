import { PatientButton } from '@/ui/PatientButton'

/**
 * design.md 9: a replay control sits top-right on every patient screen, in the
 * same position, always.
 *
 * It carries an icon AND the word. rules.md 2 names this control specifically as
 * the one that most needs the icon-plus-word rule, because it is the most-used
 * control in the product and an icon alone is a learned convention this audience
 * has no reason to know.
 *
 * The label is hardcoded English for Phase 1. Phase 5 replaces it with t() against
 * the active language; the word must always be present, never dropped to save room.
 */
export function ReplayAudioButton({
  onReplay,
  label = 'Listen again',
}: {
  onReplay?: () => void
  label?: string
}) {
  return (
    <PatientButton
      onClick={onReplay}
      aria-label={label}
      // Offset inside the woven frame so the control never sits on the border.
      className="fixed right-[calc(var(--woven-w,16px)+16px)] top-[calc(var(--woven-w,16px)+16px)] z-20 min-w-touchLg gap-3"
    >
      <SpeakerIcon />
      <span>{label}</span>
    </PatientButton>
  )
}

/**
 * Hand-drawn rather than lucide-react: patient icons carry the same 3 px stroke as
 * the rest of the design system (rules.md 2, Boundaries — and the lint rule).
 */
function SpeakerIcon() {
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
      focusable="false"
    >
      <path d="M6 12h5l6-5v18l-6-5H6z" />
      <path d="M22 11.5a6.5 6.5 0 0 1 0 9" />
      <path d="M26 7.5a12 12 0 0 1 0 17" />
    </svg>
  )
}
