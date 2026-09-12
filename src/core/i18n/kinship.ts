/**
 * The kinship table. architecture.md 7.1 and 10.
 *
 * Lives in src/core/ because BOTH modes need it: patient mode speaks the term,
 * caregiver onboarding offers it as a picker. rules.md 2 forbids either mode
 * importing from the other, and the boundary lint rule caught this when it was
 * briefly in src/patient/games/aponjon/ — correctly.
 *
 * ─── Why this file is not a list of translated words ───
 *
 * Assamese, Khasi and Mizo encode relationships far more specifically than
 * English does. English collapses four different people into "uncle"; these
 * languages do not, and the distinction is not decorative — Khasi is
 * matrilineal, so the maternal uncle (*kni*) is structurally central to the
 * family in a way no English word carries.
 *
 * So what this file defines is the STRUCTURE: which distinctions exist and must
 * be preserved. Paternal versus maternal. Elder versus younger. That structure
 * is the real localisation work, and getting it right is what makes the voice
 * prompt say the word a person has been called by for sixty years instead of a
 * generic English label.
 *
 * The `en` glosses below are placeholders in the honest sense: English has no
 * word for several of these, so the gloss is a description. **Owner 2 supplies
 * the actual terms per language** (memory.md, content track). No Assamese, Khasi
 * or Mizo words are invented here — a wrong kinship term spoken to an elder is
 * worse than an English one, because it is confidently wrong.
 *
 * `generation` and `side` exist for error typing, not for display: choosing a
 * sibling's name for a spouse is a different clinical signal from a random pick,
 * and that judgement needs to know the two are the same generation.
 */

export type KinshipSide = 'paternal' | 'maternal' | 'own' | 'none'

export type KinshipEntry = {
  key: string
  /** 0 = same generation, +1 = parents, -1 = children, +2 grandparents. */
  generation: number
  side: KinshipSide
  /** English description. NOT a translation — several have no English word. */
  gloss: string
}

export const KINSHIP_TABLE: KinshipEntry[] = [
  // ── same generation ──
  { key: 'kin.spouse', generation: 0, side: 'own', gloss: 'Husband or wife' },
  { key: 'kin.elder_brother', generation: 0, side: 'own', gloss: 'Elder brother' },
  { key: 'kin.younger_brother', generation: 0, side: 'own', gloss: 'Younger brother' },
  { key: 'kin.elder_sister', generation: 0, side: 'own', gloss: 'Elder sister' },
  { key: 'kin.younger_sister', generation: 0, side: 'own', gloss: 'Younger sister' },

  // ── one generation up. The four English calls "uncle" and "aunt". ──
  { key: 'kin.father', generation: 1, side: 'own', gloss: 'Father' },
  { key: 'kin.mother', generation: 1, side: 'own', gloss: 'Mother' },
  {
    key: 'kin.father_elder_brother',
    generation: 1,
    side: 'paternal',
    gloss: "Father's elder brother",
  },
  {
    key: 'kin.father_younger_brother',
    generation: 1,
    side: 'paternal',
    gloss: "Father's younger brother",
  },
  { key: 'kin.father_sister', generation: 1, side: 'paternal', gloss: "Father's sister" },
  {
    // Khasi: kni. Matrilineal societies place this person at the centre of the
    // household, which is precisely the relationship English has no word for.
    key: 'kin.mother_brother',
    generation: 1,
    side: 'maternal',
    gloss: "Mother's brother",
  },
  { key: 'kin.mother_elder_sister', generation: 1, side: 'maternal', gloss: "Mother's elder sister" },
  {
    key: 'kin.mother_younger_sister',
    generation: 1,
    side: 'maternal',
    gloss: "Mother's younger sister",
  },

  // ── two up ──
  { key: 'kin.father_father', generation: 2, side: 'paternal', gloss: "Father's father" },
  { key: 'kin.father_mother', generation: 2, side: 'paternal', gloss: "Father's mother" },
  { key: 'kin.mother_father', generation: 2, side: 'maternal', gloss: "Mother's father" },
  { key: 'kin.mother_mother', generation: 2, side: 'maternal', gloss: "Mother's mother" },

  // ── down ──
  { key: 'kin.son', generation: -1, side: 'own', gloss: 'Son' },
  { key: 'kin.daughter', generation: -1, side: 'own', gloss: 'Daughter' },
  { key: 'kin.grandson', generation: -2, side: 'own', gloss: 'Grandson' },
  { key: 'kin.granddaughter', generation: -2, side: 'own', gloss: 'Granddaughter' },

  { key: 'kin.other', generation: 0, side: 'none', gloss: 'Family' },
]

const BY_KEY = new Map(KINSHIP_TABLE.map((entry) => [entry.key, entry]))

export function kinshipEntry(key: string | null): KinshipEntry | null {
  if (!key) return null
  return BY_KEY.get(key) ?? null
}

/**
 * Two people close enough that confusing them is a semantic error rather than a
 * random one.
 *
 * Same generation is the criterion, because that is where the clinically
 * meaningful confusions live: naming a sibling for a spouse, or a daughter for a
 * niece. Naming a grandchild for a father is not a near miss.
 */
export function isSemanticallyNear(a: string | null, b: string | null): boolean {
  const first = kinshipEntry(a)
  const second = kinshipEntry(b)
  if (!first || !second) return false
  if (first.key === second.key) return false
  return first.generation === second.generation
}
