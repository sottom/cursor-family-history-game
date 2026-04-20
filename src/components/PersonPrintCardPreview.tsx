import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useAppState } from '../state/AppProvider'
import { PERSON_MAIN_OVAL_ASPECT_RATIO, type MarriageEntry, type PhotoTransform } from '../state/appState'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import { personPhotoFrameWrapperStyle } from '../utils/photoFrameTransform'
import { computeGenerationByPersonId, getGenerationAccentColor } from '../utils/generation'
import { getEraColor, getPersonTimelineSpots, getTimelineStartYear, parseYear } from '../utils/timeline'

type Props = {
  personId: string
  /** Live framing from the photo editor (before modal save). Falls back to saved person data. */
  mainTransform?: PhotoTransform
  thumbTransform?: PhotoTransform
  /** Bumped when new image bytes are stored under the same blob keys (paste / file replace). */
  photoBlobRevision?: number
  /** Narrow column beside the form: tighter copy, no "jump to photo" (card stays in view). */
  layout?: 'default' | 'aside'
}

/* ---------- Icons (monochrome; color comes from era-colored bubble behind them) ---------- */

function IconStroller() {
  return (
    <svg width="60%" height="60%" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="8" cy="19.5" rx="1.7" ry="1.7" fill="currentColor" />
      <ellipse cx="16" cy="19.5" rx="1.7" ry="1.7" fill="currentColor" />
      <path
        d="M4 11.5 a7.5 7.5 0 0 1 13 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
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
      <path
        d="M7 21 V12 a5 5 0 0 1 10 0 V21 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M12 14 V19 M10 16 H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 21 H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/* ---------- Photo-in-oval / -circle renderer (live zoom/pan via PhotoTransform) ---------- */

function PhotoInFrame({
  transform,
  url,
  emptyLabel,
  borderRadius,
}: {
  transform: PhotoTransform
  url: string | null
  emptyLabel: string
  borderRadius: string
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        borderRadius,
        overflow: 'hidden',
        background: '#d5c2a7',
      }}
    >
      <div style={personPhotoFrameWrapperStyle(transform)}>
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
            }}
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

/* ---------- Blob-backed object URL hooks (revoke on change) ---------- */

function useMainPortraitUrl(blobKey: string | undefined, blobRevision: number) {
  const [url, setUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      if (!blobKey) {
        setUrl(null)
        return
      }
      const blob = await getBlob(blobKey)
      if (!blob || cancelled) return
      const u = URL.createObjectURL(blob)
      urlRef.current = u
      setUrl(u)
    })()
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [blobKey, blobRevision])
  return url
}

function useThumbPortraitUrl(personId: string, thumbBlobKey: string | undefined, blobRevision: number) {
  const [url, setUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
      const blob =
        (await getBlob(getOriginalBlobKey(personId))) ?? (thumbBlobKey ? await getBlob(thumbBlobKey) : null)
      if (!blob || cancelled) {
        setUrl(null)
        return
      }
      const u = URL.createObjectURL(blob)
      urlRef.current = u
      setUrl(u)
    })()
    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [personId, thumbBlobKey, blobRevision])
  return url
}

/* ---------- Date formatting: "1976 Aug 15" (subline is "Aug 15") ---------- */

function formatLifecycleDate(dateISO?: string): { year: string; monthDay: string } {
  const s = dateISO?.trim() ?? ''
  if (!s) return { year: '—', monthDay: '' }
  if (/^\d{4}$/.test(s)) return { year: s, monthDay: '' }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    const year = String(d.getUTCFullYear())
    // Treat YYYY-MM-DD as a date-only value (no day drift across timezones).
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

/* ---------- Lifecycle row (colored bubble + serif year + short month/day) ---------- */

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

/* ---------- Mini timeline dots under thumbnail (mirrors PersonNode tree dots) ---------- */

const THUMB_DOT_LANE_LEFT_PCT: Record<string, number> = {
  left: 18,
  'center-left': 37,
  center: 50,
  'center-right': 63,
  right: 82,
}
const THUMB_DOT_SIZE_PX = 16
const THUMB_DOT_ROW_GAP_PX = 1

function ThumbTimelineDots({
  spots,
}: {
  spots: ReturnType<typeof getPersonTimelineSpots>
}) {
  const rows = spots.reduce((m, s) => Math.max(m, s.row), 0) + 1
  const height = rows * THUMB_DOT_SIZE_PX + (rows - 1) * THUMB_DOT_ROW_GAP_PX
  return (
    <div className="ftPrintCard__thumbDots" style={{ height }} aria-hidden>
      {spots.map((spot, i) => (
        <span
          key={i}
          className="ftPrintCard__thumbDot"
          style={{
            left: `${THUMB_DOT_LANE_LEFT_PCT[spot.lane] ?? 50}%`,
            top: spot.row * (THUMB_DOT_SIZE_PX + THUMB_DOT_ROW_GAP_PX),
            background: spot.color ?? 'transparent',
            borderColor: spot.color ? '#1b0f0f' : 'transparent',
            width: THUMB_DOT_SIZE_PX,
            height: THUMB_DOT_SIZE_PX,
          }}
        />
      ))}
    </div>
  )
}

/* ---------- Main component ---------- */

const DEFAULT_T: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

export default function PersonPrintCardPreview({
  personId,
  mainTransform,
  thumbTransform,
  photoBlobRevision = 0,
  layout = 'default',
}: Props) {
  const state = useAppState()
  const person = state.persons[personId]

  const mainT: PhotoTransform = mainTransform ?? person?.photoMain?.transform ?? DEFAULT_T
  const thumbT: PhotoTransform = thumbTransform ?? person?.photoThumb?.transform ?? DEFAULT_T

  const mainKey = person?.photoMain?.blobKey
  const thumbKey = person?.photoThumb?.blobKey

  const mainUrl = useMainPortraitUrl(mainKey, photoBlobRevision)
  const thumbUrl = useThumbPortraitUrl(personId, thumbKey, photoBlobRevision)

  // Generation accent (brown ribbon, oval border, thumb border) — matches the tree node.
  const generationAccent = useMemo(() => {
    const idx = computeGenerationByPersonId(state.persons, state.edges)[personId] ?? 0
    return getGenerationAccentColor(idx)
  }, [personId, state.persons, state.edges])

  // Era-colored bubbles for lifecycle icons + thumb timeline dots — match the tree's date-based palette.
  const startYear = useMemo(() => getTimelineStartYear(state), [state])
  const timelineSpots = useMemo(
    () => (person ? getPersonTimelineSpots(person, startYear) : []),
    [person, startYear],
  )

  const displayName = useMemo(
    () => person?.fullName || person?.shortName || 'Name',
    [person?.fullName, person?.shortName],
  )

  const birth = useMemo(() => formatLifecycleDate(person?.dob?.dateISO), [person?.dob?.dateISO])
  const death = useMemo(() => formatLifecycleDate(person?.dod?.dateISO), [person?.dod?.dateISO])
  const birthBubble = useMemo(() => getEraColor(parseYear(person?.dob?.dateISO), startYear), [
    person?.dob?.dateISO,
    startYear,
  ])
  const deathBubble = useMemo(() => getEraColor(parseYear(person?.dod?.dateISO), startYear), [
    person?.dod?.dateISO,
    startYear,
  ])

  const marriageRows = useMemo(() => {
    const src: MarriageEntry[] = person?.marriages ?? []
    // Promote the flagged "primary" marriage to the first column (index 0). Subsequent
    // marriages flow into the second column, as the spec requires.
    const ordered = [...src].sort((a, b) => {
      if (!!a.isCurrent && !b.isCurrent) return -1
      if (!!b.isCurrent && !a.isCurrent) return 1
      return 0
    })
    return ordered.map((m) => ({
      spouseId: m.spouseId,
      formatted: formatLifecycleDate(m.dateISO),
      bubble: getEraColor(parseYear(m.dateISO), startYear),
    }))
  }, [person?.marriages, startYear])

  if (!person) return null

  const aside = layout === 'aside'

  const firstMarriage = marriageRows[0]
  const extraMarriages = marriageRows.slice(1)
  const hasMultipleMarriages = extraMarriages.length > 0

  return (
    <section
      className={`ftPrintCardSection${aside ? ' ftPrintCardSection--aside' : ''}`}
      aria-labelledby="ft-print-card-heading"
    >
      <div className="ftPrintCardSection__intro">
        <h3 id="ft-print-card-heading" className="ftPrintCardSection__title">
          Keepsake print card
        </h3>
        {aside ? (
          <p className="ftPrintCardSection__blurb ftPrintCardSection__blurb--aside">
            Live preview of portrait, thumbnail, name, and dates. Framing saves when you close this window.
          </p>
        ) : (
          <>
            <p className="ftPrintCardSection__blurb">
              Preview how portrait, thumbnail, full name, birth date, and marriage date can read on your printed
              card. Photos and dates update live as you edit; framing also saves to the tree when you close this
              window.
            </p>
            <button
              type="button"
              className="ftBtn ftPrintCardSection__jump"
              onClick={() =>
                document
                  .getElementById('ft-person-form-photo-anchor')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Jump to photo editing
            </button>
          </>
        )}
      </div>

      <div className="ftPrintCardWrap">
        <div
          className="ftPrintCard"
          role="img"
          aria-label={`Print card preview for ${displayName}`}
          style={{ ['--ftCardAccent' as string]: generationAccent }}
        >
          {/* Background artwork from baseTemplate */}
          <img
            src="/cards/blankCard.png"
            alt=""
            aria-hidden
            className="ftPrintCard__bg"
            draggable={false}
          />

          {/* Top-left thumbnail + mini timeline dots (both use dynamic colors) */}
          <div className="ftPrintCard__thumbArea">
            <div
              className="ftPrintCard__thumb"
              style={{ borderColor: generationAccent, background: generationAccent }}
            >
              <PhotoInFrame transform={thumbT} url={thumbUrl} emptyLabel="Thumb" borderRadius="50%" />
            </div>
            <ThumbTimelineDots spots={timelineSpots} />
          </div>

          {/* Central oval portrait — same border color/thickness as tree node */}
          <div className="ftPrintCard__ovalWrap">
            <div
              className="ftPrintCard__oval"
              style={{
                borderColor: generationAccent,
                aspectRatio: PERSON_MAIN_OVAL_ASPECT_RATIO,
              }}
            >
              <PhotoInFrame transform={mainT} url={mainUrl} emptyLabel="Portrait" borderRadius="50%" />
            </div>
          </div>

          {/* Brown ribbon name banner */}
          <div className="ftPrintCard__nameBanner" style={{ background: generationAccent }}>
            <span className="ftPrintCard__nameText">{displayName}</span>
          </div>

          {/* Lifecycle rows — single column for 1 marriage, two columns for 2+ */}
          <div
            className={`ftPrintCard__lifecycle${
              hasMultipleMarriages ? ' ftPrintCard__lifecycle--multi' : ''
            }`}
          >
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
                    ariaLabel={`Marriage ${m.formatted.year}${
                      m.formatted.monthDay ? ` ${m.formatted.monthDay}` : ''
                    }`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
