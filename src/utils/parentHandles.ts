import type { Edge, NodePosition } from '../state/appState'
import { PERSON_CARD_W } from '../state/appState'

/** 0 = left (25%), 1 = center (50%), 2 = right (75%) — bottom `parent-N` source handles only; child top uses a single `child` target. */
export function lineageSlotIndex(
  edge: Edge,
  _edges: Edge[],
  nodePositions: Record<string, NodePosition>,
): 0 | 1 | 2 {
  if (edge.type !== 'parent-child') return 1
  const parentId = edge.source
  const childId = edge.target
  const pCx = (nodePositions[parentId]?.x ?? 0) + PERSON_CARD_W / 2
  const cCx = (nodePositions[childId]?.x ?? 0) + PERSON_CARD_W / 2
  const dx = cCx - pCx
  const t = PERSON_CARD_W / 5
  if (dx < -t) return 0
  if (dx > t) return 2
  return 1
}

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
 * Left positions (% from card left) for the three bottom lineage handles.
 */
export function computeParentHandleLeftPercents(
  _personId: string,
  _edges: Edge[],
  _nodePositions: Record<string, NodePosition>,
): number[] {
  return [25, 50, 75]
}

export function parentChildSourceHandleIndex(edge: Edge, edges: Edge[], nodePositions: Record<string, NodePosition>): number {
  return lineageSlotIndex(edge, edges, nodePositions)
}

export function parentSourceHandleId(edge: Edge, edges: Edge[], nodePositions: Record<string, NodePosition>): string {
  return `parent-${lineageSlotIndex(edge, edges, nodePositions)}`
}

/** Single centered top target on the child card; parent→child lines always meet here. */
export function childTargetHandleId(_edge: Edge, _edges: Edge[], _nodePositions: Record<string, NodePosition>): string {
  return 'child'
}

/** Three bottom source handles (`parent-0` … `parent-2`); edges pick a slot from layout. */
export function parentSourceHandleCount(_personId: string, _edges: Edge[]): number {
  return 3
}
