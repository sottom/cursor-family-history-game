import { useEffect, useMemo } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { PersonDate } from '../state/appState'
import PersonFormPhotoBlock from './PersonFormPhotoBlock'

function DateLocationField({
  label,
  value,
  onDateChange,
  onLocationChange,
}: {
  label: string
  value: PersonDate
  onDateChange: (next?: string) => void
  onLocationChange: (next?: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-h)', fontSize: 13 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>Date (ISO)</span>
          <input
            value={value.dateISO ?? ''}
            onChange={(e) => onDateChange(e.target.value || undefined)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
            placeholder="YYYY-MM-DD or YYYY"
          />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>Location</span>
          <input
            value={value.location ?? ''}
            onChange={(e) => onLocationChange(e.target.value || undefined)}
            style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
            placeholder="City, State"
          />
        </label>
      </div>
    </div>
  )
}

export default function PersonForm() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const personId = state.ui.personForm?.personId

  const person = personId ? state.persons[personId] : undefined

  const title = useMemo(() => person?.fullName || person?.shortName || 'Person', [person])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'CLOSE_PERSON_FORM' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  if (!personId || !person) return null

  return (
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'CLOSE_PERSON_FORM' })
      }}
    >
      <div className="ftModal" style={{ width: 'min(900px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">Edit Details: {title}</div>
          <button className="ftIconBtn" onClick={() => dispatch({ type: 'CLOSE_PERSON_FORM' })} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ftModal__body ftModal__body--person">
          <div className="ftPersonFormLayout">
            <PersonFormPhotoBlock personId={personId} />
            <div className="ftPersonFormLayout__fields" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Full name</span>
              <input
                value={person.fullName}
                onChange={(e) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { fullName: e.target.value } } })}
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Short name</span>
              <input
                value={person.shortName}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { shortName: e.target.value } } })
                }
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DateLocationField
              label="Birth"
              value={person.dob}
              onDateChange={(next) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { dob: { ...person.dob, dateISO: next } } } })}
              onLocationChange={(next) =>
                dispatch({
                  type: 'UPDATE_PERSON',
                  payload: { personId, patch: { dob: { ...person.dob, location: next } } },
                })
              }
            />
            <DateLocationField
              label="Death"
              value={person.dod}
              onDateChange={(next) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { dod: { ...person.dod, dateISO: next } } } })}
              onLocationChange={(next) =>
                dispatch({
                  type: 'UPDATE_PERSON',
                  payload: { personId, patch: { dod: { ...person.dod, location: next } } },
                })
              }
            />
          </div>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--text)' }}>Notes</span>
            <textarea
              value={person.notes ?? ''}
              onChange={(e) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { notes: e.target.value } } })}
              style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)', minHeight: 90 }}
            />
          </label>

          {person.marriages?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-h)' }}>Marriages</div>
              {person.marriages.map((m, idx) => (
                <div key={`${m.spouseId}:${idx}`} style={{ display: 'grid', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                      {state.persons[m.spouseId]?.shortName || state.persons[m.spouseId]?.fullName || 'Spouse'}
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={!!m.isCurrent}
                        onChange={(e) => {
                          const next = [...person.marriages]
                          next[idx] = { ...m, isCurrent: e.target.checked }
                          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { marriages: next } } })
                        }}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      Current
                    </label>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>Marriage date</span>
                      <input
                        value={m.dateISO ?? ''}
                        onChange={(e) => {
                          const next = [...person.marriages]
                          next[idx] = { ...m, dateISO: e.target.value || undefined }
                          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { marriages: next } } })
                        }}
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                        placeholder="YYYY-MM-DD or YYYY"
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>Location</span>
                      <input
                        value={m.location ?? ''}
                        onChange={(e) => {
                          const next = [...person.marriages]
                          next[idx] = { ...m, location: e.target.value || undefined }
                          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { marriages: next } } })
                        }}
                        style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                        placeholder="City, State"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

