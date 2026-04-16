import { useAppDispatch, useAppState } from '../state/AppProvider'
import { createInitialAppState, createNewPerson, PERSON_CARD_H, SPOUSE_PAIR_SPACING_X } from '../state/appState'

export default function SampleLoader() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const onLoadSample = () => {
    const next = createInitialAppState()
    next.ui.hasSeenTour = state.ui.hasSeenTour

    // Root couple: Root <-> Spouse, then 3 children connected to both parents.
    const root = createNewPerson({ fullName: 'Alex Root', shortName: 'Alex' })
    const spouse = createNewPerson({ fullName: 'Sam Spouse', shortName: 'Sam' })

    const spouseEdgeMarriage = { dateISO: '1900-06-01', location: 'Springfield' }
    next.persons[root.id] = { ...root, marriages: [{ spouseId: spouse.id, ...spouseEdgeMarriage }] }
    next.persons[spouse.id] = { ...spouse, marriages: [{ spouseId: root.id, ...spouseEdgeMarriage }] }

    const x0 = 0
    const y0 = 0
    const spouseX = x0 + SPOUSE_PAIR_SPACING_X

    const childY = y0 + PERSON_CARD_H + 120
    const xAvg = (x0 + spouseX) / 2

    const child1 = createNewPerson({ fullName: 'Casey Child 1', shortName: 'Casey 1' })
    const child2 = createNewPerson({ fullName: 'Taylor Child 2', shortName: 'Taylor 2' })
    const child3 = createNewPerson({ fullName: 'Jordan Child 3', shortName: 'Jordan 3' })

    next.persons[child1.id] = child1
    next.persons[child2.id] = child2
    next.persons[child3.id] = child3

    // Positions
    next.nodePositions[root.id] = { x: x0, y: y0 }
    next.nodePositions[spouse.id] = { x: spouseX, y: y0 }
    next.nodePositions[child1.id] = { x: xAvg - 200, y: childY }
    next.nodePositions[child2.id] = { x: xAvg, y: childY }
    next.nodePositions[child3.id] = { x: xAvg + 200, y: childY }

    // Edges
    next.edges.push({
      id: crypto.randomUUID(),
      source: root.id,
      target: spouse.id,
      type: 'spouse',
      marriage: spouseEdgeMarriage,
    })

    for (const child of [child1, child2, child3]) {
      next.edges.push({
        id: crypto.randomUUID(),
        source: root.id,
        target: child.id,
        type: 'parent-child',
      })
      next.edges.push({
        id: crypto.randomUUID(),
        source: spouse.id,
        target: child.id,
        type: 'parent-child',
      })
    }

    next.selectedPersonIds = [root.id]

    dispatch({ type: 'SET_STATE', payload: { state: next } })
  }

  return (
    <button type="button" className="ftBtn" onClick={onLoadSample} style={{ padding: '10px 12px' }}>
      Load Sample
    </button>
  )
}

