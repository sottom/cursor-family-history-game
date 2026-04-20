import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'

import type { PhotoTransform } from '../state/appState'

export const PHOTO_FRAMING_SCALE_MIN = 0.15
export const PHOTO_FRAMING_SCALE_MAX = 40

export const DEFAULT_PHOTO_TRANSFORM: PhotoTransform = { xPercent: 0, yPercent: 0, scale: 1 }

type Variant = 'main' | 'thumb'

type DragState = {
  variant: Variant
  startClientX: number
  startClientY: number
  startXPercent: number
  startYPercent: number
  frameW: number
  frameH: number
}

/**
 * Drag + wheel-zoom for one or two photo frame elements (keepsake oval + thumb).
 * Matches the previous modal photo editor (same translate / zoom-to-cursor math).
 */
export function usePhotoFramingInteraction(opts: {
  enabled: boolean
  mainFrameEl: HTMLDivElement | null
  thumbFrameEl: HTMLDivElement | null
  getMain: () => PhotoTransform
  getThumb: () => PhotoTransform
  setMain: (t: PhotoTransform) => void
  setThumb: (t: PhotoTransform) => void
  hasMainPhoto: boolean
  hasThumbPhoto: boolean
}) {
  const {
    enabled,
    mainFrameEl,
    thumbFrameEl,
    getMain,
    getThumb,
    setMain,
    setThumb,
    hasMainPhoto,
    hasThumbPhoto,
  } = opts

  const dragRef = useRef<DragState | null>(null)
  const getMainRef = useRef(getMain)
  const getThumbRef = useRef(getThumb)
  const setMainRef = useRef(setMain)
  const setThumbRef = useRef(setThumb)
  getMainRef.current = getMain
  getThumbRef.current = getThumb
  setMainRef.current = setMain
  setThumbRef.current = setThumb

  useEffect(() => {
    if (!enabled) return

    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      const dx = e.clientX - d.startClientX
      const dy = e.clientY - d.startClientY
      const nextX = d.startXPercent + (dx / Math.max(1, d.frameW)) * 100
      const nextY = d.startYPercent + (dy / Math.max(1, d.frameH)) * 100
      const curr = d.variant === 'main' ? getMainRef.current() : getThumbRef.current()
      const next = { ...curr, xPercent: nextX, yPercent: nextY }
      if (d.variant === 'main') setMainRef.current(next)
      else setThumbRef.current(next)
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
  }, [enabled])

  useEffect(() => {
    if (!enabled || !mainFrameEl || !hasMainPhoto) return

    const onWheel = (e: WheelEvent) => {
      const curr = getMainRef.current()
      e.preventDefault()
      e.stopPropagation()
      const rect = mainFrameEl.getBoundingClientRect()
      const frameW = Math.max(1, rect.width)
      const frameH = Math.max(1, rect.height)
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.002)
      const nextScale = Math.max(PHOTO_FRAMING_SCALE_MIN, Math.min(PHOTO_FRAMING_SCALE_MAX, curr.scale * factor))
      if (nextScale === curr.scale) return
      const k = nextScale / curr.scale
      const tx0 = (curr.xPercent / 100) * frameW
      const ty0 = (curr.yPercent / 100) * frameH
      const tx1 = mx - k * (mx - tx0)
      const ty1 = my - k * (my - ty0)
      setMainRef.current({
        xPercent: (tx1 / frameW) * 100,
        yPercent: (ty1 / frameH) * 100,
        scale: nextScale,
      })
    }

    mainFrameEl.addEventListener('wheel', onWheel, { passive: false })
    return () => mainFrameEl.removeEventListener('wheel', onWheel)
  }, [enabled, mainFrameEl, hasMainPhoto])

  useEffect(() => {
    if (!enabled || !thumbFrameEl || !hasThumbPhoto) return

    const onWheel = (e: WheelEvent) => {
      const curr = getThumbRef.current()
      e.preventDefault()
      e.stopPropagation()
      const rect = thumbFrameEl.getBoundingClientRect()
      const frameW = Math.max(1, rect.width)
      const frameH = Math.max(1, rect.height)
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.002)
      const nextScale = Math.max(PHOTO_FRAMING_SCALE_MIN, Math.min(PHOTO_FRAMING_SCALE_MAX, curr.scale * factor))
      if (nextScale === curr.scale) return
      const k = nextScale / curr.scale
      const tx0 = (curr.xPercent / 100) * frameW
      const ty0 = (curr.yPercent / 100) * frameH
      const tx1 = mx - k * (mx - tx0)
      const ty1 = my - k * (my - ty0)
      setThumbRef.current({
        xPercent: (tx1 / frameW) * 100,
        yPercent: (ty1 / frameH) * 100,
        scale: nextScale,
      })
    }

    thumbFrameEl.addEventListener('wheel', onWheel, { passive: false })
    return () => thumbFrameEl.removeEventListener('wheel', onWheel)
  }, [enabled, thumbFrameEl, hasThumbPhoto])

  function onMainPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || !hasMainPhoto) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const curr = getMainRef.current()
    dragRef.current = {
      variant: 'main',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPercent: curr.xPercent,
      startYPercent: curr.yPercent,
      frameW: rect.width,
      frameH: rect.height,
    }
  }

  function onThumbPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!enabled || !hasThumbPhoto) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    const curr = getThumbRef.current()
    dragRef.current = {
      variant: 'thumb',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPercent: curr.xPercent,
      startYPercent: curr.yPercent,
      frameW: rect.width,
      frameH: rect.height,
    }
  }

  return { onMainPointerDown, onThumbPointerDown }
}
