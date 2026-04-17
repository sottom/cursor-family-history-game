export type PhotoTransform = {
  xPercent: number
  yPercent: number
  scale: number
}

export type PhotoRef = {
  blobKey: string
  transform: PhotoTransform
}

export type PersonDate = {
  dateISO?: string
  location?: string
}

export type MarriageEntry = {
  spouseId: string
  dateISO?: string
  location?: string
  isCurrent?: boolean
}

export type Person = {
  id: string
  fullName: string
  shortName: string
  dob: PersonDate
  marriages: MarriageEntry[]
  dod: PersonDate
  notes?: string
  photoMain?: PhotoRef
  photoThumb?: PhotoRef
  /** Bumps when portrait/thumbnail refs are updated (including same-key blob overwrite in IndexedDB). */
  photoRevision?: number
}

export type EdgeType = 'parent-child' | 'spouse'

export type Edge = {
  id: string
  source: string
  target: string
  type: EdgeType
  /**
   * Marriage metadata is stored on spouse edges so exports can reproduce the relationship history.
   * For parent-child edges this is unused.
   */
  marriage?: {
    dateISO?: string
    location?: string
  }
  /**
   * Which vertical marriage-dot pair (0–2) this edge uses; set when connecting. Older graphs omit this.
   */
  spouseHandleSlot?: 0 | 1 | 2
}

export type NodePosition = { x: number; y: number }

/** User-imported images; blobs stored in IndexedDB at `blobKey`. */
export type PhotoLibraryEntry = {
  id: string
  name: string
  blobKey: string
}

export type AppState = {
  version: 1
  persons: Record<string, Person>
  edges: Edge[]
  nodePositions: Record<string, NodePosition>
  selectedPersonIds: string[]
  photoLibrary: PhotoLibraryEntry[]
  ui: {
    hasSeenTour: boolean
    personForm: { personId: string } | null
    groupingOverrides: Partial<Record<GroupingKind, { boundaries: [number, number, number] }>>
  }
}

export type AlignMode = 'left' | 'cx' | 'right' | 'top' | 'cy' | 'bottom'
export type DistributeMode = 'h' | 'v'

// Placeholder card dimensions. These must match `PersonNode` in canvas for perfect alignment.
export const PERSON_CARD_W = 220
export const PERSON_CARD_H = 340
export const SPOUSE_GAP = 28
export const SPOUSE_PAIR_SPACING_X = PERSON_CARD_W + SPOUSE_GAP

export type GroupingKind = 'birth' | 'marriage' | 'death'

export type AppAction =
  | {
      type: 'ADD_PERSON'
      payload: { person: Person; position: NodePosition }
    }
  | {
      type: 'UPDATE_PERSON'
      payload: { personId: string; patch: Partial<Person> }
    }
  | {
      type: 'REMOVE_PERSON'
      payload: { personId: string }
    }
  | {
      type: 'SET_NODE_POSITION'
      payload: { personId: string; position: NodePosition }
    }
  | {
      type: 'SET_NODE_POSITIONS_BULK'
      payload: { positions: Record<string, NodePosition> }
    }
  | {
      type: 'ADD_EDGE'
      payload: { edge: Edge }
    }
  | {
      type: 'REMOVE_EDGE'
      payload: { edgeId: string }
    }
  | {
      type: 'SET_SELECTED'
      payload: { personIds: string[] }
    }
  | {
      type: 'ALIGN_SELECTED'
      payload: { mode: AlignMode; personIds: string[] }
    }
  | {
      type: 'DISTRIBUTE_SELECTED'
      payload: { axis: DistributeMode; personIds: string[] }
    }
  | {
      type: 'SET_HAS_SEEN_TOUR'
      payload: { value: boolean }
    }
  | {
      type: 'SET_GROUPING_BOUNDARIES'
      payload: { kind: GroupingKind; boundaries: [number, number, number] }
    }
  | {
      type: 'OPEN_PERSON_FORM'
      payload: { personId: string }
    }
  | {
      type: 'CLOSE_PERSON_FORM'
    }
  | {
      type: 'SET_STATE'
      payload: { state: AppState }
    }
  | {
      type: 'ADD_PHOTO_LIBRARY_ITEMS'
      payload: { entries: PhotoLibraryEntry[] }
    }
  | { type: 'CLEAR_PHOTO_LIBRARY' }

export function createNewPerson(params?: Partial<Pick<Person, 'fullName' | 'shortName' | 'dob' | 'dod' | 'notes'>>): Person {
  const id = crypto.randomUUID()
  return {
    id,
    fullName: params?.fullName ?? '',
    shortName: params?.shortName ?? '',
    dob: params?.dob ?? {},
    marriages: [],
    dod: params?.dod ?? {},
    notes: params?.notes ?? '',
    photoMain: undefined,
    photoThumb: undefined,
  }
}

/** Ensures newer fields exist when hydrating older saved state. */
export function normalizeAppState(state: AppState): AppState {
  return {
    ...state,
    photoLibrary: Array.isArray(state.photoLibrary) ? state.photoLibrary : [],
  }
}

export function createInitialAppState(): AppState {
  return {
    version: 1,
    persons: {},
    edges: [],
    nodePositions: {},
    selectedPersonIds: [],
    photoLibrary: [],
    ui: {
      hasSeenTour: false,
      personForm: null,
      groupingOverrides: {},
    },
  }
}

function alignValue(mode: AlignMode, positions: NodePosition[]): number {
  // alignValue returns the target coordinate in the node-position coordinate system.
  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  switch (mode) {
    case 'left':
      return minX
    case 'right':
      return maxX
    case 'cx': {
      const minCx = minX + PERSON_CARD_W / 2
      const maxCx = maxX + PERSON_CARD_W / 2
      const targetCx = (minCx + maxCx) / 2
      return targetCx - PERSON_CARD_W / 2
    }
    case 'top':
      return minY
    case 'bottom':
      return maxY
    case 'cy': {
      const minCy = minY + PERSON_CARD_H / 2
      const maxCy = maxY + PERSON_CARD_H / 2
      const targetCy = (minCy + maxCy) / 2
      return targetCy - PERSON_CARD_H / 2
    }
  }
}

function distributePositions(
  axis: DistributeMode,
  personIds: string[],
  nodePositions: Record<string, NodePosition>,
): Record<string, NodePosition> {
  const sorted = [...personIds].sort((a, b) => {
    const pa = nodePositions[a]
    const pb = nodePositions[b]
    if (!pa || !pb) return 0
    return axis === 'h' ? pa.x - pb.x : pa.y - pb.y
  })

  if (sorted.length <= 2) {
    return {}
  }

  const outer = sorted[0]
  const inner = sorted[sorted.length - 1]
  const start = nodePositions[outer]
  const end = nodePositions[inner]
  if (!start || !end) return {}

  const result: Record<string, NodePosition> = {}
  const steps = sorted.length - 1
  for (let i = 0; i < sorted.length; i++) {
    const id = sorted[i]
    const base = nodePositions[id]
    if (!base) continue
    if (axis === 'h') {
      const nextX = start.x + ((end.x - start.x) * i) / steps
      result[id] = { ...base, x: nextX }
    } else {
      const nextY = start.y + ((end.y - start.y) * i) / steps
      result[id] = { ...base, y: nextY }
    }
  }

  return result
}

function findNonOverlappingPosition(
  desired: NodePosition,
  existing: Record<string, NodePosition>,
  excludeId?: string,
): NodePosition {
  const PAD_X = 20
  const PAD_Y = 20

  function overlaps(pos: NodePosition): boolean {
    for (const [id, ep] of Object.entries(existing)) {
      if (id === excludeId) continue
      const dx = Math.abs(pos.x - ep.x)
      const dy = Math.abs(pos.y - ep.y)
      if (dx < PERSON_CARD_W + PAD_X && dy < PERSON_CARD_H + PAD_Y) return true
    }
    return false
  }

  if (!overlaps(desired)) return desired

  const step = PERSON_CARD_W + PAD_X
  for (let ring = 1; ring <= 8; ring++) {
    const offsets = [
      { x: ring * step, y: 0 },
      { x: -ring * step, y: 0 },
      { x: ring * step, y: desired.y >= 0 ? -(PERSON_CARD_H + PAD_Y) : PERSON_CARD_H + PAD_Y },
      { x: -ring * step, y: desired.y >= 0 ? -(PERSON_CARD_H + PAD_Y) : PERSON_CARD_H + PAD_Y },
    ]
    for (const off of offsets) {
      const candidate = { x: desired.x + off.x, y: desired.y + off.y }
      if (!overlaps(candidate)) return candidate
    }
  }

  return { x: desired.x + PERSON_CARD_W + PAD_X, y: desired.y }
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_PERSON': {
      const { person, position } = action.payload
      const safePos = findNonOverlappingPosition(position, state.nodePositions, person.id)
      return {
        ...state,
        persons: { ...state.persons, [person.id]: person },
        nodePositions: { ...state.nodePositions, [person.id]: safePos },
        selectedPersonIds: [person.id],
      }
    }
    case 'UPDATE_PERSON': {
      const { personId, patch } = action.payload
      const existing = state.persons[personId]
      if (!existing) return state
      const merged: Person = { ...existing, ...patch }
      if (patch.photoMain !== undefined || patch.photoThumb !== undefined) {
        merged.photoRevision = (existing.photoRevision ?? 0) + 1
      }
      return {
        ...state,
        persons: { ...state.persons, [personId]: merged },
      }
    }
    case 'REMOVE_PERSON': {
      const { personId } = action.payload
      if (!state.persons[personId]) return state
      const nextPersons = { ...state.persons }
      delete nextPersons[personId]
      const nextPositions = { ...state.nodePositions }
      delete nextPositions[personId]
      const nextEdges = state.edges.filter((e) => e.source !== personId && e.target !== personId)
      const nextSelected = state.selectedPersonIds.filter((id) => id !== personId)
      return {
        ...state,
        persons: nextPersons,
        nodePositions: nextPositions,
        edges: nextEdges,
        selectedPersonIds: nextSelected,
      }
    }
    case 'SET_NODE_POSITION': {
      const { personId, position } = action.payload
      return {
        ...state,
        nodePositions: { ...state.nodePositions, [personId]: position },
      }
    }
    case 'SET_NODE_POSITIONS_BULK': {
      return { ...state, nodePositions: { ...state.nodePositions, ...action.payload.positions } }
    }
    case 'ADD_EDGE': {
      const { edge } = action.payload
      if (edge.type === 'parent-child') {
        const dup = state.edges.some(
          (e) => e.type === 'parent-child' && e.source === edge.source && e.target === edge.target,
        )
        if (dup) return state
      }
      if (edge.type === 'spouse') {
        const dup = state.edges.some(
          (e) =>
            e.type === 'spouse' &&
            ((e.source === edge.source && e.target === edge.target) ||
              (e.source === edge.target && e.target === edge.source)),
        )
        if (dup) return state
      }
      return {
        ...state,
        edges: [...state.edges, edge],
      }
    }
    case 'REMOVE_EDGE': {
      const { edgeId } = action.payload
      const removed = state.edges.find((e) => e.id === edgeId)
      let persons = state.persons
      if (removed?.type === 'spouse') {
        const a = removed.source
        const b = removed.target
        let nextPersons = { ...state.persons }
        const strip = (personId: string, spouseId: string) => {
          const p = nextPersons[personId]
          if (!p) return
          nextPersons = {
            ...nextPersons,
            [personId]: {
              ...p,
              marriages: (p.marriages ?? []).filter((m) => m.spouseId !== spouseId),
            },
          }
        }
        strip(a, b)
        strip(b, a)
        persons = nextPersons
      }
      return {
        ...state,
        persons,
        edges: state.edges.filter((e) => e.id !== edgeId),
      }
    }
    case 'SET_SELECTED': {
      const nextIds = action.payload.personIds
      if (
        nextIds.length === state.selectedPersonIds.length &&
        nextIds.every((id, index) => id === state.selectedPersonIds[index])
      ) {
        return state
      }
      return { ...state, selectedPersonIds: nextIds }
    }
    case 'ALIGN_SELECTED': {
      const { mode, personIds } = action.payload
      const positions = personIds.map((id) => state.nodePositions[id]).filter(Boolean) as NodePosition[]
      if (positions.length !== personIds.length) return state
      const target = alignValue(mode, positions)
      const updated: Record<string, NodePosition> = {}
      for (const id of personIds) {
        const base = state.nodePositions[id]
        if (!base) continue
        if (mode === 'left' || mode === 'cx' || mode === 'right') {
          updated[id] = { ...base, x: target }
        } else {
          updated[id] = { ...base, y: target }
        }
      }
      return { ...state, nodePositions: { ...state.nodePositions, ...updated } }
    }
    case 'DISTRIBUTE_SELECTED': {
      const { axis, personIds } = action.payload
      const updates = distributePositions(axis, personIds, state.nodePositions)
      if (Object.keys(updates).length === 0) return state
      return { ...state, nodePositions: { ...state.nodePositions, ...updates } }
    }
    case 'SET_HAS_SEEN_TOUR':
      return { ...state, ui: { ...state.ui, hasSeenTour: action.payload.value } }
    case 'SET_GROUPING_BOUNDARIES':
      return {
        ...state,
        ui: {
          ...state.ui,
          groupingOverrides: {
            ...state.ui.groupingOverrides,
            [action.payload.kind]: { boundaries: action.payload.boundaries },
          },
        },
      }
    case 'OPEN_PERSON_FORM':
      return { ...state, ui: { ...state.ui, personForm: { personId: action.payload.personId } } }
    case 'CLOSE_PERSON_FORM':
      return { ...state, ui: { ...state.ui, personForm: null } }
    case 'SET_STATE':
      return normalizeAppState(action.payload.state)
    case 'ADD_PHOTO_LIBRARY_ITEMS': {
      const { entries } = action.payload
      if (entries.length === 0) return state
      return { ...state, photoLibrary: [...(state.photoLibrary ?? []), ...entries] }
    }
    case 'CLEAR_PHOTO_LIBRARY':
      return { ...state, photoLibrary: [] }
    default:
      return state
  }
}

