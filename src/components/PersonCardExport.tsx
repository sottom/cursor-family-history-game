import type { Person } from '../state/appState'
import { PERSON_CARD_H, PERSON_CARD_W, type PhotoTransform } from '../state/appState'
import { PHOTO_MAIN_FRAME, PHOTO_THUMB_FRAME } from '../config/cardLayout'

import { useAppState } from '../state/AppProvider'

function fmtDateOrEmpty(dateISO?: string) {
  if (!dateISO) return ''
  if (dateISO.length >= 4) return dateISO.slice(0, 10)
  return dateISO
}

function photoTransformToStyle(transform: PhotoTransform) {
  return {
    translate: `translate(${transform.xPercent}%, ${transform.yPercent}%)`,
    scale: transform.scale,
  }
}

export default function PersonCardExport(props: {
  personId: string
  person: Person
  photoMainUrl?: string | null
  photoThumbUrl?: string | null
}) {
  const state = useAppState()
  const { person } = props

  const photoMainTransform: PhotoTransform = person.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
  const photoThumbTransform: PhotoTransform = person.photoThumb?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

  const main = photoTransformToStyle(photoMainTransform)
  const thumb = photoTransformToStyle(photoThumbTransform)

  return (
    <div
      style={{
        width: PERSON_CARD_W,
        height: PERSON_CARD_H,
        borderRadius: 14,
        border: '2px solid #e5e4e7',
        background: '#ffffff',
        overflow: 'hidden',
        position: 'relative',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: PHOTO_THUMB_FRAME.x,
          top: PHOTO_THUMB_FRAME.y,
          width: PHOTO_THUMB_FRAME.w,
          height: PHOTO_THUMB_FRAME.h,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #e5e4e7',
          background: '#f6f6f6',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: thumb.translate }}>
          {props.photoThumbUrl ? (
            <img
              src={props.photoThumbUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${thumb.scale})` }}
            />
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: PHOTO_MAIN_FRAME.x,
          top: PHOTO_MAIN_FRAME.y,
          width: PHOTO_MAIN_FRAME.w,
          height: PHOTO_MAIN_FRAME.h,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid #e5e4e7',
          background: '#f6f6f6',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: main.translate }}>
          {props.photoMainUrl ? (
            <img
              src={props.photoMainUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${main.scale})` }}
            />
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: PHOTO_MAIN_FRAME.y + PHOTO_MAIN_FRAME.h + 8,
          bottom: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontWeight: 900, color: '#08060d', fontSize: 14, lineHeight: 1.05 }}>
          {person.fullName || person.shortName || 'New Person'}
        </div>

        {person.shortName && person.shortName !== person.fullName ? (
          <div style={{ marginTop: 4, fontSize: 12, color: '#6b6375', lineHeight: 1.2 }}>
            Short: <span style={{ color: '#08060d', fontWeight: 700 }}>{person.shortName}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 6, fontSize: 12, color: '#6b6375', lineHeight: 1.25 }}>
          Born: {fmtDateOrEmpty(person.dob?.dateISO)} {person.dob?.location ? `• ${person.dob.location}` : ''}
        </div>

        <div style={{ marginTop: 4, fontSize: 12, color: '#6b6375', lineHeight: 1.25 }}>
          {person.marriages.length ? (
            <>
              Marriages:{' '}
              {person.marriages
                .slice(0, 2)
                .map((m) => {
                  const spouse = state.persons[m.spouseId]
                  const spouseName = spouse?.shortName || spouse?.fullName || m.spouseId
                  const d = fmtDateOrEmpty(m.dateISO)
                  const loc = m.location ? ` • ${m.location}` : ''
                  const cur = m.isCurrent ? ' ✓' : ''
                  return `${spouseName}${cur}${d ? ` (${d})` : ''}${loc}`
                })
                .join('; ')}
              {person.marriages.length > 2 ? ` (+${person.marriages.length - 2} more)` : ''}
            </>
          ) : (
            'Marriages: —'
          )}
        </div>

        <div style={{ marginTop: 4, fontSize: 12, color: '#6b6375', lineHeight: 1.25 }}>
          Died: {fmtDateOrEmpty(person.dod?.dateISO)} {person.dod?.location ? `• ${person.dod.location}` : ''}
        </div>

        {person.notes ? (
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b6375', opacity: 0.9, lineHeight: 1.2 }}>
            {person.notes.slice(0, 155)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

