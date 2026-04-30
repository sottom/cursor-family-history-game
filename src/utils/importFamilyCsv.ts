import Papa from 'papaparse'
import { layoutDagre } from '../layout/layoutDagre'
import type { AppState, Edge, MarriageEntry, Person } from '../state/appState'
import { createInitialAppState, createNewPerson } from '../state/appState'
import { makeUuid } from './uuid'

type CsvRow = {
  relationship: string
  name: string
  birthDate: string
  marriageDate: string
  secondMarriageDate: string
  deathDate: string
  nickname: string
}

type ImportPersonRecord = {
  person: Person
  relationshipKey: string
}

type ImportResult = {
  state: AppState
  importedCount: number
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function toRelationshipKey(raw: string): string {
  return normalizeText(raw).toLowerCase()
}

function looksLikeMissing(value: string): boolean {
  const normalized = normalizeText(value).toLowerCase()
  return normalized === '' || normalized === '-' || normalized === 'n/a' || normalized === '(optional: include up to 3 additional people here, and specify their relationship)'
}

function parseCsvDate(value: string): string | undefined {
  if (looksLikeMissing(value)) return undefined
  const trimmed = normalizeText(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return undefined

  const yyyy = parsed.getFullYear()
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const dd = String(parsed.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function makeRows(csvText: string): CsvRow[] {
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: true })
  const rows = parsed.data
  if (!Array.isArray(rows) || rows.length < 2) return []

  const dataRows = rows.slice(2)
  return dataRows.map((raw) => ({
    relationship: normalizeText(raw[0] ?? ''),
    name: normalizeText(raw[1] ?? ''),
    birthDate: normalizeText(raw[2] ?? ''),
    marriageDate: normalizeText(raw[3] ?? ''),
    secondMarriageDate: normalizeText(raw[4] ?? ''),
    deathDate: normalizeText(raw[5] ?? ''),
    nickname: normalizeText(raw[6] ?? ''),
  }))
}

function isImportableRow(row: CsvRow): boolean {
  if (looksLikeMissing(row.name)) return false
  const rel = toRelationshipKey(row.relationship)
  return rel !== 'other (optional)'
}

function addMarriage(personByRel: Map<string, ImportPersonRecord>, edges: Edge[], aRel: string, bRel: string, dateISO?: string) {
  const a = personByRel.get(aRel)?.person
  const b = personByRel.get(bRel)?.person
  if (!a || !b) return

  const edgeExists = edges.some(
    (e) => e.type === 'spouse' && ((e.source === a.id && e.target === b.id) || (e.source === b.id && e.target === a.id)),
  )
  if (!edgeExists) {
    edges.push({
      id: makeUuid(),
      source: a.id,
      target: b.id,
      type: 'spouse',
      spouseHandleSlot: 1,
      marriage: dateISO ? { dateISO } : undefined,
    })
  }

  const upsertMarriage = (person: Person, spouseId: string, next: MarriageEntry) => {
    const existingIndex = person.marriages.findIndex((m) => m.spouseId === spouseId)
    if (existingIndex >= 0) {
      person.marriages[existingIndex] = { ...person.marriages[existingIndex], ...next }
      return
    }
    person.marriages.push(next)
  }

  upsertMarriage(a, b.id, { spouseId: b.id, dateISO, isCurrent: true })
  upsertMarriage(b, a.id, { spouseId: a.id, dateISO, isCurrent: true })
}

function addParentChild(personByRel: Map<string, ImportPersonRecord>, edges: Edge[], parentRel: string, childRel: string) {
  const parent = personByRel.get(parentRel)?.person
  const child = personByRel.get(childRel)?.person
  if (!parent || !child) return

  const exists = edges.some((e) => e.type === 'parent-child' && e.source === parent.id && e.target === child.id)
  if (!exists) {
    edges.push({ id: makeUuid(), source: parent.id, target: child.id, type: 'parent-child' })
  }
}

function applyTemplateRelationships(personByRel: Map<string, ImportPersonRecord>, rowsByRel: Map<string, CsvRow[]>, edges: Edge[]) {
  addMarriage(personByRel, edges, 'father', 'mother', parseCsvDate(rowsByRel.get('father')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'grandparent 1', 'grandparent 2', parseCsvDate(rowsByRel.get('grandparent 1')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'grandparent 3', 'grandparent 4', parseCsvDate(rowsByRel.get('grandparent 3')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'great-gparent 1', 'great-gparent 2', parseCsvDate(rowsByRel.get('great-gparent 1')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'great-gparent 3', 'great-gparent 4', parseCsvDate(rowsByRel.get('great-gparent 3')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'great-gparent 5', 'great-gparent 6', parseCsvDate(rowsByRel.get('great-gparent 5')?.[0]?.marriageDate ?? ''))
  addMarriage(personByRel, edges, 'great-gparent 7', 'great-gparent 8', parseCsvDate(rowsByRel.get('great-gparent 7')?.[0]?.marriageDate ?? ''))
  addMarriage(
    personByRel,
    edges,
    "grandparent 1",
    "donna's 2nd husband",
    parseCsvDate(rowsByRel.get('grandparent 1')?.[0]?.secondMarriageDate ?? ''),
  )
  addMarriage(
    personByRel,
    edges,
    'great-gparent 7',
    "mildred's last husband",
    parseCsvDate(rowsByRel.get('great-gparent 7')?.[0]?.secondMarriageDate ?? ''),
  )

  addParentChild(personByRel, edges, 'father', 'child')
  addParentChild(personByRel, edges, 'mother', 'child')
  addParentChild(personByRel, edges, 'grandparent 1', 'father')
  addParentChild(personByRel, edges, 'grandparent 2', 'father')
  addParentChild(personByRel, edges, 'grandparent 3', 'mother')
  addParentChild(personByRel, edges, 'grandparent 4', 'mother')
  addParentChild(personByRel, edges, 'great-gparent 1', 'grandparent 1')
  addParentChild(personByRel, edges, 'great-gparent 2', 'grandparent 1')
  addParentChild(personByRel, edges, 'great-gparent 3', 'grandparent 2')
  addParentChild(personByRel, edges, 'great-gparent 4', 'grandparent 2')
  addParentChild(personByRel, edges, 'great-gparent 5', 'grandparent 3')
  addParentChild(personByRel, edges, 'great-gparent 6', 'grandparent 3')
  addParentChild(personByRel, edges, 'great-gparent 7', 'grandparent 4')
  addParentChild(personByRel, edges, 'great-gparent 8', 'grandparent 4')
}

export function importFamilySheetCsv(csvText: string, preserveUiFrom: AppState): ImportResult {
  const rows = makeRows(csvText).filter(isImportableRow)
  if (rows.length === 0) {
    throw new Error('No importable people were found in this CSV.')
  }

  const next = createInitialAppState()
  next.ui.hasSeenTour = preserveUiFrom.ui.hasSeenTour

  const personByRel = new Map<string, ImportPersonRecord>()
  const rowsByRel = new Map<string, CsvRow[]>()

  for (const row of rows) {
    const relationshipKey = toRelationshipKey(row.relationship)
    const list = rowsByRel.get(relationshipKey) ?? []
    list.push(row)
    rowsByRel.set(relationshipKey, list)

    const person = createNewPerson({
      fullName: row.name,
      shortName: looksLikeMissing(row.nickname) ? row.name : row.nickname,
      dob: { dateISO: parseCsvDate(row.birthDate) },
      dod: { dateISO: parseCsvDate(row.deathDate) },
    })

    next.persons[person.id] = person
    if (!personByRel.has(relationshipKey)) {
      personByRel.set(relationshipKey, { person, relationshipKey })
    }
  }

  const edges: Edge[] = []
  applyTemplateRelationships(personByRel, rowsByRel, edges)
  next.edges = edges
  next.nodePositions = layoutDagre(next.persons, next.edges)
  next.selectedPersonIds = []

  return { state: next, importedCount: Object.keys(next.persons).length }
}
