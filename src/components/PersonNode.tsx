import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { createNewPerson, type PhotoTransform, PERSON_CARD_H, PERSON_CARD_W, SPOUSE_PAIR_SPACING_X } from '../state/appState'
import { useAppDispatch, useAppState } from '../state/AppProvider'
import { ingestPersonPhotoBlob, getBlob } from '../storage/indexedDb'
import AddChildModal from './AddChildModal'
import AddParentModal from './AddParentModal'

type PersonNodeData = { personId: string; isNewlyAdded?: boolean }
type PersonNodeType = FlowNode<PersonNodeData, 'person'>

const blobUrlCache = new Map<string, string>()
const STATUS_DOT_COUNT = 3

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
  const { personId, isNewlyAdded } = props.data
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]

  const selected = !!props.selected
  const dragging = !!props.dragging
  const isSingleSelected = selected && state.selectedPersonIds.length === 1
  const toolbarVisible = isSingleSelected && !dragging

  const mainUrl = useBlobUrl(person?.photoMain?.blobKey)
  const photoMainTransform: PhotoTransform = person?.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

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

  const displayName = useMemo(
    () => person?.fullName || person?.shortName || 'New Person',
    [person?.fullName, person?.shortName],
  )

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
      className={`ftPersonCard ${selected ? 'selected' : ''} ${isNewlyAdded ? 'ftPersonCard--new' : ''}`}
      title={!selected ? 'Click to select. Then use the toolbar to edit details, add family, or set photos.' : undefined}
      style={{
        width: PERSON_CARD_W,
        height: PERSON_CARD_H,
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Oval portrait */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 44,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid #1b0f0f',
          background: '#d5c2a7',
          pointerEvents: 'none',
          boxShadow: selected
            ? 'var(--card-shadow), 0 0 0 4px var(--accent-bg)'
            : 'var(--card-shadow)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${photoMainTransform.xPercent}%, ${photoMainTransform.yPercent}%)`,
          }}
        >
          {mainUrl ? (
            <img
              src={mainUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: `scale(${photoMainTransform.scale})`,
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

      {/* Name bar */}
      <div
        style={{
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
          pointerEvents: 'none',
        }}
      >
        {displayName}
      </div>

      {/* Transparent status circles */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 2,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {Array.from({ length: STATUS_DOT_COUNT }).map((_, idx) => (
          <div
            key={`${personId}-status-${idx}`}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '3px solid #1b0f0f',
              background: 'transparent',
            }}
          />
        ))}
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
