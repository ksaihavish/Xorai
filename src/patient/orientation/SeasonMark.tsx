import type { Season } from '@/patient/orientation/questions'

/**
 * The four seasons as line drawings. design.md Part II 4: the season question is
 * the one orientation question that does not depend on literacy at all, so it
 * uses drawings rather than words.
 *
 * Single-weight, 5 px stroke, one colour, no fill, no shading — the house style
 * for every structural object (design.md Part II 2, "silhouette, not
 * illustration"). It is what makes a japi and a hurricane lantern look like they
 * belong in the same product, and it stays legible to a low-contrast-sensitivity
 * eye at card size.
 *
 * Hand-drawn rather than lucide-react, which the lint rule bans in patient mode
 * precisely so these carry the same stroke as everything else.
 */
export function SeasonMark({ season }: { season: Season }) {
  return (
    <svg
      width="140"
      height="140"
      viewBox="0 0 140 140"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {season === 'bihu' ? <Bihu /> : null}
      {season === 'monsoon' ? <Monsoon /> : null}
      {season === 'harvest' ? <Harvest /> : null}
      {season === 'winter' ? <Winter /> : null}
    </svg>
  )
}

/** Spring: the dhol and a flowering branch — Rongali Bihu, unmistakable locally. */
function Bihu() {
  return (
    <>
      <rect x="26" y="52" width="58" height="40" rx="8" />
      <path d="M26 62h58M26 82h58" />
      <path d="M100 96V54" />
      <path d="M100 66c8-4 14-2 18 2M100 80c8-4 14-2 18 2" />
      <circle cx="100" cy="48" r="7" />
    </>
  )
}

/** Monsoon: cloud and rain. */
function Monsoon() {
  return (
    <>
      <path d="M40 66a20 20 0 0 1 38-8 16 16 0 0 1 20 20 12 12 0 0 1-12 10H50a16 16 0 0 1-10-22Z" />
      <path d="M50 102l-6 16M72 102l-6 16M94 102l-6 16" />
    </>
  )
}

/** Harvest: sheaves of paddy. */
function Harvest() {
  return (
    <>
      <path d="M52 116V56M70 116V44M88 116V56" />
      <path d="M52 56c-10-8-12-18-10-26 10 2 16 10 16 20" />
      <path d="M70 44c-11-9-13-21-11-30 11 3 18 12 18 23" />
      <path d="M88 56c10-8 12-18 10-26-10 2-16 10-16 20" />
      <path d="M34 116h72" />
    </>
  )
}

/** Winter: bare branch and a low sun. */
function Winter() {
  return (
    <>
      <circle cx="46" cy="50" r="16" />
      <path d="M96 116V44" />
      <path d="M96 74c-10-6-16-4-22 2M96 92c10-6 16-4 22 2M96 58c8-6 13-5 18 0" />
    </>
  )
}
