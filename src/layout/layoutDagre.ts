import dagre from 'dagre'

import type { Edge, Person } from '../state/appState'
import { PERSON_CARD_H, PERSON_CARD_W, SPOUSE_GAP } from '../state/appState'
import type { NodePosition } from '../state/appState'
import { isJointChildWithSpouse, marriageSideRelative } from '../utils/parentHandles'

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

  const familyUnits = buildFamilyUnits(childToParents, spouseAdj)

  const g = new dagre.graphlib.Graph()
  g.setGraph({
    rankdir: 'TB',
    // allows update line spacing combined with FamilyCanvas.tsx pathOptions: offset
    nodesep: 24,
    ranksep: 25 ,
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

  snapSpouseClusters(positions, personIds, spouseAdj, childToParents)
  alignFamilies(positions, familyUnits, personIds, spouseAdj, childToParents, edges)
  fanExclusiveChildrenOfMarriedParents(positions, edges, spouseAdj)
  resolveOverlaps(positions, personIds, spouseAdj, childToParents)

  return positions
}

const FAN_EXCLUSIVE_GAP = SPOUSE_GAP

/**
 * When a married person has several children who are only linked to them (not joint with their
 * spouse), center the leftmost under that parent and lay the rest out to the right so lines stay
 * clear of joint children (e.g. shared child between spouses) and of each other.
 */
function fanExclusiveChildrenOfMarriedParents(
  positions: Record<string, NodePosition>,
  edges: Edge[],
  spouseAdj: Map<string, Set<string>>,
) {
  const parentSources = new Set<string>()
  for (const e of edges) {
    if (e.type === 'parent-child') parentSources.add(e.source)
  }

  for (const P of parentSources) {
    if (!spouseAdj.get(P)?.size) continue

    const exclusiveTargets = new Set<string>()
    for (const pe of edges) {
      if (pe.type !== 'parent-child' || pe.source !== P) continue
      if (!isJointChildWithSpouse(P, pe.target, edges)) exclusiveTargets.add(pe.target)
    }

    if (exclusiveTargets.size < 2) continue

    const kids = [...exclusiveTargets].sort((a, b) => {
      const xa = positions[a]?.x ?? 0
      const xb = positions[b]?.x ?? 0
      if (Math.abs(xa - xb) > 2) return xa - xb
      return a.localeCompare(b)
    })

    const pPos = positions[P]
    if (!pPos) continue
    const parentCenterX = pPos.x + PERSON_CARD_W / 2

    const side = marriageSideRelative(P, edges, positions)
    const fanLeft = side === 'left'

    if (fanLeft) {
      let x = parentCenterX - PERSON_CARD_W / 2
      for (let i = 0; i < kids.length; i++) {
        const cid = kids[i]!
        const py = positions[cid]?.y ?? pPos.y
        positions[cid] = { x, y: py }
        if (i < kids.length - 1) x -= PERSON_CARD_W + FAN_EXCLUSIVE_GAP
      }
    } else {
      let x = parentCenterX - PERSON_CARD_W / 2
      for (const cid of kids) {
        const py = positions[cid]?.y ?? pPos.y
        positions[cid] = { x, y: py }
        x += PERSON_CARD_W + FAN_EXCLUSIVE_GAP
      }
    }
  }
}

function hasSpouse(personId: string, spouseAdj: Map<string, Set<string>>): boolean {
  return (spouseAdj.get(personId)?.size ?? 0) > 0
}

/** Sorted parent ids for layout grouping; empty if the person has no recorded parents. */
function parentSignature(childToParents: Map<string, Set<string>>, id: string): string {
  const p = childToParents.get(id)
  if (!p || p.size === 0) return ''
  return [...p].sort().join('|')
}

/**
 * Spouses who share this link move as one unit in alignment / overlap resolution when they have the
 * same parent set (or both are roots). Couples with different parentage (e.g. two married people
 * whose parents are different pairs) align independently under their own parents.
 */
function spousesShareLayoutCluster(
  childToParents: Map<string, Set<string>>,
  a: string,
  b: string,
): boolean {
  return parentSignature(childToParents, a) === parentSignature(childToParents, b)
}

function buildAlignClusterMap(
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
  childToParents: Map<string, Set<string>>,
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
      if (!nbrs) continue
      for (const n of nbrs) {
        if (visited.has(n)) continue
        if (!spousesShareLayoutCluster(childToParents, curr, n)) continue
        q.push(n)
      }
    }
    for (const mid of cluster) clusterOf.set(mid, cluster)
  }

  return clusterOf
}

function buildFamilyUnits(
  childToParents: Map<string, Set<string>>,
  spouseAdj: Map<string, Set<string>>
): FamilyUnit[] {
  const map = new Map<string, FamilyUnit>()
  let idx = 0

  for (const [childId, parents] of childToParents) {
    const key = [...parents].sort().join('|')
    if (!map.has(key)) {
      map.set(key, { id: `__fu_${idx++}`, parentIds: [...parents].sort(), childIds: [] })
    }
    map.get(key)!.childIds.push(childId)
  }

  const seenSpousePairs = new Set<string>()
  for (const [p1, nbrs] of spouseAdj) {
    for (const p2 of nbrs) {
      const key = [p1, p2].sort().join('|')
      if (seenSpousePairs.has(key)) continue
      seenSpousePairs.add(key)
      if (!map.has(key)) {
        map.set(key, { id: `__fu_${idx++}`, parentIds: [p1, p2].sort(), childIds: [] })
      }
    }
  }

  return [...map.values()]
}

function orderSpouseChain(
  cluster: string[],
  spouseAdj: Map<string, Set<string>>,
  positions: Record<string, NodePosition>
): string[] {
  if (cluster.length <= 1) return cluster
  const inCluster = new Set(cluster)

  const endpoints = cluster.filter((id) => {
    const nbrs = spouseAdj.get(id)
    if (!nbrs) return true
    return [...nbrs].filter((n) => inCluster.has(n)).length <= 1
  })

  // Pick the endpoint that Dagre placed furthest left
  const start = endpoints.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))[0] ?? cluster[0]

  const ordered: string[] = []
  const seen = new Set<string>()
  const q = [start]
  while (q.length > 0) {
    const curr = q.shift()!
    if (seen.has(curr)) continue
    seen.add(curr)
    ordered.push(curr)
    const nbrs = spouseAdj.get(curr)
    if (nbrs) {
      // Sort neighbors left-to-right to preserve Dagre's natural ordering
      const nList = [...nbrs].filter((n) => !seen.has(n) && inCluster.has(n))
      nList.sort((a, b) => (positions[a]?.x ?? 0) - (positions[b]?.x ?? 0))
      for (const n of nList) q.push(n)
    }
  }
  return ordered
}

function snapSpouseClusters(
  positions: Record<string, NodePosition>,
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
  childToParents: Map<string, Set<string>>,
) {
  const visited = new Set<string>()

  for (const id of personIds) {
    if (visited.has(id)) continue
    const component: string[] = []
    const q = [id]
    while (q.length > 0) {
      const curr = q.shift()!
      if (visited.has(curr)) continue
      visited.add(curr)
      component.push(curr)
      const nbrs = spouseAdj.get(curr)
      if (nbrs) for (const n of nbrs) if (!visited.has(n)) q.push(n)
    }
    if (component.length <= 1) continue

    const bySig = new Map<string, string[]>()
    for (const pid of component) {
      const sig = parentSignature(childToParents, pid)
      if (!bySig.has(sig)) bySig.set(sig, [])
      bySig.get(sig)!.push(pid)
    }

    for (const group of bySig.values()) {
      if (group.length <= 1) continue

      const ordered = orderSpouseChain(group, spouseAdj, positions)
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
}

/**
 * Iteratively relaxes X so parent midpoints line up with their children.
 * Spouse pairs with the same parent set (or both roots) move as one block;
 * married people with different parents (e.g. two in-laws) shift independently
 * so each stays centered under their own parents.
 */
function alignFamilies(
  positions: Record<string, NodePosition>,
  familyUnits: FamilyUnit[],
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
  childToParents: Map<string, Set<string>>,
  edges: Edge[],
) {
  const clusterOf = buildAlignClusterMap(personIds, spouseAdj, childToParents)
  const clusters = [...new Set(personIds.map((id) => clusterOf.get(id)!))]

  for (let pass = 0; pass < 20; pass++) {
    const clusterForces = new Map<string[], number[]>()
    for (const c of clusters) clusterForces.set(c, [])

    for (const fu of familyUnits) {
      if (fu.childIds.length === 0 || fu.parentIds.length === 0) continue

      // Married parent with multiple children only linked to them: fan layout handles X — skip
      // averaging that would center the group as a block.
      if (fu.parentIds.length === 1 && fu.childIds.length >= 2) {
        const only = fu.parentIds[0]!
        if (hasSpouse(only, spouseAdj)) {
          const allExclusive = fu.childIds.every(
            (cid) => !isJointChildWithSpouse(only, cid, edges),
          )
          if (allExclusive) continue
        }
      }

      const parentMidX =
        fu.parentIds.reduce((s, id) => s + (positions[id]?.x ?? 0) + PERSON_CARD_W / 2, 0) /
        fu.parentIds.length
      const childMidX =
        fu.childIds.reduce((s, id) => s + (positions[id]?.x ?? 0) + PERSON_CARD_W / 2, 0) /
        fu.childIds.length

      const diff = parentMidX - childMidX

      // Children want to move right by diff
      const childClusters = new Set(fu.childIds.map((id) => clusterOf.get(id)!))
      for (const c of childClusters) clusterForces.get(c)!.push(diff)

      // Parents want to move left by diff
      const parentClusters = new Set(fu.parentIds.map((id) => clusterOf.get(id)!))
      for (const c of parentClusters) clusterForces.get(c)!.push(-diff)
    }

    let moved = false
    for (const c of clusters) {
      const forces = clusterForces.get(c)!
      if (forces.length === 0) continue
      const avgForce = forces.reduce((a, b) => a + b, 0) / forces.length
      const shift = avgForce * 0.5 // Damping
      if (Math.abs(shift) > 0.5) {
        moved = true
        for (const id of c) {
          if (positions[id]) positions[id]!.x += shift
        }
      }
    }

    resolveOverlaps(positions, personIds, spouseAdj, childToParents)

    if (!moved) break
  }
}

function resolveOverlaps(
  positions: Record<string, NodePosition>,
  personIds: string[],
  spouseAdj: Map<string, Set<string>>,
  childToParents: Map<string, Set<string>>,
) {
  const clusterOf = buildAlignClusterMap(personIds, spouseAdj, childToParents)
  const clusters = [...new Set(personIds.map((id) => clusterOf.get(id)!))]

  const minXGap = 24
  const yBand = PERSON_CARD_H * 0.7

  for (let pass = 0; pass < 12; pass++) {
    let moved = false

    const blocks = clusters
      .map((cluster) => {
        let minX = Number.POSITIVE_INFINITY
        let maxX = Number.NEGATIVE_INFINITY
        let sumY = 0
        for (const id of cluster) {
          const p = positions[id]
          if (!p) continue
          minX = Math.min(minX, p.x)
          maxX = Math.max(maxX, p.x + PERSON_CARD_W)
          sumY += p.y
        }
        return {
          cluster,
          left: minX,
          right: maxX,
          y: sumY / cluster.length,
        }
      })
      .filter((b) => b.left !== Number.POSITIVE_INFINITY)

    blocks.sort((a, b) => {
      const dy = a.y - b.y
      if (Math.abs(dy) > 1) return dy
      return a.left - b.left
    })

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i]!
        const b = blocks[j]!
        if (Math.abs(a.y - b.y) > yBand) continue

        const aCenter = (a.left + a.right) / 2
        const bCenter = (b.left + b.right) / 2

        let overlap: number
        if (aCenter <= bCenter) {
          overlap = a.right + minXGap - b.left
          if (overlap <= 0) continue
          const push = overlap / 2 + 0.1
          for (const id of a.cluster) {
            const p = positions[id]
            if (p) p.x -= push
          }
          for (const id of b.cluster) {
            const p = positions[id]
            if (p) p.x += push
          }
          a.left -= push
          a.right -= push
          b.left += push
          b.right += push
        } else {
          overlap = b.right + minXGap - a.left
          if (overlap <= 0) continue
          const push = overlap / 2 + 0.1
          for (const id of b.cluster) {
            const p = positions[id]
            if (p) p.x -= push
          }
          for (const id of a.cluster) {
            const p = positions[id]
            if (p) p.x += push
          }
          b.left -= push
          b.right -= push
          a.left += push
          a.right += push
        }
        moved = true
      }
    }
    if (!moved) break
  }
}
