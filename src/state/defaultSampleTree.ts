import { layoutDagre } from '../layout/layoutDagre'
import type { AppState, Edge } from './appState'
import { createInitialAppState, createNewPerson } from './appState'

/** Middle left/right marriage dots (`spouse-left-1` / `spouse-right-1`) so lines stay centered on cards. */
function spouseEdge(a: string, b: string): Edge {
  return {
    id: crypto.randomUUID(),
    source: a,
    target: b,
    type: 'spouse',
    spouseHandleSlot: 1,
  }
}

function parentChild(parentId: string, childId: string): Edge {
  return { id: crypto.randomUUID(), source: parentId, target: childId, type: 'parent-child' }
}

/**
 * 15 people across 4 generations (great-grandparents → child), names only — no dates, marriages, or notes.
 */
export function buildFourGenerationSampleState(): AppState {
  const next = createInitialAppState()

  const o = createNewPerson({ fullName: 'Omar West', shortName: 'Omar West' })
  const p = createNewPerson({ fullName: 'Petra West', shortName: 'Petra West' })
  const q = createNewPerson({ fullName: 'Quinn Lee', shortName: 'Quinn Lee' })
  const r = createNewPerson({ fullName: 'Rhea Lee', shortName: 'Rhea Lee' })
  const s = createNewPerson({ fullName: 'Saul Chen', shortName: 'Saul Chen' })
  const t = createNewPerson({ fullName: 'Tessa Chen', shortName: 'Tessa Chen' })
  const u = createNewPerson({ fullName: 'Uri Park', shortName: 'Uri Park' })
  const v = createNewPerson({ fullName: 'Vera Park', shortName: 'Vera Park' })

  const frank = createNewPerson({ fullName: 'Frank West', shortName: 'Frank West' })
  const grace = createNewPerson({ fullName: 'Grace Lee', shortName: 'Grace Lee' })
  const henry = createNewPerson({ fullName: 'Henry Chen', shortName: 'Henry Chen' })
  const iris = createNewPerson({ fullName: 'Iris Park', shortName: 'Iris Park' })

  const dana = createNewPerson({ fullName: 'Dana West', shortName: 'Dana West' })
  const evan = createNewPerson({ fullName: 'Evan Chen', shortName: 'Evan Chen' })

  const avery = createNewPerson({ fullName: 'Avery Chen', shortName: 'Avery Chen' })

  const people = [o, p, q, r, s, t, u, v, frank, grace, henry, iris, dana, evan, avery]
  for (const person of people) {
    next.persons[person.id] = person
  }

  const edges: Edge[] = [
    spouseEdge(o.id, p.id),
    spouseEdge(q.id, r.id),
    spouseEdge(s.id, t.id),
    spouseEdge(u.id, v.id),
    spouseEdge(frank.id, grace.id),
    spouseEdge(henry.id, iris.id),
    spouseEdge(dana.id, evan.id),
    parentChild(o.id, frank.id),
    parentChild(p.id, frank.id),
    parentChild(q.id, grace.id),
    parentChild(r.id, grace.id),
    parentChild(s.id, henry.id),
    parentChild(t.id, henry.id),
    parentChild(u.id, iris.id),
    parentChild(v.id, iris.id),
    parentChild(frank.id, dana.id),
    parentChild(grace.id, dana.id),
    parentChild(henry.id, evan.id),
    parentChild(iris.id, evan.id),
    parentChild(dana.id, avery.id),
    parentChild(evan.id, avery.id),
  ]

  next.edges = edges
  next.nodePositions = layoutDagre(next.persons, next.edges)
  next.selectedPersonIds = [dana.id]

  return next
}
