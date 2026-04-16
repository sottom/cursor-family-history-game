import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { createNewPerson, PERSON_CARD_H, SPOUSE_PAIR_SPACING_X } from '../state/appState'
import { useAppDispatch, useAppState } from '../state/AppProvider'

function spreadOffset(index: number, step: number) {
  if (index <= 0) return 0
  const slot = Math.ceil(index / 2)
  const side = index % 2 === 1 ? 1 : -1
  return side * slot * step
}

type Props = { personId: string; onClose: () => void }

export default function AddChildModal({ personId, onClose }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const matchesFilter = useCallback(
    (id: string, query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      const p = state.persons[id]
      return (
        (p?.fullName ?? '').toLowerCase().includes(q) ||
        (p?.shortName ?? '').toLowerCase().includes(q)
      )
    },
    [state.persons],
  )

  const directSpouses = useMemo(() => {
    const set = new Set<string>()
    for (const e of state.edges) {
      if (e.type !== 'spouse') continue
      if (e.source === personId) set.add(e.target)
      if (e.target === personId) set.add(e.source)
    }
    return [...set]
  }, [personId, state.edges])

  const potentialCoParents = useMemo(() => {
    const spouseSet = new Set(directSpouses)
    return Object.keys(state.persons)
      .filter((id) => id !== personId && !spouseSet.has(id))
      .sort((a, b) => {
        const aL = state.persons[a]?.shortName || state.persons[a]?.fullName || ''
        const bL = state.persons[b]?.shortName || state.persons[b]?.fullName || ''
        return aL.localeCompare(bL)
      })
  }, [directSpouses, personId, state.persons])

  const filteredSpouses = useMemo(
    () => directSpouses.filter((id) => matchesFilter(id, filter)),
    [directSpouses, filter, matchesFilter],
  )

  const filteredCoParents = useMemo(
    () => potentialCoParents.filter((id) => matchesFilter(id, filter)),
    [potentialCoParents, filter, matchesFilter],
  )

  const createChildForParents = useCallback(
    (parents: string[]) => {
      const unique = [...new Set(parents)]
      if (unique.length === 0) return

      const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
      const yMax = Math.max(
        ...unique.map((id) => state.nodePositions[id]?.y ?? currPos.y),
      )
      const xAvg =
        unique.reduce((s, id) => s + (state.nodePositions[id]?.x ?? currPos.x), 0) /
        unique.length

      const targetKey = [...unique].sort().join('|')
      const childParents = new Map<string, Set<string>>()
      for (const edge of state.edges) {
        if (edge.type !== 'parent-child') continue
        if (!childParents.has(edge.target)) childParents.set(edge.target, new Set())
        childParents.get(edge.target)!.add(edge.source)
      }
      let siblingCount = 0
      for (const ps of childParents.values()) {
        if ([...ps].sort().join('|') === targetKey) siblingCount += 1
      }

      const child = createNewPerson({ shortName: 'Child', fullName: '' })
      const childPos = {
        x: xAvg + spreadOffset(siblingCount, Math.floor(SPOUSE_PAIR_SPACING_X * 0.72)),
        y: yMax + PERSON_CARD_H + 120,
      }

      dispatch({ type: 'ADD_PERSON', payload: { person: child, position: childPos } })
      dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: child.id } })
      for (const pId of unique) {
        dispatch({
          type: 'ADD_EDGE',
          payload: {
            edge: { id: crypto.randomUUID(), source: pId, target: child.id, type: 'parent-child' },
          },
        })
      }
    },
    [dispatch, personId, state.edges, state.nodePositions],
  )

  const personLabel = person?.shortName || person?.fullName || 'this person'

  return createPortal(
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ftModal" style={{ width: 'min(560px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">Add Child</div>
          <button className="ftIconBtn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ftModal__body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            Who are the parents of this child?
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type a name to filter..."
              className="ftInput"
            />
            {filteredSpouses.map((spouseId) => {
              const sp = state.persons[spouseId]
              const spLabel = sp?.shortName || sp?.fullName || 'Unnamed spouse'
              return (
                <button
                  key={spouseId}
                  className="ftBtn"
                  style={{ textAlign: 'left', padding: '10px 12px' }}
                  onClick={() => { createChildForParents([personId, spouseId]); onClose() }}
                  type="button"
                >
                  {personLabel} &amp; {spLabel}
                </button>
              )
            })}
            {filteredCoParents.map((otherId) => {
              const other = state.persons[otherId]
              const otherLabel = other?.shortName || other?.fullName || 'Unnamed'
              return (
                <button
                  key={otherId}
                  className="ftBtn"
                  style={{ textAlign: 'left', padding: '10px 12px' }}
                  onClick={() => { createChildForParents([personId, otherId]); onClose() }}
                  type="button"
                >
                  {personLabel} &amp; {otherLabel}
                </button>
              )
            })}
            <button
              className="ftBtn"
              style={{ textAlign: 'left', padding: '10px 12px' }}
              onClick={() => { createChildForParents([personId]); onClose() }}
              type="button"
            >
              Just {personLabel}
            </button>
            {filteredSpouses.length === 0 && filteredCoParents.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text)' }}>No matching people found.</div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="ftBtn" type="button" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
