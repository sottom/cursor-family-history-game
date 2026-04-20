import type { Edge, Person } from '../state/appState'

/**
 * Border / name-bar accent for tree cards, youngest → oldest (then two deeper tones, then repeat).
 * Indices 0–3 are the four primary game generations; 4–5 extend the palette.
 */
export const GENERATION_NODE_ACCENT_HEX = [
  '#8A151B',
  '#180147',
  '#02622B',
  '#5F2E15',
  '#0A1F44',
  '#703E05',
] as const

export function getGenerationAccentColor(generationIndex: number): string {
  const n = GENERATION_NODE_ACCENT_HEX.length
  const i = ((generationIndex % n) + n) % n
  return GENERATION_NODE_ACCENT_HEX[i]!
}

/**
 * Generation from parent→child edges: people with no descendants in the graph are 0 (youngest);
 * each step up to parents increments by 1.
 */
export function computeGenerationByPersonId(
  persons: Record<string, Person>,
  edges: Edge[],
): Record<string, number> {
  const ids = Object.keys(persons)
  const gen: Record<string, number> = {}
  for (const id of ids) gen[id] = 0

  const parentChild: [string, string][] = []
  for (const e of edges) {
    if (e.type === 'parent-child' && persons[e.source] && persons[e.target]) {
      parentChild.push([e.source, e.target])
    }
  }

  let changed = true
  let guard = 0
  const maxPasses = Math.max(ids.length + 2, 8)
  while (changed && guard < maxPasses) {
    changed = false
    guard++
    for (const [parent, child] of parentChild) {
      const next = Math.max(gen[parent] ?? 0, (gen[child] ?? 0) + 1)
      if (next !== gen[parent]) {
        gen[parent] = next
        changed = true
      }
    }
  }
  return gen
}
