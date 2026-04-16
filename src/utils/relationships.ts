import type { Edge } from '../state/appState'

/**
 * Returns all person IDs connected to `personId` via spouse edges
 * (transitive closure — walks the full spouse cluster).
 */
export function getSpouseCluster(personId: string, edges: Edge[]): string[] {
  const adjacency = new Map<string, Set<string>>()
  for (const e of edges) {
    if (e.type !== 'spouse') continue
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set())
    adjacency.get(e.source)!.add(e.target)
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set())
    adjacency.get(e.target)!.add(e.source)
  }

  const seen = new Set<string>()
  const q: string[] = [personId]
  while (q.length) {
    const curr = q.shift()
    if (!curr || seen.has(curr)) continue
    seen.add(curr)
    const nbrs = adjacency.get(curr)
    if (nbrs) for (const id of nbrs) q.push(id)
  }
  return [...seen]
}
