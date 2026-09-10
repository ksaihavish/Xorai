import type { ReactNode } from 'react'
import { cn } from '@/ui/cn'

/**
 * The instruction. One per screen (design.md 4: maximum two actions per screen,
 * one thing to read).
 *
 * Copy discipline lives with the caller, not here: present tense, active voice,
 * 12 words or fewer, sentence case (design.md 3). Every prompt is also spoken
 * automatically on screen entry — literacy is not assumable.
 */
export function Prompt({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('mx-auto max-w-patient text-center text-prompt text-ink', className)}>
      {children}
    </p>
  )
}
