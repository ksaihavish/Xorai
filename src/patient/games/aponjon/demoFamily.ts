import type { LocalFamilyMember } from '@/core/telemetry/types'

/**
 * A stand-in family, used only when Dexie `local_profile` holds none.
 *
 * Phase 6 caches the real profile at onboarding and this stops being reachable.
 * It exists so Aponjon can be run, seen and tested before that wiring lands —
 * the alternative is a game nobody can open for two more phases.
 *
 * The portraits are generated shapes, not photographs of anyone. They are
 * deliberately distinguishable at a glance by silhouette and hue, because a
 * face-name task built on portraits nobody can tell apart tests eyesight rather
 * than memory, and it would make the game look broken when it is not.
 *
 * The kinship keys are the point of the fixture: four people English would call
 * by two words, kept distinct.
 */

function portrait(bg: string, skin: string, cloth: string, hair: 'bun' | 'short' | 'long' | 'bald'): string {
  const hairPath =
    hair === 'bun'
      ? `<circle cx="120" cy="52" r="16" fill="${skin}" opacity="0.55"/><path d="M84 92a36 36 0 0 1 72 0" fill="${skin}" opacity="0.55"/>`
      : hair === 'short'
        ? `<path d="M84 90a36 34 0 0 1 72 0z" fill="${skin}" opacity="0.55"/>`
        : hair === 'long'
          ? `<path d="M80 96a40 40 0 0 1 80 0v54H80z" fill="${skin}" opacity="0.45"/>`
          : ''

  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
         <rect width="240" height="240" fill="${bg}"/>
         ${hairPath}
         <circle cx="120" cy="104" r="38" fill="${skin}"/>
         <path d="M52 214c0-38 30-62 68-62s68 24 68 62z" fill="${cloth}"/>
       </svg>`,
    )
  )
}

export const DEMO_FAMILY: LocalFamilyMember[] = [
  {
    id: 'demo-1',
    display_name: 'Priya',
    kinship_term_key: 'kin.daughter',
    relationship_en: 'Daughter',
    photo_url: portrait('#F4EEE2', '#8C6A4A', '#B3342B', 'bun'),
    voice_note_url: null,
    phone: null,
    is_emergency: true,
    sort_order: 0,
  },
  {
    id: 'demo-2',
    display_name: 'Nomita',
    kinship_term_key: 'kin.elder_sister',
    relationship_en: 'Elder sister',
    photo_url: portrait('#EFE7D8', '#7A5A3E', '#2E4632', 'long'),
    voice_note_url: null,
    phone: null,
    is_emergency: false,
    sort_order: 1,
  },
  {
    id: 'demo-3',
    display_name: 'Bhaskar',
    // The maternal uncle. English says "uncle" for four different people; this
    // is the one a matrilineal household is built around.
    kinship_term_key: 'kin.mother_brother',
    relationship_en: "Mother's brother",
    photo_url: portrait('#F4EEE2', '#6E5138', '#C08A2E', 'short'),
    voice_note_url: null,
    phone: null,
    is_emergency: false,
    sort_order: 2,
  },
  {
    id: 'demo-4',
    display_name: 'Ranjit',
    kinship_term_key: 'kin.spouse',
    relationship_en: 'Husband',
    photo_url: portrait('#EFE7D8', '#8C6A4A', '#5E5142', 'bald'),
    voice_note_url: null,
    phone: null,
    is_emergency: true,
    sort_order: 3,
  },
]
