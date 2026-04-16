import { Handle, Position, type NodeProps, type Node as FlowNode } from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { createNewPerson, type PhotoTransform, PERSON_CARD_H, PERSON_CARD_W, SPOUSE_PAIR_SPACING_X } from '../state/appState'
import { useAppDispatch, useAppState } from '../state/AppProvider'
import { ingestPersonPhotoBlob, getBlob } from '../storage/indexedDb'
import { PHOTO_MAIN_FRAME, PHOTO_THUMB_FRAME } from '../config/cardLayout'

type PersonNodeData = {
  personId: string
}

type PersonNodeType = FlowNode<PersonNodeData, 'person'>

function fmtDateOrEmpty(dateISO?: string) {
  if (!dateISO) return ''
  if (dateISO.length >= 4) return dateISO.slice(0, 10)
  return dateISO
}

function spreadOffset(index: number, step: number) {
  if (index <= 0) return 0
  const slot = Math.ceil(index / 2)
  const side = index % 2 === 1 ? 1 : -1
  return side * slot * step
}

const blobUrlCache = new Map<string, string>()

function useBlobUrl(blobKey?: string) {
  const [url, setUrl] = useState<string | null>(() => (blobKey ? blobUrlCache.get(blobKey) ?? null : null))

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

    return () => {
      cancelled = true
    }
  }, [blobKey])

  return url
}

export default function PersonNode(props: NodeProps<PersonNodeType>) {
  const { personId } = props.data
  const state = useAppState()
  const dispatch = useAppDispatch()
  const person = state.persons[personId]

  const selected = !!props.selected
  const dragging = !!(props as any).dragging
  const isSingleSelected = selected && state.selectedPersonIds.length === 1
  const toolbarVisible = isSingleSelected && !dragging

  const mainUrl = useBlobUrl(person?.photoMain?.blobKey)
  const thumbUrl = useBlobUrl(person?.photoThumb?.blobKey)

  const photoMainTransform: PhotoTransform = person?.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
  const photoThumbTransform: PhotoTransform = person?.photoThumb?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [childSpousePickerOpen, setChildSpousePickerOpen] = useState(false)
  const [parentSpousePickerOpen, setParentSpousePickerOpen] = useState(false)
  const [childParentFilter, setChildParentFilter] = useState('')
  const [existingParentFilter, setExistingParentFilter] = useState('')

  const getDirectSpouses = useCallback((): string[] => {
    const direct = new Set<string>()
    for (const e of state.edges) {
      if (e.type !== 'spouse') continue
      if (e.source === personId) direct.add(e.target)
      if (e.target === personId) direct.add(e.source)
    }
    return [...direct]
  }, [personId, state.edges])

  const getPotentialCoParents = useCallback((): string[] => {
    const direct = new Set(getDirectSpouses())
    return Object.keys(state.persons)
      .filter((id) => id !== personId && !direct.has(id))
      .sort((a, b) => {
        const aLabel = state.persons[a]?.shortName || state.persons[a]?.fullName || ''
        const bLabel = state.persons[b]?.shortName || state.persons[b]?.fullName || ''
        return aLabel.localeCompare(bLabel)
      })
  }, [getDirectSpouses, personId, state.persons])

  const matchesFilter = useCallback(
    (id: string, query: string) => {
      const q = query.trim().toLowerCase()
      if (!q) return true
      const p = state.persons[id]
      const full = (p?.fullName ?? '').toLowerCase()
      const short = (p?.shortName ?? '').toLowerCase()
      return full.includes(q) || short.includes(q)
    },
    [state.persons],
  )

  const filteredDirectSpouses = useMemo(
    () => getDirectSpouses().filter((id) => matchesFilter(id, childParentFilter)),
    [childParentFilter, getDirectSpouses, matchesFilter],
  )

  const filteredPotentialCoParents = useMemo(
    () => getPotentialCoParents().filter((id) => matchesFilter(id, childParentFilter)),
    [childParentFilter, getPotentialCoParents, matchesFilter],
  )

  const setPhotoFromBlob = useCallback(
    async (sourceBlob: Blob) => {
      if (!person) return

      const mainTransform = person.photoMain?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }
      const thumbTransform = person.photoThumb?.transform ?? { xPercent: 0, yPercent: 0, scale: 1 }

      const mainRef = await ingestPersonPhotoBlob({
        personId,
        variant: 'photoMain',
        sourceBlob,
        transform: mainTransform,
      })
      const thumbRef = await ingestPersonPhotoBlob({
        personId,
        variant: 'photoThumb',
        sourceBlob,
        transform: thumbTransform,
      })

      dispatch({
        type: 'UPDATE_PERSON',
        payload: { personId, patch: { photoMain: mainRef, photoThumb: thumbRef } },
      })
    },
    [dispatch, person, personId],
  )

  const onFilesSelected = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      await setPhotoFromBlob(file)
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

  useEffect(() => {
    if (!childSpousePickerOpen && !parentSpousePickerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setChildSpousePickerOpen(false)
        setParentSpousePickerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [childSpousePickerOpen, parentSpousePickerOpen])

  useEffect(() => {
    if (!childSpousePickerOpen) setChildParentFilter('')
  }, [childSpousePickerOpen])

  useEffect(() => {
    if (!parentSpousePickerOpen) setExistingParentFilter('')
  }, [parentSpousePickerOpen])

  const getExistingParents = useCallback((): string[] => {
    return state.edges
      .filter((e) => e.type === 'parent-child' && e.target === personId)
      .map((e) => e.source)
  }, [personId, state.edges])

  const filteredExistingParents = useMemo(
    () => getExistingParents().filter((id) => matchesFilter(id, existingParentFilter)),
    [existingParentFilter, getExistingParents, matchesFilter],
  )

  const createParentAndLink = useCallback(
    (marryExistingParentId?: string) => {
      const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
      const existingParentCount = getExistingParents().length
      const newPerson = createNewPerson({ shortName: 'Parent', fullName: '' })

      let newPos: { x: number; y: number }
      if (marryExistingParentId) {
        const spousePos = state.nodePositions[marryExistingParentId] ?? {
          x: currPos.x + SPOUSE_PAIR_SPACING_X,
          y: currPos.y - (PERSON_CARD_H + 120),
        }
        const existingSpouseIds = state.edges
          .filter((e) => e.type === 'spouse' && (e.source === marryExistingParentId || e.target === marryExistingParentId))
          .map((e) => (e.source === marryExistingParentId ? e.target : e.source))
        const parentX = spousePos.x
        const hasRight = existingSpouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) > parentX)
        const hasLeft = existingSpouseIds.some((id) => (state.nodePositions[id]?.x ?? 0) < parentX)
        let newX: number
        if (!hasRight) newX = parentX + SPOUSE_PAIR_SPACING_X
        else if (!hasLeft) newX = parentX - SPOUSE_PAIR_SPACING_X
        else {
          const maxRight = Math.max(...existingSpouseIds.map((id) => state.nodePositions[id]?.x ?? 0))
          newX = maxRight + SPOUSE_PAIR_SPACING_X
        }
        newPos = { x: newX, y: spousePos.y }
      } else {
        newPos = {
          x: currPos.x + spreadOffset(existingParentCount, Math.floor(SPOUSE_PAIR_SPACING_X * 0.72)),
          y: currPos.y - (PERSON_CARD_H + 120),
        }
      }

      dispatch({ type: 'ADD_PERSON', payload: { person: newPerson, position: newPos } })
      dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: newPerson.id } })
      dispatch({
        type: 'ADD_EDGE',
        payload: {
          edge: { id: crypto.randomUUID(), source: newPerson.id, target: personId, type: 'parent-child' },
        },
      })

      if (marryExistingParentId) {
        const marriage = { dateISO: undefined as string | undefined, location: undefined as string | undefined }
        dispatch({
          type: 'ADD_EDGE',
          payload: {
            edge: {
              id: crypto.randomUUID(),
              source: marryExistingParentId,
              target: newPerson.id,
              type: 'spouse',
              marriage,
            },
          },
        })

        const existingA = state.persons[marryExistingParentId]?.marriages ?? []
        dispatch({
          type: 'UPDATE_PERSON',
          payload: {
            personId: marryExistingParentId,
            patch: { marriages: [...existingA, { spouseId: newPerson.id, ...marriage }] },
          },
        })
        dispatch({
          type: 'UPDATE_PERSON',
          payload: {
            personId: newPerson.id,
            patch: { marriages: [{ spouseId: marryExistingParentId, ...marriage }] },
          },
        })
      }
    },
    [dispatch, getExistingParents, personId, state.edges, state.nodePositions, state.persons],
  )

  const addParent = useCallback(() => {
    const existingParents = getExistingParents()
    if (existingParents.length > 0) {
      setParentSpousePickerOpen(true)
      return
    }
    createParentAndLink()
  }, [createParentAndLink, getExistingParents])

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
    const newPos = { x: newX, y: currPos.y }

    const marriage = { dateISO: undefined as string | undefined, location: undefined as string | undefined }

    dispatch({ type: 'ADD_PERSON', payload: { person: newPerson, position: newPos } })
    dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: newPerson.id } })
    dispatch({
      type: 'ADD_EDGE',
      payload: { edge: { id: crypto.randomUUID(), source: personId, target: newPerson.id, type: 'spouse', marriage } },
    })

    const existingA = person?.marriages ?? []
    const existingB = state.persons[newPerson.id]?.marriages ?? []
    dispatch({
      type: 'UPDATE_PERSON',
      payload: {
        personId,
        patch: { marriages: [...existingA, { spouseId: newPerson.id, ...marriage }] },
      },
    })
    dispatch({
      type: 'UPDATE_PERSON',
      payload: {
        personId: newPerson.id,
        patch: { marriages: [...existingB, { spouseId: personId, ...marriage }] },
      },
    })
  }, [dispatch, getDirectSpouses, person, personId, state.nodePositions, state.persons])

  const createChildForParents = useCallback(
    (parents: string[]) => {
      const uniqueParents = [...new Set(parents)]
      if (uniqueParents.length === 0) return

      const currPos = state.nodePositions[personId] ?? { x: 0, y: 0 }
      const yMax = Math.max(...uniqueParents.map((id) => state.nodePositions[id]?.y ?? currPos.y))
      const xAvg = uniqueParents.reduce((sum, id) => sum + (state.nodePositions[id]?.x ?? currPos.x), 0) / uniqueParents.length

      const targetParentKey = [...uniqueParents].sort().join('|')
      const childParents = new Map<string, Set<string>>()
      for (const edge of state.edges) {
        if (edge.type !== 'parent-child') continue
        if (!childParents.has(edge.target)) childParents.set(edge.target, new Set())
        childParents.get(edge.target)!.add(edge.source)
      }
      let existingSiblingCount = 0
      for (const parentSet of childParents.values()) {
        if ([...parentSet].sort().join('|') === targetParentKey) existingSiblingCount += 1
      }

      const child = createNewPerson({ shortName: 'Child', fullName: '' })
      const childPos = {
        x: xAvg + spreadOffset(existingSiblingCount, Math.floor(SPOUSE_PAIR_SPACING_X * 0.72)),
        y: yMax + PERSON_CARD_H + 120,
      }

      dispatch({ type: 'ADD_PERSON', payload: { person: child, position: childPos } })
      dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: child.id } })

      for (const pId of uniqueParents) {
        dispatch({
          type: 'ADD_EDGE',
          payload: {
            edge: { id: crypto.randomUUID(), source: pId, target: child.id, type: 'parent-child' },
          },
        })
      }
    },
    [dispatch, personId, state.edges, state.nodePositions],
  )

  const addChild = useCallback(() => {
    setChildSpousePickerOpen(true)
  }, [])

  const onOpenEdit = useCallback(() => dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId } }), [dispatch, personId])
  const onOpenAdjustMain = useCallback(
    () => dispatch({ type: 'OPEN_PHOTO_ADJUST', payload: { personId, variant: 'photoMain' } }),
    [dispatch, personId],
  )

  return (
    <div
      className={`ftPersonCard ${selected ? 'selected' : ''}`}
      title={!selected ? 'Click to select. Then use the toolbar to edit details, add family, or set photos.' : undefined}
      style={{
        width: PERSON_CARD_W,
        height: PERSON_CARD_H,
        borderRadius: 14,
        border: selected ? '2px solid var(--accent-border)' : '1px solid var(--border)',
        boxShadow: selected ? '0 0 0 3px var(--accent-bg)' : 'none',
        background: 'color-mix(in srgb, var(--bg), transparent 0%)',
        overflow: 'visible',
        position: 'relative',
      }}
    >
      {/* Connection handles for parent-child edges */}
      <Handle type="target" position={Position.Top} id="child" style={{ background: 'transparent', border: 0 }} />
      <Handle type="target" position={Position.Top} id="child-left" style={{ left: '30%', background: 'transparent', border: 0 }} />
      <Handle type="target" position={Position.Top} id="child-right" style={{ left: '70%', background: 'transparent', border: 0 }} />
      <Handle type="source" position={Position.Bottom} id="parent" style={{ background: 'transparent', border: 0 }} />
      <Handle type="source" position={Position.Bottom} id="parent-left" style={{ left: '30%', background: 'transparent', border: 0 }} />
      <Handle type="source" position={Position.Bottom} id="parent-right" style={{ left: '70%', background: 'transparent', border: 0 }} />
      <Handle type="source" position={Position.Right} id="spouse-right" style={{ background: 'transparent', border: 0 }} />
      <Handle type="target" position={Position.Left} id="spouse-left" style={{ background: 'transparent', border: 0 }} />

      {/* Photo frames */}
      <div
        style={{
          position: 'absolute',
          left: PHOTO_THUMB_FRAME.x,
          top: PHOTO_THUMB_FRAME.y,
          width: PHOTO_THUMB_FRAME.w,
          height: PHOTO_THUMB_FRAME.h,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.03)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `translate(${photoThumbTransform.xPercent}%, ${photoThumbTransform.yPercent}%)`,
          }}
        >
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${photoThumbTransform.scale})` }}
            />
          ) : null}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: PHOTO_MAIN_FRAME.x,
          top: PHOTO_MAIN_FRAME.y,
          width: PHOTO_MAIN_FRAME.w,
          height: PHOTO_MAIN_FRAME.h,
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid var(--border)',
          background: 'rgba(0,0,0,0.03)',
          pointerEvents: 'none',
          zIndex: 0,
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
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${photoMainTransform.scale})` }}
            />
          ) : null}
        </div>
      </div>

      {/* Toolbar */}
      {toolbarVisible ? (
        <div
          className="ftPersonCard__toolbar"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 'calc(100% + 10px)',
            transform: 'translateX(-50%)',
            zIndex: 12,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            justifyContent: 'center',
            pointerEvents: 'auto',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button className="ftNodeBtn" onClick={addParent} type="button">
            + Parent
          </button>
          <button className="ftNodeBtn" onClick={addSpouse} type="button">
            + Spouse
          </button>
          <button className="ftNodeBtn" onClick={addChild} type="button">
            + Child
          </button>
          <button className="ftNodeBtn" onClick={onOpenEdit} type="button">
            Edit
          </button>
          <button
            className="ftNodeBtn"
            onClick={() => fileInputRef.current?.click()}
            type="button"
            aria-label="Set photo"
          >
            Set Photo
          </button>
          <button className="ftNodeBtn" onClick={onOpenAdjustMain} type="button">
            Adjust Photo
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => void onFilesSelected(e.target.files)}
          />
        </div>
      ) : null}

      {!toolbarVisible ? (
        <div className="ftPersonCard__tooltip" aria-hidden="true">
          Click to select, then edit, add family, or set photos.
        </div>
      ) : null}

      {childSpousePickerOpen
        ? createPortal(
            <div
              className="ftModalBackdrop"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setChildSpousePickerOpen(false)
              }}
            >
              <div className="ftModal" style={{ width: 'min(560px, 100%)' }}>
                <div className="ftModal__header">
                  <div className="ftModal__title">Add Child</div>
                  <button className="ftIconBtn" onClick={() => setChildSpousePickerOpen(false)} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="ftModal__body" style={{ display: 'grid', gap: 12 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Who are the parents of this child? You can pick an existing person on the canvas.
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="text"
                      value={childParentFilter}
                      onChange={(e) => setChildParentFilter(e.target.value)}
                      placeholder="Type a name to filter parents..."
                      className="ftInput"
                    />
                    {filteredDirectSpouses.map((spouseId) => {
                      const spouse = state.persons[spouseId]
                      const spouseLabel = spouse?.shortName || spouse?.fullName || 'Unnamed spouse'
                      return (
                        <button
                          key={spouseId}
                          className="ftBtn"
                          style={{ textAlign: 'left', padding: '10px 12px' }}
                          onClick={() => {
                            createChildForParents([personId, spouseId])
                            setChildSpousePickerOpen(false)
                          }}
                          type="button"
                        >
                          {person?.shortName || person?.fullName || 'This person'} &amp; {spouseLabel}
                        </button>
                      )
                    })}
                    {filteredPotentialCoParents.map((otherParentId) => {
                      const other = state.persons[otherParentId]
                      const otherLabel = other?.shortName || other?.fullName || 'Unnamed'
                      return (
                        <button
                          key={otherParentId}
                          className="ftBtn"
                          style={{ textAlign: 'left', padding: '10px 12px' }}
                          onClick={() => {
                            createChildForParents([personId, otherParentId])
                            setChildSpousePickerOpen(false)
                          }}
                          type="button"
                        >
                          {person?.shortName || person?.fullName || 'This person'} &amp; {otherLabel}
                        </button>
                      )
                    })}
                    <button
                      className="ftBtn"
                      style={{ textAlign: 'left', padding: '10px 12px' }}
                      onClick={() => {
                        createChildForParents([personId])
                        setChildSpousePickerOpen(false)
                      }}
                      type="button"
                    >
                      Just {person?.shortName || person?.fullName || 'this person'}
                    </button>
                    {filteredDirectSpouses.length === 0 && filteredPotentialCoParents.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>No matching people found.</div>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="ftBtn" type="button" onClick={() => setChildSpousePickerOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {parentSpousePickerOpen
        ? createPortal(
            <div
              className="ftModalBackdrop"
              role="dialog"
              aria-modal="true"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setParentSpousePickerOpen(false)
              }}
            >
              <div className="ftModal" style={{ width: 'min(560px, 100%)' }}>
                <div className="ftModal__header">
                  <div className="ftModal__title">New Parent</div>
                  <button className="ftIconBtn" onClick={() => setParentSpousePickerOpen(false)} aria-label="Close">
                    ×
                  </button>
                </div>
                <div className="ftModal__body" style={{ display: 'grid', gap: 12 }}>
                  <div style={{ fontSize: 14, color: 'var(--text)' }}>
                    Is this new parent married to one of the existing parents?
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="text"
                      value={existingParentFilter}
                      onChange={(e) => setExistingParentFilter(e.target.value)}
                      placeholder="Type a name to filter existing parents..."
                      className="ftInput"
                    />
                    {filteredExistingParents.map((parentId) => {
                      const parent = state.persons[parentId]
                      const parentLabel = parent?.shortName || parent?.fullName || 'Unnamed'
                      return (
                        <button
                          key={parentId}
                          className="ftBtn"
                          style={{ textAlign: 'left', padding: '10px 12px' }}
                          onClick={() => {
                            createParentAndLink(parentId)
                            setParentSpousePickerOpen(false)
                          }}
                          type="button"
                        >
                          Yes, married to {parentLabel}
                        </button>
                      )
                    })}
                    {filteredExistingParents.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>No matching parents found.</div>
                    ) : null}
                    <button
                      className="ftBtn"
                      style={{ textAlign: 'left', padding: '10px 12px' }}
                      onClick={() => {
                        createParentAndLink()
                        setParentSpousePickerOpen(false)
                      }}
                      type="button"
                    >
                      No, separate parent
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="ftBtn" type="button" onClick={() => setParentSpousePickerOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Text content */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          top: PHOTO_MAIN_FRAME.y + PHOTO_MAIN_FRAME.h + 8,
          bottom: 10,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div style={{ fontWeight: 900, color: 'var(--text-h)', fontSize: 14, lineHeight: 1.05 }}>
          {person?.fullName || person?.shortName || 'New Person'}
        </div>
        {person?.shortName && person.shortName !== person.fullName ? (
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.2 }}>
            Short: <span style={{ color: 'var(--text-h)', fontWeight: 700 }}>{person.shortName}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          Born: {fmtDateOrEmpty(person?.dob?.dateISO)} {person?.dob?.location ? `• ${person.dob.location}` : ''}
        </div>

        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          {person?.marriages?.length ? (
            <>
              Marriages:{' '}
              {person.marriages
                .slice(0, 2)
                .map((m) => {
                  const spouse = state.persons[m.spouseId]
                  const spouseName = spouse?.shortName || spouse?.fullName || m.spouseId
                  const d = fmtDateOrEmpty(m.dateISO)
                  const loc = m.location ? ` • ${m.location}` : ''
                  const cur = m.isCurrent ? ' ✓' : ''
                  return `${spouseName}${cur}${d ? ` (${d})` : ''}${loc}`
                })
                .join('; ')}
              {person.marriages.length > 2 ? ` (+${person.marriages.length - 2} more)` : ''}
            </>
          ) : (
            'Marriages: —'
          )}
        </div>

        <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text)', lineHeight: 1.25 }}>
          Died: {fmtDateOrEmpty(person?.dod?.dateISO)} {person?.dod?.location ? `• ${person.dod.location}` : ''}
        </div>

        {person?.notes ? (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text)', opacity: 0.9, lineHeight: 1.2 }}>
            {person.notes.slice(0, 155)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

