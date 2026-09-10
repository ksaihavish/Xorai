import type { ReactNode } from 'react'

/**
 * Caregiver mode. A different system, not patient mode in another colour.
 *
 * design.md 4: 12 columns, 24 px gutter, 1280 px maximum, and sections separated
 * by 1 px --rule hairlines rather than by cards. The SaaS card grid is the
 * default look and this is meant to read as a clinical instrument. The only
 * carded element in the whole mode is a flag, because a flag genuinely is a
 * discrete object that gets acknowledged and dismissed.
 *
 * Inter for UI and numerals, 16 px base, 14 px floor — density is the job here,
 * where in patient mode it is the enemy.
 */
export function CaregiverAppShell({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <div data-mode="caregiver" className="min-h-screen bg-paper font-ui text-[16px] leading-[1.5] text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-caregiver items-baseline justify-between gap-6 px-6 py-5">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em]">{title}</h1>
          {actions}
        </div>
      </header>

      <div className="mx-auto grid max-w-caregiver grid-cols-12 gap-x-6 px-6 py-8">{children}</div>
    </div>
  )
}

/**
 * A hairline-divided band, not a card. Spans the full 12 columns unless told
 * otherwise; `span` takes a Tailwind col-span class so the grid stays declarative.
 *
 * `divider` is explicit rather than a `first:` variant because sections sit in a
 * 12-column grid: two sections sharing the top row are both "first" visually but
 * only one of them is the first child, which leaves the row with one hairline and
 * a hanging edge. The caller knows which row a section is on; CSS does not.
 */
export function CaregiverSection({
  heading,
  hint,
  span = 'col-span-12',
  divider = true,
  children,
}: {
  heading: string
  hint?: string
  span?: string
  divider?: boolean
  children: ReactNode
}) {
  return (
    <section className={`${span} ${divider ? 'border-t border-rule pt-6' : ''} pb-6`}>
      <div className="mb-4 flex items-baseline gap-3">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-clay">{heading}</h2>
        {hint ? <span className="text-[14px] text-clay">{hint}</span> : null}
      </div>
      {children}
    </section>
  )
}

/**
 * The one carded thing in caregiver mode.
 *
 * `level` maps to brass or madder, never to a traffic light: design.md 2.1 —
 * this product does not say "good" or "bad" about a person. The level also
 * carries a word, because colour is never the only carrier of meaning.
 */
export function CaregiverFlagCard({
  level,
  heading,
  body,
  meta,
  actions,
}: {
  level: 'amber' | 'red' | 'effort'
  heading: string
  body: string
  meta?: string
  actions?: ReactNode
}) {
  const accent =
    level === 'red' ? 'var(--madder)' : level === 'amber' ? 'var(--brass)' : 'var(--clay)'

  return (
    <article
      className="rounded-[8px] border border-rule bg-paperSunk p-5"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="mb-2 flex items-center gap-3">
        <span
          className="text-[12px] font-semibold uppercase tracking-[0.09em]"
          style={{ color: accent }}
        >
          {level}
        </span>
        {meta ? <span className="tabular text-[12px] text-clay">{meta}</span> : null}
      </div>
      <h3 className="mb-1 text-[16px] font-semibold">{heading}</h3>
      <p className="max-w-[72ch] text-[14px] text-clay">{body}</p>
      {actions ? <div className="mt-4 flex gap-3">{actions}</div> : null}
    </article>
  )
}
