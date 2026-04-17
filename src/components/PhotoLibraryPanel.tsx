import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { PhotoLibraryEntry } from '../state/appState'
import { deleteBlob, getBlob, getPhotoLibraryBlobKey, putBlob } from '../storage/indexedDb'
import { decodeIfHeic } from '../utils/heicDecode'
import { PHOTO_LIBRARY_DATA_PREFIX, setLibraryPhotoDragId } from '../utils/photoLibraryDrag'

function isImageFile(file: File): boolean {
  const t = file.type.toLowerCase()
  if (t.startsWith('image/')) return true
  if (/\.(jpe?g|png|gif|webp|bmp|avif|svg|hei[cf]|tiff?)$/i.test(file.name)) return true
  if (t === 'application/octet-stream' && /\.(jpe?g|png|gif|webp|hei[cf]|tiff?)$/i.test(file.name)) return true
  if (t === 'video/quicktime' && /\.hei[cf]$/i.test(file.name)) return true
  return false
}

/** When MIME is missing, detect common still-image signatures (first bytes only). */
async function sniffBinaryLooksLikeImage(file: File): Promise<boolean> {
  if (file.size < 24) return false
  const buf = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return true
  const riff = String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!)
  if (riff === 'RIFF' && String.fromCharCode(buf[8]!, buf[9]!, buf[10]!, buf[11]!) === 'WEBP') return true
  const tag = String.fromCharCode(buf[4]!, buf[5]!, buf[6]!, buf[7]!)
  if (tag === 'ftyp') return true
  return false
}

async function filterImportableImages(files: File[]): Promise<File[]> {
  const pass = files.filter(isImageFile)
  if (pass.length > 0) return pass
  const loose = files.filter((f) => !f.type || f.type === 'application/octet-stream')
  const out: File[] = []
  for (const f of loose) {
    if (await sniffBinaryLooksLikeImage(f)) out.push(f)
  }
  return out
}

function displayNameForFile(file: File, pathPrefix?: string): string {
  if (pathPrefix) return `${pathPrefix}/${file.name}`.replace(/^\/+/, '').replace(/\\/g, '/')
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  if (rel && typeof rel === 'string' && rel.length > 0) return rel.replace(/\\/g, '/')
  return file.name
}

/** Pull every File out of a dropped FileSystemEntry tree (folders supported in Chromium/WebKit). */
type FsEntry = {
  isFile: boolean
  isDirectory: boolean
  name: string
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void
  createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void }
}

async function readAllFilesFromEntry(entry: FsEntry, prefix: string, out: { file: File; path: string }[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject))
    out.push({ file, path: prefix })
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader()
    let batch: FsEntry[] = []
    do {
      batch = await new Promise<FsEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      )
      for (const child of batch) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name
        await readAllFilesFromEntry(child, nextPrefix, out)
      }
    } while (batch.length > 0)
  }
}

async function filesFromDropEvent(e: DragEvent | ReactDragEvent): Promise<{ file: File; path?: string }[]> {
  const out: { file: File; path?: string }[] = []
  const dt = e.dataTransfer
  if (!dt) return out

  const items = dt.items ? Array.from(dt.items) : []
  const supportsEntry = items.some((it) => typeof (it as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry === 'function')

  if (supportsEntry) {
    for (const it of items) {
      const entry = (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.()
      if (!entry) continue
      const collected: { file: File; path: string }[] = []
      await readAllFilesFromEntry(entry, '', collected)
      for (const { file, path } of collected) out.push({ file, path })
    }
  } else if (dt.files) {
    for (const f of Array.from(dt.files)) out.push({ file: f })
  }
  return out
}

function LibraryThumb({ entry }: { entry: PhotoLibraryEntry }) {
  const [url, setUrl] = useState<string | null>(null)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setPreviewFailed(false)
    setUrl(null)
    ;(async () => {
      const blob = await getBlob(entry.blobKey)
      if (!blob || cancelled) return
      try {
        const displayable = await decodeIfHeic(blob, entry.name)
        objectUrl = URL.createObjectURL(displayable)
        if (!cancelled) setUrl(objectUrl)
      } catch {
        if (!cancelled) setPreviewFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [entry.blobKey, entry.name])

  return (
    <div
      className="ftPhotoLibraryPanel__thumb"
      draggable
      title={`Drag onto a person card: ${entry.name}`}
      onDragStart={(e) => {
        setLibraryPhotoDragId(entry.id)
        e.dataTransfer.setData('text/plain', `${PHOTO_LIBRARY_DATA_PREFIX}${entry.id}`)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => setLibraryPhotoDragId(null)}
    >
      {previewFailed ? (
        <div className="ftPhotoLibraryPanel__thumbPlaceholder ftPhotoLibraryPanel__thumbPlaceholder--heic" title="Preview unavailable">
          HEIC
        </div>
      ) : url ? (
        <img src={url} alt="" draggable={false} onError={() => setPreviewFailed(true)} />
      ) : (
        <div className="ftPhotoLibraryPanel__thumbPlaceholder" />
      )}
      <span className="ftPhotoLibraryPanel__thumbLabel">{entry.name}</span>
    </div>
  )
}

export default function PhotoLibraryPanel() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const filePickRef = useRef<HTMLInputElement>(null)
  const importHintTimerRef = useRef<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [importHint, setImportHint] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState(false)

  useEffect(() => {
    const onDragEnd = () => setLibraryPhotoDragId(null)
    window.addEventListener('dragend', onDragEnd)
    return () => window.removeEventListener('dragend', onDragEnd)
  }, [])

  useEffect(() => {
    return () => {
      if (importHintTimerRef.current != null) window.clearTimeout(importHintTimerRef.current)
    }
  }, [])

  const setHintBriefly = useCallback((msg: string) => {
    setImportHint(msg)
    if (importHintTimerRef.current != null) window.clearTimeout(importHintTimerRef.current)
    importHintTimerRef.current = window.setTimeout(() => {
      importHintTimerRef.current = null
      setImportHint((h) => (typeof h === 'string' && h.startsWith('Imported') ? null : h))
    }, 4000)
  }, [])

  const importPayload = useCallback(
    async (payload: { file: File; path?: string }[]) => {
      if (payload.length === 0) {
        setImportHint('Nothing to import.')
        return
      }
      const files = await filterImportableImages(payload.map((p) => p.file))
      if (files.length === 0) {
        setImportHint(
          `Found ${payload.length} files but none looked like importable images. Supported: JPEG, PNG, GIF, WebP, HEIC/HEIF, TIFF.`,
        )
        return
      }
      setImportHint(null)
      setImporting(true)
      try {
        const entries: PhotoLibraryEntry[] = []
        for (const file of files) {
          const match = payload.find((p) => p.file === file)
          const id = crypto.randomUUID()
          const blobKey = getPhotoLibraryBlobKey(id)
          await putBlob(blobKey, file)
          entries.push({ id, name: displayNameForFile(file, match?.path), blobKey })
        }
        dispatch({ type: 'ADD_PHOTO_LIBRARY_ITEMS', payload: { entries } })
        setHintBriefly(`Imported ${entries.length} photo${entries.length === 1 ? '' : 's'}.`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Photo import failed', err)
        setImportHint(`Import failed: ${msg}`)
      } finally {
        setImporting(false)
      }
    },
    [dispatch, setHintBriefly],
  )

  const onFilesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      e.target.value = ''
      if (!list?.length) return
      void importPayload(Array.from(list).map((f) => ({ file: f })))
    },
    [importPayload],
  )

  const onPanelDragOver = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropHover(true)
    }
  }, [])

  const onPanelDragLeave = useCallback((e: ReactDragEvent<HTMLDivElement>) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const stillInside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
    if (!stillInside) setDropHover(false)
  }, [])

  const onPanelDrop = useCallback(
    async (e: ReactDragEvent<HTMLDivElement>) => {
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
      e.stopPropagation()
      setDropHover(false)
      const files = await filesFromDropEvent(e)
      await importPayload(files)
    },
    [importPayload],
  )

  const clearLibrary = useCallback(async () => {
    for (const entry of state.photoLibrary) {
      await deleteBlob(entry.blobKey)
    }
    dispatch({ type: 'CLEAR_PHOTO_LIBRARY' })
  }, [dispatch, state.photoLibrary])

  return (
    <aside
      className={`ftPhotoLibraryPanel${dropHover ? ' ftPhotoLibraryPanel--dropping' : ''}`}
      aria-label="Imported photos"
      onDragOver={onPanelDragOver}
      onDragLeave={onPanelDragLeave}
      onDrop={onPanelDrop}
    >
      <div className="ftPhotoLibraryPanel__header">
        <div className="ftPhotoLibraryPanel__title">Photo tray</div>
        <p className="ftPhotoLibraryPanel__intro">
          <strong>Drag a folder</strong> (or files) here, or click <strong>Choose photos…</strong>. Then drag a thumbnail
          onto a person card. HEIC/HEIF are converted in the browser for preview and cards.
        </p>
        {importHint ? <p className="ftPhotoLibraryPanel__hint">{importHint}</p> : null}
        <div className="ftPhotoLibraryPanel__actions">
          <button
            type="button"
            className="ftBtn ftBtn--primary ftPhotoLibraryPanel__folderBtn"
            onClick={() => filePickRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : 'Choose photos…'}
          </button>
          {state.photoLibrary.length > 0 ? (
            <button type="button" className="ftBtn ftPhotoLibraryPanel__clearBtn" onClick={() => void clearLibrary()}>
              Clear all
            </button>
          ) : null}
        </div>
        <input
          ref={filePickRef}
          type="file"
          className="ftPhotoLibraryPanel__hiddenInput"
          multiple
          onChange={onFilesChange}
        />
      </div>

      {state.photoLibrary.length === 0 ? (
        <div className="ftPhotoLibraryPanel__empty">
          {importing ? 'Reading files…' : dropHover ? 'Release to import…' : 'Drag a folder or photos here, or use “Choose photos…”.'}
        </div>
      ) : (
        <div className="ftPhotoLibraryPanel__grid">
          {state.photoLibrary.map((entry) => (
            <LibraryThumb key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </aside>
  )
}
