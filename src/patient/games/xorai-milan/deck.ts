import type { Severity } from '@/core/telemetry/types'

/**
 * The Xorai Milan deck. architecture.md 7.3.
 *
 * ─── The weighting is the clinical argument, not a content preference ───
 *
 * Remote memory outlives recent memory. A one-horned rhino is RECOGNITION — the
 * patient knows what it is. A hurricane lantern is THEIR MEMORY — they owned
 * one, filled it, carried it to the outhouse in the monsoon. The second turns a
 * matching task into a reminiscence prompt, and reminiscence is the therapeutic
 * half of this game.
 *
 * So the deck is biased 60/40 toward 1950s-70s everyday objects over landmarks,
 * expressed as a weight on `media_assets.era`. Landmarks, festivals, fauna and
 * produce fill the remainder.
 */

export const ERA_WEIGHTS = { vintage: 0.6, contemporary: 0.4 } as const

export type Era = keyof typeof ERA_WEIGHTS

export type DeckCard = {
  id: string
  /** i18n key for the spoken caption. The reminiscence prompt. */
  item_name_key: string
  /** i18n key for the alt text. design.md 10 requires one. */
  alt_text_key: string
  image_url: string
  era: Era
  category: string
}

export type GridShape = { cols: number; rows: number }

/** 2x2 → 2x3 → 3x4 → 4x4. architecture.md 7.3. */
const GRIDS: GridShape[] = [
  { cols: 2, rows: 2 },
  { cols: 3, rows: 2 },
  { cols: 4, rows: 3 },
  { cols: 4, rows: 4 },
]

/**
 * Severity caps the grid, and 'severe' never exceeds 2x3.
 *
 * A 4x4 board in front of someone who cannot hold four items is not a harder
 * game, it is an impossible one, and the errorless contract would then paper
 * over sixteen consecutive failures.
 */
const SMALLEST_GRID: GridShape = { cols: 2, rows: 2 }

export function gridFor(level: number, severity: Severity | null): GridShape {
  const byLevel = Math.min(Math.max(level - 1, 0), GRIDS.length - 1)
  const cap = severity === 'severe' ? 1 : severity === 'moderate' ? 2 : GRIDS.length - 1
  return GRIDS[Math.min(byLevel, cap)] ?? SMALLEST_GRID
}

/**
 * How long both cards stay face-up before flipping back, in ms.
 *
 * Shrinks with level and floors at 1.2 s. Below that the task measures how fast
 * someone can move their eyes, which is not what is being asked.
 */
export function visibleMsFor(level: number): number {
  return Math.max(1_200, 3_000 - (level - 1) * 350)
}

/**
 * Pick `pairs` cards, honouring the era weighting.
 *
 * Deterministic given a seed so a re-render never reshuffles a board mid-game —
 * the same reason the orientation options are seeded.
 */
export function buildDeck(available: DeckCard[], pairs: number, seed: number): DeckCard[] {
  const vintage = available.filter((c) => c.era === 'vintage')
  const contemporary = available.filter((c) => c.era === 'contemporary')

  const wantVintage = Math.round(pairs * ERA_WEIGHTS.vintage)
  const chosen: DeckCard[] = [
    ...take(vintage, wantVintage, seed),
    ...take(contemporary, pairs - wantVintage, seed + 17),
  ]

  // Short of one era, top up from the other rather than shrinking the board.
  if (chosen.length < pairs) {
    const rest = available.filter((c) => !chosen.some((x) => x.id === c.id))
    chosen.push(...take(rest, pairs - chosen.length, seed + 29))
  }

  return chosen.slice(0, pairs)
}

function take<T>(items: T[], count: number, seed: number): T[] {
  if (count <= 0 || items.length === 0) return []
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    const j = state % (i + 1)
    const a = out[i]
    const b = out[j]
    if (a === undefined || b === undefined) continue
    out[i] = b
    out[j] = a
  }
  return out.slice(0, count)
}

/** Two of each card, shuffled deterministically. */
export function layOutBoard(deck: DeckCard[], seed: number): DeckCard[] {
  return take([...deck, ...deck], deck.length * 2, seed + 101)
}

/**
 * A stand-in deck of line-drawn objects, used until owner 1's photographic pack
 * lands (memory.md, content track). Weighted the same 60/40.
 *
 * These are drawings, and 7.3 is explicit that the real deck must be
 * PHOTOGRAPHS — recognition needs realism. They exist so the game is playable
 * and testable now, not as a substitute for the asset pack.
 */
function drawing(paths: string, bg: string): string {
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
         <rect width="200" height="200" fill="${bg}"/>
         <g fill="none" stroke="#2A211A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
       </svg>`,
    )
  )
}

const TERRACOTTA = '%23F0E2D6'
const SUNK = '%23F4EEE2'

export const DEMO_DECK: DeckCard[] = [
  // ── vintage: their memory ──
  {
    id: 'lantern',
    item_name_key: 'deck.lantern',
    alt_text_key: 'deck.lantern',
    era: 'vintage',
    category: 'household',
    image_url: drawing(
      '<path d="M78 40h44M84 40v18M116 40v18M74 58h52l6 78H68z"/><rect x="86" y="76" width="28" height="42" rx="4"/><path d="M62 136h76M100 26v14"/>',
      TERRACOTTA,
    ),
  },
  {
    id: 'radio',
    item_name_key: 'deck.radio',
    alt_text_key: 'deck.radio',
    era: 'vintage',
    category: 'household',
    image_url: drawing(
      '<rect x="40" y="70" width="120" height="76" rx="8"/><circle cx="72" cy="108" r="20"/><path d="M112 88h34M112 102h34M112 116h34"/><path d="M150 70V40"/>',
      SUNK,
    ),
  },
  {
    id: 'xorai',
    item_name_key: 'deck.xorai',
    alt_text_key: 'deck.xorai',
    era: 'vintage',
    category: 'ritual',
    image_url: drawing(
      '<path d="M56 74h88l-10 40a24 24 0 0 1-23 17H89a24 24 0 0 1-23-17z"/><path d="M48 74h104M100 131v14M74 160h52M82 160c0-8 8-11 18-11s18 3 18 11"/>',
      TERRACOTTA,
    ),
  },
  {
    id: 'japi',
    item_name_key: 'deck.japi',
    alt_text_key: 'deck.japi',
    era: 'vintage',
    category: 'craft',
    image_url: drawing(
      '<path d="M32 132a68 44 0 0 1 136 0z"/><path d="M100 88v-2M74 120a26 20 0 0 1 52 0"/><path d="M32 132h136"/>',
      SUNK,
    ),
  },
  {
    id: 'sewing',
    item_name_key: 'deck.sewing',
    alt_text_key: 'deck.sewing',
    era: 'vintage',
    category: 'household',
    image_url: drawing(
      '<path d="M44 92h96v26H44z"/><path d="M132 92V66h-52"/><path d="M80 66a12 12 0 0 0-12 12v14"/><path d="M52 118v34h80v-34M60 152l-8 16M124 152l8 16"/>',
      TERRACOTTA,
    ),
  },
  {
    id: 'dheki',
    item_name_key: 'deck.dheki',
    alt_text_key: 'deck.dheki',
    era: 'vintage',
    category: 'household',
    image_url: drawing(
      '<path d="M30 120l110-36"/><path d="M140 84l22-8"/><path d="M84 104l-8 34"/><circle cx="46" cy="140" r="14"/><path d="M118 128h34"/>',
      SUNK,
    ),
  },
  // ── contemporary: recognition ──
  {
    id: 'rhino',
    item_name_key: 'deck.rhino',
    alt_text_key: 'deck.rhino',
    era: 'contemporary',
    category: 'fauna',
    image_url: drawing(
      '<path d="M40 128c0-30 26-44 56-44s58 12 58 40v20H40z"/><path d="M152 108l14-14-4 22"/><path d="M62 144v20M96 144v20M132 144v20"/>',
      SUNK,
    ),
  },
  {
    id: 'hornbill',
    item_name_key: 'deck.hornbill',
    alt_text_key: 'deck.hornbill',
    era: 'contemporary',
    category: 'fauna',
    image_url: drawing(
      '<path d="M64 96a34 30 0 0 1 60-18l40 10-40 12"/><path d="M124 66c8-8 22-8 30 2"/><path d="M64 96c-6 34 12 58 40 60"/><circle cx="86" cy="88" r="3"/>',
      TERRACOTTA,
    ),
  },
  {
    id: 'tea',
    item_name_key: 'deck.tea',
    alt_text_key: 'deck.tea',
    era: 'contemporary',
    category: 'produce',
    image_url: drawing(
      '<path d="M100 158V72"/><path d="M100 96c-18-12-34-8-42 2 12 12 30 12 42-2z"/><path d="M100 122c18-12 34-8 42 2-12 12-30 12-42-2z"/><path d="M100 72c-6-12 0-24 8-28 4 12 0 24-8 28z"/>',
      SUNK,
    ),
  },
  {
    id: 'orchid',
    item_name_key: 'deck.orchid',
    alt_text_key: 'deck.orchid',
    era: 'contemporary',
    category: 'flora',
    image_url: drawing(
      '<path d="M100 160v-52"/><ellipse cx="100" cy="86" rx="16" ry="24"/><ellipse cx="72" cy="102" rx="22" ry="14" transform="rotate(-25 72 102)"/><ellipse cx="128" cy="102" rx="22" ry="14" transform="rotate(25 128 102)"/>',
      TERRACOTTA,
    ),
  },
]
