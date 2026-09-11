/**
 * Reference figures for Ghorir Chobi. architecture.md 7.4 and design.md Part II 4.
 *
 * The `copy` condition shows a clock to reproduce. The `trace` condition — for
 * severe patients — shows a North Eastern form instead: a japi outline, a
 * living-root-bridge arch, or a Naga shawl border.
 *
 * Trace variants carry the same graphomotor signal as a clock. Every timing
 * feature the analysis wants — pre-stroke hesitation, air time, latency
 * variability — comes from the pen, not from what is being drawn. What changes
 * is that failure becomes impossible: there is no wrong way to follow a line,
 * so a person who can no longer produce a clock still produces data, and still
 * finishes something.
 *
 * Rendered in brass-soft at 3 px: visible enough to follow, faint enough that
 * the patient's own line in 6 px ink is clearly theirs.
 */

export type TraceShape = 'clock' | 'japi' | 'root-bridge' | 'naga-border'

export function ReferenceFigure({ shape, size }: { shape: TraceShape; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 400 400"
      fill="none"
      stroke={shape === 'clock' ? 'var(--clay)' : 'var(--brass-soft)'}
      strokeWidth={shape === 'clock' ? 4 : 3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
    >
      {shape === 'clock' ? <ClockFace /> : null}
      {shape === 'japi' ? <Japi /> : null}
      {shape === 'root-bridge' ? <RootBridge /> : null}
      {shape === 'naga-border' ? <NagaBorder /> : null}
    </svg>
  )
}

/** Ten past eleven, the standard prompt. Shown for `copy` only. */
function ClockFace() {
  return (
    <>
      <circle cx="200" cy="200" r="150" />
      {Array.from({ length: 12 }, (_, i) => {
        const angle = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2
        const x = 200 + Math.cos(angle) * 120
        const y = 200 + Math.sin(angle) * 120
        return (
          <text
            key={i}
            x={x}
            y={y + 8}
            textAnchor="middle"
            fontSize="26"
            fill="var(--clay)"
            stroke="none"
          >
            {i + 1}
          </text>
        )
      })}
      {/* Hour hand to 11, minute hand to 2. */}
      <path d="M200 200 L162 122" strokeWidth="7" />
      <path d="M200 200 L268 162" strokeWidth="5" />
      <circle cx="200" cy="200" r="7" fill="var(--clay)" stroke="none" />
    </>
  )
}

/** A cone and two arcs — deliberately the easiest shape here under tremor. */
function Japi() {
  return (
    <>
      <path d="M60 268a140 92 0 0 1 280 0z" />
      <path d="M60 268h280" />
      <path d="M140 236a62 44 0 0 1 120 0" />
      <path d="M200 176v-16" />
    </>
  )
}

/** Meghalaya's living root bridges: an arch with roots dropping from it. */
function RootBridge() {
  return (
    <>
      <path d="M40 300C110 150 290 150 360 300" />
      <path d="M40 330C110 190 290 190 360 330" />
      <path d="M92 216v52M140 178v58M200 164v62M260 178v58M308 216v52" />
    </>
  )
}

/** The banded geometry of a Naga shawl: straight lines and triangles. */
function NagaBorder() {
  return (
    <>
      <path d="M40 130h320M40 270h320" />
      <path d="M40 170h320M40 230h320" />
      {Array.from({ length: 8 }, (_, i) => {
        const x = 50 + i * 40
        return <path key={i} d={`M${x} 230 l20 -60 l20 60`} />
      })}
    </>
  )
}

/** Rotates through the variants so a repeat session is not the same shape. */
export function traceShapeFor(sessionSeed: number): TraceShape {
  const shapes: TraceShape[] = ['japi', 'root-bridge', 'naga-border']
  return shapes[sessionSeed % shapes.length] ?? 'japi'
}
