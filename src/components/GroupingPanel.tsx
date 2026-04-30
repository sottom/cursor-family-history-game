import { useMemo } from 'react'

import { useAppState } from '../state/AppProvider'
import { computeUnifiedEventGrouping } from '../utils/groupings'

function formatRange(range: { minYear: number; maxYear: number }) {
  return range.minYear === range.maxYear ? `${range.minYear}` : `${range.minYear}–${range.maxYear}`
}

export default function GroupingPanel() {
  const state = useAppState()
  const buckets = useMemo(() => computeUnifiedEventGrouping(state), [state])

  const memberLabel = (id: string) => state.persons[id]?.shortName || state.persons[id]?.fullName || id

  return (
    <div className="ftPanel">
      <div className="ftPanel__title">Event Buckets</div>

      <div className="ftPanel__body" style={{ display: 'grid', gap: 14 }}>
        {buckets.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {buckets.map((bucket) => (
              <div key={bucket.bucketIndex} style={{ display: 'grid', gap: 4, padding: 10, borderRadius: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-h)', fontWeight: 900 }}>
                  Group {bucket.bucketIndex}: {formatRange(bucket.range)} ({bucket.memberCount} people)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  Events: {bucket.eventCount} (Birth {bucket.birthCount}, Marriage {bucket.marriageCount}, Death {bucket.deathCount})
                </div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {bucket.members.slice(0, 10).map(memberLabel).join(', ')}
                  {bucket.members.length > 10 ? ` (+${bucket.members.length - 10})` : ''}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text)' }}>No valid dates yet.</div>
        )}
      </div>
    </div>
  )
}

