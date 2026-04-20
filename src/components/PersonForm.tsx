import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { PersonDate, PhotoTransform } from '../state/appState'
import PersonFormPhotoBlock from './PersonFormPhotoBlock'
import PersonPrintCardPreview from './PersonPrintCardPreview'
import { DatePicker } from './DatePicker'

function DateField({
  label,
  value,
  onDateChange,
}: {
  label: string
  value: PersonDate
  onDateChange: (next?: string) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700, color: 'var(--text-h)', fontSize: 13 }}>{label}</div>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text)' }}>Date</span>
        <DatePicker value={value.dateISO} onChange={onDateChange} />
      </label>
    </div>
  )
}

const DEFAULT_PHOTO_T: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

export default function PersonForm() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const personId = state.ui.personForm?.personId

  const person = personId ? state.persons[personId] : undefined

  const [livePhotoTransforms, setLivePhotoTransforms] = useState<{
    main: PhotoTransform
    thumb: PhotoTransform
  } | null>(null)

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

  useEffect(() => {
    if (!personId || !person) return
    setLivePhotoTransforms({
      main: person.photoMain?.transform ?? DEFAULT_PHOTO_T,
      thumb: person.photoThumb?.transform ?? DEFAULT_PHOTO_T,
    })
  }, [personId, person?.photoMain?.blobKey, person?.photoThumb?.blobKey, person?.photoRevision ?? 0])

  const onPhotoDraftTransformsChange = useCallback((main: PhotoTransform, thumb: PhotoTransform) => {
    setLivePhotoTransforms({ main, thumb })
  }, [])

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
      <div className="ftModal ftModal--personEdit">
        <div className="ftModal__header">
          <div className="ftModal__title">Edit Details: {title}</div>
          <button className="ftIconBtn" onClick={() => dispatch({ type: 'CLOSE_PERSON_FORM' })} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ftModal__body ftModal__body--person">
          <div className="ftPersonEditGrid">
            <div id="ft-person-form-photo-anchor" className="ftPersonEditGrid__photo" tabIndex={-1}>
              <PersonFormPhotoBlock personId={personId} onDraftTransformsChange={onPhotoDraftTransformsChange} />
            </div>
            <div className="ftPersonEditGrid__fields ftPersonFormLayout__fields" style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr)', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Full name (on Card)</span>
              <input
                value={person.fullName}
                onChange={(e) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { fullName: e.target.value } } })}
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Short name (on Tree)</span>
              <input
                value={person.shortName}
                onChange={(e) =>
                  dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { shortName: e.target.value } } })
                }
                style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
            <DateField
              label="Birth"
              value={person.dob}
              onDateChange={(next) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { dob: { ...person.dob, dateISO: next } } } })}
            />
            <DateField
              label="Death"
              value={person.dod}
              onDateChange={(next) => dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { dod: { ...person.dod, dateISO: next } } } })}
            />
          </div>

          {person.marriages?.length ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 800, color: 'var(--text-h)' }}>Marriages</div>
              {person.marriages.map((m, idx) => (
                <div key={`${m.spouseId}:${idx}`} style={{ display: 'grid', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-h)' }}>
                      {state.persons[m.spouseId]?.shortName || state.persons[m.spouseId]?.fullName || 'Spouse'}
                    </span>
                    <label className="ftPrimaryPartnerToggle" aria-label="Primary partner">
                      <input
                        type="radio"
                        name="primaryPartner"
                        checked={!!m.isCurrent}
                        onChange={() => {
                          const next = person.marriages.map((marriage, i) => ({
                            ...marriage,
                            isCurrent: i === idx,
                          }))
                          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { marriages: next } } })
                        }}
                      />
                      <span className="ftPrimaryPartnerToggle__track" aria-hidden>
                        <span className="ftPrimaryPartnerToggle__thumb" />
                      </span>
                      <span className="ftPrimaryPartnerToggle__text">Primary Partner</span>
                    </label>
                  </div>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>Marriage date</span>
                      <DatePicker
                        value={m.dateISO}
                        onChange={(val) => {
                          const next = [...person.marriages]
                          next[idx] = { ...m, dateISO: val }
                          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { marriages: next } } })
                        }}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
            </div>
            <aside className="ftPersonEditGrid__print" aria-label="Print card preview">
              <PersonPrintCardPreview
                personId={personId}
                mainTransform={livePhotoTransforms?.main}
                thumbTransform={livePhotoTransforms?.thumb}
                photoBlobRevision={person.photoRevision ?? 0}
                layout="aside"
              />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

