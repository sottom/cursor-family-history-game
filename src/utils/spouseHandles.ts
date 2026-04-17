import type { Edge } from '../state/appState'

export function slotFromSpouseRightHandle(sh: string | null | undefined): 0 | 1 | 2 | undefined {
  if (!sh || !/^spouse-right-[0-2]$/.test(sh)) return undefined
  return Number.parseInt(sh.slice('spouse-right-'.length), 10) as 0 | 1 | 2
}

/**
 * Vertical slot (0–2) for a spouse edge so left/right cards use matching handle heights.
 * Uses {@link Edge.spouseHandleSlot} when set; otherwise a stable index among all spouse edges.
 */
export function marriageHandleSlot(edge: Edge, allEdges: Edge[]): 0 | 1 | 2 {
  if (edge.type !== 'spouse') return 1
  if (edge.spouseHandleSlot !== undefined) return edge.spouseHandleSlot
  const spouseEdges = allEdges.filter((e) => e.type === 'spouse').sort((a, b) => a.id.localeCompare(b.id))
  const idx = spouseEdges.findIndex((e) => e.id === edge.id)
  const i = idx >= 0 ? idx : 0
  return (i % 3) as 0 | 1 | 2
}

export function spouseSourceHandleId(edge: Edge, allEdges: Edge[]): string {
  return `spouse-right-${marriageHandleSlot(edge, allEdges)}`
}

export function spouseTargetHandleId(edge: Edge, allEdges: Edge[]): string {
  return `spouse-left-${marriageHandleSlot(edge, allEdges)}`
}
