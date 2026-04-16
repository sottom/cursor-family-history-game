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

export default function AddParentModal({ personId, onClose }: Props) {
  const state = useAppState()
  const dispatch = useAppDispatch()
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

  const existingParents = useMemo(
    () => state.edges.filter((e) => e.type === 'parent-child' && e.target === personId).map((e) => e.source),
    [personId, state.edges],
  )

  const filteredParents = useMemo(
    () => existingParents.filter((id) => matchesFilter(id, filter)),
    [existingParents, filter, matchesFilter],
  )

  const createParentAndLink = useCallback(
    (marryExistingParentId?: string) => {
      const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
      const newPerson = createNewPerson({ shortName: 'Parent', fullName: '' })

      let newPos: { x: number; y: number }
      if (marryExistingParentId) {
        const spousePos = state.nodePositions[marryExistingParentId] ?? {
          x: currPos.x + SPOUSE_PAIR_SPACING_X,
          y: currPos.y - (PERSON_CARD_H + 120),
        }
        const existingSpouseIds = state.edges
          .filter(
            (e) =>
              e.type === 'spouse' &&
              (e.source === marryExistingParentId || e.target === marryExistingParentId),
          )
          .map((e) => (e.source === marryExistingParentId ? e.target : e.source))
        const parentX = spousePos.x
        const hasRight = existingSpouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) > parentX)
        const hasLeft = existingSpouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) < parentX)
        let newX: number
        if (!hasRight) newX = parentX + SPOUSE_PAIR_SPACING_X
        else if (!hasLeft) newX = parentX - SPOUSE_PAIR_SPACING_X
        else {
          const maxRight = Math.max(
            ...existingSpouseIds.map((id) => state.nodePositions[id]?.x ?? 0),
          )
          newX = maxRight + SPOUSE_PAIR_SPACING_X
        }
        newPos = { x: newX, y: spousePos.y }
      } else {
        newPos = {
          x: currPos.x + spreadOffset(existingParents.length, Math.floor(SPOUSE_PAIR_SPACING_X * 0.72)),
          y: currPos.y - (PERSON_CARD_H + 120),
        }
      }

      dispatch({ type: 'ADD_PERSON', payload: { person: newPerson, position: newPos } })
      dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: newPerson.id } })
      dispatch({
        type: 'ADD_EDGE',
        payload: {
          edge: {
            id: crypto.randomUUID(),
            source: newPerson.id,
            target: personId,
            type: 'parent-child',
          },
        },
      })

      if (marryExistingParentId) {
        const marriage = { dateISO: undefined as string | undefined, location: undefined as string | undefined }
        dispatch({
          type: 'ADD_EDGE',
          payload: {
            edge: {
              id: crypto.randomUUID(),
              source: marryExistingParentId,
              target: newPerson.id,
              type: 'spouse',
              marriage,
            },
          },
        })
        const existingA = state.persons[marryExistingParentId]?.marriages ?? []
        dispatch({
          type: 'UPDATE_PERSON',
          payload: {
            personId: marryExistingParentId,
            patch: { marriages: [...existingA, { spouseId: newPerson.id, ...marriage }] },
          },
        })
        dispatch({
          type: 'UPDATE_PERSON',
          payload: {
            personId: newPerson.id,
            patch: { marriages: [{ spouseId: marryExistingParentId, ...marriage }] },
          },
        })
      }
    },
    [dispatch, existingParents.length, personId, state.edges, state.nodePositions, state.persons],
  )

  return createPortal(
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="ftModal" style={{ width: 'min(560px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">New Parent</div>
          <button className="ftIconBtn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="ftModal__body" style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            Is this new parent married to one of the existing parents?
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type a name to filter existing parents..."
              className="ftInput"
            />
            {filteredParents.map((parentId) => {
              const parent = state.persons[parentId]
              const label = parent?.shortName || parent?.fullName || 'Unnamed'
              return (
                <button
                  key={parentId}
                  className="ftBtn"
                  style={{ textAlign: 'left', padding: '10px 12px' }}
                  onClick={() => { createParentAndLink(parentId); onClose() }}
                  type="button"
                >
                  Yes, married to {label}
                </button>
              )
            })}
            {filteredParents.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text)' }}>No matching parents found.</div>
            )}
            <button
              className="ftBtn"
              style={{ textAlign: 'left', padding: '10px 12px' }}
              onClick={() => { createParentAndLink(); onClose() }}
              type="button"
            >
              No, separate parent
            </button>
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
