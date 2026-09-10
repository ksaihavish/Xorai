import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const REVEAL_MS = 800
const HOLD_MS = 3000

/**
 * The one control in patient mode that is not for the patient.
 *
 * architecture.md 3: a press-and-hold for 3 seconds in a fixed corner, and **no
 * PIN in v1** — nothing collects one at onboarding and `caregivers` has no
 * `pin_hash`. A 3-second hold on an unmarked corner is not discoverable by
 * someone who taps everything, which is the whole security model and an honest
 * one. Adding a PIN later needs a schema column and an onboarding step.
 *
 * Not a tap (patients tap everything) and not a gesture (gestures are banned in
 * patient mode by design.md 5 — this control sits deliberately outside the
 * patient UI contract, and is the single exception).
 *
 * Nothing renders until 800 ms into the hold. Before that there is no hover
 * state, no border, no cursor change and no ripple: a patient who finds a hidden
 * control has found a way to end their own session.
 *
 * The two thresholds are timers and the ring is animation-frame driven,
 * deliberately in that order. A frame callback can be throttled to nothing when
 * the compositor is busy or the document is not being painted, and a caregiver
 * holding the corner for three seconds must get out regardless of whether the
 * ring managed to draw. The ring is feedback; the timer is the contract.
 */
export function ExitGuard({ onExit }: { onExit: () => void }) {
  const [ringProgress, setRingProgress] = useState(0)
  const revealTimer = useRef<number | null>(null)
  const exitTimer = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const startedAt = useRef<number | null>(null)

  const stop = useCallback(() => {
    if (revealTimer.current !== null) window.clearTimeout(revealTimer.current)
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current)
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    revealTimer.current = null
    exitTimer.current = null
    frame.current = null
    startedAt.current = null
    setRingProgress(0)
  }, [])

  useEffect(() => stop, [stop])

  const drawRing = useCallback(() => {
    const start = startedAt.current
    if (start === null) return

    const elapsed = performance.now() - start
    setRingProgress(Math.min(1, Math.max(0, (elapsed - REVEAL_MS) / (HOLD_MS - REVEAL_MS))))

    if (elapsed < HOLD_MS) {
      frame.current = requestAnimationFrame(drawRing)
    }
  }, [])

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    startedAt.current = performance.now()

    revealTimer.current = window.setTimeout(() => {
      // A minimum so the ring is visible even if no frame ever lands.
      setRingProgress((current) => Math.max(current, 0.001))
      frame.current = requestAnimationFrame(drawRing)
    }, REVEAL_MS)

    exitTimer.current = window.setTimeout(() => {
      stop()
      onExit()
    }, HOLD_MS)
  }

  return (
    <div
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(e) => e.preventDefault()}
      // No aria label, no role, no title. It is not announced because it is not
      // a patient control; the caregiver is told where it is out of band.
      aria-hidden="true"
      className="absolute bottom-0 left-0 z-30 h-[60px] w-[60px] touch-none"
    >
      {ringProgress > 0 && (
        <div
          className="pointer-events-none absolute inset-[6px] rounded-full"
          style={{
            background: `conic-gradient(var(--brass) ${ringProgress * 360}deg, transparent 0deg)`,
            // The ring, not the disc: mask the middle out.
            WebkitMask: 'radial-gradient(circle, transparent 58%, #000 60%)',
            mask: 'radial-gradient(circle, transparent 58%, #000 60%)',
            opacity: 0.85,
          }}
        />
      )}
    </div>
  )
}
