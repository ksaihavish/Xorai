import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { weaveBackground, type WeaveAxis } from '@/patient/shell/weave'

type Edge = 'top' | 'right' | 'bottom' | 'left'

/**
 * The session progress indicator, and the frame, and the only one of either.
 *
 * design.md 1: the woven border is not decoration. It begins madder and fills
 * with brass as the session advances. The patient never sees a percentage, a bar
 * or a number — but they can see how much is left. One structural device, two jobs.
 *
 * The fill runs clockwise from the top-left corner, so progress is measured
 * against the perimeter and each of the four bands takes its share. The bands are
 * measured rather than assumed because design.md 10 makes the border thickness
 * responsive: height is the binding constraint on a 1024x600 tablet.
 */
export function WovenSessionBorder({ progress }: { progress: number }) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const node = frameRef.current
    if (!node) return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const clamped = Math.min(1, Math.max(0, progress))

  // Clockwise from the top-left: top, right, bottom, left.
  const order: Edge[] = ['top', 'right', 'bottom', 'left']
  const lengths: Record<Edge, number> = {
    top: size.w,
    right: size.h,
    bottom: size.w,
    left: size.h,
  }
  const perimeter = order.reduce((sum, edge) => sum + lengths[edge], 0)

  let travelled = clamped * perimeter
  const fills = {} as Record<Edge, number>
  for (const edge of order) {
    const length = lengths[edge]
    fills[edge] = length > 0 ? Math.min(1, Math.max(0, travelled / length)) : 0
    travelled -= length
  }

  return (
    <div ref={frameRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {order.map((edge) => (
        <Band key={edge} edge={edge} fill={fills[edge]} />
      ))}
    </div>
  )
}

const BAND_AXIS: Record<Edge, WeaveAxis> = {
  top: 'horizontal',
  right: 'vertical',
  bottom: 'horizontal',
  left: 'vertical',
}

const BAND_BOX: Record<Edge, CSSProperties> = {
  top: { top: 0, left: 0, width: '100%', height: 'var(--woven-w)' },
  right: { top: 0, right: 0, width: 'var(--woven-w)', height: '100%' },
  bottom: { bottom: 0, left: 0, width: '100%', height: 'var(--woven-w)' },
  left: { bottom: 0, left: 0, width: 'var(--woven-w)', height: '100%' },
}

/** Each band fills from the corner the clockwise path enters it by. */
function fillBox(edge: Edge, fill: number): CSSProperties {
  const pct = `${fill * 100}%`
  switch (edge) {
    case 'top':
      return { top: 0, bottom: 0, left: 0, width: pct }
    case 'right':
      return { left: 0, right: 0, top: 0, height: pct }
    case 'bottom':
      return { top: 0, bottom: 0, right: 0, width: pct }
    case 'left':
      return { left: 0, right: 0, bottom: 0, height: pct }
  }
}

function Band({ edge, fill }: { edge: Edge; fill: number }) {
  const axis = BAND_AXIS[edge]

  return (
    <div className="absolute" style={{ ...BAND_BOX[edge], ...weaveBackground('var(--madder)', axis) }}>
      {fill > 0 && (
        <div
          className="absolute"
          style={{ ...fillBox(edge, fill), ...weaveBackground('var(--brass)', axis) }}
        />
      )}
    </div>
  )
}
