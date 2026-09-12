import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KINSHIP_TABLE } from '@/core/i18n/kinship'

/**
 * The language layer. architecture.md 10, design.md 3 and 9.
 *
 * en.json is the source of truth. These tests are what let owner 2 fill a
 * language file and know immediately whether it is complete and safe, without
 * anyone reading 328 strings by hand.
 */

const I18N = 'i18n'
const en = load('en')

function load(lang: string): Record<string, string> {
  return JSON.parse(readFileSync(join(I18N, `${lang}.json`), 'utf8')) as Record<string, string>
}

function strings(bundle: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(bundle).filter(([k]) => !k.startsWith('_meta')))
}

/** Everything the patient can see or hear. The caregiver UI is not bound by these. */
const PATIENT_PREFIXES = [
  'patient.',
  'orientation.',
  'aponjon.',
  'deck.',
  'milan.',
  'ghorir.',
  'assist.',
  'session.',
  'kin.',
]

const isPatientKey = (key: string) => PATIENT_PREFIXES.some((p) => key.startsWith(p))

describe('en.json is a flat source of truth', () => {
  it('has only flat string values, never a nested object', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `${key} is not a string`).toBe('string')
    }
  })

  it('uses dot-namespaced keys', () => {
    expect(Object.keys(strings(en)).filter((k) => k.includes('.')).length).toBeGreaterThan(200)
  })

  it('maps every key to a legal audio filename', () => {
    // The key IS the filename: public/audio/{lang}/{key}.mp3. A key containing a
    // slash or a colon would produce a path that cannot be written.
    for (const key of Object.keys(strings(en))) {
      expect(key, `${key} is not filename-safe`).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })
})

describe('the errorless contract, enforced on the strings themselves', () => {
  /**
   * rules.md 2: these must not appear in ANY patient-mode key. The product never
   * tells the patient they were wrong — not in a message, not in a label, and
   * not in a word tucked inside a longer sentence.
   */
  it('no patient-facing string says the patient was wrong', () => {
    const forbidden = ['wrong', 'incorrect', 'try again', 'failed', 'error']
    const offenders: string[] = []

    for (const [key, value] of Object.entries(strings(en))) {
      if (!isPatientKey(key)) continue
      for (const word of forbidden) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(value)) offenders.push(`${key}: "${word}"`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('no patient-facing string carries a score, streak or percentage', () => {
    // design.md 6 bans all three outright.
    const offenders: string[] = []
    for (const [key, value] of Object.entries(strings(en))) {
      if (!isPatientKey(key)) continue
      if (/\b(score|streak|percent)\b/i.test(value) || value.includes('%')) {
        offenders.push(`${key}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('patient copy discipline (design.md 3)', () => {
  /**
   * Instructions run to 12 words or fewer. The one exception is the
   * clock-drawing command, which is a standard neuropsychological instruction:
   * shortening it would change the task rather than tighten the copy.
   */
  const LONG_BY_DESIGN = new Set(['ghorir.command'])

  it('keeps patient instructions to 12 words or fewer', () => {
    const offenders: string[] = []
    for (const [key, value] of Object.entries(strings(en))) {
      if (!isPatientKey(key) || LONG_BY_DESIGN.has(key)) continue
      const words = value.replace(/\{\{[^}]+\}\}/g, 'x').split(/\s+/).filter(Boolean)
      if (words.length > 12) offenders.push(`${key}: ${words.length} words`)
    }
    expect(offenders).toEqual([])
  })

  it('uses sentence case, never shouting', () => {
    const offenders: string[] = []
    for (const [key, value] of Object.entries(strings(en))) {
      if (!isPatientKey(key)) continue
      const shouted = value
        .split(/\s+/)
        // Must contain letters: "1024" and "8" equal their own uppercase and
        // are numbers, not shouting.
        .filter((w) => /[A-Za-z]/.test(w) && w.length > 3 && w === w.toUpperCase())
      if (shouted.length > 0) offenders.push(`${key}: ${shouted.join(' ')}`)
    }
    expect(offenders).toEqual([])
  })
})

describe('the kinship table', () => {
  it('has an en.json key for every entry', () => {
    for (const entry of KINSHIP_TABLE) {
      expect(en[entry.key], `${entry.key} missing from en.json`).toBeTruthy()
    }
  })

  it('keeps the distinctions English collapses', () => {
    const keys = KINSHIP_TABLE.map((e) => e.key)

    // Four separate people; English has one word for all of them.
    for (const key of [
      'kin.father_elder_brother',
      'kin.father_younger_brother',
      'kin.mother_brother',
      'kin.father_sister',
    ]) {
      expect(keys).toContain(key)
    }

    // Elder and younger are distinct relationships, not a modifier.
    for (const key of [
      'kin.elder_brother',
      'kin.younger_brother',
      'kin.elder_sister',
      'kin.younger_sister',
    ]) {
      expect(keys).toContain(key)
    }
  })

  it('marks the maternal uncle as maternal — Khasi is matrilineal', () => {
    expect(KINSHIP_TABLE.find((e) => e.key === 'kin.mother_brother')?.side).toBe('maternal')
  })
})

describe('every shipped language', () => {
  const langs = readdirSync(I18N)
    .filter((f) => f.endsWith('.json') && f !== 'en.json')
    .map((f) => f.replace('.json', ''))

  it('ships all seven NER languages', () => {
    expect(langs.sort()).toEqual(['as', 'brx', 'hi', 'kha', 'lus', 'mni', 'ne'])
  })

  it.each(langs)('%s declares its language and script', (lang) => {
    const bundle = load(lang)
    expect(bundle['_meta.language']).toBeTruthy()
    expect(bundle['_meta.script']).toBeTruthy()
  })

  /**
   * The parity gate, and the reason these stubs are safe to ship.
   *
   * An empty file is fine: i18next falls back to English for every missing key,
   * so an untranslated language renders English rather than invented Indic text.
   * But the moment a file has ANY real string it must have ALL of them — a
   * half-translated language is worse than an English one, because the patient
   * hears their own language and then, mid-session, does not.
   */
  it.each(langs)('%s is either empty or complete, never half-translated', (lang) => {
    const translated = strings(load(lang))
    if (Object.keys(translated).length === 0) return

    const missing = Object.keys(strings(en)).filter((key) => !translated[key])
    const extra = Object.keys(translated).filter((key) => !(key in en))

    expect(missing, `${lang} is missing ${missing.length} keys`).toEqual([])
    expect(extra, `${lang} has keys not in en.json`).toEqual([])
  })

  it.each(langs)('%s never says the patient was wrong either', (lang) => {
    const translated = strings(load(lang))
    const forbidden = ['wrong', 'incorrect', 'try again', 'failed', 'error']
    const offenders: string[] = []

    for (const [key, value] of Object.entries(translated)) {
      if (!isPatientKey(key)) continue
      for (const word of forbidden) {
        if (new RegExp(`\\b${word}\\b`, 'i').test(value)) offenders.push(`${key}: ${word}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
