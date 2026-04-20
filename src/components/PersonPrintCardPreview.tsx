import { useEffect, useRef, useState, type MutableRefObject } from 'react'

import { useAppState } from '../state/AppProvider'
import { type PhotoTransform } from '../state/appState'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import KeepsakeCard from './KeepsakeCard'
import PersonPhotoImportControls from './PersonPhotoImportControls'

type Props = {
  personId: string
  /** Live framing from the photo editor (before modal save). Falls back to saved person data. */
  mainTransform?: PhotoTransform
  thumbTransform?: PhotoTransform
  /** Bumped when new image bytes are stored under the same blob keys (paste / file replace). */
  photoBlobRevision?: number
  /** Narrow column beside the form: tighter copy, no "jump to photo" (card stays in view). */
  layout?: 'default' | 'aside'
  /** Edit modal: drag / scroll-zoom on the keepsake card photos. */
  interactive?: boolean
  onMainTransformChange?: (t: PhotoTransform) => void
  onThumbTransformChange?: (t: PhotoTransform) => void
  onResetMainFraming?: () => void
  onResetThumbFraming?: () => void
  hasPhotoMain?: boolean
  hasPhotoThumb?: boolean
  /** When set with aside layout, photo import sits in the toolbar above the preview. */
  draftMainRef?: MutableRefObject<PhotoTransform>
  draftThumbRef?: MutableRefObject<PhotoTransform>
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
  interactive = false,
  onMainTransformChange,
  onThumbTransformChange,
  onResetMainFraming,
  onResetThumbFraming,
  hasPhotoMain = false,
  hasPhotoThumb = false,
  draftMainRef,
  draftThumbRef,
}: Props) {
  const state = useAppState()
  const person = state.persons[personId]
  const [photoImporting, setPhotoImporting] = useState(false)

  const mainKey = person?.photoMain?.blobKey
  const thumbKey = person?.photoThumb?.blobKey
  const mainUrl = useMainPortraitUrl(mainKey, photoBlobRevision)
  const thumbUrl = useThumbPortraitUrl(personId, thumbKey, photoBlobRevision)

  if (!person) return null

  const aside = layout === 'aside'
  const showResets = interactive && (onResetMainFraming || onResetThumbFraming)
  const photoToolbar =
    aside && draftMainRef && draftThumbRef
      ? (
          <div className="ftPrintCardSection__toolsWrap">
            <div className="ftPrintCardSection__toolsRow ftPrintCardSection__toolsRow--primary" role="group" aria-label="Import photo">
              <PersonPhotoImportControls
                variant="toolbar"
                personId={personId}
                draftMainRef={draftMainRef}
                draftThumbRef={draftThumbRef}
                onImportBusyChange={setPhotoImporting}
              />
            </div>
            {/* {showResets ? (
              <div className="ftPrintCardSection__toolsRow ftPrintCardSection__toolsRow--reset" role="group" aria-label="Reset framing">
                  <button
                    type="button"
                    className="ftBtn ftPrintCardSection__resetBtn"
                    disabled={!hasPhotoMain}
                    onClick={() => onResetMainFraming?.()}
                  >
                    Reset oval
                  </button>
                  <button
                    type="button"
                    className="ftBtn ftPrintCardSection__resetBtn"
                    disabled={!hasPhotoThumb}
                    onClick={() => onResetThumbFraming?.()}
                  >
                    Reset thumbnail
                  </button>
              </div>
            ) : null} */}
          </div>
        )
      : null

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
          <>
            <p className="ftPrintCardSection__blurb ftPrintCardSection__blurb--aside">
              Drag to reposition, scroll to zoom. Oval updates tree.
            </p>
            {photoToolbar}
          </>
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
                document.getElementById('ft-person-keepsake-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              Jump to keepsake card
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
          interactive={interactive}
          photoImporting={photoImporting}
          onMainTransformChange={onMainTransformChange}
          onThumbTransformChange={onThumbTransformChange}
        />
      </div>
            <p className="ftPrintCardSection__pasteHint">You can also paste an image anywhere in this window</p>
    </section>
  )
}
