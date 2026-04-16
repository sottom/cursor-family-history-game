import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { PhotoTransform, PhotoRef } from '../state/appState'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import { PHOTO_MAIN_FRAME, PHOTO_THUMB_FRAME } from '../config/cardLayout'

export default function PhotoAdjustOverlay() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const adjust = state.ui.photoAdjust
  const overlayRootRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    startClientX: number
    startClientY: number
    startXPercent: number
    startYPercent: number
    frameW: number
    frameH: number
  } | null>(null)

  const person = adjust ? state.persons[adjust.personId] : undefined
  const adjustPersonId = adjust?.personId
  const adjustVariant = adjust?.variant
  const photoRef: PhotoRef | undefined =
    adjust?.variant === 'photoMain' ? person?.photoMain : adjust?.variant === 'photoThumb' ? person?.photoThumb : undefined

  const [draft, setDraft] = useState<PhotoTransform>(() => photoRef?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 })
  const draftRef = useRef(draft)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    const next = photoRef?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
    setDraft(next)
    draftRef.current = next
  }, [photoRef])

  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      if (!photoRef?.blobKey) {
        setBlobUrl(null)
        return
      }
      const blob =
        adjust?.variant === 'photoThumb' && adjust?.personId
          ? ((await getBlob(getOriginalBlobKey(adjust.personId))) ?? (await getBlob(photoRef.blobKey)))
          : await getBlob(photoRef.blobKey)
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      if (!cancelled) setBlobUrl(objectUrl)
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [adjust?.personId, adjust?.variant, photoRef?.blobKey])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch({ type: 'CLOSE_PHOTO_ADJUST' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch])

  const applyDraft = (next: PhotoTransform) => {
    if (!adjust) return
    setDraft(next)
    draftRef.current = next

    const blobKey = photoRef?.blobKey
    const patch =
      adjust.variant === 'photoMain'
        ? { photoMain: blobKey ? { blobKey, transform: next } : undefined }
        : { photoThumb: blobKey ? { blobKey, transform: next } : undefined }

    dispatch({ type: 'UPDATE_PERSON', payload: { personId: adjust.personId, patch } as any })
  }

  useEffect(() => {
    if (!adjust) return
    const overlayEl = overlayRootRef.current
    if (!overlayEl) return

    const onWheel = (e: WheelEvent) => {
      // Must be native non-passive to prevent ReactFlow's wheel-zoom.
      e.preventDefault()
      e.stopPropagation()

      if (!photoRef) return
      const curr = draftRef.current
      const factor = Math.exp(-e.deltaY * 0.002)
      const nextScale = Math.max(0.15, Math.min(8, curr.scale * factor))
      applyDraft({ ...curr, scale: nextScale })
    }

    overlayEl.addEventListener('wheel', onWheel, { passive: false })
    return () => overlayEl.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, adjustPersonId, adjustVariant, photoRef?.blobKey])

  useEffect(() => {
    if (!adjust) return
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      e.preventDefault()
      e.stopPropagation()

      const d = dragRef.current
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY

      const nextX = d.startXPercent + (dx / Math.max(1, d.frameW)) * 100
      const nextY = d.startYPercent + (dy / Math.max(1, d.frameH)) * 100

      applyDraft({ ...draftRef.current, xPercent: nextX, yPercent: nextY })
    }

    const onPointerUp = () => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove as any)
      window.removeEventListener('pointerup', onPointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjustPersonId, adjustVariant, photoRef?.blobKey])

  if (!adjust) return null

  return createPortal(
    <div
      ref={overlayRootRef}
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dispatch({ type: 'CLOSE_PHOTO_ADJUST' })
      }}
    >
      <div className="ftModal" style={{ width: 'min(1100px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">
            Adjust Photo: {adjust.variant === 'photoMain' ? 'Main' : 'Thumbnail'}
          </div>
          <button className="ftIconBtn" onClick={() => dispatch({ type: 'CLOSE_PHOTO_ADJUST' })} aria-label="Close">
            ×
          </button>
        </div>

        <div className="ftModal__body" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <div
              ref={frameRef}
              style={{
                width: '100%',
                maxWidth: 720,
                  aspectRatio:
                    adjust.variant === 'photoMain'
                      ? `${PHOTO_MAIN_FRAME.w}/${PHOTO_MAIN_FRAME.h}`
                      : `${PHOTO_THUMB_FRAME.w}/${PHOTO_THUMB_FRAME.h}`,
                margin: '0 auto',
                borderRadius: 18,
                overflow: 'hidden',
                border: '1px solid var(--border)',
                background: 'rgba(0,0,0,0.03)',
                touchAction: 'none',
                userSelect: 'none',
                position: 'relative',
              }}
              onPointerDown={(e) => {
                if (!photoRef) return
                e.preventDefault()
                e.stopPropagation()
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
              {/* Transform wrapper */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  transform: `translate(${draft.xPercent}%, ${draft.yPercent}%)`,
                  willChange: 'transform',
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
                      objectFit: 'cover',
                      transform: `scale(${draft.scale})`,
                    }}
                  />
                ) : null}
              </div>

              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  boxShadow: 'inset 0 0 0 1px rgba(170,59,255,0.12)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
            <div style={{ fontWeight: 800, color: 'var(--text-h)' }}>Controls</div>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              Drag to reposition. Use mouse wheel to zoom. The preview updates live on the canvas and persists locally.
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="ftBtn"
                style={{ padding: '8px 10px' }}
                onClick={() => dispatch({ type: 'OPEN_PHOTO_ADJUST', payload: { personId: adjust.personId, variant: 'photoMain' } })}
                type="button"
              >
                Edit Main
              </button>
              <button
                className="ftBtn"
                style={{ padding: '8px 10px' }}
                onClick={() =>
                  dispatch({ type: 'OPEN_PHOTO_ADJUST', payload: { personId: adjust.personId, variant: 'photoThumb' } })
                }
                type="button"
              >
                Edit Thumb
              </button>
            </div>

            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'rgba(0,0,0,0.02)' }}>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                xPercent: <span style={{ color: 'var(--text-h)', fontWeight: 700 }}>{draft.xPercent.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                yPercent: <span style={{ color: 'var(--text-h)', fontWeight: 700 }}>{draft.yPercent.toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)' }}>
                scale: <span style={{ color: 'var(--text-h)', fontWeight: 700 }}>{draft.scale.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="ftBtn"
                style={{ flex: 1, padding: '10px 12px' }}
                onClick={() => {
                  if (!photoRef) return
                  applyDraft({ xPercent: 0, yPercent: 0, scale: 1 })
                }}
                type="button"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

