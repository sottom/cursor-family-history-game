import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'

import type { AppAction, AppState } from './appState'
import { appReducer, createInitialAppState } from './appState'
import { buildFourGenerationSampleState } from './defaultSampleTree'
import { loadAppState, saveAppState } from '../storage/indexedDb'
import {
  createInitialHistoryState,
  withHistory,
  type HistoryAction,
} from './history'

const AppStateContext = createContext<AppState | null>(null)
const AppDispatchContext = createContext<((action: AppAction) => void) | null>(null)
const PersistStatusContext = createContext<'idle' | 'saving' | 'saved' | 'error'>('idle')

export type AppHistoryValue = {
  canUndo: boolean
  canRedo: boolean
  /** Human-readable label for what undo will revert ("edit person", "remove person"...). */
  undoLabel: string | null
  /** Human-readable label for the action redo will re-apply. */
  redoLabel: string | null
  undo: () => void
  redo: () => void
}

const AppHistoryContext = createContext<AppHistoryValue | null>(null)

const historyReducer = withHistory(appReducer, { limit: 100, coalesceWindowMs: 700 })

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [history, historyDispatch] = useReducer(
    historyReducer,
    undefined,
    () => createInitialHistoryState(createInitialAppState()),
  )

  const state = history.present.state

  // Narrow the dispatch surface exposed to existing call sites to AppAction only. Undo/redo
  // flow through the dedicated history context.
  const dispatch = useCallback((action: AppAction) => {
    historyDispatch(action as HistoryAction)
  }, [])

  const [persistStatus, setPersistStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const didHydrateRef = useRef(false)

  // Hydrate once on mount. SET_STATE resets history — exactly what we want on fresh load.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await loadAppState()
      if (cancelled) return
      historyDispatch({
        type: 'SET_STATE',
        payload: { state: loaded ?? buildFourGenerationSampleState() },
      })
      didHydrateRef.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced save on state changes. Persist only the live app state; the history stack itself
  // is session-local so past undo chains don't bleed into a fresh session.
  useEffect(() => {
    if (!didHydrateRef.current) return
    setPersistStatus('saving')
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveAppState(state)
          setPersistStatus('saved')
        } catch (err) {
          console.error('Failed to persist app state', err)
          setPersistStatus('error')
        }
      })()
    }, 600)
    return () => window.clearTimeout(t)
  }, [state])

  const undo = useCallback(() => {
    historyDispatch({ type: '__UNDO' })
  }, [])
  const redo = useCallback(() => {
    historyDispatch({ type: '__REDO' })
  }, [])

  const historyValue = useMemo<AppHistoryValue>(
    () => ({
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      undoLabel: history.past.length > 0 ? history.present.label || null : null,
      redoLabel: history.future.length > 0 ? history.future[0].label || null : null,
      undo,
      redo,
    }),
    [history.future, history.past.length, history.present.label, redo, undo],
  )

  return (
    <PersistStatusContext.Provider value={persistStatus}>
      <AppHistoryContext.Provider value={historyValue}>
        <AppStateContext.Provider value={state}>
          <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
        </AppStateContext.Provider>
      </AppHistoryContext.Provider>
    </PersistStatusContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

export function useAppDispatch() {
  const ctx = useContext(AppDispatchContext)
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider')
  return ctx
}

export function usePersistStatus() {
  return useContext(PersistStatusContext)
}

export function useAppHistory(): AppHistoryValue {
  const ctx = useContext(AppHistoryContext)
  if (!ctx) throw new Error('useAppHistory must be used within AppProvider')
  return ctx
}
