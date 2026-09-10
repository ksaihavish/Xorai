import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge resolves `text-*` against its own idea of what a font size looks
 * like. The patient scale is named (design.md 3) rather than t-shirt-sized, so
 * `text-prompt` was being classified as a colour and dropped whenever a real
 * colour followed it — the type silently collapsed to the 16 px browser default,
 * which is 8 px below this product's type floor. Teach it the scale instead.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['prompt', 'promptLg', 'body', 'name', 'btn'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
