import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/react'
import { Fragment, useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react'

import { type PhotoTransform, PERSON_CARD_H, PERSON_CARD_W, PERSON_MAIN_OVAL_BOTTOM_INSET } from '../state/appState'
import { useAppDispatch, useAppState } from '../state/AppProvider'
import { getBlob, ingestPersonPhotoBlob } from '../storage/indexedDb'
import { getLibraryPhotoDragId, resolveLibraryPhotoIdFromDrop, setLibraryPhotoDragId } from '../utils/photoLibraryDrag'

type PersonNodeData = { personId: string; isNewlyAdded?: boolean }
type PersonNodeType = FlowNode<PersonNodeData, 'person'>

const STATUS_DOT_COUNT = 3

/** Loads portrait bytes; `contentRevision` busts cache when IndexedDB is overwritten under the same blob key. */
function useBlobUrl(blobKey: string | undefined, contentRevision: number | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  const rev = contentRevision ?? 0

  useEffect(() => {
    if (!blobKey) {
      setUrl(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    ;(async () => {
      const blob = await getBlob(blobKey)
      if (!blob || cancelled) return
      objectUrl = URL.createObjectURL(blob)
      if (!cancelled) setUrl(objectUrl)
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [blobKey, rev])

  return url
}

export default function PersonNode(props: NodeProps<PersonNodeType>) {
  const { personId, isNewlyAdded } = props.data
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]

  const selected = !!props.selected
  const dragging = !!props.dragging

  const mainUrl = useBlobUrl(person?.photoMain?.blobKey, person?.photoRevision)
  const photoMainTransform: PhotoTransform = person?.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

  const [hoveredHandleKey, setHoveredHandleKey] = useState<string | null>(null)

  const onCardDoubleClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (el.closest('.react-flow__handle')) return
      e.stopPropagation()
      dispatch({ type: 'SET_SELECTED', payload: { personIds: [personId] } })
      dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId } })
    },
    [dispatch, personId],
  )

  const onLibraryDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!getLibraryPhotoDragId()) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onLibraryDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      const libId = resolveLibraryPhotoIdFromDrop(e.dataTransfer)
      setLibraryPhotoDragId(null)
      if (!libId || !person) return
      const entry = state.photoLibrary.find((x) => x.id === libId)
      if (!entry) return
      const blob = await getBlob(entry.blobKey)
      if (!blob) return
      const transform = { xPercent: 0, yPercent: 0, scale: 1 }
      try {
        const mainRef = await ingestPersonPhotoBlob({ personId, variant: 'photoMain', sourceBlob: blob, transform })
        const thumbRef = await ingestPersonPhotoBlob({ personId, variant: 'photoThumb', sourceBlob: blob, transform })
        dispatch({ type: 'UPDATE_PERSON', payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } } })
      } catch (err) {
        console.error('Could not apply library photo to this person', err)
      }
    },
    [dispatch, person, personId, state.photoLibrary],
  )
  const displayName = useMemo(
    () => person?.shortName || person?.fullName || 'New Person',
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
      className={`ftPersonCard ${selected ? 'selected' : ''} ${isNewlyAdded ? 'ftPersonCard--new' : ''} ${dragging ? 'ftPersonCard--dragging' : ''}`}
      title={
        !selected
          ? 'Click to select · drag to move · double-click to edit · drag dots to connect · drop a tray photo here'
          : undefined
      }
      onDoubleClick={onCardDoubleClick}
      onDragOver={onLibraryDragOver}
      onDrop={onLibraryDrop}
      style={{
        width: PERSON_CARD_W,
        height: PERSON_CARD_H,
        boxSizing: 'border-box',
        position: 'relative',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
        transition: 'transform 120ms ease-out',
      }}
    >
      {isNewlyAdded ? (
        <div className="ftPersonCard__newBadge" aria-live="polite">
          New
        </div>
      ) : null}

      {/* Oval portrait */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: PERSON_MAIN_OVAL_BOTTOM_INSET,
          borderRadius: '50%',
          overflow: 'hidden',
          border: '3px solid #1b0f0f',
          background: '#d5c2a7',
          pointerEvents: 'none',
          boxShadow: selected
            ? 'var(--card-shadow), 0 0 0 5px color-mix(in srgb, var(--accent), white 18%), 0 0 16px color-mix(in srgb, var(--accent), transparent 45%)'
            : 'var(--card-shadow)',
          transition: 'box-shadow 140ms ease-out',
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
                objectFit: 'contain',
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
          border: selected ? '2px solid color-mix(in srgb, var(--accent), white 20%)' : '2px solid transparent',
          pointerEvents: 'none',
          transition: 'border-color 140ms ease-out',
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
              boxShadow: selected ? '0 0 0 2px color-mix(in srgb, var(--accent), white 20%)' : 'none',
              background: 'transparent',
              transition: 'box-shadow 140ms ease-out',
            }}
          />
        ))}
      </div>

      <div className="ftPersonCard__tooltip" aria-hidden="true">
        Select · drag to move · double-click to edit · drag handles to connect · drop tray photo on card
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
