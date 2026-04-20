import type { AppAction, AppState } from './appState'

/**
 * Wraps {@link AppState} with undo/redo history. History entries carry a human-readable label
 * so the UI can show what a given undo/redo will revert ("Undo remove person", etc.).
 *
 * Design notes:
 * - Selection, open person form, and other ephemeral UI flags are intentionally *not* treated
 *   as undoable. Changing selection doesn't pollute history; text edits and structural changes
 *   do.
 * - Rapid keystroke-style edits are coalesced into a single history entry so one Cmd+Z reverts
 *   a whole word you just typed instead of a single character.
 * - `SET_STATE` (sample loader, hydration from IndexedDB) clears history — it's a fresh session.
 */
export type HistoryEntry = {
  state: AppState
  /** Label describing the action that *produced* this state. */
  label: string
}

export type HistoryState = {
  past: HistoryEntry[]
  present: HistoryEntry
  future: HistoryEntry[]
  /**
   * The coalesce key of the action that produced `present`, if any. Subsequent actions with the
   * same key and within the debounce window will update `present` in place rather than pushing a
   * new history entry.
   */
  lastCoalesceKey: string | null
  lastCoalesceAt: number
}

export type HistoryMetaAction =
  | { type: '__UNDO' }
  | { type: '__REDO' }
  | { type: '__CLEAR_HISTORY' }

export type HistoryAction = AppAction | HistoryMetaAction

type Classification =
  | { kind: 'commit'; label: string }
  | { kind: 'coalesce'; key: string; label: string }
  | { kind: 'ignore'; breakCoalesce: boolean }
  | { kind: 'reset' }

/**
 * Patch shapes that come from text/number inputs and should coalesce during rapid editing.
 * Keys are sorted-join signatures of Object.keys(patch).
 */
const TEXT_PATCH_SIGNATURES = new Set<string>([
  'fullName',
  'shortName',
  'notes',
  'dob',
  'dod',
  'marriages',
  'photoMain,photoThumb',
])

function patchSignature(patch: Record<string, unknown> | undefined): string {
  if (!patch) return ''
  return Object.keys(patch).sort().join(',')
}

function classifyAction(action: HistoryAction): Classification {
  switch (action.type) {
    case '__UNDO':
    case '__REDO':
    case '__CLEAR_HISTORY':
      // Meta actions are handled before classify() is consulted; this branch is unreachable.
      return { kind: 'ignore', breakCoalesce: false }

    case 'SET_STATE':
      return { kind: 'reset' }

    // Pure UI state: never appears on the undo stack and doesn't interrupt coalescing.
    case 'SET_SELECTED':
      return { kind: 'ignore', breakCoalesce: false }

    // Opening/closing the editor is a natural boundary between logical edits.
    case 'OPEN_PERSON_FORM':
    case 'CLOSE_PERSON_FORM':
    case 'SET_HAS_SEEN_TOUR':
      return { kind: 'ignore', breakCoalesce: true }

    case 'ADD_PERSON':
      return { kind: 'commit', label: 'add person' }
    case 'REMOVE_PERSON':
      // Bulk delete dispatches one REMOVE_PERSON per selected card in a tight loop; coalesce so
      // a single undo restores them all.
      return { kind: 'coalesce', key: 'remove-person-batch', label: 'remove person' }
    case 'UPDATE_PERSON': {
      const sig = patchSignature(action.payload.patch as Record<string, unknown> | undefined)
      if (TEXT_PATCH_SIGNATURES.has(sig)) {
        return {
          kind: 'coalesce',
          key: `update:${action.payload.personId}:${sig}`,
          label: 'edit person',
        }
      }
      return { kind: 'commit', label: 'edit person' }
    }
    case 'SET_NODE_POSITION':
    case 'SET_NODE_POSITIONS_BULK':
      return { kind: 'commit', label: 'move' }
    case 'ADD_EDGE':
      return { kind: 'commit', label: 'add connection' }
    case 'REMOVE_EDGE':
      return { kind: 'commit', label: 'remove connection' }
    case 'ALIGN_SELECTED':
      return { kind: 'commit', label: 'align' }
    case 'DISTRIBUTE_SELECTED':
      return { kind: 'commit', label: 'distribute' }
    case 'SET_GROUPING_BOUNDARIES':
      return { kind: 'commit', label: 'update grouping' }
    case 'ADD_PHOTO_LIBRARY_ITEMS':
      return { kind: 'commit', label: 'add photos' }
    case 'CLEAR_PHOTO_LIBRARY':
      return { kind: 'commit', label: 'clear photo library' }
    case '__BATCH': {
      return { kind: 'commit', label: action.payload.label ?? 'change' }
    }
  }
}

export type HistoryConfig = {
  /** Maximum number of past entries retained. Oldest entries drop off first. */
  limit?: number
  /** Maximum time (ms) between two actions sharing a coalesce key that still merges. */
  coalesceWindowMs?: number
}

const INITIAL_LABEL = ''

export function createInitialHistoryState(initial: AppState): HistoryState {
  return {
    past: [],
    present: { state: initial, label: INITIAL_LABEL },
    future: [],
    lastCoalesceKey: null,
    lastCoalesceAt: 0,
  }
}

/**
 * Returns a reducer that wraps the given app reducer with past/present/future history. The
 * returned reducer accepts the base {@link AppAction}s plus meta actions for undo/redo/clear.
 */
export function withHistory(
  reducer: (state: AppState, action: AppAction) => AppState,
  config: HistoryConfig = {},
): (state: HistoryState, action: HistoryAction) => HistoryState {
  const limit = config.limit ?? 100
  const coalesceWindowMs = config.coalesceWindowMs ?? 700

  return function historyReducer(state, action) {
    if (action.type === '__UNDO') {
      if (state.past.length === 0) return state
      const previous = state.past[state.past.length - 1]
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      }
    }

    if (action.type === '__REDO') {
      if (state.future.length === 0) return state
      const next = state.future[0]
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      }
    }

    if (action.type === '__CLEAR_HISTORY') {
      return {
        past: [],
        present: state.present,
        future: [],
        lastCoalesceKey: null,
        lastCoalesceAt: 0,
      }
    }

    const appAction = action as AppAction
    const classification = classifyAction(appAction)

    if (classification.kind === 'reset') {
      const nextState = reducer(state.present.state, appAction)
      return createInitialHistoryState(nextState)
    }

    const nextState = reducer(state.present.state, appAction)

    // No observable change — don't even note a timestamp.
    if (nextState === state.present.state) {
      if (classification.kind === 'ignore' && classification.breakCoalesce) {
        return state.lastCoalesceKey == null
          ? state
          : { ...state, lastCoalesceKey: null, lastCoalesceAt: 0 }
      }
      return state
    }

    if (classification.kind === 'ignore') {
      return {
        ...state,
        present: { state: nextState, label: state.present.label },
        lastCoalesceKey: classification.breakCoalesce ? null : state.lastCoalesceKey,
        lastCoalesceAt: classification.breakCoalesce ? 0 : state.lastCoalesceAt,
      }
    }

    const now = Date.now()

    // Coalesce: extend the current present without pushing a new past entry.
    if (
      classification.kind === 'coalesce' &&
      state.lastCoalesceKey === classification.key &&
      now - state.lastCoalesceAt < coalesceWindowMs
    ) {
      return {
        ...state,
        present: { state: nextState, label: state.present.label || classification.label },
        future: [], // any new edit invalidates redo
        lastCoalesceAt: now,
      }
    }

    // Commit: push the prior present onto past, start a new present.
    const trimmedPast =
      state.past.length >= limit ? state.past.slice(state.past.length - limit + 1) : state.past
    const nextPast = [...trimmedPast, state.present]

    return {
      past: nextPast,
      present: { state: nextState, label: classification.label },
      future: [],
      lastCoalesceKey: classification.kind === 'coalesce' ? classification.key : null,
      lastCoalesceAt: classification.kind === 'coalesce' ? now : 0,
    }
  }
}
