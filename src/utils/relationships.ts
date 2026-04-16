import type { Edge } from '../state/appState'

function addAdjacency(adjacency: Map<string, Set<string>>, a: string, b: string) {
  if (!adjacency.has(a)) adjacency.set(a, new Set())
  adjacency.get(a)!.add(b)
}

export function buildSpouseAdjacency(edges: Edge[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.type !== 'spouse') continue
    addAdjacency(adjacency, e.source, e.target)
    addAdjacency(adjacency, e.target, e.source)
  }
  return adjacency
}

export function getSpouseCluster(personId: string, edges: Edge[]): string[] {
  const adjacency = buildSpouseAdjacency(edges)
  const seen = new Set<string>()
  const q: string[] = [personId]
  while (q.length) {
    const curr = q.shift()
    if (!curr) continue
    if (seen.has(curr)) continue
    seen.add(curr)
    const next = adjacency.get(curr)
    if (!next) continue
    for (const id of next) q.push(id)
  }
  return [...seen]
}

export function getAllSpouseClusters(personIds: string[], edges: Edge[]): string[][] {
  const adjacency = buildSpouseAdjacency(edges)
  const seen = new Set<string>()
  const clusters: string[][] = []

  for (const id of personIds) {
    if (seen.has(id)) continue
    const q: string[] = [id]
    const cluster: string[] = []
    while (q.length) {
      const curr = q.shift()
      if (!curr) continue
      if (seen.has(curr)) continue
      seen.add(curr)
      cluster.push(curr)
      const next = adjacency.get(curr)
      if (!next) continue
      for (const n of next) {
        if (!seen.has(n)) q.push(n)
      }
    }
    clusters.push(cluster)
  }

  return clusters
}

export function deriveParentMap(edges: Edge[]): Map<string, Set<string>> {
  // childId -> parents
  const childToParents = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.type !== 'parent-child') continue
    if (!childToParents.has(e.target)) childToParents.set(e.target, new Set())
    childToParents.get(e.target)!.add(e.source)
  }
  return childToParents
}

export function deriveSiblingIds(personId: string, edges: Edge[]): string[] {
  const childToParents = deriveParentMap(edges)
  const parentsOfTarget = childToParents.get(personId)
  if (!parentsOfTarget || parentsOfTarget.size === 0) return []

  const siblings = new Set<string>()
  for (const [childId, parents] of childToParents.entries()) {
    if (childId === personId) continue
    const intersects = [...parents].some((p) => parentsOfTarget.has(p))
    if (intersects) siblings.add(childId)
  }
  return [...siblings]
}

export function deriveSiblingPairs(edges: Edge[]): Array<{ a: string; b: string }> {
  const childToParents = deriveParentMap(edges)
  const ids = [...childToParents.keys()]

  const pairs: Array<{ a: string; b: string }> = []
  const seen = new Set<string>()

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]
      const b = ids[j]
      const parentsA = childToParents.get(a)
      const parentsB = childToParents.get(b)
      if (!parentsA || !parentsB) continue
      const intersects = [...parentsA].some((p) => parentsB.has(p))
      if (!intersects) continue
      const key = a < b ? `${a}:${b}` : `${b}:${a}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ a, b })
    }
  }

  return pairs
}

