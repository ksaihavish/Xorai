import { useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cn } from '@/ui/cn'

type PatientButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
  children: ReactNode
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * design.md 5. Every interactive element has a visible border AND a fill at rest:
 * users under cognitive strain cannot reliably tell interactive from
 * non-interactive, and may not know modern affordance conventions at all. There
 * is no ghost, flat or icon-only variant of this component and there must not be.
 *
 * The pressed state changes fill and border colour but never scale — a scale
 * transform moves the target out from under a tremoring finger.
 *
 * The press visual is driven by pointer events rather than :active because on
 * touch the pseudo-class is unreliable, and this is the feedback that tells the
 * patient the tap registered.
 */
export function PatientButton({
  children,
  className,
  ref,
  onPointerDown,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  ...rest
}: PatientButtonProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={(e) => {
        setPressed(true)
        onPointerDown?.(e)
      }}
      onPointerUp={(e) => {
        setPressed(false)
        onPointerUp?.(e)
      }}
      onPointerCancel={(e) => {
        setPressed(false)
        onPointerCancel?.(e)
      }}
      onPointerLeave={(e) => {
        setPressed(false)
        onPointerLeave?.(e)
      }}
      className={cn(
        'inline-flex min-h-touchLg items-center justify-center rounded-patient border-[3px] px-8',
        'text-btn font-semibold',
        // 120 ms is the press-feedback budget in design.md 7. Colour only.
        'transition-[background-color,border-color,transform] duration-[120ms]',
        // Focus ring is --focus, not brass: brass measures 2.91:1 and misses even
        // the 3:1 non-text minimum, and brass is reward-only (design.md 2, II.3).
        'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus',
        pressed
          ? 'translate-y-[2px] border-madderDeep bg-brassSoft text-ink'
          : 'translate-y-0 border-ink bg-paper text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
