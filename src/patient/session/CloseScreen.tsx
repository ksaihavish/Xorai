import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { db, readMeta, writeMeta } from '@/core/db/dexie'
import type { LocalPatient } from '@/core/telemetry/types'

const GROVE_KEY = 'completed_sessions'

/**
 * The bamboo grove. design.md 8.
 *
 * This is the patient's ONLY feedback across sessions, and the rules governing
 * it are short and absolute:
 *
 *   It grows. It never shrinks. It never resets.
 *
 * One culm per completed session, taller and denser over weeks. A missed day
 * adds nothing and takes nothing away. There is no number on this screen, no
 * percentage, and above all no streak — a streak punishes illness and shames the
 * caregiver, and the caregiver is the person we most need to keep.
 *
 * Bamboo because it is regionally correct across the whole North East, because
 * it is a real object rather than a metaphor invented for an app, and because it
 * has exactly the right property: it grows and it does not go backwards.
 */
export function CloseScreen({ patient }: { patient: LocalPatient }) {
  const { t } = useTranslation()
  const [culms, setCulms] = useState<number | null>(null)

  useEffect(() => {
    let active = true

    const record = async () => {
      try {
        const previous = await readMeta(GROVE_KEY, db)
        const next = (typeof previous === 'number' ? previous : 0) + 1
        await writeMeta(GROVE_KEY, next, db)
        if (active) setCulms(next)
      } catch {
        // A storage failure must not show the patient an error (design.md 6).
        // The grove simply renders at its smallest; the session still completed.
        if (active) setCulms(1)
      }
    }

    void record()
    return () => {
      active = false
    }
  }, [])

  if (culms === null) return null

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <XoraiBowl />
      <BambooGrove culms={culms} />
      <p className="text-name text-ink">{t('session.close.farewell', { name: patient.display_name })}</p>
    </div>
  )
}

/**
 * The single celebratory object, in the single reward colour. design.md Part II:
 * nothing else in the product is brass.
 */
function XoraiBowl() {
  return (
    <svg
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="none"
      stroke="var(--brass)"
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M26 30h68l-8 30a20 20 0 0 1-19 14H53a20 20 0 0 1-19-14z" />
      <path d="M20 30h80" />
      <path d="M60 74v10" />
      <path d="M38 92h44" />
      <path d="M46 92c0-6 6-8 14-8s14 2 14 8" />
    </svg>
  )
}

/**
 * Culms are capped for LAYOUT only, never for meaning — the count in Dexie keeps
 * rising, and past the cap the grove reads as "many", which is the honest render
 * of a grove anyway. Nothing here ever displays the number.
 */
const MAX_DRAWN_CULMS = 24

function BambooGrove({ culms }: { culms: number }) {
  const drawn = Math.min(culms, MAX_DRAWN_CULMS)
  const width = 640
  const height = 220
  const spacing = width / (drawn + 1)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      stroke="var(--tea)"
      strokeWidth="5"
      strokeLinecap="round"
      aria-hidden="true"
      className="max-w-full"
    >
      {Array.from({ length: drawn }, (_, i) => {
        const x = spacing * (i + 1)
        // Deterministic variation from the index: a grove of identical stalks
        // reads as a chart. This has to look grown, not plotted.
        const wobble = ((i * 37) % 11) - 5
        const culmHeight = 96 + ((i * 53) % 84)
        const top = height - 20 - culmHeight

        return (
          <g key={i}>
            <path d={`M${x} ${height - 20} L${x + wobble} ${top}`} />
            {[0.34, 0.62, 0.86].map((at) => (
              <path
                key={at}
                d={`M${x + wobble * at} ${height - 20 - culmHeight * at} h14`}
                opacity={0.75}
              />
            ))}
            <path d={`M${x + wobble} ${top} l12 -14`} opacity={0.75} />
            <path d={`M${x + wobble} ${top} l-12 -10`} opacity={0.75} />
          </g>
        )
      })}
      <path d={`M40 ${height - 20} H${width - 40}`} opacity={0.4} />
    </svg>
  )
}
