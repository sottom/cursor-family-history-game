import { useAppDispatch, useAppState } from '../state/AppProvider'
import { createInitialAppState, createNewPerson } from '../state/appState'
import { layoutDagre } from '../layout/layoutDagre'

/**
 * Loads a sample blended-family tree that exercises the layout's
 * ability to group children under their correct parent pairs:
 *
 *   Suzanna --- Marne --- Courtney
 *      |    |          |
 *    Jack  Sophia    Hazel
 */
export default function SampleLoader() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const onLoadSample = () => {
    const next = createInitialAppState()
    next.ui.hasSeenTour = state.ui.hasSeenTour

    const suzanna = createNewPerson({ fullName: 'Suzanna', shortName: 'Suzanna' })
    const marne = createNewPerson({ fullName: 'Marne', shortName: 'Marne' })
    const courtney = createNewPerson({ fullName: 'Courtney', shortName: 'Courtney' })
    const jack = createNewPerson({ fullName: 'Jack', shortName: 'Jack' })
    const sophia = createNewPerson({ fullName: 'Sophia', shortName: 'Sophia' })
    const hazel = createNewPerson({ fullName: 'Hazel', shortName: 'Hazel' })

    const marriageSM = { dateISO: '1990-06-15', location: undefined as string | undefined }
    const marriageMC = { dateISO: '2005-09-20', location: undefined as string | undefined }

    next.persons[suzanna.id] = { ...suzanna, marriages: [{ spouseId: marne.id, ...marriageSM }] }
    next.persons[marne.id] = {
      ...marne,
      marriages: [
        { spouseId: suzanna.id, ...marriageSM },
        { spouseId: courtney.id, ...marriageMC, isCurrent: true },
      ],
    }
    next.persons[courtney.id] = { ...courtney, marriages: [{ spouseId: marne.id, ...marriageMC, isCurrent: true }] }
    next.persons[jack.id] = jack
    next.persons[sophia.id] = sophia
    next.persons[hazel.id] = hazel

    // Spouse edges
    next.edges.push(
      { id: crypto.randomUUID(), source: suzanna.id, target: marne.id, type: 'spouse', marriage: marriageSM },
      { id: crypto.randomUUID(), source: marne.id, target: courtney.id, type: 'spouse', marriage: marriageMC },
    )

    // Parent-child: Jack and Sophia belong to Suzanna + Marne
    for (const child of [jack, sophia]) {
      next.edges.push(
        { id: crypto.randomUUID(), source: suzanna.id, target: child.id, type: 'parent-child' },
        { id: crypto.randomUUID(), source: marne.id, target: child.id, type: 'parent-child' },
      )
    }

    // Parent-child: Hazel belongs to Courtney only
    next.edges.push(
      { id: crypto.randomUUID(), source: courtney.id, target: hazel.id, type: 'parent-child' },
    )

    next.nodePositions = layoutDagre(next.persons, next.edges)
    next.selectedPersonIds = [suzanna.id]

    dispatch({ type: 'SET_STATE', payload: { state: next } })
  }

  return (
    <button type="button" className="ftBtn" onClick={onLoadSample} style={{ padding: '10px 12px' }}>
      Load Sample
    </button>
  )
}
