import { forwardRef, type ReactNode } from 'react'

/**
 * The dhol head. design.md Part II 4.
 *
 * A single line-drawn target, 400 px minimum, centred. It is the whole
 * interactive surface of the game: one target, tap only, no gestures.
 *
 * The lacing pulses in brass-soft on each beat of the model rhythm, driven by
 * the AUDIO clock rather than by a frame counter. That makes it a visual
 * metronome as well as decoration — which matters, because a hard-of-hearing
 * patient can still play this game entirely from the pulse.
 *
 * Zero literacy, zero language, zero visual acuity requirement. It is the game
 * that stays playable deepest into progression, and the cleanest reaction-time
 * variability measurement in the app, because there is no cognitive task layered
 * on top of the timing.
 */
export const DholHead = forwardRef<
  HTMLDivElement,
  { pulsing: boolean; listening: boolean; size?: number; children?: ReactNode }
>(function DholHead({ pulsing, listening, size = 420, children }, ref) {
  return (
    <div
      ref={ref}
      // touch-action none + a non-passive listener on the parent is what stops a
      // scroll gesture stealing or delaying the tap being measured.
      className="relative select-none [touch-action:none]"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 420 420"
        fill="none"
        aria-hidden="true"
        className="absolute inset-0"
      >
        <circle
          cx="210"
          cy="210"
          r="196"
          fill="var(--paper-sunk)"
          stroke="var(--ink)"
          strokeWidth="6"
        />

        {/* The lacing. Sixteen cords, pulsing on the beat. */}
        {Array.from({ length: 16 }, (_, i) => {
          const angle = (i / 16) * Math.PI * 2
          const x1 = 210 + Math.cos(angle) * 196
          const y1 = 210 + Math.sin(angle) * 196
          const x2 = 210 + Math.cos(angle + 0.42) * 150
          const y2 = 210 + Math.sin(angle + 0.42) * 150
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={pulsing ? 'var(--brass)' : 'var(--clay)'}
              strokeWidth={pulsing ? 6 : 4}
              strokeLinecap="round"
              style={{ transition: 'stroke 90ms linear, stroke-width 90ms linear' }}
            />
          )
        })}

        <circle
          cx="210"
          cy="210"
          r="150"
          fill={pulsing ? 'var(--brass-soft)' : 'var(--paper)'}
          stroke="var(--ink)"
          strokeWidth="5"
          style={{ transition: 'fill 120ms linear' }}
        />

        {/* A quiet centre mark so the head has a middle to aim at. */}
        <circle cx="210" cy="210" r="54" fill="none" stroke="var(--clay)" strokeWidth="3" />

        {/* Listening: a brass rim, so "your turn" is a change of state, not a
            written instruction. No word appears on this surface at all. */}
        {listening ? (
          <circle cx="210" cy="210" r="186" fill="none" stroke="var(--brass)" strokeWidth="5" />
        ) : null}
      </svg>
      {children}
    </div>
  )
})

/**
 * The brass ring that expands from the touch point and fades over 250 ms.
 *
 * design.md 7 allows motion only in direct response to the patient's own action,
 * and this is that: it is the acknowledgement that the tap registered. It never
 * indicates whether the tap was on time — that would be a failure state.
 */
export function TapRipple({ x, y }: { x: number; y: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x,
        top: y,
        width: 0,
        height: 0,
        border: '4px solid var(--brass)',
        transform: 'translate(-50%, -50%)',
        animation: 'xorai-ripple 250ms ease-out forwards',
      }}
    />
  )
}
