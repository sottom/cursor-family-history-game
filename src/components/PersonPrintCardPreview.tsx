import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppState } from '../state/AppProvider'
import type { PhotoTransform } from '../state/appState'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import { formatDateForPrintBadge, pickMarriageForPrintPreview } from '../utils/printCardDates'

type Props = {
  personId: string
  /** Live framing from the photo editor (before modal save). Falls back to saved person data. */
  mainTransform?: PhotoTransform
  thumbTransform?: PhotoTransform
  /** Bumped when new image bytes are stored under the same blob keys (paste / file replace). */
  photoBlobRevision?: number
  /** Narrow column beside the form: tighter copy, no “jump to photo” (card stays in view). */
  layout?: 'default' | 'aside'
}

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
      <div
        style={{
          width: '100%',
          height: '100%',
          transform: `translate(${transform.xPercent}%, ${transform.yPercent}%)`,
        }}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transform: `scale(${transform.scale})`,
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
              opacity: 0.65,
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

function IconStroller() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <ellipse cx="12" cy="17" rx="7" ry="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 14V9a2 2 0 0 1 2-2h2l1.5 4H17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function IconRings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9.5" cy="12" r="5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14.5" cy="12" r="5" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

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

  const displayName = useMemo(
    () => person?.fullName || person?.shortName || 'Name',
    [person?.fullName, person?.shortName],
  )

  const birth = formatDateForPrintBadge(person?.dob?.dateISO)
  const marriageEntry = pickMarriageForPrintPreview(person?.marriages)
  const marriage = formatDateForPrintBadge(marriageEntry?.dateISO)

  if (!person) return null

  const aside = layout === 'aside'

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
              Preview how portrait, thumbnail, full name, birth date, and marriage date can read on your printed card.
              Photos and dates update live as you edit; framing also saves to the tree when you close this window.
            </p>
            <button
              type="button"
              className="ftBtn ftPrintCardSection__jump"
              onClick={() => document.getElementById('ft-person-form-photo-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Jump to photo editing
            </button>
          </>
        )}
      </div>

      <div className="ftPrintCardWrap">
        <div className="ftPrintCard" role="img" aria-label={`Print card preview for ${displayName}`}>
          <div className="ftPrintCard__plate">
            <div className="ftPrintCard__upper">
              <div className="ftPrintCard__thumb">
                <PhotoInFrame transform={thumbT} url={thumbUrl} emptyLabel="Thumb" borderRadius="50%" />
              </div>

              <div className="ftPrintCard__ovalWrap">
                <div className="ftPrintCard__oval">
                  <PhotoInFrame transform={mainT} url={mainUrl} emptyLabel="Portrait" borderRadius="50%" />
                </div>
              </div>

              <div className="ftPrintCard__nameBanner">
                <span className="ftPrintCard__nameText">{displayName}</span>
              </div>
            </div>

            <div className="ftPrintCard__lower">
              <div className="ftPrintCard__badges">
                <div className="ftPrintCard__badge ftPrintCard__badge--birth">
                  <span className="ftPrintCard__badgeIcon" aria-hidden>
                    <IconStroller />
                  </span>
                  <span className="ftPrintCard__badgeText">
                    <span className="ftPrintCard__badgeYear">{birth.year}</span>
                    {birth.subline ? <span className="ftPrintCard__badgeSub">{birth.subline}</span> : null}
                  </span>
                </div>
                <div className="ftPrintCard__badge ftPrintCard__badge--marriage">
                  <span className="ftPrintCard__badgeIcon" aria-hidden>
                    <IconRings />
                  </span>
                  <span className="ftPrintCard__badgeText">
                    <span className="ftPrintCard__badgeYear">{marriage.year}</span>
                    {marriage.subline ? <span className="ftPrintCard__badgeSub">{marriage.subline}</span> : null}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
