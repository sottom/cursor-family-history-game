import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import domtoimage from 'dom-to-image-more'
import JSZip from 'jszip'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import { computeAllGroupings, computeEqualSpreadGrouping } from '../utils/groupings'
import { getBlob, getOriginalBlobKey } from '../storage/indexedDb'
import { getReactFlowInstance } from '../utils/reactFlowBridge'
import PersonCardExport from './PersonCardExport'
import type { Person } from '../state/appState'

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

export default function ExportDrawer({ onClose }: { onClose: () => void }) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [isGenerating, setIsGenerating] = useState(false)

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const people = useMemo(() => Object.values(state.persons), [state.persons])

  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

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

  const waitForImages = async (container: HTMLElement, timeoutMs = 30000) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const imgs = Array.from(container.querySelectorAll('img'))
      const allReady = imgs.every((img) => img.complete && img.naturalWidth > 0)
      if (allReady) return
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  const generate = async () => {
    setIsGenerating(true)

    const prevSelection = state.selectedPersonIds
    try {
      clearSelection()

      const dataUrls = await buildPhotoUrls()
      flushSync(() => setPhotoUrls(dataUrls))
      await new Promise((r) => setTimeout(r, 50))

      const zip = new JSZip()

      // Cards
      zip.folder('cards')
      for (const person of people) {
        const wrapper = cardRefs.current[person.id]
        if (!wrapper) continue

        await waitForImages(wrapper)

        const pngDataUrl = await domtoimage.toPng(wrapper, {
          pixelRatio: 5,
          bgcolor: '#ffffff',
          cacheBust: true,
        })

        const blob = await (await fetch(pngDataUrl)).blob()
        zip.file(`cards/${person.id}.png`, blob)
      }

      // Tree - convert blob: URLs to data URLs before capture
      const rfInstance = getReactFlowInstance()
      const rfEl = document.querySelector('.ftReactFlow') as HTMLElement | null
      if (rfInstance && rfEl) {
        await rfInstance.fitView({ padding: 0.1, duration: 0 })
        await new Promise((r) => setTimeout(r, 100))

        const canvasImgs = Array.from(rfEl.querySelectorAll('img'))
        const originalSrcs: Array<{ img: HTMLImageElement; src: string }> = []
        for (const img of canvasImgs) {
          if (img.src.startsWith('blob:')) {
            originalSrcs.push({ img, src: img.src })
            try {
              const resp = await fetch(img.src)
              const blob = await resp.blob()
              img.src = await blobToDataUrl(blob)
            } catch {
              // leave as-is if fetch fails
            }
          }
        }
        await new Promise((r) => setTimeout(r, 50))

        const treePngDataUrl = await domtoimage.toPng(rfEl, {
          pixelRatio: 4,
          bgcolor: '#ffffff',
          cacheBust: true,
        })
        const treeBlob = await (await fetch(treePngDataUrl)).blob()
        zip.file('tree.png', treeBlob)

        for (const entry of originalSrcs) {
          entry.img.src = entry.src
        }
      }

      // data.json
      const dataJson = {
        version: state.version,
        persons: state.persons,
        edges: state.edges,
        nodePositions: state.nodePositions,
        groupingsOverrides: state.ui.groupingOverrides,
      }
      zip.file('data.json', JSON.stringify(dataJson, null, 2))

      // groupings.json
      const groupings = computeAllGroupings({ state, overrides: state.ui.groupingOverrides })
      zip.file('groupings.json', JSON.stringify(groupings, null, 2))

      // groupings.csv (equal year spread ranges)
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

      // data.csv
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
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `family-tree-export-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      onClose()
    } finally {
      dispatch({ type: 'SET_SELECTED', payload: { personIds: prevSelection } })
      setIsGenerating(false)
    }
  }

  return (
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="ftModal" style={{ width: 'min(980px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">Export for Print</div>
          <button className="ftIconBtn" onClick={onClose} aria-label="Close export">
            ×
          </button>
        </div>

        <div className="ftModal__body" style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 800, color: 'var(--text-h)' }}>ZIP contents</div>
          <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.4 }}>
            <code>cards/</code> PNG per person, <code>photos/</code> originals at full resolution,{' '}
            <code>tree.png</code>, <code>data.csv</code>, <code>groupings.csv</code>, <code>data.json</code>,{' '}
            <code>groupings.json</code>.
          </div>

          <button
            type="button"
            className="ftBtn ftBtn--primary"
            style={{ padding: '12px 14px' }}
            onClick={() => void generate()}
            disabled={isGenerating || people.length === 0}
          >
            {people.length === 0 ? 'Add people first' : isGenerating ? 'Generating...' : 'Download ZIP'}
          </button>
        </div>

        {/* Hidden export cards staging area */}
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

