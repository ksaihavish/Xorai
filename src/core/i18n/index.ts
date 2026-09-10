import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../../i18n/en.json'
import { DEFAULT_LANGUAGE } from '@/core/i18n/languages'

/**
 * buildbook amendment 1: nothing user-facing is ever hardcoded, from Phase 1
 * onward. Every string in both modes goes through t() against i18n/en.json, so
 * Phase 5 is a wiring job rather than a rewrite.
 *
 * Bundles are statically imported rather than fetched. The patient path must
 * make zero network requests, and a translation that arrives over the network is
 * a translation that is missing on a tablet in a village with no signal.
 *
 * Phase 5 adds the remaining seven languages and moves loading to per-language
 * chunks so a device carries only its own.
 */
void i18next.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    // React escapes for us; double-escaping mangles names with apostrophes.
    escapeValue: false,
  },
  returnNull: false,
})

export { i18next }
