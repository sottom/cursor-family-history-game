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
import { setReactFlowInstance } from '../utils/reactFlowBridge'
import { createNewPerson } from '../state/appState'
import { getReactFlowInstance } from '../utils/reactFlowBridge'
import { getSpouseCluster } from '../utils/relationships'

type PersonNodeData = {
  personId: string
}

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

  // Keep a stable reference for ReactFlow to avoid unnecessary re-renders.
  const nodeTypes = useMemo(() => ({ person: PersonNode }), [])

  const derivedNodes = useMemo<PersonNodeType[]>(() => {
    return Object.values(state.persons).map((person) => {
      const pos = state.nodePositions[person.id] ?? { x: 0, y: 0 }
      return {
        id: person.id,
        type: 'person',
        position: pos,
        data: { personId: person.id },
        draggable: true,
      }
    })
  }, [state.persons, state.nodePositions])

  const [nodes, setNodes] = useState<PersonNodeType[]>(derivedNodes)

  useEffect(() => {
    setNodes(derivedNodes)
  }, [derivedNodes])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPlacingNode(false)
        return
      }

      if ((event.key === 'Backspace' || event.key === 'Delete') && state.selectedPersonIds.length > 0) {
        const activeTag = (event.target as HTMLElement | null)?.tagName
        const isTypingTarget = activeTag === 'INPUT' || activeTag === 'TEXTAREA'
        if (isTypingTarget) return
        event.preventDefault()
        for (const personId of state.selectedPersonIds) {
          dispatch({ type: 'REMOVE_PERSON', payload: { personId } })
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, state.selectedPersonIds])

  const edges = useMemo<Edge[]>(() => {
    const childToParents = new Map<string, Set<string>>()
    for (const e of state.edges) {
      if (e.type !== 'parent-child') continue
      if (!childToParents.has(e.target)) childToParents.set(e.target, new Set())
      childToParents.get(e.target)!.add(e.source)
    }
    const coParentSets = new Map<string, Set<string>>()
    for (const parents of childToParents.values()) {
      for (const p of parents) {
        if (!coParentSets.has(p)) coParentSets.set(p, new Set())
        for (const other of parents) {
          if (other !== p) coParentSets.get(p)!.add(other)
        }
      }
    }

    return state.edges.map((edge: AppEdge) => {
      if (edge.type === 'spouse') {
        const sourceX = state.nodePositions[edge.source]?.x ?? 0
        const targetX = state.nodePositions[edge.target]?.x ?? 0
        const leftId = sourceX <= targetX ? edge.source : edge.target
        const rightId = sourceX <= targetX ? edge.target : edge.source
        return {
          id: edge.id,
          source: leftId,
          target: rightId,
          type: 'straight',
          sourceHandle: 'spouse-right',
          targetHandle: 'spouse-left',
          style: {
            stroke: '#b79c7a',
            strokeWidth: 1.5,
            strokeDasharray: '4 4',
          },
          data: { relationshipType: edge.type, marriage: edge.marriage },
        }
      }

      const useOffset = (coParentSets.get(edge.source)?.size ?? 0) > 1
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        sourceHandle: useOffset
          ? (state.nodePositions[edge.source]?.x ?? 0) <= (state.nodePositions[edge.target]?.x ?? 0)
            ? 'parent-right'
            : 'parent-left'
          : 'parent',
        targetHandle: 'child',
        style: { stroke: hashColorFromId(edge.source), strokeWidth: 1.6 },
        data: { relationshipType: edge.type, marriage: edge.marriage },
      }
    })
  }, [state.edges, state.nodePositions])

  const onAutoLayout = useCallback(() => {
    const next = layoutDagre(state.persons, state.edges)
    dispatch({ type: 'SET_NODE_POSITIONS_BULK', payload: { positions: next } })
  }, [dispatch, state.edges, state.persons])

  const moveSpouseCluster = useCallback(
    (personId: string, anchorPosition: NodePosition, commitToState: boolean) => {
      const cluster = getSpouseCluster(personId, state.edges)
      if (cluster.length <= 1) {
        if (commitToState) {
          dispatch({ type: 'SET_NODE_POSITION', payload: { personId, position: anchorPosition } })
        }
        return
      }

      const orderedCluster = [...cluster].sort(
        (a, b) => (state.nodePositions[a]?.x ?? 0) - (state.nodePositions[b]?.x ?? 0),
      )

      const anchorIndex = orderedCluster.indexOf(personId)
      const baseX = anchorPosition.x - anchorIndex * SPOUSE_PAIR_SPACING_X
      const nextPositions: Record<string, NodePosition> = {}

      orderedCluster.forEach((id, index) => {
        nextPositions[id] = {
          x: baseX + index * SPOUSE_PAIR_SPACING_X,
          y: anchorPosition.y,
        }
      })

      setNodes((prev) =>
        prev.map((node) =>
          nextPositions[node.id]
            ? {
                ...node,
                position: nextPositions[node.id],
              }
            : node,
        ),
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
        selectionOnDrag={true}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode="Shift"
        selectionKeyCode="Shift"
        fitView
        nodesDraggable
        nodesConnectable
        panOnScroll
        zoomOnScroll
        panOnDrag={true}
        attributionPosition="bottom-left"
        className={`ftReactFlow ${isPlacingNode ? 'ftReactFlow--placing' : 'ftReactFlow--browse'}`}
        onInit={(instance) => setReactFlowInstance(instance)}
        onNodesChange={(changes: NodeChange[]) => {
          const removals = changes.filter((change) => change.type === 'remove')
          if (removals.length > 0) {
            for (const change of removals) {
              dispatch({ type: 'REMOVE_PERSON', payload: { personId: change.id } })
            }
          }
          const nonRemoveChanges = changes.filter((change) => change.type !== 'remove')
          if (nonRemoveChanges.length > 0) {
            setNodes((prev) => applyNodeChanges(nonRemoveChanges, prev) as PersonNodeType[])
          }
        }}
        onNodeDragStop={(_, node) => {
          moveSpouseCluster(node.id, node.position as NodePosition, true)
        }}
        onNodeDrag={(_, node) => {
          moveSpouseCluster(node.id, node.position as NodePosition, false)
        }}
        onEdgesChange={(changes: EdgeChange[]) => {
          // For now, ignore edge edits since relationship logic is toolbar-driven later.
          void changes
        }}
        onConnect={(connection) => {
          const sourceHandle = connection.sourceHandle
          const targetHandle = connection.targetHandle
          if (!sourceHandle || !targetHandle) return
          if (!sourceHandle.startsWith('parent') || !targetHandle.startsWith('child')) return

          dispatch({
            type: 'ADD_EDGE',
            payload: {
              edge: {
                id: crypto.randomUUID(),
                source: connection.source,
                target: connection.target,
                type: 'parent-child',
              },
            },
          })
        }}
        onSelectionChange={({ nodes: selectedNodes }) => {
          const personIds = selectedNodes.map((n) => (n.data as PersonNodeData).personId)
          if (
            personIds.length === state.selectedPersonIds.length &&
            personIds.every((id, index) => id === state.selectedPersonIds[index])
          ) {
            return
          }

          dispatch({
            type: 'SET_SELECTED',
            payload: { personIds },
          })
        }}
        onPaneClick={(event) => {
          const target = event.target as HTMLElement | null
          if (target?.closest('.react-flow__node')) return
          if (!isPlacingNode) return
          const rfInstance = getReactFlowInstance()
          if (!rfInstance) return
          const { x, y } = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
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

