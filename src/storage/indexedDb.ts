import localforage from 'localforage'

import type { AppState, PhotoTransform, PhotoRef } from '../state/appState'

export type PhotoVariant = 'photoMain' | 'photoThumb'

const APP_DB_NAME = 'family-tree-cards'

const blobStore = localforage.createInstance({
  name: APP_DB_NAME,
  storeName: 'blobs',
})

const indexStore = localforage.createInstance({
  name: APP_DB_NAME,
  storeName: 'index',
})

const APP_INDEX_KEY = 'app:index'

export function getPhotoBlobKey(personId: string, variant: PhotoVariant) {
  return `${variant}:${personId}`
}

export async function loadAppState(): Promise<AppState | null> {
  try {
    const state = (await indexStore.getItem<AppState>(APP_INDEX_KEY)) ?? null
    return state
  } catch {
    return null
  }
}

export async function saveAppState(state: AppState): Promise<void> {
  await indexStore.setItem(APP_INDEX_KEY, state)
}

export async function putBlob(blobKey: string, blob: Blob): Promise<void> {
  await blobStore.setItem(blobKey, blob)
}

export async function getBlob(blobKey: string): Promise<Blob | null> {
  try {
    const blob = await blobStore.getItem<Blob>(blobKey)
    return blob ?? null
  } catch {
    return null
  }
}

export async function deleteBlob(blobKey: string): Promise<void> {
  await blobStore.removeItem(blobKey)
}

async function ensureJpegBlob(source: Blob, maxDim: number, quality: number): Promise<Blob> {
  // Always convert to JPEG for consistent export + smaller IndexedDB footprint.
  const img = new Image()
  const url = URL.createObjectURL(source)
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.src = url
    })

    const { width, height } = img
    const scale = Math.min(1, maxDim / Math.max(width, height))
    const outW = Math.max(1, Math.round(width * scale))
    const outH = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new Error('Canvas 2D context unavailable')

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, outW, outH)

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('Failed to encode JPEG'))
          else resolve(blob)
        },
        'image/jpeg',
        quality,
      )
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function getOriginalBlobKey(personId: string) {
  return `original:${personId}`
}

export async function ingestPersonPhotoBlob(params: {
  personId: string
  variant: PhotoVariant
  sourceBlob: Blob
  transform?: PhotoTransform
}): Promise<PhotoRef> {
  const { personId, variant, sourceBlob } = params

  const blobKey = getPhotoBlobKey(personId, variant)

  const maxDim = variant === 'photoMain' ? 1600 : 300
  const quality = 0.85
  const jpeg = await ensureJpegBlob(sourceBlob, maxDim, quality)
  await putBlob(blobKey, jpeg)

  if (variant === 'photoMain') {
    await putBlob(getOriginalBlobKey(personId), sourceBlob)
  }

  return {
    blobKey,
    transform: params.transform ?? { xPercent: 0, yPercent: 0, scale: 1 },
  }
}

