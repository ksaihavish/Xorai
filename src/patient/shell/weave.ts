/**
 * The gamosa weave, as CSS.
 *
 * design.md Part II 2 asks for texture rather than colour: a flat red border is a
 * rectangle, a border with visible warp lines and diamond figures is cloth. Same
 * two colours, same contrast, dramatically more presence — which matters here
 * because liveliness cannot come from more hue or more motion.
 *
 * Three layers: warp threads running across the band, and two opposed diagonal
 * line sets whose intersection is the diamond figure. The diagonals are drawn as
 * thin lines rather than wide stripes; wide ones read as a barber pole rather
 * than as weaving.
 *
 * The lattice pitch is tuned to a ~16 px band so roughly one row of diamonds
 * sits in the frame at full thickness, which is how the border of a real gamosa
 * is proportioned.
 */
export type WeaveAxis = 'horizontal' | 'vertical'

const WARP_PITCH_PX = 3
const DIAMOND_PITCH_PX = 12

export function weaveBackground(
  colour: string,
  axis: WeaveAxis,
): { backgroundColor: string; backgroundImage: string } {
  // Threads run perpendicular to the band's long edge.
  const warpAngle = axis === 'horizontal' ? '90deg' : '0deg'

  return {
    backgroundColor: colour,
    backgroundImage: [
      `repeating-linear-gradient(${warpAngle}, rgba(0,0,0,0.17) 0 1px, rgba(0,0,0,0) 1px ${WARP_PITCH_PX}px)`,
      `repeating-linear-gradient(45deg, rgba(255,255,255,0.42) 0 2px, rgba(255,255,255,0) 2px ${DIAMOND_PITCH_PX}px)`,
      `repeating-linear-gradient(-45deg, rgba(255,255,255,0.42) 0 2px, rgba(255,255,255,0) 2px ${DIAMOND_PITCH_PX}px)`,
    ].join(', '),
  }
}
