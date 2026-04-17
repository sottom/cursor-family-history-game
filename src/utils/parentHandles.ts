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

/**
 * Handles are centered on the bottom edge (one source slot for all parent→child links).
 */
export function computeParentHandleLeftPercents(
  _personId: string,
  _edges: Edge[],
  _nodePositions: Record<string, NodePosition>,
): number[] {
  return [50]
}

/**
 * Single centered parent source handle (`parent-0`) for all outgoing parent→child edges.
 */
export function parentChildSourceHandleIndex(_edge: Edge, _edges: Edge[], _nodePositions: Record<string, NodePosition>): number {
  return 0
}

export function parentSourceHandleId(_edge: Edge, _edges: Edge[], _nodePositions: Record<string, NodePosition>): string {
  return 'parent-0'
}

/** One bottom source handle; all parent→child edges attach to `parent-0`. */
export function parentSourceHandleCount(_personId: string, _edges: Edge[]): number {
  return 1
}
