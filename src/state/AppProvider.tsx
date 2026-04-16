import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import type { AppAction, AppState } from './appState'
import { appReducer, createInitialAppState } from './appState'
import { loadAppState, saveAppState } from '../storage/indexedDb'

const AppStateContext = createContext<AppState | null>(null)
const AppDispatchContext = createContext<((action: AppAction) => void) | null>(null)
const PersistStatusContext = createContext<'idle' | 'saving' | 'saved' | 'error'>('idle')

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState)
  const memoState = useMemo(() => state, [state])
  const [persistStatus, setPersistStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const didHydrateRef = useRef(false)

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const loaded = await loadAppState()
      if (cancelled) return
      if (loaded) {
        dispatch({ type: 'SET_STATE', payload: { state: loaded } })
      }
      didHydrateRef.current = true
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced save on state changes.
  useEffect(() => {
    if (!didHydrateRef.current) return
    setPersistStatus('saving')
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveAppState(state)
          setPersistStatus('saved')
        } catch (err) {
          // Non-fatal: allow the user to keep working even if storage fails.
          console.error('Failed to persist app state', err)
          setPersistStatus('error')
        }
      })()
    }, 600)
    return () => window.clearTimeout(t)
  }, [state])

  return (
    <PersistStatusContext.Provider value={persistStatus}>
      <AppStateContext.Provider value={memoState}>
        <AppDispatchContext.Provider value={dispatch}>{children}</AppDispatchContext.Provider>
      </AppStateContext.Provider>
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

