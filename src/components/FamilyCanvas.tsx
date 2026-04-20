import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { PERSON_CARD_H, PERSON_CARD_W } from '../state/appState'
import { computeCardAlignmentSnap } from '../utils/alignmentSnap'
import {
  ReactFlow,
  Background,
  Controls,
  SelectionMode,
  ViewportPortal,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'

import '@xyflow/react/dist/style.css'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { AppAction, Edge as AppEdge } from '../state/appState'
import type { NodePosition } from '../state/appState'
import PersonNode from './PersonNode'
import AlignToolbar from './AlignToolbar'
import PhotoLibraryPanel from './PhotoLibraryPanel'
import { layoutDagre } from '../layout/layoutDagre'
import { setReactFlowInstance, getReactFlowInstance } from '../utils/reactFlowBridge'
import { createNewPerson } from '../state/appState'
import { childTargetHandleId, parentSourceHandleId } from '../utils/parentHandles'
import { slotFromSpouseRightHandle, spouseSourceHandleId, spouseTargetHandleId } from '../utils/spouseHandles'
import { computeGenerationByPersonId } from '../utils/generation'

type PersonNodeData = { personId: string; isNewlyAdded?: boolean; generationIndex: number }
type PersonNodeType = Node<PersonNodeData, 'person'>

/** Screen pixels — converted to flow units using zoom for consistent feel while panning/zooming */
const ALIGNMENT_SNAP_SCREEN_PX = 8

/** Whole flow units — avoids subpixel drift between React Flow’s internal drag and persisted state. */
function roundFlowPosition(p: NodePosition): NodePosition {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

function hashColorFromId(id: string) {
  const palette = ['#b08f68', '#8e7f63', '#9f8671', '#7d776a', '#b48a6a', '#8d6f58']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

function strokeWidthNumber(style: Edge['style']): number {
  const sw = style?.strokeWidth
  if (typeof sw === 'number' && !Number.isNaN(sw)) return sw
  if (typeof sw === 'string') {
    const n = parseFloat(sw)
    return Number.isNaN(n) ? 1.5 : n
  }
  return 1.5
}

/** Strong highlight so selected edges are obvious before Delete/Backspace (inline styles override RF defaults). */
function applyEdgeHighlight(e: Edge): Edge {
  const base = { ...(e.style ?? {}) }
  if (!e.selected) {
    return { ...e, style: base }
  }
  const sw = strokeWidthNumber(e.style)
  return {
    ...e,
    style: {
      ...base,
      stroke: '#cf1e1e',
      strokeWidth: sw + 2.75,
      filter: 'drop-shadow(0 0 7px rgba(207, 30, 30, 0.65))',
    },
  }
}

function mergeDerivedEdgesWithSelection(derived: Edge[], selectedIds: Set<string>): Edge[] {
  return derived.map((e) => applyEdgeHighlight({ ...e, selected: selectedIds.has(e.id) }))
}

export default function FamilyCanvas() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [newlyAddedNodeIds, setNewlyAddedNodeIds] = useState<Record<string, true>>({})
  const newNodeHighlightTimeoutsRef = useRef<number[]>([])

  const nodeTypes = useMemo(() => ({ person: PersonNode }), [])

  const generationByPersonId = useMemo(
    () => computeGenerationByPersonId(state.persons, state.edges),
    [state.persons, state.edges],
  )

  const derivedNodes = useMemo<PersonNodeType[]>(
    () =>
      Object.values(state.persons).map((person) => ({
        id: person.id,
        type: 'person' as const,
        position: state.nodePositions[person.id] ?? { x: 0, y: 0 },
        data: {
          personId: person.id,
          isNewlyAdded: !!newlyAddedNodeIds[person.id],
          generationIndex: generationByPersonId[person.id] ?? 0,
        },
        draggable: true,
      })),
    [generationByPersonId, newlyAddedNodeIds, state.persons, state.nodePositions],
  )

  const [nodes, setNodes] = useState<PersonNodeType[]>(derivedNodes)
  useEffect(() => { setNodes(derivedNodes) }, [derivedNodes])

  const [alignmentGuides, setAlignmentGuides] = useState<{
    vertical: { x: number; y1: number; y2: number } | null
    horizontal: { y: number; x1: number; x2: number } | null
    zoom: number
  }>({ vertical: null, horizontal: null, zoom: 1 })

  /** Last aligned positions shown during drag (RF’s internal coords stay unsnapped). */
  const lastAlignedDragPositionsRef = useRef<Record<string, NodePosition>>({})

  useEffect(() => {
    return () => {
      for (const timeoutId of newNodeHighlightTimeoutsRef.current) window.clearTimeout(timeoutId)
      newNodeHighlightTimeoutsRef.current = []
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.key === 'Backspace' || event.key === 'Delete') && state.selectedPersonIds.length > 0) {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        event.preventDefault()
        const ids = state.selectedPersonIds
        dispatch({
          type: '__BATCH',
          payload: {
            label: ids.length > 1 ? `remove ${ids.length} people` : 'remove person',
            actions: ids.map((personId) => ({
              type: 'REMOVE_PERSON',
              payload: { personId },
            })),
          },
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, state.selectedPersonIds])

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false
    const sh = connection.sourceHandle ?? null
    const th = connection.targetHandle ?? null
    if (/^spouse-right-[0-2]$/.test(sh ?? '') && /^spouse-left-[0-2]$/.test(th ?? '')) {
      return sh!.slice('spouse-right-'.length) === th!.slice('spouse-left-'.length)
    }
    if (/^parent-[0-2]$/.test(sh ?? '') && th === 'child') return true
    if (sh === 'to-parent' && /^parent-accept-[0-2]$/.test(th ?? '')) return true
    return false
  }, [])

  const onConnect = useCallback(
    (connection: Connection) => {
      const sh = connection.sourceHandle
      const th = connection.targetHandle
      if (!connection.source || !connection.target) return

      if (/^spouse-right-[0-2]$/.test(sh ?? '') && /^spouse-left-[0-2]$/.test(th ?? '')) {
        const a = connection.source
        const b = connection.target
        if (a === b) return
        const exists = state.edges.some(
          (e) =>
            e.type === 'spouse' &&
            ((e.source === a && e.target === b) || (e.source === b && e.target === a)),
        )
        if (exists) return

        const marriage = { dateISO: undefined as string | undefined, location: undefined as string | undefined }
        const edgeId = crypto.randomUUID()
        const spouseHandleSlot = slotFromSpouseRightHandle(sh)
        const pa = state.persons[a]
        const pb = state.persons[b]
        // Bundle the edge + both marriage-list updates so a single Undo reverses the whole
        // connection rather than three separate steps.
        const batchActions: AppAction[] = [
          {
            type: 'ADD_EDGE',
            payload: {
              edge: {
                id: edgeId,
                source: a,
                target: b,
                type: 'spouse',
                marriage,
                ...(spouseHandleSlot !== undefined ? { spouseHandleSlot } : {}),
              },
            },
          },
        ]
        if (pa) {
          batchActions.push({
            type: 'UPDATE_PERSON',
            payload: {
              personId: a,
              patch: { marriages: [...(pa.marriages ?? []), { spouseId: b, ...marriage }] },
            },
          })
        }
        if (pb) {
          batchActions.push({
            type: 'UPDATE_PERSON',
            payload: {
              personId: b,
              patch: { marriages: [...(pb.marriages ?? []), { spouseId: a, ...marriage }] },
            },
          })
        }
        dispatch({ type: '__BATCH', payload: { actions: batchActions, label: 'add marriage' } })
        return
      }

      let parentId: string
      let childId: string
      if (/^parent-[0-2]$/.test(sh ?? '') && th === 'child') {
        parentId = connection.source
        childId = connection.target
      } else if (sh === 'to-parent' && /^parent-accept-[0-2]$/.test(th ?? '')) {
        childId = connection.source
        parentId = connection.target
      } else {
        return
      }

      if (parentId === childId) return
      const exists = state.edges.some(
        (e) => e.type === 'parent-child' && e.source === parentId && e.target === childId,
      )
      if (exists) return

      dispatch({
        type: 'ADD_EDGE',
        payload: {
          edge: { id: crypto.randomUUID(), source: parentId, target: childId, type: 'parent-child' },
        },
      })
    },
    [dispatch, state.edges, state.persons],
  )

  const derivedFlowEdgesRef = useRef<Edge[]>([])

  const derivedFlowEdges = useMemo<Edge[]>(
    () =>
      state.edges.map((edge: AppEdge) => {
        if (edge.type === 'spouse') {
          const sx = state.nodePositions[edge.source]?.x ?? 0
          const tx = state.nodePositions[edge.target]?.x ?? 0
          const leftId = sx <= tx ? edge.source : edge.target
          const rightId = sx <= tx ? edge.target : edge.source
          const leftPerson = state.persons[leftId]
          const rightPerson = state.persons[rightId]
          const isActivePartnerConnection =
            !!leftPerson?.marriages?.some((m) => m.spouseId === rightId && m.isCurrent) ||
            !!rightPerson?.marriages?.some((m) => m.spouseId === leftId && m.isCurrent)
          return {
            id: edge.id,
            source: leftId,
            target: rightId,
            type: 'straight',
            sourceHandle: spouseSourceHandleId(edge, state.edges),
            targetHandle: spouseTargetHandleId(edge, state.edges),
            style: { stroke: '#a822e5', strokeWidth: 3, strokeDasharray: '4 4' },
            label: isActivePartnerConnection ? 'Active Partner' : undefined,
            labelStyle: isActivePartnerConnection
              ? {
                  fill: '#ffffff',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: 0.3,
                  textTransform: 'uppercase' as const,
                }
              : undefined,
            labelShowBg: isActivePartnerConnection,
            labelBgStyle: isActivePartnerConnection
              ? { fill: '#a822e5', fillOpacity: 1, stroke: '#ffffff', strokeWidth: 0.75 }
              : undefined,
            labelBgPadding: isActivePartnerConnection ? [8, 4] : undefined,
            labelBgBorderRadius: isActivePartnerConnection ? 999 : undefined,
            data: { relationshipType: edge.type, marriage: edge.marriage },
            interactionWidth: 28,
          }
        }

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          sourceHandle: parentSourceHandleId(edge, state.edges, state.nodePositions),
          targetHandle: childTargetHandleId(edge, state.edges, state.nodePositions),
          style: { stroke: hashColorFromId(edge.source), strokeWidth: 3 },
          pathOptions: { borderRadius: 5, offset: 10 },
          data: { relationshipType: edge.type },
          interactionWidth: 28,
        }
      }),
    [state.edges, state.nodePositions],
  )

  derivedFlowEdgesRef.current = derivedFlowEdges

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removals = changes.filter((c) => c.type === 'remove')
      if (removals.length > 0) {
        dispatch({
          type: '__BATCH',
          payload: {
            label:
              removals.length > 1 ? `remove ${removals.length} connections` : 'remove connection',
            actions: removals
              .filter((c) => c.type === 'remove')
              .map((c) => ({ type: 'REMOVE_EDGE', payload: { edgeId: c.id } })),
          },
        })
      }
      const rest = changes.filter((c) => c.type !== 'remove')
      if (rest.length > 0) {
        setRfEdges((eds) => {
          const next = applyEdgeChanges(rest, eds) as Edge[]
          const selectedIds = new Set(next.filter((e) => e.selected).map((e) => e.id))
          return mergeDerivedEdgesWithSelection(derivedFlowEdgesRef.current, selectedIds)
        })
      }
    },
    [dispatch],
  )

  const [rfEdges, setRfEdges] = useState<Edge[]>([])
  useEffect(() => {
    setRfEdges((prev) => {
      const selectedIds = new Set(prev.filter((e) => e.selected).map((e) => e.id))
      return mergeDerivedEdgesWithSelection(derivedFlowEdges, selectedIds)
    })
  }, [derivedFlowEdges])

  const onAutoLayout = useCallback(() => {
    const next = layoutDagre(state.persons, state.edges)
    dispatch({ type: 'SET_NODE_POSITIONS_BULK', payload: { positions: next } })
  }, [dispatch, state.edges, state.persons])

  const addPersonInView = useCallback(() => {
    const rf = getReactFlowInstance()
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    let x = 120
    let y = 120

    if (rf && canvasRect) {
      const centerScreen = {
        x: canvasRect.left + canvasRect.width / 2,
        y: canvasRect.top + canvasRect.height / 2,
      }
      const centerFlow = rf.screenToFlowPosition(centerScreen)
      x = centerFlow.x - PERSON_CARD_W / 2
      y = centerFlow.y - PERSON_CARD_H / 2
    }

    const p = createNewPerson({ shortName: '', fullName: '' })
    dispatch({
      type: '__BATCH',
      payload: {
        label: 'add person',
        actions: [
          { type: 'ADD_PERSON', payload: { person: p, position: { x, y } } },
          { type: 'SET_SELECTED', payload: { personIds: [p.id] } },
        ],
      },
    })

    setNewlyAddedNodeIds((prev) => ({ ...prev, [p.id]: true }))
    const timeoutId = window.setTimeout(() => {
      setNewlyAddedNodeIds((prev) => {
        if (!prev[p.id]) return prev
        const next = { ...prev }
        delete next[p.id]
        return next
      })
      newNodeHighlightTimeoutsRef.current = newNodeHighlightTimeoutsRef.current.filter((id) => id !== timeoutId)
    }, 4000)
    newNodeHighlightTimeoutsRef.current.push(timeoutId)
  }, [dispatch])

  const onNodeDragStart = useCallback(() => {
    lastAlignedDragPositionsRef.current = {}
  }, [])

  const onNodeDrag = useCallback(
    (_: MouseEvent, _node: PersonNodeType, draggedNodes: PersonNodeType[]) => {
      const rf = getReactFlowInstance()
      if (!rf || draggedNodes.length === 0) return

      const zoom = rf.getZoom()
      const thresholdFlow = ALIGNMENT_SNAP_SCREEN_PX / zoom
      const dragIds = new Set(draggedNodes.map((n) => n.id))

      const all = rf.getNodes() as PersonNodeType[]
      const otherTopLefts = all
        .filter((n) => n.type === 'person' && !dragIds.has(n.id))
        .map((n) => ({ x: n.position.x, y: n.position.y }))

      const draggedTopLefts = draggedNodes.map((n) => ({ x: n.position.x, y: n.position.y }))

      const { dx, dy, verticalGuide, horizontalGuide } = computeCardAlignmentSnap(
        draggedTopLefts,
        otherTopLefts,
        PERSON_CARD_W,
        PERSON_CARD_H,
        thresholdFlow,
      )

      if (dx !== 0 || dy !== 0) {
        setNodes((prev) =>
          prev.map((n) => {
            if (!dragIds.has(n.id)) return n
            const d = draggedNodes.find((x) => x.id === n.id)
            if (!d) return n
            return {
              ...n,
              position: roundFlowPosition({ x: d.position.x + dx, y: d.position.y + dy }),
            }
          }),
        )
      }

      for (const d of draggedNodes) {
        lastAlignedDragPositionsRef.current[d.id] = roundFlowPosition({
          x: d.position.x + dx,
          y: d.position.y + dy,
        })
      }

      setAlignmentGuides((prev) => {
        const v = verticalGuide
        const h = horizontalGuide
        const sameV =
          (prev.vertical === null && v === null) ||
          (prev.vertical !== null &&
            v !== null &&
            prev.vertical.x === v.x &&
            prev.vertical.y1 === v.y1 &&
            prev.vertical.y2 === v.y2)
        const sameH =
          (prev.horizontal === null && h === null) ||
          (prev.horizontal !== null &&
            h !== null &&
            prev.horizontal.y === h.y &&
            prev.horizontal.x1 === h.x1 &&
            prev.horizontal.x2 === h.x2)
        if (sameV && sameH && prev.zoom === zoom) return prev
        return { vertical: v, horizontal: h, zoom }
      })
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (_: MouseEvent, _node: PersonNodeType, draggedNodes: PersonNodeType[]) => {
      setAlignmentGuides({ vertical: null, horizontal: null, zoom: 1 })
      const positions: Record<string, NodePosition> = {}
      for (const n of draggedNodes) {
        const aligned = lastAlignedDragPositionsRef.current[n.id]
        positions[n.id] = aligned ?? roundFlowPosition(n.position)
      }
      lastAlignedDragPositionsRef.current = {}
      dispatch({ type: 'SET_NODE_POSITIONS_BULK', payload: { positions } })
      setNodes((prev) =>
        prev.map((n) => {
          const p = positions[n.id]
          return p ? { ...n, position: p } : n
        }),
      )
    },
    [dispatch],
  )

  return (
    <div className="ftCanvas" ref={canvasRef}>
      <div className="ftCanvas__flow">
        <AlignToolbar />
        <ReactFlow
        nodes={nodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        fitView
        nodesDraggable
        nodesConnectable
        deleteKeyCode={['Backspace', 'Delete']}
        panOnScroll
        zoomOnScroll
        panOnDrag
        defaultEdgeOptions={{ selectable: true, focusable: true }}
        edgesReconnectable={false}
        isValidConnection={isValidConnection}
        attributionPosition="bottom-left"
        className="ftReactFlow ftReactFlow--browse"
        onInit={(instance) => setReactFlowInstance(instance)}
        onNodesChange={(changes: NodeChange[]) => {
          const removals = changes.filter((c) => c.type === 'remove')
          if (removals.length > 0) {
            dispatch({
              type: '__BATCH',
              payload: {
                label: removals.length > 1 ? `remove ${removals.length} people` : 'remove person',
                actions: removals.map((c) => ({
                  type: 'REMOVE_PERSON',
                  payload: { personId: c.id },
                })),
              },
            })
          }
          const rest = changes
            .filter((c) => c.type !== 'remove')
            .map((c) => {
              if (c.type === 'position' && c.position) {
                return { ...c, position: roundFlowPosition(c.position) }
              }
              return c
            })
          if (rest.length > 0) setNodes((prev) => applyNodeChanges(rest, prev) as PersonNodeType[])
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={({ nodes: sel }) => {
          const ids = sel.map((n) => (n.data as PersonNodeData).personId)
          if (ids.length === state.selectedPersonIds.length && ids.every((id, i) => id === state.selectedPersonIds[i])) return
          dispatch({ type: 'SET_SELECTED', payload: { personIds: ids } })
        }}
        >
          <Background gap={18} size={1} />
          <ViewportPortal>
            {(alignmentGuides.vertical != null || alignmentGuides.horizontal != null) && (
              <svg
                className="ftAlignmentGuides"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 1,
                  height: 1,
                  overflow: 'visible',
                  pointerEvents: 'none',
                  zIndex: 6,
                }}
                aria-hidden
              >
                {alignmentGuides.vertical != null && (
                  <line
                    x1={alignmentGuides.vertical.x}
                    y1={alignmentGuides.vertical.y1}
                    x2={alignmentGuides.vertical.x}
                    y2={alignmentGuides.vertical.y2}
                    stroke="#e01818"
                    strokeOpacity={0.98}
                    strokeWidth={1.5 / alignmentGuides.zoom}
                    strokeDasharray={`${4.5 / alignmentGuides.zoom} ${4.5 / alignmentGuides.zoom}`}
                    strokeLinecap="round"
                  />
                )}
                {alignmentGuides.horizontal != null && (
                  <line
                    x1={alignmentGuides.horizontal.x1}
                    y1={alignmentGuides.horizontal.y}
                    x2={alignmentGuides.horizontal.x2}
                    y2={alignmentGuides.horizontal.y}
                    stroke="#e01818"
                    strokeOpacity={0.98}
                    strokeWidth={1.5 / alignmentGuides.zoom}
                    strokeDasharray={`${4.5 / alignmentGuides.zoom} ${4.5 / alignmentGuides.zoom}`}
                    strokeLinecap="round"
                  />
                )}
              </svg>
            )}
          </ViewportPortal>
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="ftCanvasSidebar" aria-label="Canvas tools">
        <div className="ftCanvasSidebar__group">
          <div className="ftCanvasSidebar__title">Quick actions</div>
          <div className="ftCanvasSidebar__actions">
            <button className="ftBtn ftBtn--primary" type="button" onClick={addPersonInView}>
              Add Person
            </button>
            <button
              className="ftBtn"
              type="button"
              onClick={onAutoLayout}
              disabled={Object.keys(state.persons).length < 2}
            >
              Auto Layout
            </button>
          </div>
          {state.selectedPersonIds.length < 2 && (
            <div className="ftCanvas__help">
              Drag from card edges to connect: top/bottom = parent-child, sides = marriage. Import photos in the tray,
              then drag a thumbnail onto a card. Click a line and press Delete to remove it.
            </div>
          )}
        </div>
        <PhotoLibraryPanel className="ftPhotoLibraryPanel--embedded" />
      </aside>
    </div>
  )
}
