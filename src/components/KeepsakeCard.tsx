import { useMemo, useState, type ReactNode } from 'react'

import { usePhotoFramingInteraction } from '../hooks/usePhotoFramingInteraction'
import { useAppState } from '../state/AppProvider'
import {
  PERSON_MAIN_OVAL_ASPECT_RATIO,
  type MarriageEntry,
  type Person,
  type PhotoTransform,
} from '../state/appState'
import { computeGenerationByPersonId, getGenerationAccentColor } from '../utils/generation'
import { personPhotoFrameWrapperStyle } from '../utils/photoFrameTransform'
import { getEraColor, getPersonTimelineSpots, getTimelineYearBounds, parseYear } from '../utils/timeline'

/**
 * Shared renderer for the "Keepsake" print card. The edit-modal preview and the
 * ZIP export both render this, so whatever the user sees in the preview is
 * exactly what gets saved to the exported image — down to the dynamic oval
 * color, era-colored bubbles, multi-marriage layout, and portrait framing.
 *
 * Callers are responsible for resolving photo blobs to URL strings (data URLs
 * for export so rasterizers can capture them; blob/object URLs for the live
 * modal preview).
 */
export type KeepsakeCardProps = {
  personId: string
  /** Falls back to saved transform on the person. Used by the edit modal for live editing. */
  mainTransform?: PhotoTransform
  thumbTransform?: PhotoTransform
  /** Resolved portrait URL (data URL or object URL). */
  photoMainUrl?: string | null
  /** Resolved thumbnail URL (data URL or object URL). */
  photoThumbUrl?: string | null
  /** Optional override of the card's CSS width. Used by the ZIP export to rasterize at a crisp, deterministic size. */
  width?: number
  /** Optional override of the background artwork URL (defaults to the served `/cards/blankCard.png`). Set to a data URL during export so html→canvas rasterizers can capture it. */
  backgroundUrl?: string
  /** For accessibility / DOM id conflicts when multiple copies render at once. */
  className?: string
  /** Strip UI-only chrome (drop-shadow) that would otherwise be clipped by the
   *  rasterizer's tight bounding-box capture. Use when saving to PNG for
   *  print — the template background is already baked into the artwork. */
  exportMode?: boolean
  /** Edit modal: drag / scroll-zoom photos directly on the card oval and thumbnail. */
  interactive?: boolean
  /** Edit modal: show spinners on oval + thumb while a new photo is ingesting. */
  photoImporting?: boolean
  onMainTransformChange?: (t: PhotoTransform) => void
  onThumbTransformChange?: (t: PhotoTransform) => void
}

const DEFAULT_T: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

/* ---------- Icons ---------- */

function IconStroller() {
  return (
    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="8" cy="19.5" rx="1.7" ry="1.7" fill="currentColor" />
      <ellipse cx="16" cy="19.5" rx="1.7" ry="1.7" fill="currentColor" />
      <path d="M4 11.5 a7.5 7.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path
        d="M4 11.5 H17 V14 a3 3 0 0 1 -3 3 H7 a3 3 0 0 1 -3 -3 z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M17 6 L20 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconRings() {
  return (
    <svg width="65%" height="65%" viewBox="0 0 28 24" fill="none" aria-hidden>
      <circle cx="11" cy="14" r="6" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="14" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9.5 4 L11 7 L12.5 4 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function IconHeadstone() {
  return (
    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 21 V12 a5 5 0 0 1 10 0 V21 Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" fill="none" />
      <path d="M12 14 V19 M10 16 H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 21 H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/* ---------- Photo renderer (transforms match modal/tree exactly) ---------- */

function PhotoInFrame({
  transform,
  url,
  emptyLabel,
  borderRadius,
}: {
  transform: PhotoTransform
  url?: string | null
  emptyLabel: string
  borderRadius: string
}) {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius, overflow: 'hidden', background: '#d5c2a7' }}>
      <div style={personPhotoFrameWrapperStyle(transform)}>
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              fontSize: 9,
              fontWeight: 700,
              color: '#3d2a1a',
              opacity: 0.7,
              padding: 4,
              textAlign: 'center',
            }}
          >
            {emptyLabel}
          </div>
        )}
      </div>
    </div>
  )
}

function PhotoSlotBusyOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="ftPrintCard__photoLoadingOverlay" role="status" aria-live="polite" aria-label="Uploading photo">
      <div className="ftSpinner ftPrintCard__photoLoadingSpinner" />
    </div>
  )
}

/* ---------- Date → "1976 Aug 15" ---------- */

function formatLifecycleDate(dateISO?: string): { year: string; monthDay: string } {
  const s = dateISO?.trim() ?? ''
  if (!s) return { year: '—', monthDay: '' }
  if (/^\d{4}$/.test(s)) return { year: s, monthDay: '' }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const year = String(d.getUTCFullYear())
    // Treat YYYY-MM-DD as date-only so days don't drift across timezones.
    const hasDay = /^\d{4}-\d{2}-\d{2}/.test(s)
    const hasMonth = /^\d{4}-\d{2}/.test(s)
    if (hasDay) {
      const md = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toLocaleDateString(
        'en-US',
        { month: 'short', day: 'numeric', timeZone: 'UTC' },
      )
      return { year, monthDay: md }
    }
    if (hasMonth) {
      const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toLocaleDateString('en-US', {
        month: 'short',
        timeZone: 'UTC',
      })
      return { year, monthDay: m }
    }
    return { year, monthDay: '' }
  }
  return { year: s.slice(0, 4) || '—', monthDay: '' }
}

/* ---------- Lifecycle row ---------- */

function LifecycleRow({
  icon,
  bubbleColor,
  year,
  monthDay,
  ariaLabel,
}: {
  icon: ReactNode
  bubbleColor: string | null
  year: string
  monthDay: string
  ariaLabel: string
}) {
  return (
    <div className="ftPrintCard__row" aria-label={ariaLabel}>
      <span
        className="ftPrintCard__rowBubble"
        style={{ background: bubbleColor ?? 'rgba(150, 130, 100, 0.45)' }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="ftPrintCard__rowText">
        <span className="ftPrintCard__rowYear">{year}</span>
        {monthDay ? <span className="ftPrintCard__rowMonthDay">{monthDay}</span> : null}
      </span>
    </div>
  )
}

/* ---------- Mini timeline dots ---------- */

const THUMB_DOT_LANE_ORDER: Record<string, number> = {
  left: 0,
  'center-left': 1,
  center: 2,
  'center-right': 3,
  right: 4,
}
const THUMB_DOT_SIZE_PX = 13

function ThumbTimelineDots({ spots }: { spots: ReturnType<typeof getPersonTimelineSpots> }) {
  const rows = useMemo(() => {
    const rowIndices = [...new Set(spots.map((s) => s.row))].sort((a, b) => a - b)
    return rowIndices.map((row) =>
      spots
        .filter((s) => s.row === row)
        .sort((a, b) => (THUMB_DOT_LANE_ORDER[a.lane] ?? 2) - (THUMB_DOT_LANE_ORDER[b.lane] ?? 2)),
    )
  }, [spots])

  return (
    <div className="ftPrintCard__thumbDots" aria-hidden>
      {rows.map((rowSpots, rowIdx) => (
        <div key={rowIdx} className="ftPrintCard__thumbDotsRow">
          {rowSpots.map((spot, i) => (
            <span
              key={`${spot.type}-${spot.lane}-${i}`}
              className="ftPrintCard__thumbDot"
              style={{
                background: spot.color ?? 'transparent',
                borderColor: spot.color ? '#1b0f0f' : 'transparent',
                width: THUMB_DOT_SIZE_PX,
                height: THUMB_DOT_SIZE_PX,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/* ---------- Card ---------- */

export default function KeepsakeCard({
  personId,
  mainTransform,
  thumbTransform,
  photoMainUrl,
  photoThumbUrl,
  width,
  backgroundUrl,
  className,
  exportMode = false,
  interactive = false,
  photoImporting = false,
  onMainTransformChange,
  onThumbTransformChange,
}: KeepsakeCardProps) {
  const state = useAppState()
  const person: Person | undefined = state.persons[personId]

  const mainT = mainTransform ?? person?.photoMain?.transform ?? DEFAULT_T
  const thumbT = thumbTransform ?? person?.photoThumb?.transform ?? DEFAULT_T

  const [mainHitEl, setMainHitEl] = useState<HTMLDivElement | null>(null)
  const [thumbHitEl, setThumbHitEl] = useState<HTMLDivElement | null>(null)

  const hasMainPhoto = !!person?.photoMain?.blobKey
  const hasThumbPhoto = !!person?.photoThumb?.blobKey

  const { onMainPointerDown, onThumbPointerDown } = usePhotoFramingInteraction({
    enabled: interactive && !!(onMainTransformChange && onThumbTransformChange) && !photoImporting,
    mainFrameEl: mainHitEl,
    thumbFrameEl: thumbHitEl,
    getMain: () => mainT,
    getThumb: () => thumbT,
    setMain: (t) => onMainTransformChange?.(t),
    setThumb: (t) => onThumbTransformChange?.(t),
    hasMainPhoto,
    hasThumbPhoto,
  })

  const generationAccent = useMemo(() => {
    const idx = computeGenerationByPersonId(state.persons, state.edges)[personId] ?? 0
    return getGenerationAccentColor(idx)
  }, [personId, state.persons, state.edges])

  const timelineBounds = useMemo(() => getTimelineYearBounds(state), [state.persons, state.edges])
  const startYear = timelineBounds?.startYear ?? null
  const endYear = timelineBounds?.endYear ?? null
  const timelineSpots = useMemo(
    () => (person ? getPersonTimelineSpots(person, startYear, endYear) : []),
    [person, startYear, endYear],
  )

  const displayName = useMemo(
    () => person?.fullName || person?.shortName || 'Name',
    [person?.fullName, person?.shortName],
  )

  const birth = useMemo(() => formatLifecycleDate(person?.dob?.dateISO), [person?.dob?.dateISO])
  const death = useMemo(() => formatLifecycleDate(person?.dod?.dateISO), [person?.dod?.dateISO])
  const birthBubble = useMemo(() => getEraColor(parseYear(person?.dob?.dateISO), startYear, endYear), [
    person?.dob?.dateISO,
    startYear,
    endYear,
  ])
  const deathBubble = useMemo(() => getEraColor(parseYear(person?.dod?.dateISO), startYear, endYear), [
    person?.dod?.dateISO,
    startYear,
    endYear,
  ])

  const marriageRows = useMemo(() => {
    const src: MarriageEntry[] = person?.marriages ?? []
    // Promote the flagged "primary" marriage to the first column; subsequent marriages flow into column 2.
    const ordered = [...src].sort((a, b) => {
      if (!!a.isCurrent && !b.isCurrent) return -1
      if (!!b.isCurrent && !a.isCurrent) return 1
      return 0
    })
    return ordered.map((m) => ({
      spouseId: m.spouseId,
      formatted: formatLifecycleDate(m.dateISO),
      bubble: getEraColor(parseYear(m.dateISO), startYear, endYear),
    }))
  }, [person?.marriages, startYear, endYear])

  if (!person) return null

  const firstMarriage = marriageRows[0]
  const extraMarriages = marriageRows.slice(1)
  const hasMultipleMarriages = extraMarriages.length > 0

  // When the export provides an explicit width, lock both the CSS width and (for cqw) the container's inline size.
  const rootStyle: Record<string, string | number> = {
    ['--ftCardAccent']: generationAccent,
  }
  if (typeof width === 'number' && width > 0) {
    rootStyle.width = `${width}px`
    rootStyle.maxWidth = `${width}px`
  }

  const classes = [
    'ftPrintCard',
    exportMode ? 'ftPrintCard--export' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      role="img"
      aria-label={`Print card for ${displayName}`}
      style={rootStyle}
    >
      {/* Background artwork */}
      <img
        src={backgroundUrl ?? '/cards/blankCard.png'}
        alt=""
        aria-hidden
        className="ftPrintCard__bg"
        draggable={false}
        crossOrigin="anonymous"
      />

      <div className="ftPrintCard__thumbArea">
        <div className="ftPrintCard__thumb" style={{ background: generationAccent }}>
          <div className="ftPrintCard__photoFrameInner">
            <PhotoInFrame transform={thumbT} url={photoThumbUrl} emptyLabel="Thumb" borderRadius="50%" />
            <PhotoSlotBusyOverlay show={photoImporting} />
            <div className="ftPrintCard__thumbBorder" aria-hidden />
            {interactive ? (
              <div
                ref={setThumbHitEl}
                className="ftPrintCard__photoHit"
                onPointerDown={onThumbPointerDown}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
        <ThumbTimelineDots spots={timelineSpots} />
      </div>

      <div className="ftPrintCard__ovalWrap">
        <div
          className="ftPrintCard__oval"
          style={{ borderColor: generationAccent, aspectRatio: PERSON_MAIN_OVAL_ASPECT_RATIO }}
        >
          <div className="ftPrintCard__photoFrameInner ftPrintCard__photoFrameInner--oval">
            <PhotoInFrame transform={mainT} url={photoMainUrl} emptyLabel="Portrait" borderRadius="50%" />
            <PhotoSlotBusyOverlay show={photoImporting} />
            {interactive ? (
              <div
                ref={setMainHitEl}
                className="ftPrintCard__photoHit"
                onPointerDown={onMainPointerDown}
                aria-hidden
              />
            ) : null}
          </div>
        </div>
      </div>

      <div className="ftPrintCard__nameBannerWrap">
        <div className="ftPrintCard__nameBanner" style={{ background: generationAccent }}>
          <span className="ftPrintCard__nameText">{displayName}</span>
        </div>
      </div>

      <div className={`ftPrintCard__lifecycle${hasMultipleMarriages ? ' ftPrintCard__lifecycle--multi' : ''}`}>
        <div className="ftPrintCard__lifecycleCol ftPrintCard__lifecycleCol--primary">
          <LifecycleRow
            icon={<IconStroller />}
            bubbleColor={birthBubble}
            year={birth.year}
            monthDay={birth.monthDay}
            ariaLabel={`Birth ${birth.year}${birth.monthDay ? ` ${birth.monthDay}` : ''}`}
          />
          <LifecycleRow
            icon={<IconRings />}
            bubbleColor={firstMarriage?.bubble ?? null}
            year={firstMarriage?.formatted.year ?? '—'}
            monthDay={firstMarriage?.formatted.monthDay ?? ''}
            ariaLabel={
              firstMarriage
                ? `Marriage ${firstMarriage.formatted.year}${
                    firstMarriage.formatted.monthDay ? ` ${firstMarriage.formatted.monthDay}` : ''
                  }`
                : 'Marriage (not set)'
            }
          />
          <LifecycleRow
            icon={<IconHeadstone />}
            bubbleColor={deathBubble}
            year={death.year}
            monthDay={death.monthDay}
            ariaLabel={`Death ${death.year}${death.monthDay ? ` ${death.monthDay}` : ''}`}
          />
        </div>

        {hasMultipleMarriages ? (
          <div className="ftPrintCard__lifecycleCol ftPrintCard__lifecycleCol--extra">
            {extraMarriages.map((m, i) => (
              <LifecycleRow
                key={`${m.spouseId}:${i}`}
                icon={<IconRings />}
                bubbleColor={m.bubble}
                year={m.formatted.year}
                monthDay={m.formatted.monthDay}
                ariaLabel={`Marriage ${m.formatted.year}${m.formatted.monthDay ? ` ${m.formatted.monthDay}` : ''}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
