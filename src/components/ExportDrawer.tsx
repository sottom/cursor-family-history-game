import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import domtoimage from 'dom-to-image-more'
import JSZip from 'jszip'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import { PERSON_CARD_H, PERSON_CARD_W } from '../state/appState'
import { computeAllGroupings, computeEqualSpreadGrouping } from '../utils/groupings'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import { getReactFlowInstance } from '../utils/reactFlowBridge'
import PersonCardExport from './PersonCardExport'
import { lineageSlotIndex } from '../utils/parentHandles'
import type { Edge as AppEdge, NodePosition, Person } from '../state/appState'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function filenameFromBlobKey(blobKey?: string) {
  if (!blobKey) return ''
  return `${blobKey.replace(':', '_')}.jpg`
}

function csvEscape(value: unknown) {
  const s = value == null ? '' : String(value)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows: Record<string, string | number | null | undefined>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines: string[] = []
  lines.push(headers.map(csvEscape).join(','))
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  }
  return lines.join('\n')
}

function personToCsvRow(person: Person) {
  const marriages = person.marriages ?? []
  const main = person.photoMain
  const thumb = person.photoThumb
  return {
    id: person.id,
    fullName: person.fullName,
    shortName: person.shortName,
    DOB: person.dob.dateISO ?? '',
    DOB_location: person.dob.location ?? '',
    marriages: JSON.stringify(
      marriages.map((m) => ({
        spouseId: m.spouseId,
        dateISO: m.dateISO ?? '',
        location: m.location ?? '',
      })),
    ),
    DOD: person.dod.dateISO ?? '',
    DOD_location: person.dod.location ?? '',
    notes: person.notes ?? '',
    photoMain_filename: filenameFromBlobKey(main?.blobKey),
    photoMain_xPercent: main?.transform.xPercent ?? '',
    photoMain_yPercent: main?.transform.yPercent ?? '',
    photoMain_scale: main?.transform.scale ?? '',
    photoThumb_filename: filenameFromBlobKey(thumb?.blobKey),
    photoThumb_xPercent: thumb?.transform.xPercent ?? '',
    photoThumb_yPercent: thumb?.transform.yPercent ?? '',
    photoThumb_scale: thumb?.transform.scale ?? '',
  }
}

function groupingRowsFromEqualSpread(params: {
  kind: 'birth' | 'marriage' | 'death'
  buckets: ReturnType<typeof computeEqualSpreadGrouping>
}) {
  return params.buckets.map((bucket, index) => ({
    kind: params.kind,
    bucketIndex: index + 1,
    rangeStartYear: bucket.minYear,
    rangeEndYear: bucket.maxYear,
    memberCount: bucket.memberCount,
    memberIds: bucket.members.join('|'),
  }))
}

function waitForFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve()
      else requestAnimationFrame(() => step(left - 1))
    }
    step(count)
  })
}

async function waitForAllImages(root: HTMLElement, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const imgs = Array.from(root.querySelectorAll('img'))
    const allReady = imgs.every((img) => img.complete && img.naturalWidth > 0)
    if (allReady) return
    await new Promise((r) => setTimeout(r, 80))
  }
}

/** Swap any `blob:` URLs for inlined data URLs so html → canvas rasterization captures them. */
async function inlineBlobImages(root: HTMLElement): Promise<Array<{ img: HTMLImageElement; src: string }>> {
  const originals: Array<{ img: HTMLImageElement; src: string }> = []
  const imgs = Array.from(root.querySelectorAll('img'))
  for (const img of imgs) {
    if (img.src.startsWith('blob:')) {
      originals.push({ img, src: img.src })
      try {
        const resp = await fetch(img.src)
        const blob = await resp.blob()
        img.src = await blobToDataUrl(blob)
      } catch {
        // leave as-is
      }
    }
  }
  return originals
}

function restoreBlobImages(originals: Array<{ img: HTMLImageElement; src: string }>) {
  for (const { img, src } of originals) img.src = src
}

type TreeBounds = { minX: number; minY: number; maxX: number; maxY: number }

function computeTreeBounds(rf: any): TreeBounds | null {
  const nodes = (rf?.getNodes?.() ?? []) as Array<{
    id: string
    position: { x: number; y: number }
    width?: number
    height?: number
    measured?: { width?: number; height?: number }
  }>
  if (nodes.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const w = n.measured?.width ?? n.width ?? PERSON_CARD_W
    const h = n.measured?.height ?? n.height ?? PERSON_CARD_H
    const x = n.position?.x ?? 0
    const y = n.position?.y ?? 0
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x + w > maxX) maxX = x + w
    if (y + h > maxY) maxY = y + h
  }
  return { minX, minY, maxX, maxY }
}

type CaptureOptions = {
  /** Multiplies the output raster resolution — higher = crisper. Typical values: 2, 3, 4. */
  pixelRatio: number
  /** Flow-unit padding around the node bounding box. */
  padding: number
  /** Background fill. Use 'transparent' for posters composed over a template. */
  bgcolor: string
  /** If true, applies an additional CSS class to hide edges during rasterization. */
  isPoster?: boolean
}

/**
 * Rasterize only the nodes + edges, tightly cropped to their bounding box.
 *
 * Strategy: temporarily resize the React Flow container to exactly the tree's
 * bbox (+ padding), set the viewport to render at zoom = 1 (so nothing is
 * up-scaled), add a capture-only CSS class to hide chrome/handles/grid, then
 * rasterize with a high pixelRatio so text & edges stay crisp.
 */
async function captureTreeImage(options: CaptureOptions): Promise<Blob | null> {
  const rf = getReactFlowInstance()
  const rfEl = document.querySelector('.ftReactFlow') as HTMLElement | null
  const canvasEl = document.querySelector('.ftCanvas') as HTMLElement | null
  if (!rf || !rfEl || !canvasEl) return null

  const bounds = computeTreeBounds(rf)
  if (!bounds) return null

  const pad = options.padding
  const boxW = Math.ceil(bounds.maxX - bounds.minX) + pad * 2
  const boxH = Math.ceil(bounds.maxY - bounds.minY) + pad * 2

  const savedViewport = rf.getViewport?.() ?? { x: 0, y: 0, zoom: 1 }
  const savedRfStyle = {
    position: rfEl.style.position,
    width: rfEl.style.width,
    height: rfEl.style.height,
    overflow: rfEl.style.overflow,
    background: rfEl.style.background,
  }

  let inlinedImages: Array<{ img: HTMLImageElement; src: string }> = []

  try {
    canvasEl.classList.add('ftCanvas--exporting')
    if (options.isPoster) canvasEl.classList.add('ftCanvas--exporting-poster')

    rfEl.style.width = `${boxW}px`
    rfEl.style.height = `${boxH}px`
    rfEl.style.overflow = 'visible'

    rf.setViewport({ x: -bounds.minX + pad, y: -bounds.minY + pad, zoom: 1 }, { duration: 0 })

    await waitForFrames(2)
    await waitForAllImages(rfEl)

    inlinedImages = await inlineBlobImages(rfEl)
    // Swapping src triggers a reload on the <img> element, so wait again
    // before rasterizing or dom-to-image will capture un-decoded images.
    await waitForAllImages(rfEl)
    await waitForFrames(1)

    const dataUrl: string = await domtoimage.toPng(rfEl, {
      pixelRatio: options.pixelRatio,
      bgcolor: options.bgcolor,
      cacheBust: true,
      width: boxW,
      height: boxH,
    })

    const resp = await fetch(dataUrl)
    return await resp.blob()
  } finally {
    restoreBlobImages(inlinedImages)
    rfEl.style.position = savedRfStyle.position
    rfEl.style.width = savedRfStyle.width
    rfEl.style.height = savedRfStyle.height
    rfEl.style.overflow = savedRfStyle.overflow
    rfEl.style.background = savedRfStyle.background
    canvasEl.classList.remove('ftCanvas--exporting')
    if (options.isPoster) canvasEl.classList.remove('ftCanvas--exporting-poster')
    rf.setViewport?.(savedViewport, { duration: 0 })
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })
}

/** Compose the tree render on top of a user-provided background, fit-contain with a margin. */
async function composePosterBlob(params: {
  treeBlob: Blob
  backgroundBlob: Blob
  edges: AppEdge[]
  nodePositions: Record<string, NodePosition>
  treeBounds: TreeBounds
  treePadding: number
  treePixelRatio: number
  /** Fraction of the background's shorter side to leave as margin around the tree. */
  marginFraction: number
  mime: 'image/png' | 'image/jpeg'
  quality: number
}): Promise<Blob | null> {
  const [tree, bg] = await Promise.all([
    loadImageFromBlob(params.treeBlob),
    loadImageFromBlob(params.backgroundBlob),
  ])

  const canvas = document.createElement('canvas')
  canvas.width = bg.naturalWidth
  canvas.height = bg.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height)

  const margin = Math.min(canvas.width, canvas.height) * params.marginFraction
  const availW = canvas.width - margin * 2
  const availH = canvas.height - margin * 2
  const scale = Math.min(availW / tree.naturalWidth, availH / tree.naturalHeight)
  const drawW = tree.naturalWidth * scale
  const drawH = tree.naturalHeight * scale
  const drawX = (canvas.width - drawW) / 2
  const drawY = (canvas.height - drawH) / 2

  const boxW = Math.ceil(params.treeBounds.maxX - params.treeBounds.minX) + params.treePadding * 2
  const boxH = Math.ceil(params.treeBounds.maxY - params.treeBounds.minY) + params.treePadding * 2

  // Draw only parent-child connectors (never marriage connectors) so poster exports
  // always include ancestry lines even when transparent tree rasterization drops edges.
  for (const edge of params.edges) {
    if (edge.type !== 'parent-child') continue
    const parentPos = params.nodePositions[edge.source]
    const childPos = params.nodePositions[edge.target]
    if (!parentPos || !childPos) continue

    const slot = lineageSlotIndex(edge, params.edges, params.nodePositions)
    const handlePercent = slot === 0 ? 0.25 : slot === 2 ? 0.75 : 0.5

    const parentFlowX = parentPos.x + PERSON_CARD_W * handlePercent
    const parentFlowY = parentPos.y + PERSON_CARD_H
    const childFlowX = childPos.x + PERSON_CARD_W / 2
    const childFlowY = childPos.y

    const toPosterX = (flowX: number) => {
      const boxX = flowX - params.treeBounds.minX + params.treePadding
      return drawX + (boxX / boxW) * drawW
    }
    const toPosterY = (flowY: number) => {
      const boxY = flowY - params.treeBounds.minY + params.treePadding
      return drawY + (boxY / boxH) * drawH
    }

    const x1 = toPosterX(parentFlowX)
    const y1 = toPosterY(parentFlowY)
    const x2 = toPosterX(childFlowX)
    const y2 = toPosterY(childFlowY)
    const midY = y1 + (y2 - y1) * 0.5

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1, midY)
    ctx.lineTo(x2, midY)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = '#6f5b49'
    ctx.lineWidth = Math.max(2, Math.round(3 * scale))
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  ctx.drawImage(tree, drawX, drawY, drawW, drawH)

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), params.mime, params.quality)
  })
}

export default function ExportDrawer({ onClose }: { onClose: () => void }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [isGenerating, setIsGenerating] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string>('')

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const people = useMemo(() => Object.values(state.persons), [state.persons])

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  const [backgroundFile, setBackgroundFile] = useState<File | null>(null)
  const [backgroundPreviewUrl, setBackgroundPreviewUrl] = useState<string | null>(null)
  const [pixelRatio, setPixelRatio] = useState<2 | 3 | 4>(3)
  const [marginPercent, setMarginPercent] = useState<number>(6)
  const [outputFormat, setOutputFormat] = useState<'png' | 'jpeg'>('png')

  useEffect(() => {
    if (!backgroundFile) {
      setBackgroundPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(backgroundFile)
    setBackgroundPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [backgroundFile])

  const clearSelection = () => dispatch({ type: 'SET_SELECTED', payload: { personIds: [] } })

  const buildPhotoUrls = async () => {
    const next: Record<string, string> = {}
    for (const p of people) {
      const main = p.photoMain
      const thumb = p.photoThumb
      if (main?.blobKey && !next[main.blobKey]) {
        const blob = await getBlob(main.blobKey)
        if (blob) next[main.blobKey] = await blobToDataUrl(blob)
      }
      if (thumb?.blobKey && !next[thumb.blobKey]) {
        const blob = await getBlob(thumb.blobKey)
        if (blob) next[thumb.blobKey] = await blobToDataUrl(blob)
      }
    }
    setPhotoUrls(next)
    return next
  }

  const timestamp = () => new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)

  const downloadTreeOnly = async () => {
    if (people.length === 0) return
    setIsGenerating(true)
    setBusyLabel('Rendering tree at high resolution...')
    const prevSelection = state.selectedPersonIds
    try {
      clearSelection()
      await waitForFrames(2)

      const blob = await captureTreeImage({
        pixelRatio,
        padding: 40,
        // Opaque white so a tree-only PNG isn't see-through when viewed/printed.
        bgcolor: '#ffffff',
      })
      if (!blob) return
      downloadBlob(blob, `family-tree-${timestamp()}.png`)
    } finally {
      dispatch({ type: 'SET_SELECTED', payload: { personIds: prevSelection } })
      setIsGenerating(false)
      setBusyLabel('')
    }
  }

  const downloadPoster = async () => {
    if (people.length === 0 || !backgroundFile) return
    setIsGenerating(true)
    const prevSelection = state.selectedPersonIds
    try {
      clearSelection()
      await waitForFrames(2)

      setBusyLabel('Rendering tree at high resolution...')
      const rf = getReactFlowInstance()
      const treeBounds = rf ? computeTreeBounds(rf) : null
      if (!treeBounds) return
      const treeBlob = await captureTreeImage({
        pixelRatio,
        padding: 40,
        // Transparent so the user's template background shows through around cards.
        bgcolor: 'transparent',
        isPoster: true,
      })
      if (!treeBlob) return

      setBusyLabel('Compositing onto background...')
      const mime = outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      const posterBlob = await composePosterBlob({
        treeBlob,
        backgroundBlob: backgroundFile,
        edges: state.edges,
        nodePositions: state.nodePositions,
        treeBounds,
        treePadding: 40,
        treePixelRatio: pixelRatio,
        marginFraction: Math.max(0, Math.min(30, marginPercent)) / 100,
        mime,
        quality: 0.95,
      })
      if (!posterBlob) return
      const ext = outputFormat === 'jpeg' ? 'jpg' : 'png'
      downloadBlob(posterBlob, `family-tree-poster-${timestamp()}.${ext}`)
    } finally {
      dispatch({ type: 'SET_SELECTED', payload: { personIds: prevSelection } })
      setIsGenerating(false)
      setBusyLabel('')
    }
  }

  const generateZip = async () => {
    setIsGenerating(true)
    setBusyLabel('Building ZIP archive...')

    const prevSelection = state.selectedPersonIds
    try {
      clearSelection()

      const dataUrls = await buildPhotoUrls()
      flushSync(() => setPhotoUrls(dataUrls))
      await new Promise((r) => setTimeout(r, 50))

      const zip = new JSZip()

      // Cards — one PNG per person, rendered from the dedicated export card.
      zip.folder('cards')
      for (const person of people) {
        const wrapper = cardRefs.current[person.id]
        if (!wrapper) continue

        await waitForAllImages(wrapper)

        const pngDataUrl = await domtoimage.toPng(wrapper, {
          pixelRatio: 5,
          bgcolor: '#ffffff',
          cacheBust: true,
        })

        const blob = await (await fetch(pngDataUrl)).blob()
        zip.file(`cards/${person.id}.png`, blob)
      }

      // tree.png — crisp, tightly-cropped capture of just the node graph.
      setBusyLabel('Rendering tree at high resolution...')
      const treeBlob = await captureTreeImage({
        pixelRatio,
        padding: 40,
        bgcolor: '#ffffff',
      })
      if (treeBlob) zip.file('tree.png', treeBlob)

      // Optional composite poster using the selected background image.
      if (backgroundFile) {
        setBusyLabel('Compositing poster...')
        const rf = getReactFlowInstance()
        const treeBounds = rf ? computeTreeBounds(rf) : null
        const transparentTree = await captureTreeImage({
          pixelRatio,
          padding: 40,
          bgcolor: 'transparent',
          isPoster: true,
        })
        if (transparentTree && treeBounds) {
          const poster = await composePosterBlob({
            treeBlob: transparentTree,
            backgroundBlob: backgroundFile,
            edges: state.edges,
            nodePositions: state.nodePositions,
            treeBounds,
            treePadding: 40,
            treePixelRatio: pixelRatio,
            marginFraction: Math.max(0, Math.min(30, marginPercent)) / 100,
            mime: outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
            quality: 0.95,
          })
          if (poster) zip.file(`tree-poster.${outputFormat === 'jpeg' ? 'jpg' : 'png'}`, poster)
        }
      }

      setBusyLabel('Writing data files...')

      const dataJson = {
        version: state.version,
        persons: state.persons,
        edges: state.edges,
        nodePositions: state.nodePositions,
        groupingsOverrides: state.ui.groupingOverrides,
      }
      zip.file('data.json', JSON.stringify(dataJson, null, 2))

      const groupings = computeAllGroupings({ state, overrides: state.ui.groupingOverrides })
      zip.file('groupings.json', JSON.stringify(groupings, null, 2))

      const groupingRows = [
        ...groupingRowsFromEqualSpread({ kind: 'birth', buckets: computeEqualSpreadGrouping({ state, kind: 'birth' }) }),
        ...groupingRowsFromEqualSpread({
          kind: 'marriage',
          buckets: computeEqualSpreadGrouping({ state, kind: 'marriage' }),
        }),
        ...groupingRowsFromEqualSpread({ kind: 'death', buckets: computeEqualSpreadGrouping({ state, kind: 'death' }) }),
      ]
      if (groupingRows.length > 0) {
        zip.file('groupings.csv', toCsv(groupingRows))
      }

      zip.file(
        'data.csv',
        toCsv(people.map((p) => personToCsvRow(p)) as unknown as Record<string, string>[]),
      )

      // Full-resolution original photos
      const photosFolder = zip.folder('photos')!
      for (const person of people) {
        const originalBlob = await getBlob(getOriginalBlobKey(person.id))
        const fallbackBlob =
          originalBlob ??
          (person.photoMain?.blobKey ? await getBlob(person.photoMain.blobKey) : null) ??
          (person.photoThumb?.blobKey ? await getBlob(person.photoThumb.blobKey) : null)
        if (!fallbackBlob) continue
        const safeName = (person.shortName || person.fullName || person.id).replace(/[^a-zA-Z0-9_-]/g, '_')
        const ext = fallbackBlob.type === 'image/png' ? 'png' : fallbackBlob.type === 'image/gif' ? 'gif' : 'jpg'
        photosFolder.file(`${safeName}_${person.id.slice(0, 8)}.${ext}`, fallbackBlob)
      }

      const content = await zip.generateAsync({ type: 'blob' })
      downloadBlob(content, `family-tree-export-${new Date().toISOString().slice(0, 10)}.zip`)
      onClose()
    } finally {
      dispatch({ type: 'SET_SELECTED', payload: { personIds: prevSelection } })
      setIsGenerating(false)
      setBusyLabel('')
    }
  }

  return (
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isGenerating) onClose()
      }}
    >
      <div className="ftModal" style={{ width: 'min(980px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">Export Family Tree</div>
          <button
            className="ftIconBtn"
            onClick={onClose}
            aria-label="Close export"
            disabled={isGenerating}
          >
            ×
          </button>
        </div>

        <div className="ftModal__body" style={{ display: 'grid', gap: 18 }}>
          {/* --- Tree Poster ------------------------------------------------- */}
          <section
            style={{
              display: 'grid',
              gap: 12,
              padding: 14,
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: 'color-mix(in srgb, var(--bg), transparent 4%)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-h)', fontSize: 15 }}>Tree Poster (PNG / JPEG)</div>
              <div style={{ color: 'var(--text)', fontSize: 12, opacity: 0.8 }}>
                Crops to just the nodes, composites onto your background.
              </div>
            </div>

            <label
              style={{
                display: 'grid',
                gap: 6,
                padding: 10,
                border: '1px dashed var(--border)',
                borderRadius: 10,
                cursor: 'pointer',
                background: backgroundPreviewUrl ? 'transparent' : 'color-mix(in srgb, var(--bg), transparent 8%)',
              }}
            >
              <div style={{ fontWeight: 700, color: 'var(--text-h)', fontSize: 13 }}>Background template image</div>
              <div style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.35, opacity: 0.8 }}>
                Pick any PNG or JPEG. The tree will be centered on top, fit-contain.
                The final image uses the background's native pixel dimensions.
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setBackgroundFile(e.target.files?.[0] ?? null)}
                style={{ fontSize: 12 }}
              />
              {backgroundPreviewUrl ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, alignItems: 'center' }}>
                  <img
                    src={backgroundPreviewUrl}
                    alt="Background preview"
                    style={{
                      width: 96,
                      height: 96,
                      objectFit: 'cover',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  />
                  <div style={{ fontSize: 12, color: 'var(--text)', wordBreak: 'break-all' }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-h)' }}>{backgroundFile?.name}</div>
                    <div style={{ opacity: 0.75 }}>
                      {backgroundFile ? `${Math.round(backgroundFile.size / 1024).toLocaleString()} KB` : ''}
                    </div>
                  </div>
                </div>
              ) : null}
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 10,
              }}
            >
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-h)' }}>Render quality</span>
                <select
                  value={pixelRatio}
                  onChange={(e) => setPixelRatio(Number(e.target.value) as 2 | 3 | 4)}
                  disabled={isGenerating}
                >
                  <option value={2}>2× (fast, good)</option>
                  <option value={3}>3× (recommended)</option>
                  <option value={4}>4× (print / large format)</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-h)' }}>Background margin</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  step={1}
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(Number(e.target.value))}
                  disabled={isGenerating}
                />
                <span style={{ opacity: 0.75 }}>% of shorter side</span>
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text)' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-h)' }}>Output format</span>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as 'png' | 'jpeg')}
                  disabled={isGenerating}
                >
                  <option value="png">PNG (lossless)</option>
                  <option value="jpeg">JPEG (smaller file)</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ftBtn ftBtn--primary"
                style={{ padding: '10px 14px' }}
                onClick={() => void downloadPoster()}
                disabled={isGenerating || people.length === 0 || !backgroundFile}
                title={!backgroundFile ? 'Pick a background image first' : undefined}
              >
                {people.length === 0
                  ? 'Add people first'
                  : isGenerating
                    ? busyLabel || 'Working...'
                    : 'Download poster'}
              </button>
              <button
                type="button"
                className="ftBtn"
                style={{ padding: '10px 14px' }}
                onClick={() => void downloadTreeOnly()}
                disabled={isGenerating || people.length === 0}
              >
                Tree only (no background)
              </button>
            </div>
          </section>

          {/* --- ZIP archive -------------------------------------------------- */}
          <section
            style={{
              display: 'grid',
              gap: 10,
              padding: 14,
              border: '1px solid var(--border)',
              borderRadius: 12,
            }}
          >
            <div style={{ fontWeight: 800, color: 'var(--text-h)', fontSize: 15 }}>Full ZIP archive</div>
            <div style={{ color: 'var(--text)', fontSize: 12, lineHeight: 1.4 }}>
              <code>cards/</code> PNG per person, <code>photos/</code> originals, <code>tree.png</code>
              {backgroundFile ? <> + <code>tree-poster</code></> : null}, <code>data.csv</code>,{' '}
              <code>groupings.csv</code>, <code>data.json</code>, <code>groupings.json</code>.
            </div>
            <button
              type="button"
              className="ftBtn"
              style={{ padding: '10px 14px', justifySelf: 'start' }}
              onClick={() => void generateZip()}
              disabled={isGenerating || people.length === 0}
            >
              {people.length === 0 ? 'Add people first' : isGenerating ? busyLabel || 'Working...' : 'Download ZIP'}
            </button>
          </section>

          {isGenerating && busyLabel ? (
            <div style={{ fontSize: 12, color: 'var(--text)', opacity: 0.85 }}>{busyLabel}</div>
          ) : null}
        </div>

        {/* Hidden export cards staging area — used only by the ZIP path. */}
        <div
          style={{
            position: 'absolute',
            left: '-100000px',
            top: 0,
            width: 'max-content',
            height: 'max-content',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <div>
            {people.map((person) => (
              <div
                key={person.id}
                ref={(el) => {
                  cardRefs.current[person.id] = el
                }}
              >
                <PersonCardExport
                  personId={person.id}
                  person={person}
                  photoMainUrl={person.photoMain?.blobKey ? photoUrls[person.photoMain.blobKey] : null}
                  photoThumbUrl={person.photoThumb?.blobKey ? photoUrls[person.photoThumb.blobKey] : null}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
