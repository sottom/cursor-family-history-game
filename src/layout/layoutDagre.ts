import dagre from 'dagre'

import type { Edge, Person } from '../state/appState'
import { PERSON_CARD_H, PERSON_CARD_W, SPOUSE_GAP } from '../state/appState'
import type { NodePosition } from '../state/appState'

const SPOUSE_PAIR_SPACING = PERSON_CARD_W + SPOUSE_GAP

type FamilyUnit = {
  id: string
  parentIds: string[]
  childIds: string[]
}

/**
 * Lay out a family tree using dagre with virtual "connector" nodes.
 *
 * The key insight: each distinct set of co-parents forms a "family unit."
 * A tiny connector node is inserted between the parents and their shared
 * children so dagre naturally groups children under the correct parent pair
 * rather than scattering them across unrelated branches.
 */
export function layoutDagre(
  persons: Record<string, Person>,
  edges: Edge[],
): Record<string, NodePosition> {
  const personIds = Object.keys(persons)
  if (personIds.length === 0) return {}

  const childToParents = new Map<string, Set<string>>()
  const spouseAdj = new Map<string, Set<string>>()

  for (const e of edges) {
    if (e.type === 'parent-child' && persons[e.source] && persons[e.target]) {
      if (!childToParents.has(e.target)) childToParents.set(e.target, new Set())
      childToParents.get(e.target)!.add(e.source)
    } else if (e.type === 'spouse' && persons[e.source] && persons[e.target]) {
      if (!spouseAdj.has(e.source)) spouseAdj.set(e.source, new Set())
      spouseAdj.get(e.source)!.add(e.target)
      if (!spouseAdj.has(e.target)) spouseAdj.set(e.target, new Set())
      spouseAdj.get(e.target)!.add(e.source)
    }
  }

  const familyUnits = buildFamilyUnits(childToParents)

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB',
    nodesep: 50,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  })
  g.setDefaultEdgeLabel(() => ({}))

  for (const id of personIds) {
    g.setNode(id, { width: PERSON_CARD_W, height: PERSON_CARD_H })
  }

  for (const fu of familyUnits) {
    g.setNode(fu.id, { width: 1, height: 1 })
    for (const pid of fu.parentIds) g.setEdge(pid, fu.id)
    for (const cid of fu.childIds) g.setEdge(fu.id, cid)
  }

  dagre.layout(g)

  const positions: Record<string, NodePosition> = {}
  for (const id of personIds) {
    const node = g.node(id) as { x: number; y: number } | undefined
    if (!node) continue
    positions[id] = { x: node.x - PERSON_CARD_W / 2, y: node.y - PERSON_CARD_H / 2 }
  }

  snapSpouseClusters(positions, personIds, spouseAdj)
  centerChildrenUnderParents(positions, familyUnits, personIds, spouseAdj)
  resolveOverlaps(positions, personIds)

  return positions
}

function buildFamilyUnits(childToParents: Map<string, Set<string>>): FamilyUnit[] {
  const map = new Map<string, FamilyUnit>()
  let idx = 0

  for (const [childId, parents] of childToParents) {
    const key = [...parents].sort().join('|')
    if (!map.has(key)) {
      map.set(key, { id: `__fu_${idx++}`, parentIds: [...parents].sort(), childIds: [] })
    }
    map.get(key)!.childIds.push(childId)
  }

  return [...map.values()]
}

function orderSpouseChain(cluster: string[], spouseAdj: Map<string, Set<string>>): string[] {
  if (cluster.length <= 1) return cluster
  const inCluster = new Set(cluster)

  const start = cluster.find((id) => {
    const nbrs = spouseAdj.get(id)
    if (!nbrs) return true
    return [...nbrs].filter((n) => inCluster.has(n)).length <= 1
  }) ?? cluster[0]

  const ordered: string[] = []
  const seen = new Set<string>()
  const q = [start]
  while (q.length > 0) {
    const curr = q.shift()!
    if (seen.has(curr)) continue
    seen.add(curr)
    ordered.push(curr)
    const nbrs = spouseAdj.get(curr)
    if (nbrs) for (const n of nbrs) if (!seen.has(n) && inCluster.has(n)) q.push(n)
  }
  return ordered
}

function snapSpouseClusters(
  positions: Record<string, NodePosition>,
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
) {
  const visited = new Set<string>()

  for (const id of personIds) {
    if (visited.has(id)) continue
    const cluster: string[] = []
    const q = [id]
    while (q.length > 0) {
      const curr = q.shift()!
      if (visited.has(curr)) continue
      visited.add(curr)
      cluster.push(curr)
      const nbrs = spouseAdj.get(curr)
      if (nbrs) for (const n of nbrs) if (!visited.has(n)) q.push(n)
    }
    if (cluster.length <= 1) continue

    const ordered = orderSpouseChain(cluster, spouseAdj)
    const avgY = ordered.reduce((s, cid) => s + (positions[cid]?.y ?? 0), 0) / ordered.length
    const centerX =
      ordered.reduce((s, cid) => s + (positions[cid]?.x ?? 0) + PERSON_CARD_W / 2, 0) /
      ordered.length
    const totalW = ordered.length * PERSON_CARD_W + (ordered.length - 1) * SPOUSE_GAP
    const startX = centerX - totalW / 2

    for (let i = 0; i < ordered.length; i++) {
      positions[ordered[i]] = { x: startX + i * SPOUSE_PAIR_SPACING, y: avgY }
    }
  }
}

/**
 * Shift each family unit's children so they are centered horizontally
 * beneath the midpoint of their actual parents.  When a child is part of
 * a spouse cluster the whole cluster moves together so couples aren't split.
 */
function centerChildrenUnderParents(
  positions: Record<string, NodePosition>,
  familyUnits: FamilyUnit[],
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
) {
  const clusterOf = buildClusterMap(personIds, spouseAdj)

  for (const fu of familyUnits) {
    if (fu.childIds.length === 0) continue

    const parentMidX =
      fu.parentIds.reduce((s, id) => s + (positions[id]?.x ?? 0) + PERSON_CARD_W / 2, 0) /
      fu.parentIds.length

    const childClusterIds = new Set<string>()
    const clusterCenterXs: number[] = []

    for (const cid of fu.childIds) {
      const cluster = clusterOf.get(cid) ?? [cid]
      const clusterKey = [...cluster].sort().join('|')
      if (childClusterIds.has(clusterKey)) continue
      childClusterIds.add(clusterKey)

      const cx =
        cluster.reduce((s, mid) => s + (positions[mid]?.x ?? 0) + PERSON_CARD_W / 2, 0) /
        cluster.length
      clusterCenterXs.push(cx)
    }

    const currentCenter =
      clusterCenterXs.reduce((s, x) => s + x, 0) / clusterCenterXs.length
    const dx = parentMidX - currentCenter

    const shifted = new Set<string>()
    for (const cid of fu.childIds) {
      const cluster = clusterOf.get(cid) ?? [cid]
      for (const mid of cluster) {
        if (shifted.has(mid)) continue
        shifted.add(mid)
        const p = positions[mid]
        if (p) positions[mid] = { x: p.x + dx, y: p.y }
      }
    }
  }
}

function buildClusterMap(
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
): Map<string, string[]> {
  const visited = new Set<string>()
  const clusterOf = new Map<string, string[]>()

  for (const id of personIds) {
    if (visited.has(id)) continue
    const cluster: string[] = []
    const q = [id]
    while (q.length > 0) {
      const curr = q.shift()!
      if (visited.has(curr)) continue
      visited.add(curr)
      cluster.push(curr)
      const nbrs = spouseAdj.get(curr)
      if (nbrs) for (const n of nbrs) if (!visited.has(n)) q.push(n)
    }
    for (const mid of cluster) clusterOf.set(mid, cluster)
  }

  return clusterOf
}

function resolveOverlaps(positions: Record<string, NodePosition>, personIds: string[]) {
  const minXGap = PERSON_CARD_W + 24
  const yBand = PERSON_CARD_H * 0.7

  for (let pass = 0; pass < 12; pass++) {
    let moved = false
    const sorted = personIds
      .filter((id) => positions[id])
      .sort((a, b) => {
        const dy = positions[a]!.y - positions[b]!.y
        if (Math.abs(dy) > 1) return dy
        return positions[a]!.x - positions[b]!.x
      })

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = positions[sorted[i]]!
        const b = positions[sorted[j]]!
        if (Math.abs(a.y - b.y) > yBand) continue
        const gap = b.x - a.x
        if (gap >= minXGap) continue

        const push = (minXGap - gap) / 2 + 1
        positions[sorted[i]] = { x: a.x - push, y: a.y }
        positions[sorted[j]] = { x: b.x + push, y: b.y }
        moved = true
      }
    }
    if (!moved) break
  }
}
