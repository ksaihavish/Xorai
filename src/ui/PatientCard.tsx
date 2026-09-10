import { useState, type Ref } from 'react'
import { cn } from '@/ui/cn'

type PatientCardProps = {
  /** Alt text is mandatory, in the active language (design.md 10). */
  imageSrc: string
  imageAlt: string
  caption: string
  /** design.md 4.1: a photo sits at 1:1 or 4:3. Nothing else. */
  aspect?: '1:1' | '4:3'
  onSelect?: () => void
  className?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * A face, a match tile, a contact. design.md 5.
 *
 * The pressed border is drawn as border + 1 px ring rather than by widening the
 * border from 2 px to 3 px, because widening a border reflows the card under the
 * finger. Same 3 px of visible edge, no layout shift.
 *
 * No scale transform on press, for the same reason as PatientButton.
 */
export function PatientCard({
  imageSrc,
  imageAlt,
  caption,
  aspect = '1:1',
  onSelect,
  className,
  ref,
}: PatientCardProps) {
  const [pressed, setPressed] = useState(false)

  return (
    <button
      ref={ref}
      type="button"
      onClick={onSelect}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={cn(
        'group flex min-w-[240px] flex-col items-center gap-3 rounded-card border-2 bg-paper p-3',
        'transition-[border-color,box-shadow] duration-[120ms]',
        'outline-none focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-focus',
        pressed
          ? 'border-brass shadow-[0_0_0_1px_var(--brass)]'
          : 'border-clay shadow-none',
        className,
      )}
    >
      <img
        src={imageSrc}
        alt={imageAlt}
        draggable={false}
        className={cn(
          'w-full rounded-[12px] bg-paperSunk object-cover',
          aspect === '1:1' ? 'aspect-square' : 'aspect-[4/3]',
        )}
      />
      <span className="text-name text-ink">{caption}</span>
    </button>
  )
}
