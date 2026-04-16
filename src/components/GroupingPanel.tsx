import { useMemo, useState } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { GroupingKind } from '../state/appState'
import { computeAllGroupings } from '../utils/groupings'

function formatRange(range: { minYear: number; maxYear: number }) {
  return range.minYear === range.maxYear ? `${range.minYear}` : `${range.minYear}–${range.maxYear}`
}

export default function GroupingPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [activeKind, setActiveKind] = useState<GroupingKind>('birth')

  const groupings = useMemo(() => computeAllGroupings({ state, overrides: state.ui.groupingOverrides }), [state])
  const defaults = useMemo(() => computeAllGroupings({ state }), [state])

  const current = groupings[activeKind]
  const defaultForActive = defaults[activeKind]

  const boundaries = current.boundariesUsed ?? defaultForActive.boundariesUsed ?? [0, 0, 0]

  const onChangeBoundary = (idx: 0 | 1 | 2, raw: string) => {
    const v = Number(raw)
    if (!Number.isFinite(v)) return
    const next: [number, number, number] = [...boundaries] as [number, number, number]
    next[idx] = v
    dispatch({ type: 'SET_GROUPING_BOUNDARIES', payload: { kind: activeKind, boundaries: next } })
  }

  const memberLabel = (id: string) => state.persons[id]?.shortName || state.persons[id]?.fullName || id

  const kinds: GroupingKind[] = ['birth', 'marriage', 'death']

  return (
    <div className="ftPanel">
      <div className="ftPanel__title">Age Buckets</div>

      <div className="ftPanel__body" style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className="ftNodeBtn"
              style={{
                background: activeKind === k ? 'var(--accent-bg)' : undefined,
                borderColor: activeKind === k ? 'var(--accent-border)' : undefined,
              }}
              onClick={() => setActiveKind(k)}
            >
              {k === 'birth' ? 'Birth' : k === 'marriage' ? 'Marriage' : 'Death'}
            </button>
          ))}
        </div>

        {kinds.map((k) => {
          const g = groupings[k]
          return (
            <div key={k} style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ fontWeight: 900, color: 'var(--text-h)' }}>{k === 'birth' ? 'Birth' : k === 'marriage' ? 'Marriage' : 'Death'}</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>Buckets: {g.bucketCount}</div>
              </div>
              {g.buckets.length ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {g.buckets.map((b, idx) => (
                    <div key={idx} style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-h)', fontWeight: 800 }}>
                        Group {idx + 1}: {formatRange(b.range)} ({b.memberCount} people)
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>
                        {b.members.slice(0, 8).map(memberLabel).join(', ')}
                        {b.members.length > 8 ? ` (+${b.members.length - 8})` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text)' }}>No valid dates yet.</div>
              )}
            </div>
          )
        })}

        <div style={{ padding: 10, borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div style={{ fontWeight: 900, color: 'var(--text-h)', marginBottom: 8 }}>Tweak Boundaries ({activeKind})</div>
          {current.bucketCount < 4 ? (
            <div style={{ fontSize: 13, color: 'var(--text)' }}>Need at least 4 date entries to tweak quartiles.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>End Group 1</span>
                  <input
                    type="number"
                    value={boundaries[0]}
                    onChange={(e) => onChangeBoundary(0, e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>End Group 2</span>
                  <input
                    type="number"
                    value={boundaries[1]}
                    onChange={(e) => onChangeBoundary(1, e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>End Group 3</span>
                  <input
                    type="number"
                    value={boundaries[2]}
                    onChange={(e) => onChangeBoundary(2, e.target.value)}
                    style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--border)' }}
                  />
                </label>
              </div>

              <button
                type="button"
                className="ftBtn"
                style={{ padding: '10px 12px' }}
                onClick={() => {
                  const b = defaultForActive.boundariesUsed
                  if (!b) return
                  dispatch({ type: 'SET_GROUPING_BOUNDARIES', payload: { kind: activeKind, boundaries: b } })
                }}
              >
                Reset to Quartiles
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

