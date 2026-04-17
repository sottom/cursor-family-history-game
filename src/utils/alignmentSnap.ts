/**
 * Snap dragged card(s) to alignment with other person cards (edges + centers).
 * Guide segments bridge the reference card and the dragged selection along the shared alignment.
 */
export type AlignmentSnapResult = {
  dx: number
  dy: number
  verticalGuide: { x: number; y1: number; y2: number } | null
  horizontalGuide: { y: number; x1: number; x2: number } | null
}

export function computeCardAlignmentSnap(
  draggedTopLefts: Array<{ x: number; y: number }>,
  otherTopLefts: Array<{ x: number; y: number }>,
  cardW: number,
  cardH: number,
  thresholdFlow: number,
): AlignmentSnapResult {
  if (otherTopLefts.length === 0 || draggedTopLefts.length === 0) {
    return { dx: 0, dy: 0, verticalGuide: null, horizontalGuide: null }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of draggedTopLefts) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + cardW)
    maxY = Math.max(maxY, p.y + cardH)
  }

  const dragXs = [minX, (minX + maxX) / 2, maxX]
  const dragYs = [minY, (minY + maxY) / 2, maxY]

  let bestDx = 0
  let bestDistX = Infinity
  let verticalX: number | null = null
  let verticalOther: { x: number; y: number } | null = null

  for (const other of otherTopLefts) {
    const refXs = [other.x, other.x + cardW / 2, other.x + cardW]
    for (const rx of refXs) {
      for (const dxPt of dragXs) {
        const d = rx - dxPt
        const ad = Math.abs(d)
        if (ad <= thresholdFlow && ad < bestDistX - 1e-9) {
          bestDistX = ad
          bestDx = d
          verticalX = rx
          verticalOther = other
        }
      }
    }
  }

  let bestDy = 0
  let bestDistY = Infinity
  let horizontalY: number | null = null
  let horizontalOther: { x: number; y: number } | null = null

  for (const other of otherTopLefts) {
    const refYs = [other.y, other.y + cardH / 2, other.y + cardH]
    for (const ry of refYs) {
      for (const dyPt of dragYs) {
        const d = ry - dyPt
        const ad = Math.abs(d)
        if (ad <= thresholdFlow && ad < bestDistY - 1e-9) {
          bestDistY = ad
          bestDy = d
          horizontalY = ry
          horizontalOther = other
        }
      }
    }
  }

  if (bestDistX === Infinity) {
    bestDx = 0
    verticalX = null
    verticalOther = null
  }
  if (bestDistY === Infinity) {
    bestDy = 0
    horizontalY = null
    horizontalOther = null
  }

  const sMinX = minX + bestDx
  const sMaxX = maxX + bestDx
  const sMinY = minY + bestDy
  const sMaxY = maxY + bestDy

  let verticalGuide: AlignmentSnapResult['verticalGuide'] = null
  if (verticalX !== null && verticalOther !== null) {
    const oy1 = verticalOther.y
    const oy2 = verticalOther.y + cardH
    verticalGuide = {
      x: verticalX,
      y1: Math.min(sMinY, oy1),
      y2: Math.max(sMaxY, oy2),
    }
  }

  let horizontalGuide: AlignmentSnapResult['horizontalGuide'] = null
  if (horizontalY !== null && horizontalOther !== null) {
    const ox1 = horizontalOther.x
    const ox2 = horizontalOther.x + cardW
    horizontalGuide = {
      y: horizontalY,
      x1: Math.min(sMinX, ox1),
      x2: Math.max(sMaxX, ox2),
    }
  }

  return { dx: bestDx, dy: bestDy, verticalGuide, horizontalGuide }
}
