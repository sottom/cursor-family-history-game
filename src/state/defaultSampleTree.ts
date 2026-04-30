import { layoutDagre } from '../layout/layoutDagre'
import type { AppState, Edge } from './appState'
import { createInitialAppState, createNewPerson } from './appState'
import { makeUuid } from '../utils/uuid'

/** Middle left/right marriage dots (`spouse-left-1` / `spouse-right-1`) so lines stay centered on cards. */
function spouseEdge(a: string, b: string): Edge {
  return {
    id: makeUuid(),
    source: a,
    target: b,
    type: 'spouse',
    spouseHandleSlot: 1,
  }
}

function parentChild(parentId: string, childId: string): Edge {
  return { id: makeUuid(), source: parentId, target: childId, type: 'parent-child' }
}

function linkMarriage(next: AppState, a: string, b: string): void {
  const personA = next.persons[a]
  const personB = next.persons[b]
  if (!personA || !personB) return

  personA.marriages = [...(personA.marriages ?? []), { spouseId: b, isCurrent: true }]
  personB.marriages = [...(personB.marriages ?? []), { spouseId: a, isCurrent: true }]
}

/**
 * 15 people across 4 generations (great-grandparents → child), names only — no dates, marriages, or notes.
 */
export function buildFourGenerationSampleState(): AppState {
  const next = createInitialAppState()

  const o = createNewPerson({ fullName: '', shortName: '' })
  const p = createNewPerson({ fullName: '', shortName: '' })
  const q = createNewPerson({ fullName: '', shortName: '' })
  const r = createNewPerson({ fullName: '', shortName: '' })
  const s = createNewPerson({ fullName: '', shortName: '' })
  const t = createNewPerson({ fullName: '', shortName: '' })
  const u = createNewPerson({ fullName: '', shortName: '' })
  const v = createNewPerson({ fullName: '', shortName: '' })

  const frank = createNewPerson({ fullName: '', shortName: '' })
  const grace = createNewPerson({ fullName: '', shortName: '' })
  const henry = createNewPerson({ fullName: '', shortName: '' })
  const iris = createNewPerson({ fullName: '', shortName: '' })

  const dana = createNewPerson({ fullName: '', shortName: '' })
  const evan = createNewPerson({ fullName: '', shortName: '' })

  const avery = createNewPerson({ fullName: '', shortName: '' })

  const people = [o, p, q, r, s, t, u, v, frank, grace, henry, iris, dana, evan, avery]
  for (const person of people) {
    next.persons[person.id] = person
  }

  linkMarriage(next, o.id, p.id)
  linkMarriage(next, q.id, r.id)
  linkMarriage(next, s.id, t.id)
  linkMarriage(next, u.id, v.id)
  linkMarriage(next, frank.id, grace.id)
  linkMarriage(next, henry.id, iris.id)
  linkMarriage(next, dana.id, evan.id)

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
