import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { Person, PhotoTransform } from '../state/appState'
import { deletePersonPhotoBlobs, ingestPersonPhotoBlob } from '../storage/indexedDb'

const DEFAULT_PHOTO_T: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

type Props = {
  personId: string
  draftMainRef: MutableRefObject<PhotoTransform>
  draftThumbRef: MutableRefObject<PhotoTransform>
  /** `panel` = bordered block (legacy). `toolbar` = compact row for above keepsake preview. */
  variant?: 'panel' | 'toolbar'
  /** Fires while HEIC decode / JPEG ingest runs (paste or file pick). */
  onImportBusyChange?: (busy: boolean) => void
}

export default function PersonPhotoImportControls({
  personId,
  draftMainRef,
  draftThumbRef,
  variant = 'panel',
  onImportBusyChange,
}: Props) {
  const dispatch = useAppDispatch()
  const person = useAppState().persons[personId]
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importBusyDepthRef = useRef(0)

  const personRef = useRef<Person | undefined>(person)
  personRef.current = person

  const beginImport = useCallback(() => {
    importBusyDepthRef.current += 1
    if (importBusyDepthRef.current === 1) onImportBusyChange?.(true)
  }, [onImportBusyChange])

  const endImport = useCallback(() => {
    importBusyDepthRef.current = Math.max(0, importBusyDepthRef.current - 1)
    if (importBusyDepthRef.current === 0) onImportBusyChange?.(false)
  }, [onImportBusyChange])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        const p = personRef.current
        if (!file || !p) continue
        e.preventDefault()
        void (async () => {
          beginImport()
          try {
            const mainTransform = draftMainRef.current
            const thumbTransform = draftThumbRef.current
            const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob: file, transform: mainTransform })
            const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob: file, transform: thumbTransform })
            dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
          } catch (err) {
            console.error('Paste photo import failed', err)
          } finally {
            endImport()
          }
        })()
        break
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [beginImport, dispatch, endImport, personId, draftMainRef, draftThumbRef])

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      const p = personRef.current
      if (!file || !p) return
      beginImport()
      try {
        const mainTransform = draftMainRef.current
        const thumbTransform = draftThumbRef.current
        const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob: file, transform: mainTransform })
        const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob: file, transform: thumbTransform })
        dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
      } catch (err) {
        console.error('File photo import failed', err)
      } finally {
        endImport()
      }
    },
    [beginImport, dispatch, endImport, personId, draftMainRef, draftThumbRef],
  )

  const onClearPhoto = useCallback(async () => {
    const p = personRef.current
    if (!p?.photoMain?.blobKey) return
    await deletePersonPhotoBlobs(personId)
    draftMainRef.current = DEFAULT_PHOTO_T
    draftThumbRef.current = DEFAULT_PHOTO_T
    dispatch({
      type: 'UPDATE_PERSON',
      payload: { personId, patch: { photoMain: undefined, photoThumb: undefined } },
    })
  }, [dispatch, personId, draftMainRef, draftThumbRef])

  if (!person) return null

  const hasPhoto = !!person.photoMain?.blobKey
  const toolbar = variant === 'toolbar'
  const primaryBtn = toolbar ? 'ftBtn ftPrintCardSection__photoBtn' : 'ftBtn'
  const clearBtn = toolbar ? 'ftBtn ftPrintCardSection__photoBtn ftPersonPhotoImport__clear' : 'ftBtn ftPersonPhotoImport__clear'

  const actions = (
    <div className="ftPersonPhotoImport__actions">
      <button className={primaryBtn} type="button" onClick={() => fileInputRef.current?.click()}>
        Choose photo…
      </button>
      <button className={clearBtn} type="button" disabled={!hasPhoto} onClick={() => void onClearPhoto()}>
        Clear photo
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="ftPersonPhotoImport__file"
        onChange={(e) => void onFilesSelected(e.target.files)}
      />
    </div>
  )

  if (toolbar) {
    return (
      <>
        <button className={primaryBtn} type="button" onClick={() => fileInputRef.current?.click()}>
          Choose photo…
        </button>
        <button className={clearBtn} type="button" disabled={!hasPhoto} onClick={() => void onClearPhoto()}>
          Clear photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="ftPersonPhotoImport__file"
          onChange={(e) => void onFilesSelected(e.target.files)}
        />
      </>
    )
  }

  return (
    <div className="ftPersonPhotoImport">
      <div className="ftPersonPhotoImport__row">
        <span className="ftPersonPhotoImport__title">Photo</span>
        <span className="ftPersonPhotoImport__hint">Paste an image anywhere in this window</span>
      </div>
      {actions}
    </div>
  )
}
