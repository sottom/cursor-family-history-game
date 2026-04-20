import { useEffect, useRef, useState } from 'react'

import { useAppState } from '../state/AppProvider'
import { type PhotoTransform } from '../state/appState'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import KeepsakeCard from './KeepsakeCard'

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

export default function PersonPrintCardPreview({
  personId,
  mainTransform,
  thumbTransform,
  photoBlobRevision = 0,
  layout = 'default',
}: Props) {
  const state = useAppState()
  const person = state.persons[personId]

  const mainKey = person?.photoMain?.blobKey
  const thumbKey = person?.photoThumb?.blobKey
  const mainUrl = useMainPortraitUrl(mainKey, photoBlobRevision)
  const thumbUrl = useThumbPortraitUrl(personId, thumbKey, photoBlobRevision)

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
        <KeepsakeCard
          personId={personId}
          mainTransform={mainTransform}
          thumbTransform={thumbTransform}
          photoMainUrl={mainUrl}
          photoThumbUrl={thumbUrl}
        />
      </div>
    </section>
  )
}
