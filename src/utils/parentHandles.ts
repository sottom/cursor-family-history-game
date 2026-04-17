import type { Edge, NodePosition } from '../state/appState'
import { PERSON_CARD_W } from '../state/appState'

function directParentsOfChild(childId: string, edges: Edge[]): string[] {
  const ids: string[] = []
  for (const e of edges) {
    if (e.type === 'parent-child' && e.target === childId) ids.push(e.source)
  }
  return ids
}

function directSpouses(personId: string, edges: Edge[]): Set<string> {
  const s = new Set<string>()
  for (const e of edges) {
    if (e.type !== 'spouse') continue
    if (e.source === personId) s.add(e.target)
    if (e.target === personId) s.add(e.source)
  }
  return s
}

function cardCenterX(personId: string, nodePositions: Record<string, NodePosition>): number {
  return (nodePositions[personId]?.x ?? 0) + PERSON_CARD_W / 2
}

/**
 * Whether this person is left or right of their spouse(s)' average position on the canvas.
 * Used to place exclusive-child handles on the outer bottom edge (away from the spouse).
 */
export function marriageSideRelative(
  personId: string,
  edges: Edge[],
  nodePositions: Record<string, NodePosition>,
): 'left' | 'right' | 'none' {
  const spouses = [...directSpouses(personId, edges)]
  if (spouses.length === 0) return 'none'
  const pCx = cardCenterX(personId, nodePositions)
  let sum = 0
  let n = 0
  for (const s of spouses) {
    sum += cardCenterX(s, nodePositions)
    n++
  }
  const avgSp = sum / n
  if (Math.abs(pCx - avgSp) < 4) return 'none'
  return pCx < avgSp ? 'left' : 'right'
}

/**
 * True when the child has another parent who is a spouse of `parentId`
 * (shared child of the married couple).
 */
export function isJointChildWithSpouse(parentId: string, childId: string, edges: Edge[]): boolean {
  const parents = directParentsOfChild(childId, edges)
  if (parents.length < 2) return false
  const spouses = directSpouses(parentId, edges)
  for (const p of parents) {
    if (p !== parentId && spouses.has(p)) return true
  }
  return false
}

/** Bottom-edge zones (percent of card width) for handle centers. */
const ZONE_INNER_LO = 62
const ZONE_INNER_HI = 94
const ZONE_OUTER_LO = 6
const ZONE_OUTER_HI = 38

/**
 * Parent→child edges in visual order (left → right on the card), matching `parent-N` handle ids.
 */
export function rankedParentChildEdges(parentId: string, edges: Edge[], nodePositions: Record<string, NodePosition>): Edge[] {
  const outgoing = edges.filter((e) => e.type === 'parent-child' && e.source === parentId)
  const side = marriageSideRelative(parentId, edges, nodePositions)

  const withMeta = outgoing.map((e) => ({
    e,
    joint: isJointChildWithSpouse(parentId, e.target, edges),
    target: e.target,
  }))

  withMeta.sort((a, b) => {
    if (side === 'none') {
      if (a.joint !== b.joint) return a.joint ? -1 : 1
      return a.target.localeCompare(b.target)
    }
    if (side === 'left') {
      // Outer (exclusive) handles on the left; joint toward spouse on the right.
      if (a.joint !== b.joint) return a.joint ? 1 : -1
      return a.target.localeCompare(b.target)
    }
    // side === 'right': joint toward spouse (left); exclusive on the outer right.
    if (a.joint !== b.joint) return a.joint ? -1 : 1
    return a.target.localeCompare(b.target)
  })

  return withMeta.map((x) => x.e)
}

/**
 * Left position (%) for each bottom source handle, same length and order as `rankedParentChildEdges`
 * (and at least one slot when there are no edges yet).
 */
export function computeParentHandleLeftPercents(
  personId: string,
  edges: Edge[],
  nodePositions: Record<string, NodePosition>,
): number[] {
  const ranked = rankedParentChildEdges(personId, edges, nodePositions)
  const side = marriageSideRelative(personId, edges, nodePositions)

  if (ranked.length === 0) return [50]

  const n = ranked.length
  const joint = ranked.map((e) => isJointChildWithSpouse(personId, e.target, edges))
  const jCount = joint.filter(Boolean).length
  const eCount = n - jCount

  const pct = (lo: number, hi: number, i: number, count: number) =>
    lo + ((i + 0.5) / count) * (hi - lo)

  if (side === 'none') {
    return ranked.map((_, i) => pct(8, 92, i, n))
  }

  let ji = 0
  let ei = 0
  return ranked.map((e) => {
    const isJ = isJointChildWithSpouse(personId, e.target, edges)
    if (side === 'left') {
      if (!isJ) {
        return pct(ZONE_OUTER_LO, ZONE_OUTER_HI, ei++, eCount)
      }
      return pct(ZONE_INNER_LO, ZONE_INNER_HI, ji++, jCount)
    }
    // right spouse
    if (isJ) {
      return pct(ZONE_OUTER_LO, ZONE_OUTER_HI, ji++, jCount)
    }
    return pct(ZONE_INNER_LO, ZONE_INNER_HI, ei++, eCount)
  })
}

/**
 * Slot index for this parent→child edge along the bottom of the parent card.
 */
export function parentChildSourceHandleIndex(edge: Edge, edges: Edge[], nodePositions: Record<string, NodePosition>): number {
  if (edge.type !== 'parent-child') return 0
  const parentId = edge.source
  const ranked = rankedParentChildEdges(parentId, edges, nodePositions)
  const idx = ranked.findIndex((e) => e.id === edge.id)
  return idx >= 0 ? idx : 0
}

export function parentSourceHandleId(edge: Edge, edges: Edge[], nodePositions: Record<string, NodePosition>): string {
  return `parent-${parentChildSourceHandleIndex(edge, edges, nodePositions)}`
}

/** Number of bottom source handles (at least one for new connections). */
export function parentSourceHandleCount(personId: string, edges: Edge[]): number {
  const n = edges.filter((e) => e.type === 'parent-child' && e.source === personId).length
  return Math.max(1, n)
}
