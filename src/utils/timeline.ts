import type { AppState, Person } from '../state/appState'

export function parseYear(dateISO?: string) {
  if (!dateISO) return null
  const m = dateISO.match(/^(\d{4})/)
  if (!m) return null
  const y = Number(m[1])
  if (!Number.isFinite(y) || y < 0) return null
  return y
}

export function getTimelineStartYear(state: AppState): number | null {
  let minYear: number | null = null

  for (const person of Object.values(state.persons)) {
    const by = parseYear(person.dob?.dateISO)
    if (by !== null && (minYear === null || by < minYear)) minYear = by

    const dy = parseYear(person.dod?.dateISO)
    if (dy !== null && (minYear === null || dy < minYear)) minYear = dy

    for (const m of person.marriages) {
      const my = parseYear(m.dateISO)
      if (my !== null && (minYear === null || my < minYear)) minYear = my
    }
  }

  return minYear
}

const ERA_COLORS = [
  '#713274', // Segment 1 (Purple)
  '#51B4B4', // Segment 2 (Teal)
  '#33790E', // Segment 3 (Green)
  '#D6982F', // Segment 4 (Gold)
  '#BB0303', // Segment 5 (Red)
]

export function getEraColor(year: number | null | undefined, startYear: number | null): string | null {
  if (year === null || year === undefined) return null
  if (startYear === null) return ERA_COLORS[4] // Fallback if no start year

  const endYear = 2026
  
  if (year < startYear) return ERA_COLORS[0]
  if (year >= endYear) return ERA_COLORS[4]

  const span = endYear - startYear
  if (span <= 0) return ERA_COLORS[4]

  // Divide into 5 equal segments
  const segmentDuration = span / 5
  
  let segmentIndex = Math.floor((year - startYear) / segmentDuration)
  if (segmentIndex < 0) segmentIndex = 0
  if (segmentIndex >= 5) segmentIndex = 4

  return ERA_COLORS[segmentIndex]
}

export type TimelineSpot = {
  type: 'birth' | 'marriage' | 'death'
  year: number | null
  color: string | null
}

export function getPersonTimelineSpots(person: Person, startYear: number | null): TimelineSpot[] {
  const spots: TimelineSpot[] = []

  // Birth
  const by = parseYear(person.dob?.dateISO)
  spots.push({ type: 'birth', year: by, color: getEraColor(by, startYear) })

  // Marriages
  const marriageCount = Math.max(1, person.marriages.length)
  for (let i = 0; i < marriageCount; i++) {
    const m = person.marriages[i]
    const my = m ? parseYear(m.dateISO) : null
    spots.push({ type: 'marriage', year: my, color: getEraColor(my, startYear) })
  }

  // Death
  const dy = parseYear(person.dod?.dateISO)
  spots.push({ type: 'death', year: dy, color: getEraColor(dy, startYear) })

  return spots
}
