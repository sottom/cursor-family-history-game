import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  SelectionMode,
  applyNodeChanges,
  type Edge,
  type Node,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'

import '@xyflow/react/dist/style.css'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import { SPOUSE_PAIR_SPACING_X, type Edge as AppEdge } from '../state/appState'
import type { NodePosition } from '../state/appState'
import PersonNode from './PersonNode'
import AlignToolbar from './AlignToolbar'
import { layoutDagre } from '../layout/layoutDagre'
import { setReactFlowInstance, getReactFlowInstance } from '../utils/reactFlowBridge'
import { createNewPerson } from '../state/appState'
import { getSpouseCluster } from '../utils/relationships'

type PersonNodeData = { personId: string }
type PersonNodeType = Node<PersonNodeData, 'person'>

function hashColorFromId(id: string) {
  const palette = ['#b08f68', '#8e7f63', '#9f8671', '#7d776a', '#b48a6a', '#8d6f58']
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

export default function FamilyCanvas() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [isPlacingNode, setIsPlacingNode] = useState(false)

  const nodeTypes = useMemo(() => ({ person: PersonNode }), [])

  const derivedNodes = useMemo<PersonNodeType[]>(
    () =>
      Object.values(state.persons).map((person) => ({
        id: person.id,
        type: 'person' as const,
        position: state.nodePositions[person.id] ?? { x: 0, y: 0 },
        data: { personId: person.id },
        draggable: true,
      })),
    [state.persons, state.nodePositions],
  )

  const [nodes, setNodes] = useState<PersonNodeType[]>(derivedNodes)
  useEffect(() => { setNodes(derivedNodes) }, [derivedNodes])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsPlacingNode(false); return }
      if ((event.key === 'Backspace' || event.key === 'Delete') && state.selectedPersonIds.length > 0) {
        const tag = (event.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        event.preventDefault()
        for (const personId of state.selectedPersonIds) {
          dispatch({ type: 'REMOVE_PERSON', payload: { personId } })
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, state.selectedPersonIds])

  const edges = useMemo<Edge[]>(
    () =>
      state.edges.map((edge: AppEdge) => {
        if (edge.type === 'spouse') {
          const sx = state.nodePositions[edge.source]?.x ?? 0
          const tx = state.nodePositions[edge.target]?.x ?? 0
          const leftId = sx <= tx ? edge.source : edge.target
          const rightId = sx <= tx ? edge.target : edge.source
          return {
            id: edge.id,
            source: leftId,
            target: rightId,
            type: 'straight',
            sourceHandle: 'spouse-right',
            targetHandle: 'spouse-left',
            style: { stroke: '#b79c7a', strokeWidth: 1.5, strokeDasharray: '4 4' },
            data: { relationshipType: edge.type, marriage: edge.marriage },
          }
        }

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          sourceHandle: 'parent',
          targetHandle: 'child',
          style: { stroke: hashColorFromId(edge.source), strokeWidth: 1.6 },
          data: { relationshipType: edge.type },
        }
      }),
    [state.edges, state.nodePositions],
  )

  const onAutoLayout = useCallback(() => {
    const next = layoutDagre(state.persons, state.edges)
    dispatch({ type: 'SET_NODE_POSITIONS_BULK', payload: { positions: next } })
  }, [dispatch, state.edges, state.persons])

  const moveSpouseCluster = useCallback(
    (personId: string, anchorPosition: NodePosition, commitToState: boolean) => {
      const cluster = getSpouseCluster(personId, state.edges)
      if (cluster.length <= 1) {
        if (commitToState) dispatch({ type: 'SET_NODE_POSITION', payload: { personId, position: anchorPosition } })
        return
      }

      const orderedCluster = [...cluster].sort(
        (a, b) => (state.nodePositions[a]?.x ?? 0) - (state.nodePositions[b]?.x ?? 0),
      )
      const anchorIndex = orderedCluster.indexOf(personId)
      const baseX = anchorPosition.x - anchorIndex * SPOUSE_PAIR_SPACING_X
      const nextPositions: Record<string, NodePosition> = {}

      orderedCluster.forEach((id, index) => {
        nextPositions[id] = { x: baseX + index * SPOUSE_PAIR_SPACING_X, y: anchorPosition.y }
      })

      setNodes((prev) =>
        prev.map((node) => (nextPositions[node.id] ? { ...node, position: nextPositions[node.id] } : node)),
      )

      if (commitToState) {
        dispatch({ type: 'SET_NODE_POSITIONS_BULK', payload: { positions: nextPositions } })
      }
    },
    [dispatch, state.edges, state.nodePositions],
  )

  return (
    <div className="ftCanvas">
      <AlignToolbar />
      <button
        className="ftBtn"
        type="button"
        style={{ position: 'absolute', top: 12, right: 12, zIndex: 20, padding: '10px 12px' }}
        onClick={onAutoLayout}
        disabled={Object.keys(state.persons).length < 2}
      >
        Auto Layout
      </button>
      <div className="ftCanvas__actions">
        <button
          className={`ftBtn ${isPlacingNode ? 'ftBtn--primary' : ''}`}
          type="button"
          onClick={() => setIsPlacingNode((prev) => !prev)}
        >
          {isPlacingNode ? 'Cancel Add Person' : 'Add Person'}
        </button>
        <div className="ftCanvas__help">
          {isPlacingNode
            ? 'Click anywhere on the canvas to place the new card. Press Esc to cancel.'
            : 'Select a card to edit it or add parents, spouses, children, and photos.'}
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        fitView
        nodesDraggable
        nodesConnectable
        panOnScroll
        zoomOnScroll
        panOnDrag
        attributionPosition="bottom-left"
        className={`ftReactFlow ${isPlacingNode ? 'ftReactFlow--placing' : 'ftReactFlow--browse'}`}
        onInit={(instance) => setReactFlowInstance(instance)}
        onNodesChange={(changes: NodeChange[]) => {
          const removals = changes.filter((c) => c.type === 'remove')
          for (const c of removals) dispatch({ type: 'REMOVE_PERSON', payload: { personId: c.id } })
          const rest = changes.filter((c) => c.type !== 'remove')
          if (rest.length > 0) setNodes((prev) => applyNodeChanges(rest, prev) as PersonNodeType[])
        }}
        onNodeDragStop={(_, node) => moveSpouseCluster(node.id, node.position as NodePosition, true)}
        onNodeDrag={(_, node) => moveSpouseCluster(node.id, node.position as NodePosition, false)}
        onEdgesChange={(changes: EdgeChange[]) => { void changes }}
        onConnect={(connection) => {
          const sh = connection.sourceHandle
          const th = connection.targetHandle
          if (!sh || !th || !sh.startsWith('parent') || !th.startsWith('child')) return
          dispatch({
            type: 'ADD_EDGE',
            payload: {
              edge: { id: crypto.randomUUID(), source: connection.source, target: connection.target, type: 'parent-child' },
            },
          })
        }}
        onSelectionChange={({ nodes: sel }) => {
          const ids = sel.map((n) => (n.data as PersonNodeData).personId)
          if (ids.length === state.selectedPersonIds.length && ids.every((id, i) => id === state.selectedPersonIds[i])) return
          dispatch({ type: 'SET_SELECTED', payload: { personIds: ids } })
        }}
        onPaneClick={(event) => {
          if ((event.target as HTMLElement | null)?.closest('.react-flow__node')) return
          if (!isPlacingNode) return
          const rf = getReactFlowInstance()
          if (!rf) return
          const { x, y } = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          const p = createNewPerson({ shortName: 'Person', fullName: '' })
          dispatch({ type: 'ADD_PERSON', payload: { person: p, position: { x, y } } })
          dispatch({ type: 'OPEN_PERSON_FORM', payload: { personId: p.id } })
          setIsPlacingNode(false)
        }}
      >
        <Background gap={18} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
