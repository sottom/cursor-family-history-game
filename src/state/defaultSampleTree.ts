import { layoutDagre } from '../layout/layoutDagre'
import type { AppState, Edge, Person } from './appState'
import { createInitialAppState, createNewPerson } from './appState'

/** Middle left/right marriage dots (`spouse-left-1` / `spouse-right-1`) so lines stay centered on cards. */
function spouseEdge(a: string, b: string, marriage: { dateISO?: string; location?: string }): Edge {
  return {
    id: crypto.randomUUID(),
    source: a,
    target: b,
    type: 'spouse',
    marriage,
    spouseHandleSlot: 1,
  }
}

function parentChild(parentId: string, childId: string): Edge {
  return { id: crypto.randomUUID(), source: parentId, target: childId, type: 'parent-child' }
}

function setMarriage(a: Person, b: Person, m: { dateISO?: string; location?: string }): [Person, Person] {
  return [
    { ...a, marriages: [...a.marriages, { spouseId: b.id, ...m }] },
    { ...b, marriages: [...b.marriages, { spouseId: a.id, ...m }] },
  ]
}

/**
 * 15 people, 4 generations:
 * - 1 child → 2 married parents → each parent has 2 parents (4 grandparents) → each grandparent has 2 parents (8 great-grandparents).
 *
 * Dates are chosen so the deck timeline (earliest birth/marriage/death → 2026) spans multiple era segments
 * and status circles show varied colors. Quinn Lee (b. 1926) anchors the start; living people omit death.
 */
export function buildFourGenerationSampleState(): AppState {
  const next = createInitialAppState()

  // Gen 1 — great-grandparents (4 couples): born 1926–1933, married 1950, died 1999–2019
  let o = createNewPerson({
    fullName: 'Omar West',
    shortName: 'Omar West',
  })
  let p = createNewPerson({
    fullName: 'Petra West',
    shortName: 'Petra West',
  })
  let q = createNewPerson({
    fullName: 'Quinn Lee',
    shortName: 'Quinn Lee',
  })
  let r = createNewPerson({
    fullName: 'Rhea Lee',
    shortName: 'Rhea Lee',
  })
  let s = createNewPerson({
    fullName: 'Saul Chen',
    shortName: 'Saul Chen',
  })
  let t = createNewPerson({
    fullName: 'Tessa Chen',
    shortName: 'Tessa Chen',
  })
  let u = createNewPerson({
    fullName: 'Uri Park',
    shortName: 'Uri Park',
  })
  let v = createNewPerson({
    fullName: 'Vera Park',
    shortName: 'Vera Park',
  })

  const m1950 = { dateISO: '1950-06-01', location: 'Chicago' as string | undefined }
  ;[o, p] = setMarriage(o, p, m1950)
  ;[q, r] = setMarriage(q, r, m1950)
  ;[s, t] = setMarriage(s, t, m1950)
  ;[u, v] = setMarriage(u, v, m1950)

  // Gen 2 — grandparents
  let frank = createNewPerson({
    fullName: 'Frank West',
    shortName: 'Frank West',
  })
  let grace = createNewPerson({
    fullName: 'Grace Lee',
    shortName: 'Grace Lee',
  })
  let henry = createNewPerson({
    fullName: 'Henry Chen',
    shortName: 'Henry Chen',
  })
  let iris = createNewPerson({
    fullName: 'Iris Park',
    shortName: 'Iris Park',
  })

  const m1975 = { dateISO: '1975-08-15', location: 'Seattle' as string | undefined }
  ;[frank, grace] = setMarriage(frank, grace, m1975)
  ;[henry, iris] = setMarriage(henry, iris, m1975)

  // Gen 3 — parents (two marriage dates each → 4-spot + death layout on cards)
  let dana = createNewPerson({
    fullName: 'Dana West',
    shortName: 'Dana West',
  })
  let evan = createNewPerson({
    fullName: 'Evan Chen',
    shortName: 'Evan Chen',
  })
  const m2000 = { dateISO: '2000-05-20', location: 'Portland' as string | undefined }
  const m2012 = { dateISO: '2012-06-10', location: 'Portland' as string | undefined, isCurrent: true }
  ;[dana, evan] = setMarriage(dana, evan, m2000)
  dana = {
    ...dana,
    marriages: [...dana.marriages, { spouseId: evan.id, dateISO: m2012.dateISO, location: m2012.location, isCurrent: m2012.isCurrent }],
  }
  evan = {
    ...evan,
    marriages: [...evan.marriages, { spouseId: dana.id, dateISO: m2012.dateISO, location: m2012.location, isCurrent: m2012.isCurrent }],
  }

  // Gen 4 — child (young, living: birth only fills first circle; marriage/death slots empty)
  const avery = createNewPerson({
    fullName: 'Avery Chen',
    shortName: 'Avery Chen',
  })

  const people: Person[] = [o, p, q, r, s, t, u, v, frank, grace, henry, iris, dana, evan, avery]
  for (const person of people) {
    next.persons[person.id] = person
  }

  const edges: Edge[] = [
    spouseEdge(o.id, p.id, m1950),
    spouseEdge(q.id, r.id, m1950),
    spouseEdge(s.id, t.id, m1950),
    spouseEdge(u.id, v.id, m1950),
    spouseEdge(frank.id, grace.id, m1975),
    spouseEdge(henry.id, iris.id, m1975),
    spouseEdge(dana.id, evan.id, m2000),
    // Great-grandparents → grandparents
    parentChild(o.id, frank.id),
    parentChild(p.id, frank.id),
    parentChild(q.id, grace.id),
    parentChild(r.id, grace.id),
    parentChild(s.id, henry.id),
    parentChild(t.id, henry.id),
    parentChild(u.id, iris.id),
    parentChild(v.id, iris.id),
    // Grandparents → parents
    parentChild(frank.id, dana.id),
    parentChild(grace.id, dana.id),
    parentChild(henry.id, evan.id),
    parentChild(iris.id, evan.id),
    // Parents → child
    parentChild(dana.id, avery.id),
    parentChild(evan.id, avery.id),
  ]

  next.edges = edges
  next.nodePositions = layoutDagre(next.persons, next.edges)
  next.selectedPersonIds = [dana.id]

  return next
}
