import type { AppState, Person } from '../state/appState'

export function parseYear(dateISO?: string) {
  if (!dateISO) return null
  const m = dateISO.match(/^(\d{4})/)
  if (!m) return null
  const y = Number(m[1])
  if (!Number.isFinite(y) || y < 0) return null
  return y
}

function roundDownToNearestFive(year: number) {
  return Math.floor(year / 5) * 5
}

function roundUpToNearestFive(year: number) {
  return Math.ceil(year / 5) * 5
}

export function getTimelineYearBounds(state: AppState): { startYear: number; endYear: number } | null {
  let minYear: number | null = null
  let maxYear: number | null = null

  for (const person of Object.values(state.persons)) {
    const by = parseYear(person.dob?.dateISO)
    if (by !== null) {
      if (minYear === null || by < minYear) minYear = by
      if (maxYear === null || by > maxYear) maxYear = by
    }

    const dy = parseYear(person.dod?.dateISO)
    if (dy !== null) {
      if (minYear === null || dy < minYear) minYear = dy
      if (maxYear === null || dy > maxYear) maxYear = dy
    }

    for (const m of person.marriages) {
      const my = parseYear(m.dateISO)
      if (my !== null) {
        if (minYear === null || my < minYear) minYear = my
        if (maxYear === null || my > maxYear) maxYear = my
      }
    }
  }

  for (const edge of state.edges) {
    if (edge.type !== 'spouse') continue
    const my = parseYear(edge.marriage?.dateISO)
    if (my !== null) {
      if (minYear === null || my < minYear) minYear = my
      if (maxYear === null || my > maxYear) maxYear = my
    }
  }

  if (minYear === null || maxYear === null) return null

  const currentYear = new Date().getFullYear()
  const startYear = roundDownToNearestFive(minYear)
  const endYear = Math.min(roundUpToNearestFive(maxYear), currentYear)
  return { startYear, endYear: Math.max(startYear, endYear) }
}

const ERA_COLORS = [
  '#713274', // Segment 1 (Purple)
  '#51B4B4', // Segment 2 (Blue)
  '#33790E', // Segment 3 (Green)
  '#D6982F', // Segment 4 (Yellow)
  '#BB0303', // Segment 5 (Red)
]

type EraBucket = {
  minYear: number
  maxYear: number
}

function buildEraBuckets(startYear: number, endYear: number, bucketCount: number): EraBucket[] {
  const totalYears = endYear - startYear + 1
  if (totalYears <= 0 || bucketCount <= 0) return []

  const buckets: EraBucket[] = []
  for (let i = 0; i < bucketCount; i++) {
    const bucketStart = startYear + Math.floor((i * totalYears) / bucketCount)
    const nextBucketStart = startYear + Math.floor(((i + 1) * totalYears) / bucketCount)
    const bucketEnd = i === bucketCount - 1 ? endYear : Math.max(bucketStart, nextBucketStart - 1)
    buckets.push({ minYear: bucketStart, maxYear: bucketEnd })
  }
  return buckets
}

export function getEraColor(
  year: number | null | undefined,
  startYear: number | null,
  endYear: number | null,
): string | null {
  if (year === null || year === undefined) return null
  if (startYear === null || endYear === null) return ERA_COLORS[ERA_COLORS.length - 1] // Fallback if bounds unavailable

  if (year < startYear) return ERA_COLORS[0]
  if (year >= endYear) return ERA_COLORS[ERA_COLORS.length - 1]

  if (startYear >= endYear) return ERA_COLORS[ERA_COLORS.length - 1]

  // Divide the inclusive year range [startYear, endYear] into 5 equal-year groups.
  const buckets = buildEraBuckets(startYear, endYear, ERA_COLORS.length)
  for (let i = 0; i < buckets.length; i++) {
    if (year >= buckets[i].minYear && year <= buckets[i].maxYear) return ERA_COLORS[i]
  }
  return ERA_COLORS[ERA_COLORS.length - 1]
}

export type TimelineSpot = {
  type: 'birth' | 'marriage' | 'death'
  year: number | null
  color: string | null
  /** 0 = primary row under the card; higher rows stack lower below it. */
  row: number
  /** Horizontal lane for rendering in a fixed 3-position layout. */
  lane: 'left' | 'center' | 'right' | 'center-left' | 'center-right'
}

export function getPersonTimelineSpots(
  person: Person,
  startYear: number | null,
  endYear: number | null,
): TimelineSpot[] {
  const spots: TimelineSpot[] = []

  // Birth
  const by = parseYear(person.dob?.dateISO)
  spots.push({ type: 'birth', year: by, color: getEraColor(by, startYear, endYear), row: 0, lane: 'left' })

  // Marriages in a fixed 3-lane status area:
  // 1  => center
  // 2  => center, then center (stacked directly below)
  // 3  => center, then centered pair on next row
  // 4+ => continue with centered pairs on following rows
  const marriageCount = Math.max(1, person.marriages.length)
  for (let i = 0; i < marriageCount; i++) {
    const m = person.marriages[i]
    const my = m ? parseYear(m.dateISO) : null
    if (i === 0) {
      spots.push({ type: 'marriage', year: my, color: getEraColor(my, startYear, endYear), row: 0, lane: 'center' })
      continue
    }
    if (i === 1 && marriageCount === 2) {
      spots.push({ type: 'marriage', year: my, color: getEraColor(my, startYear, endYear), row: 1, lane: 'center' })
      continue
    }
    const pairIndex = i - 1
    const row = Math.floor(pairIndex / 2) + 1
    const lane = pairIndex % 2 === 0 ? 'center-left' : 'center-right'
    spots.push({ type: 'marriage', year: my, color: getEraColor(my, startYear, endYear), row, lane })
  }

  // Death
  const dy = parseYear(person.dod?.dateISO)
  spots.push({ type: 'death', year: dy, color: getEraColor(dy, startYear, endYear), row: 0, lane: 'right' })

  return spots
}
