import type { AppState, GroupingKind } from '../state/appState'

export type DateGroupingBucket = {
  range: { minYear: number; maxYear: number }
  members: string[]
  memberCount: number
  yearEntryCount: number
}

export type DateGrouping = {
  kind: GroupingKind
  buckets: DateGroupingBucket[]
  bucketCount: number
  boundariesUsed?: [number, number, number]
}

type YearEntry = {
  year: number
  members: string[]
}

export type EqualSpreadBucket = {
  minYear: number
  maxYear: number
  members: string[]
  memberCount: number
}

export type UnifiedGroupingBucket = {
  bucketIndex: number
  range: { minYear: number; maxYear: number }
  members: string[]
  memberCount: number
  eventCount: number
  birthCount: number
  marriageCount: number
  deathCount: number
}

function parseYear(dateISO?: string) {
  if (!dateISO) return null
  const m = dateISO.match(/^(\d{4})/)
  if (!m) return null
  const y = Number(m[1])
  if (!Number.isFinite(y) || y < 0) return null
  return y
}

function clampBoundaries(boundaries: [number, number, number], minYear: number, maxYear: number) {
  let [b1, b2, b3] = boundaries
  b1 = Math.max(minYear, Math.min(maxYear, b1))
  b2 = Math.max(b1, Math.max(minYear, Math.min(maxYear, b2)))
  b3 = Math.max(b2, Math.max(minYear, Math.min(maxYear, b3)))
  return [b1, b2, b3] as [number, number, number]
}

function uniq(arr: string[]) {
  return [...new Set(arr)]
}

function buildBucketFromEntries(entries: YearEntry[]): DateGroupingBucket {
  const years = entries.map((e) => e.year)
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const members = uniq(entries.flatMap((e) => e.members))
  return {
    range: { minYear, maxYear },
    members,
    memberCount: members.length,
    yearEntryCount: entries.length,
  }
}

export function computeDateGrouping(params: {
  state: AppState
  kind: GroupingKind
  overrideBoundaries?: [number, number, number]
}): DateGrouping {
  const { state, kind, overrideBoundaries } = params
  const entries: YearEntry[] = []

  if (kind === 'birth' || kind === 'death') {
    for (const person of Object.values(state.persons)) {
      const year = kind === 'birth' ? parseYear(person.dob.dateISO) : parseYear(person.dod.dateISO)
      if (!year) continue
      entries.push({ year, members: [person.id] })
    }
  } else if (kind === 'marriage') {
    for (const e of state.edges) {
      if (e.type !== 'spouse') continue
      const year = parseYear(e.marriage?.dateISO)
      if (!year) continue
      entries.push({ year, members: uniq([e.source, e.target]) })
    }
  }

  if (entries.length === 0) {
    return { kind, bucketCount: 0, buckets: [] }
  }

  const sorted = entries.slice().sort((a, b) => a.year - b.year)
  const bucketCount = Math.min(4, sorted.length)

  if (bucketCount < 4) {
    const buckets: DateGroupingBucket[] = []
    for (let i = 0; i < bucketCount; i++) {
      const start = Math.floor((i * sorted.length) / bucketCount)
      const end = Math.floor(((i + 1) * sorted.length) / bucketCount)
      const slice = sorted.slice(start, Math.max(start, end))
      buckets.push(buildBucketFromEntries(slice))
    }
    return { kind, buckets, bucketCount }
  }

  // For 4 buckets we can support manual boundary tweaks.
  const minYear = sorted[0].year
  const maxYear = sorted[sorted.length - 1].year

  const defaultBoundaries: [number, number, number] = (() => {
    // Compute quartile slices first to pick default end years.
    const buckets: DateGroupingBucket[] = []
    for (let i = 0; i < 4; i++) {
      const start = Math.floor((i * sorted.length) / 4)
      const end = Math.floor(((i + 1) * sorted.length) / 4)
      const slice = sorted.slice(start, Math.max(start, end))
      buckets.push(buildBucketFromEntries(slice))
    }
    return [buckets[0].range.maxYear, buckets[1].range.maxYear, buckets[2].range.maxYear]
  })()

  const boundaries = overrideBoundaries ? clampBoundaries(overrideBoundaries, minYear, maxYear) : defaultBoundaries

  const buckets: DateGroupingBucket[] = []
  const bucketEntries: YearEntry[][] = [[], [], [], []]

  for (const entry of sorted) {
    const [b1, b2, b3] = boundaries
    if (entry.year <= b1) bucketEntries[0].push(entry)
    else if (entry.year <= b2) bucketEntries[1].push(entry)
    else if (entry.year <= b3) bucketEntries[2].push(entry)
    else bucketEntries[3].push(entry)
  }

  for (let i = 0; i < 4; i++) {
    const slice = bucketEntries[i]
    if (slice.length === 0) {
      // Keep a deterministic bucket; empty buckets can happen with manual boundaries.
      buckets.push({
        range: { minYear: boundaries[Math.min(i, 2)], maxYear: boundaries[Math.min(i, 2)] },
        members: [],
        memberCount: 0,
        yearEntryCount: 0,
      })
    } else {
      buckets.push(buildBucketFromEntries(slice))
    }
  }

  return { kind, buckets, bucketCount: 4, boundariesUsed: boundaries }
}

export function computeAllGroupings(params: {
  state: AppState
  overrides?: Partial<Record<GroupingKind, { boundaries: [number, number, number] }>>
}): { birth: DateGrouping; marriage: DateGrouping; death: DateGrouping } {
  const overrides = params.overrides ?? {}
  const birth = computeDateGrouping({
    state: params.state,
    kind: 'birth',
    overrideBoundaries: overrides.birth?.boundaries,
  })
  const marriage = computeDateGrouping({
    state: params.state,
    kind: 'marriage',
    overrideBoundaries: overrides.marriage?.boundaries,
  })
  const death = computeDateGrouping({
    state: params.state,
    kind: 'death',
    overrideBoundaries: overrides.death?.boundaries,
  })

  return { birth, marriage, death }
}

function collectYearEntries(state: AppState, kind: GroupingKind): YearEntry[] {
  const entries: YearEntry[] = []
  if (kind === 'birth' || kind === 'death') {
    for (const person of Object.values(state.persons)) {
      const year = kind === 'birth' ? parseYear(person.dob.dateISO) : parseYear(person.dod.dateISO)
      if (!year) continue
      entries.push({ year, members: [person.id] })
    }
    return entries
  }

  for (const e of state.edges) {
    if (e.type !== 'spouse') continue
    const year = parseYear(e.marriage?.dateISO)
    if (!year) continue
    entries.push({ year, members: uniq([e.source, e.target]) })
  }
  return entries
}

export function computeEqualSpreadGrouping(params: { state: AppState; kind: GroupingKind }): EqualSpreadBucket[] {
  const entries = collectYearEntries(params.state, params.kind).sort((a, b) => a.year - b.year)
  if (entries.length === 0) return []

  const minYear = entries[0].year
  const maxYear = entries[entries.length - 1].year
  const bucketCount = Math.min(4, Math.max(1, maxYear - minYear + 1))
  const span = maxYear - minYear + 1

  const buckets: EqualSpreadBucket[] = []
  for (let i = 0; i < bucketCount; i++) {
    const start = minYear + Math.floor((i * span) / bucketCount)
    const endExclusive = minYear + Math.floor(((i + 1) * span) / bucketCount)
    const maxForBucket = i === bucketCount - 1 ? maxYear : Math.max(start, endExclusive - 1)
    buckets.push({
      minYear: start,
      maxYear: maxForBucket,
      members: [],
      memberCount: 0,
    })
  }

  for (const entry of entries) {
    let idx = 0
    while (idx < buckets.length - 1 && entry.year > buckets[idx].maxYear) idx += 1
    buckets[idx].members.push(...entry.members)
  }

  for (const bucket of buckets) {
    bucket.members = uniq(bucket.members)
    bucket.memberCount = bucket.members.length
  }

  return buckets
}

type EventKind = 'birth' | 'marriage' | 'death'

type EventEntry = {
  kind: EventKind
  year: number
  members: string[]
}

function collectAllEventEntries(state: AppState): EventEntry[] {
  const entries: EventEntry[] = []
  for (const person of Object.values(state.persons)) {
    const birthYear = parseYear(person.dob.dateISO)
    if (birthYear != null) entries.push({ kind: 'birth', year: birthYear, members: [person.id] })

    const deathYear = parseYear(person.dod.dateISO)
    if (deathYear != null) entries.push({ kind: 'death', year: deathYear, members: [person.id] })
  }
  for (const edge of state.edges) {
    if (edge.type !== 'spouse') continue
    const marriageYear = parseYear(edge.marriage?.dateISO)
    if (marriageYear != null) {
      entries.push({ kind: 'marriage', year: marriageYear, members: uniq([edge.source, edge.target]) })
    }
  }
  return entries
}

function buildEqualYearRanges(minYear: number, maxYear: number, bucketCount: number): Array<{ minYear: number; maxYear: number }> {
  const totalYears = maxYear - minYear + 1
  if (totalYears <= 0) return []

  const ranges: Array<{ minYear: number; maxYear: number }> = []
  for (let i = 0; i < bucketCount; i++) {
    const start = minYear + Math.floor((i * totalYears) / bucketCount)
    const nextStart = minYear + Math.floor(((i + 1) * totalYears) / bucketCount)
    const end = i === bucketCount - 1 ? maxYear : Math.max(start, nextStart - 1)
    ranges.push({ minYear: start, maxYear: end })
  }
  return ranges
}

export function computeUnifiedEventGrouping(state: AppState): UnifiedGroupingBucket[] {
  const entries = collectAllEventEntries(state)
  if (entries.length === 0) return []

  const earliestYear = entries.reduce((min, entry) => Math.min(min, entry.year), entries[0].year)
  const latestYear = entries.reduce((max, entry) => Math.max(max, entry.year), entries[0].year)
  const currentYear = new Date().getFullYear()
  const rangeStartYear = Math.floor(earliestYear / 5) * 5
  const roundedLatestYear = Math.ceil(latestYear / 5) * 5
  const rangeEndYear = Math.max(rangeStartYear, Math.min(roundedLatestYear, currentYear))
  const ranges = buildEqualYearRanges(rangeStartYear, rangeEndYear, 5)

  const buckets: UnifiedGroupingBucket[] = ranges.map((range, index) => ({
    bucketIndex: index + 1,
    range,
    members: [],
    memberCount: 0,
    eventCount: 0,
    birthCount: 0,
    marriageCount: 0,
    deathCount: 0,
  }))

  for (const entry of entries) {
    let bucketIdx = 0
    while (bucketIdx < buckets.length - 1 && entry.year > buckets[bucketIdx].range.maxYear) bucketIdx += 1
    const bucket = buckets[bucketIdx]
    bucket.members.push(...entry.members)
    bucket.eventCount += 1
    if (entry.kind === 'birth') bucket.birthCount += 1
    else if (entry.kind === 'marriage') bucket.marriageCount += 1
    else bucket.deathCount += 1
  }

  for (const bucket of buckets) {
    bucket.members = uniq(bucket.members)
    bucket.memberCount = bucket.members.length
  }

  return buckets
}

