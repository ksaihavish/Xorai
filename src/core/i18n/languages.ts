/**
 * The languages the product speaks. Codes are what goes into `patients.language`
 * and what names the audio folder under public/audio/<code>/.
 *
 * `endonym` is the language's own name for itself, because a caregiver picking a
 * language from a list should not have to read English to find their own.
 */
export const LANGUAGES = [
  { code: 'en', endonym: 'English', script: 'latin' },
  { code: 'as', endonym: 'অসমীয়া', script: 'bengali' },
  { code: 'brx', endonym: 'बड़ो', script: 'devanagari' },
  { code: 'mni', endonym: 'মৈতৈলোন্', script: 'bengali' },
  { code: 'ne', endonym: 'नेपाली', script: 'devanagari' },
  { code: 'hi', endonym: 'हिन्दी', script: 'devanagari' },
  { code: 'kha', endonym: 'Khasi', script: 'latin' },
  { code: 'lus', endonym: 'Mizo ṭawng', script: 'latin' },
] as const

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const DEFAULT_LANGUAGE: LanguageCode = 'en'

export function isLanguageCode(value: string): value is LanguageCode {
  return LANGUAGES.some((l) => l.code === value)
}
