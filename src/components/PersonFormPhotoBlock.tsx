import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { Person } from '../state/appState'
import {
  PERSON_CARD_H,
  PERSON_CARD_W,
  PERSON_MAIN_OVAL_BOTTOM_INSET,
  type PhotoRef,
  type PhotoTransform,
} from '../state/appState'
import { getBlob, getOriginalBlobKey, ingestPersonPhotoBlob } from '../storage/indexedDb'
import { getPersonTimelineSpots, getTimelineStartYear } from '../utils/timeline'

type FramingVariant = 'photoMain' | 'photoThumb'

const DEFAULT_TRANSFORM: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

function transformsEqual(a: PhotoTransform, b: PhotoTransform): boolean {
  return a.xPercent === b.xPercent && a.yPercent === b.yPercent && a.scale === b.scale
}

/** Must stay pixel-aligned with `PersonNode` portrait chrome. */
const CANVAS_CARD_SHELL: CSSProperties = {
  position: 'relative',
  width: PERSON_CARD_W,
  height: PERSON_CARD_H,
  boxSizing: 'border-box',
}

/** Oval photo region — same box model as canvas (`left/right/top/bottom` + `borderRadius: 50%`). */
const CANVAS_OVAL_SHELL: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: PERSON_MAIN_OVAL_BOTTOM_INSET,
  borderRadius: '50%',
  overflow: 'hidden',
  border: '3px solid #1b0f0f',
  background: '#d5c2a7',
  boxShadow: 'var(--card-shadow)',
  touchAction: 'none',
}

const CANVAS_NAME_BAR: CSSProperties = {
  position: 'absolute',
  left: 10,
  right: 10,
  bottom: 28,
  height: 28,
  background: '#150b0b',
  color: '#fefefe',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  fontSize: 15,
  fontWeight: 800,
  lineHeight: 1,
  padding: '0 8px',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  border: '2px solid transparent',
  pointerEvents: 'none',
}

const CANVAS_STATUS_ROW: CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 2,
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const CANVAS_STATUS_DOT: CSSProperties = {
  width: 20,
  height: 20,
  boxSizing: 'border-box',
  borderRadius: '50%',
  border: '1px solid transparent',
  boxShadow: 'none',
  background: 'transparent',
}

type PersonFormPhotoBlockProps = {
  personId: string
  /** Fired whenever local portrait/thumbnail framing changes so print preview can mirror edits before save. */
  onDraftTransformsChange?: (main: PhotoTransform, thumb: PhotoTransform) => void
}

export default function PersonFormPhotoBlock({ personId, onDraftTransformsChange }: PersonFormPhotoBlockProps) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]

  const [framingVariant, setFramingVariant] = useState<FramingVariant>('photoMain')
  const [draftMain, setDraftMain] = useState<PhotoTransform>(DEFAULT_TRANSFORM)
  const [draftThumb, setDraftThumb] = useState<PhotoTransform>(DEFAULT_TRANSFORM)

  const draftMainRef = useRef<PhotoTransform>(DEFAULT_TRANSFORM)
  const draftThumbRef = useRef<PhotoTransform>(DEFAULT_TRANSFORM)
  const initialMainRef = useRef<PhotoTransform>(DEFAULT_TRANSFORM)
  const initialThumbRef = useRef<PhotoTransform>(DEFAULT_TRANSFORM)
  const personRef = useRef(person)
  personRef.current = person

  const draftRef = useRef(draftMain)
  useEffect(() => {
    draftRef.current = framingVariant === 'photoMain' ? draftMain : draftThumb
  }, [framingVariant, draftMain, draftThumb])

  const photoRef: PhotoRef | undefined =
    framingVariant === 'photoMain' ? person?.photoMain : person?.photoThumb

  /** Sync local drafts when saved photo blobs change (e.g. new ingest), not when other fields (name, etc.) update. */
  useEffect(() => {
    if (!person) return
    const m = person.photoMain?.transform ?? DEFAULT_TRANSFORM
    const t = person.photoThumb?.transform ?? DEFAULT_TRANSFORM
    setDraftMain(m)
    setDraftThumb(t)
    draftMainRef.current = m
    draftThumbRef.current = t
    initialMainRef.current = m
    initialThumbRef.current = t
  }, [personId, person?.photoMain?.blobKey, person?.photoThumb?.blobKey, person?.photoRevision ?? 0])

  useEffect(() => {
    onDraftTransformsChange?.(draftMain, draftThumb)
  }, [draftMain, draftThumb, onDraftTransformsChange])

  /** On modal close, persist pending transforms so the canvas updates once. */
  useEffect(() => {
    const id = personId
    return () => {
      const p = personRef.current
      if (!p) return
      const patch: Partial<Person> = {}
      const mk = p.photoMain?.blobKey
      const tk = p.photoThumb?.blobKey
      if (mk && !transformsEqual(draftMainRef.current, initialMainRef.current)) {
        patch.photoMain = { blobKey: mk, transform: draftMainRef.current }
      }
      if (tk && !transformsEqual(draftThumbRef.current, initialThumbRef.current)) {
        patch.photoThumb = { blobKey: tk, transform: draftThumbRef.current }
      }
      if (Object.keys(patch).length > 0) {
        dispatch({ type: 'UPDATE_PERSON', payload: { personId: id, patch } })
      }
    }
  }, [dispatch, personId])

  const framingVariantRef = useRef(framingVariant)
  framingVariantRef.current = framingVariant

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      if (!photoRef?.blobKey) {
        setBlobUrl(null)
        return
      }
      // Prefer full-resolution `original:*` for framing (ingest downsamples photoMain/photoThumb for storage).
      const blob =
        (await getBlob(getOriginalBlobKey(personId))) ?? (await getBlob(photoRef.blobKey))
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      if (!cancelled) setBlobUrl(objectUrl)
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [framingVariant, personId, photoRef?.blobKey, person?.photoRevision ?? 0])

  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    startClientX: number
    startClientY: number
    startXPercent: number
    startYPercent: number
    frameW: number
    frameH: number
  } | null>(null)

  /** Zoom only when the wheel is over the actual photo viewport (oval or circle), not the outer photo card. */
  useEffect(() => {
    const el = frameRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      const p = personRef.current
      const variant = framingVariantRef.current
      const hasPhoto =
        variant === 'photoMain' ? !!p?.photoMain?.blobKey : !!p?.photoThumb?.blobKey
      if (!hasPhoto) return
      e.preventDefault()
      e.stopPropagation()
      const curr = draftRef.current
      const factor = Math.exp(-e.deltaY * 0.002)
      const nextScale = Math.max(0.15, Math.min(8, curr.scale * factor))
      const next = { ...curr, scale: nextScale }
      if (variant === 'photoMain') {
        setDraftMain(next)
        draftMainRef.current = next
      } else {
        setDraftThumb(next)
        draftThumbRef.current = next
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [framingVariant])

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      e.preventDefault()
      e.stopPropagation()
      const d = dragRef.current
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY
      const nextX = d.startXPercent + (dx / Math.max(1, d.frameW)) * 100
      const nextY = d.startYPercent + (dy / Math.max(1, d.frameH)) * 100
      const next = { ...draftRef.current, xPercent: nextX, yPercent: nextY }
      const variant = framingVariantRef.current
      if (variant === 'photoMain') {
        setDraftMain(next)
        draftMainRef.current = next
      } else {
        setDraftThumb(next)
        draftThumbRef.current = next
      }
    }
    const onPointerUp = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove as (ev: Event) => void)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file || !person) continue
        e.preventDefault()
        void (async () => {
          const mainTransform = draftMainRef.current
          const thumbTransform = draftThumbRef.current
          const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob: file, transform: mainTransform })
          const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob: file, transform: thumbTransform })
          dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
        })()
        break
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [dispatch, person, personId])

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file || !person) return
      const mainTransform = draftMainRef.current
      const thumbTransform = draftThumbRef.current
      const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob: file, transform: mainTransform })
      const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob: file, transform: thumbTransform })
      dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
    },
    [dispatch, person, personId],
  )

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const displayName = useMemo(
    () => person?.shortName || person?.fullName || 'New Person',
    [person?.fullName, person?.shortName],
  )

  const startYear = useMemo(() => getTimelineStartYear(state), [state.persons])
  const timelineSpots = useMemo(() => (person ? getPersonTimelineSpots(person, startYear) : []), [person, startYear])

  if (!person) return null

  const frameLabel =
    framingVariant === 'photoMain'
      ? 'Matches canvas card (220×340)'
      : 'Matches print card thumbnail (circular crop)'

  return (
    <div className="ftPersonFormPhoto">
      <div className="ftPersonFormPhoto__header">
        <span className="ftPersonFormPhoto__title">Photo</span>
        <span className="ftPersonFormPhoto__hint">Paste an image anywhere in this window</span>
      </div>

      <div className="ftPersonFormPhoto__seg" role="tablist" aria-label="Which crop to adjust">
        <button
          type="button"
          role="tab"
          className={`ftPersonFormPhoto__segBtn ${framingVariant === 'photoMain' ? 'ftPersonFormPhoto__segBtn--active' : ''}`}
          aria-selected={framingVariant === 'photoMain'}
          onClick={() => setFramingVariant('photoMain')}
        >
          Portrait View
        </button>
        <button
          type="button"
          role="tab"
          className={`ftPersonFormPhoto__segBtn ${framingVariant === 'photoThumb' ? 'ftPersonFormPhoto__segBtn--active' : ''}`}
          aria-selected={framingVariant === 'photoThumb'}
          onClick={() => setFramingVariant('photoThumb')}
        >
          Thumbnail View
        </button>
      </div>
      <p className="ftPersonFormPhoto__frameNote">{frameLabel}</p>

      <div className="ftPersonFormPhoto__frameWrap">
        {framingVariant === 'photoMain' ? (
          <div className="ftPersonFormPhoto__frame ftPersonFormPhoto__frame--node" style={CANVAS_CARD_SHELL}>
            <div
              ref={frameRef}
              style={CANVAS_OVAL_SHELL}
              onPointerDown={(e) => {
                if (!photoRef) return
                e.preventDefault()
                const rect = frameRef.current?.getBoundingClientRect()
                if (!rect) return
                dragRef.current = {
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startXPercent: draftRef.current.xPercent,
                  startYPercent: draftRef.current.yPercent,
                  frameW: rect.width,
                  frameH: rect.height,
                }
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  transform: `translate(${draftMain.xPercent}%, ${draftMain.yPercent}%)`,
                }}
              >
                {blobUrl ? (
                  <img
                    src={blobUrl}
                    alt=""
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      display: 'block',
                      transform: `scale(${draftMain.scale})`,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#1b0f0f',
                      fontSize: 12,
                      fontWeight: 700,
                      letterSpacing: 0.2,
                    }}
                  >
                    NO PHOTO
                  </div>
                )}
              </div>
            </div>
            <div style={CANVAS_NAME_BAR} aria-hidden>
              {displayName}
            </div>
            <div style={CANVAS_STATUS_ROW} aria-hidden>
              {timelineSpots.map((spot, idx) => (
                <div
                  key={`preview-dot-${idx}`}
                  style={{
                    ...CANVAS_STATUS_DOT,
                    border: spot.color ? '1px solid #1b0f0f' : '1px solid transparent',
                    background: spot.color ? spot.color : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="ftPersonFormPhoto__frame ftPersonFormPhoto__frame--thumbCard">
            <div
              ref={frameRef}
              className="ftPersonFormPhoto__frameViewport ftPersonFormPhoto__frameViewport--thumbCard"
              style={{
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                if (!photoRef) return
                e.preventDefault()
                const rect = frameRef.current?.getBoundingClientRect()
                if (!rect) return
                dragRef.current = {
                  startClientX: e.clientX,
                  startClientY: e.clientY,
                  startXPercent: draftRef.current.xPercent,
                  startYPercent: draftRef.current.yPercent,
                  frameW: rect.width,
                  frameH: rect.height,
                }
              }}
            >
              <div
                className="ftPersonFormPhoto__imgShift"
                style={{
                  transform: `translate(${draftThumb.xPercent}%, ${draftThumb.yPercent}%)`,
                }}
              >
                {blobUrl ? (
                  <img
                    src={blobUrl}
                    alt=""
                    draggable={false}
                    className="ftPersonFormPhoto__img"
                    style={{ transform: `scale(${draftThumb.scale})` }}
                  />
                ) : (
                  <div className="ftPersonFormPhoto__empty">No photo yet</div>
                )}
              </div>
              <div className="ftPersonFormPhoto__frameShine ftPersonFormPhoto__frameShine--thumbCard" aria-hidden />
            </div>
          </div>
        )}
      </div>

      <p className="ftPersonFormPhoto__controlsHint">Drag to reposition · Scroll to zoom</p>

      <div className="ftPersonFormPhoto__actions">
        <button className="ftBtn" type="button" onClick={() => fileInputRef.current?.click()}>
          Choose photo…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="ftPersonFormPhoto__file"
          onChange={(e) => void onFilesSelected(e.target.files)}
        />
        <button
          className="ftBtn"
          type="button"
          disabled={!photoRef?.blobKey}
          onClick={() => {
            if (!photoRef) return
            const next = DEFAULT_TRANSFORM
            if (framingVariant === 'photoMain') {
              setDraftMain(next)
              draftMainRef.current = next
            } else {
              setDraftThumb(next)
              draftThumbRef.current = next
            }
          }}
        >
          Reset framing
        </button>
      </div>
    </div>
  )
}
