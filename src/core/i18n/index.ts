import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../../i18n/en.json'
import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from '@/core/i18n/languages'

/**
 * i18next, with FLAT dot-keys. architecture.md 10.
 *
 * ─── Why keySeparator is false ───
 *
 * `i18n/en.json` is a flat map: the key is literally `"orientation.prompts.day"`,
 * not a nested object path. Two reasons, both practical:
 *
 *  1. A key maps one-to-one onto an audio filename —
 *     `public/audio/{lang}/orientation.prompts.day.mp3`. Nested objects would
 *     need a traversal to recover that name, and the traversal is a place for
 *     the file and the key to disagree.
 *  2. Key parity between languages becomes a set comparison rather than a tree
 *     diff, which is what `tests/i18n.test.ts` relies on.
 *
 * Every existing `t('some.dot.path')` call keeps working unchanged, because the
 * flat key IS the dot path.
 *
 * ─── Untranslated languages fall back, they do not guess ───
 *
 * The `{lang}.json` files ship with metadata only until owner 2 fills them.
 * `fallbackLng: 'en'` means a missing key renders English. That is deliberate:
 * English a caregiver can read beats invented Assamese nobody can, and a wrong
 * kinship term in front of a judge from the region is worse than no term at all.
 */
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  // The whole point: keys are flat strings containing dots.
  keySeparator: false,
  nsSeparator: false,
  interpolation: {
    // React escapes for us; double-escaping mangles names with apostrophes.
    escapeValue: false,
  },
  returnNull: false,
})

const loaded = new Set<LanguageCode>([DEFAULT_LANGUAGE])

/**
 * Loads a language bundle on demand.
 *
 * Bundles are separate chunks rather than one import, so a device carries the
 * strings for its own language and not for seven. The same principle as the font
 * subsets and the audio precache — every one of them is about what a tablet in a
 * village has room for.
 *
 * A failed load is not an error the patient may ever see (design.md 6): the app
 * keeps running in whatever language it already had.
 */
export async function loadLanguage(code: string): Promise<void> {
  if (!isLanguageCode(code)) return
  if (loaded.has(code)) {
    await i18next.changeLanguage(code)
    return
  }

  try {
    const bundle = (await import(`../../../i18n/${code}.json`)) as { default: Record<string, string> }
    // Metadata keys are bookkeeping for owner 2, not strings to render.
    const strings = Object.fromEntries(
      Object.entries(bundle.default).filter(([key]) => !key.startsWith('_meta')),
    )
    i18next.addResourceBundle(code, 'translation', strings, true, true)
    loaded.add(code)
  } catch {
    // Bundle missing or malformed. fallbackLng carries the UI in English.
  }

  await i18next.changeLanguage(code)
}

/** Whether a language has real strings yet, for the caregiver's language picker. */
export function isTranslated(code: string): boolean {
  if (code === DEFAULT_LANGUAGE) return true
  const bundle = i18next.getResourceBundle(code, 'translation') as
    | Record<string, string>
    | undefined
  if (!bundle) return false
  return Object.keys(bundle).some((key) => !key.startsWith('_meta'))
}

export { i18next }
