import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createNewPerson, type PhotoTransform, PERSON_CARD_H, PERSON_CARD_W, SPOUSE_PAIR_SPACING_X } from '../state/appState'
import { useAppDispatch, useAppState } from '../state/AppProvider'
import { ingestPersonPhotoBlob, getBlob } from '../storage/indexedDb'
import { PHOTO_MAIN_FRAME, PHOTO_THUMB_FRAME } from '../config/cardLayout'
import AddChildModal from './AddChildModal'
import AddParentModal from './AddParentModal'

type PersonNodeData = { personId: string }
type PersonNodeType = FlowNode<PersonNodeData, 'person'>

function fmtDateOrEmpty(dateISO?: string) {
  if (!dateISO) return ''
  if (dateISO.length >= 4) return dateISO.slice(0, 10)
  return dateISO
}

const blobUrlCache = new Map<string, string>()

function useBlobUrl(blobKey?: string) {
  const [url, setUrl] = useState<string | null>(() =>
    blobKey ? blobUrlCache.get(blobKey) ?? null : null,
  )

  useEffect(() => {
    if (!blobKey) return
    if (blobUrlCache.has(blobKey)) {
      setUrl(blobUrlCache.get(blobKey) ?? null)
      return
    }
    let cancelled = false
    ;(async () => {
      const blob = await getBlob(blobKey)
      if (!blob || cancelled) return
      const objectUrl = URL.createObjectURL(blob)
      blobUrlCache.set(blobKey, objectUrl)
      if (!cancelled) setUrl(objectUrl)
    })()
    return () => { cancelled = true }
  }, [blobKey])

  return url
}

export default function PersonNode(props: NodeProps<PersonNodeType>) {
  const { personId } = props.data
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]

  const selected = !!props.selected
  const dragging = !!props.dragging
  const isSingleSelected = selected && state.selectedPersonIds.length === 1
  const toolbarVisible = isSingleSelected && !dragging

  const mainUrl = useBlobUrl(person?.photoMain?.blobKey)
  const thumbUrl = useBlobUrl(person?.photoThumb?.blobKey)
  const photoMainTransform: PhotoTransform = person?.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
  const photoThumbTransform: PhotoTransform = person?.photoThumb?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [childModalOpen, setChildModalOpen] = useState(false)
  const [parentModalOpen, setParentModalOpen] = useState(false)
  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null)

  const closeChildModal = useCallback(() => setChildModalOpen(false), [])
  const closeParentModal = useCallback(() => setParentModalOpen(false), [])

  // --- Photo handling ---

  const setPhotoFromBlob = useCallback(
    async (sourceBlob: Blob) => {
      if (!person) return
      const mainTransform = person.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
      const thumbTransform = person.photoThumb?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
      const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob, transform: mainTransform })
      const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob, transform: thumbTransform })
      dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
    },
    [dispatch, person, personId],
  )

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (file) await setPhotoFromBlob(file)
    },
    [setPhotoFromBlob],
  )

  useEffect(() => {
    if (!selected) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        void setPhotoFromBlob(file)
        e.preventDefault()
        break
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [selected, setPhotoFromBlob])

  // --- Relationship actions ---

  const getExistingParents = useCallback(
    () => state.edges.filter((e) => e.type === 'parent-child' && e.target === personId).map((e) => e.source),
    [personId, state.edges],
  )

  const getDirectSpouses = useCallback((): string[] => {
    const set = new Set<string>()
    for (const e of state.edges) {
      if (e.type !== 'spouse') continue
      if (e.source === personId) set.add(e.target)
      if (e.target === personId) set.add(e.source)
    }
    return [...set]
  }, [personId, state.edges])

  const addParent = useCallback(() => {
    const existing = getExistingParents()
    if (existing.length > 0) {
      setParentModalOpen(true)
      return
    }
    const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
    const newPerson = createNewPerson({ shortName: 'Parent', fullName: '' })
    const newPos = { x: currPos.x, y: currPos.y - (PERSON_CARD_H + 120) }
    dispatch({ type: 'ADD_PERSON', payload: { person: newPerson, position: newPos } })
    dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: newPerson.id } })
    dispatch({
      type: 'ADD_EDGE',
      payload: { edge: { id: crypto.randomUUID(), source: newPerson.id, target: personId, type: 'parent-child' } },
    })
  }, [dispatch, getExistingParents, personId, state.nodePositions])

  const addSpouse = useCallback(() => {
    const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
    const newPerson = createNewPerson({ shortName: 'Spouse', fullName: '' })
    const spouseIds = getDirectSpouses()
    const personX = currPos.x
    const hasRight = spouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) > personX)
    const hasLeft = spouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) < personX)
    let newX: number
    if (!hasRight) newX = personX + SPOUSE_PAIR_SPACING_X
    else if (!hasLeft) newX = personX - SPOUSE_PAIR_SPACING_X
    else {
      const maxRight = Math.max(...spouseIds.map((id) => state.nodePositions[id]?.x ?? 0))
      newX = maxRight + SPOUSE_PAIR_SPACING_X
    }

    const marriage = { dateISO: undefined as string | undefined, location: undefined as string | undefined }
    dispatch({ type: 'ADD_PERSON', payload: { person: newPerson, position: { x: newX, y: currPos.y } } })
    dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: newPerson.id } })
    dispatch({
      type: 'ADD_EDGE',
      payload: { edge: { id: crypto.randomUUID(), source: personId, target: newPerson.id, type: 'spouse', marriage } },
    })
    const existingA = person?.marriages ?? []
    dispatch({
      type: 'UPDATE_PERSON',
      payload: { personId, patch: { marriages: [...existingA, { spouseId: newPerson.id, ...marriage }] } },
    })
    dispatch({
      type: 'UPDATE_PERSON',
      payload: { personId: newPerson.id, patch: { marriages: [{ spouseId: personId, ...marriage }] } },
    })
  }, [dispatch, getDirectSpouses, person, personId, state.nodePositions])

  const addChild = useCallback(() => setChildModalOpen(true), [])

  const onOpenEdit = useCallback(
    () => dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId } }),
    [dispatch, personId],
  )
  const onOpenAdjustMain = useCallback(
    () => dispatch({ type: 'OPEN_PHOTO_ADJUST', payload: { personId, variant: 'photoMain' } }),
    [dispatch, personId],
  )

  const marriageSummary = useMemo(() => {
    if (!person?.marriages?.length) return 'Marriages: \u2014'
    const lines = person.marriages.slice(0, 2).map((m) => {
      const spouse = state.persons[m.spouseId]
      const name = spouse?.shortName || spouse?.fullName || m.spouseId
      const d = fmtDateOrEmpty(m.dateISO)
      const loc = m.location ? ` \u2022 ${m.location}` : ''
      const cur = m.isCurrent ? ' \u2713' : ''
      return `${name}${cur}${d ? ` (${d})` : ''}${loc}`
    })
    const extra = person.marriages.length > 2 ? ` (+${person.marriages.length - 2} more)` : ''
    return `Marriages: ${lines.join('; ')}${extra}`
  }, [person?.marriages, state.persons])

  /** Visible hit targets; must sit above card content (z-index) so they show and receive drags. */
  const hz = {
    lineage: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: 'var(--bg)',
      border: '1.5px solid var(--accent)',
      boxShadow: '0 1px 3px rgba(60, 40, 20, 0.16)',
      zIndex: 24,
    } as const,
    lineageSide: {
      width: 4,
      height: 4,
      borderRadius: 999,
      background: 'var(--bg)',
      border: '0.75px solid var(--accent)',
      boxShadow: '0 1px 2px rgba(60, 40, 20, 0.12)',
      zIndex: 24,
    } as const,
    spouse: {
      width: 8,
      height: 8,
      borderRadius: 999,
      background: 'var(--bg)',
      border: '1.5px solid #b79c7a',
      boxShadow: '0 1px 3px rgba(60, 40, 20, 0.16)',
      zIndex: 24,
    } as const,
    spouseSide: {
      width: 4,
      height: 4,
      borderRadius: 999,
      background: 'var(--bg)',
      border: '0.75px solid #b79c7a',
      boxShadow: '0 1px 2px rgba(60, 40, 20, 0.12)',
      zIndex: 24,
    } as const,
  }

  const lineageSlotLeftPct = [25, 50, 75] as const
  const marriageSlotTopPct = [25, 50, 75] as const
  const lineageStyleForSlot = (slot: 0 | 1 | 2) => (slot === 1 ? hz.lineage : hz.lineageSide)
  const spouseStyleForSlot = (slot: 0 | 1 | 2) => (slot === 1 ? hz.spouse : hz.spouseSide)

  const handlePointer = (key: string) => ({
    onPointerEnter: () => setHoveredHandleKey(key),
    onPointerLeave: () => setHoveredHandleKey((h) => (h === key ? null : h)),
  })

  const withHoverScale = (key: string, baseTransform: string, style: Record<string, unknown>) => ({
    ...style,
    transform: `${baseTransform} scale(${hoveredHandleKey === key ? 3 : 1})`,
    transition: 'transform 0.14s ease-out',
  })

  return (
    <div
      className={`ftPersonCard ${selected ? 'selected' : ''}`}
      title={!selected ? 'Click to select. Then use the toolbar to edit details, add family, or set photos.' : undefined}
      style={{
        width: PERSON_CARD_W,
        height: PERSON_CARD_H,
        boxSizing: 'border-box',
        borderRadius: 14,
        border: '2px solid var(--card-border)',
        boxShadow: selected
          ? 'var(--card-shadow), 0 0 0 3px var(--accent-bg)'
          : 'var(--card-shadow), 0 0 0 3px transparent',
        background: 'var(--card-bg)',
        overflow: 'visible',
        position: 'relative',
      }}
    >
      {/* Thumbnail photo */}
      <div
        style={{
          position: 'absolute',
          left: PHOTO_THUMB_FRAME.x, top: PHOTO_THUMB_FRAME.y,
          width: PHOTO_THUMB_FRAME.w, height: PHOTO_THUMB_FRAME.h,
          borderRadius: 12, overflow: 'hidden',
          border: '1px solid color-mix(in srgb, var(--card-border), transparent 35%)',
          background: 'color-mix(in srgb, var(--text-h), transparent 97%)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: `translate(${photoThumbTransform.xPercent}%, ${photoThumbTransform.yPercent}%)` }}>
          {thumbUrl && (
            <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${photoThumbTransform.scale})` }} />
          )}
        </div>
      </div>

      {/* Main photo */}
      <div
        style={{
          position: 'absolute',
          left: PHOTO_MAIN_FRAME.x, top: PHOTO_MAIN_FRAME.y,
          width: PHOTO_MAIN_FRAME.w, height: PHOTO_MAIN_FRAME.h,
          borderRadius: 14, overflow: 'hidden',
          border: '1px solid color-mix(in srgb, var(--card-border), transparent 35%)',
          background: 'color-mix(in srgb, var(--text-h), transparent 97%)',
          pointerEvents: 'none',
        }}
      >
        <div style={{ width: '100%', height: '100%', transform: `translate(${photoMainTransform.xPercent}%, ${photoMainTransform.yPercent}%)` }}>
          {mainUrl && (
            <img src={mainUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${photoMainTransform.scale})` }} />
          )}
        </div>
      </div>

      {/* Toolbar */}
      {toolbarVisible && (
        <div
          className="ftPersonCard__toolbar"
          style={{
            position: 'absolute', left: '50%', bottom: 'calc(100% + 10px)',
            transform: 'translateX(-50%)', zIndex: 12,
            display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="ftNodeBtn" onClick={addParent} type="button">+ Parent</button>
          <button className="ftNodeBtn" onClick={addSpouse} type="button">+ Spouse</button>
          <button className="ftNodeBtn" onClick={addChild} type="button">+ Child</button>
          <button className="ftNodeBtn" onClick={onOpenEdit} type="button">Edit</button>
          <button className="ftNodeBtn" onClick={() => fileInputRef.current?.click()} type="button" aria-label="Set photo">Set Photo</button>
          <button className="ftNodeBtn" onClick={onOpenAdjustMain} type="button">Adjust Photo</button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => void onFilesSelected(e.target.files)} />
        </div>
      )}

      {!toolbarVisible && (
        <div className="ftPersonCard__tooltip" aria-hidden="true">
          Click to select, then edit, add family, or set photos.
        </div>
      )}

      {/* Extracted modals */}
      {childModalOpen && <AddChildModal personId={personId} onClose={closeChildModal} />}
      {parentModalOpen && <AddParentModal personId={personId} onClose={closeParentModal} />}

      {/* Text content */}
      <div
        style={{
          position: 'absolute', left: 12, right: 12,
          top: PHOTO_MAIN_FRAME.y + PHOTO_MAIN_FRAME.h + 8, bottom: 10,
          overflow: 'hidden', pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 900, color: 'var(--text-h)', fontSize: 14, lineHeight: 1.05 }}>
          {person?.fullName || person?.shortName || 'New Person'}
        </div>
        {person?.shortName && person.shortName !== person.fullName && (
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.2 }}>
            Short: <span style={{ color: 'var(--text-h)', fontWeight: 700 }}>{person.shortName}</span>
          </div>
        )}
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          Born: {fmtDateOrEmpty(person?.dob?.dateISO)} {person?.dob?.location ? `\u2022 ${person.dob.location}` : ''}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          {marriageSummary}
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          Died: {fmtDateOrEmpty(person?.dod?.dateISO)} {person?.dod?.location ? `\u2022 ${person.dod.location}` : ''}
        </div>
        {person?.notes && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', opacity: 0.9, lineHeight: 1.2 }}>
            {person.notes.slice(0, 155)}
          </div>
        )}
      </div>

      {/* Lineage: one centered dot on top; three on the bottom. Sides = spouse. */}
      <Handle
        type="source"
        position={Position.Top}
        id="to-parent"
        title="Drag to a parent’s bottom dot to link as their child"
        {...handlePointer(`${personId}:to-parent`)}
        style={withHoverScale(`${personId}:to-parent`, 'translate(-50%, -50%)', { ...hz.lineage, left: '50%', zIndex: 24 })}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="child"
        title="Parent → child (incoming)"
        {...handlePointer(`${personId}:child`)}
        style={withHoverScale(`${personId}:child`, 'translate(-50%, -50%)', { ...hz.lineage, left: '50%', zIndex: 25 })}
      />
      {([0, 1, 2] as const).map((slot) => {
        const lb = lineageStyleForSlot(slot)
        const left = `${lineageSlotLeftPct[slot]}%`
        const label = slot === 0 ? 'left' : slot === 1 ? 'center' : 'right'
        return (
          <Fragment key={`lineage-bottom-${slot}`}>
            <Handle
              type="target"
              position={Position.Bottom}
              id={`parent-accept-${slot}`}
              title="Drop from a child’s top (outgoing) dot"
              {...handlePointer(`${personId}:parent-accept-${slot}`)}
              style={withHoverScale(`${personId}:parent-accept-${slot}`, 'translate(-50%, 50%)', {
                ...lb,
                left,
                zIndex: 24,
              })}
            />
            <Handle
              type="source"
              position={Position.Bottom}
              id={`parent-${slot}`}
              title={`Drag to a child’s top-center dot (${label} bottom source)`}
              {...handlePointer(`${personId}:parent-${slot}`)}
              style={withHoverScale(`${personId}:parent-${slot}`, 'translate(-50%, 50%)', {
                ...lb,
                left,
                zIndex: 25,
              })}
            />
          </Fragment>
        )
      })}
      {([0, 1, 2] as const).map((slot) => {
        const sb = spouseStyleForSlot(slot)
        const top = `${marriageSlotTopPct[slot]}%`
        const place = slot === 0 ? 'upper' : slot === 1 ? 'middle' : 'lower'
        return (
          <Fragment key={`marriage-side-${slot}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={`spouse-right-${slot}`}
              title={`Marriage (${place} dot — drag to a spouse’s left)`}
              {...handlePointer(`${personId}:spouse-right-${slot}`)}
              style={withHoverScale(`${personId}:spouse-right-${slot}`, 'translate(50%, -50%)', { ...sb, top, zIndex: 25 })}
            />
            <Handle
              type="target"
              position={Position.Left}
              id={`spouse-left-${slot}`}
              title={`Marriage (${place} dot — incoming from a spouse’s right)`}
              {...handlePointer(`${personId}:spouse-left-${slot}`)}
              style={withHoverScale(`${personId}:spouse-left-${slot}`, 'translate(-50%, -50%)', { ...sb, top, zIndex: 24 })}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
