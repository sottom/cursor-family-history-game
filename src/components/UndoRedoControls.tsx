import { useCallback, useEffect, useRef, useState } from 'react'

import { useAppHistory } from '../state/AppProvider'

/** Preferred shortcut hints per platform (rendered in button titles and the help strip). */
function shortcutHint(kind: 'undo' | 'redo'): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|od|ad)/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl'
  if (kind === 'undo') return `${mod}+Z`
  return isMac ? '⇧⌘Z' : `${mod}+Y`
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 14L4 9l5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 9h10a6 6 0 0 1 0 12h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 14l5-5-5-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 9H10a6 6 0 0 0 0 12h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Transient status line that announces the most recent undo/redo. Duplicate messages reset the
 * timer so repeated presses keep the label visible. Cleared on unmount to avoid orphan timers.
 */
function useTransientToast(durationMs = 1600) {
  const [message, setMessage] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)

  const show = useCallback(
    (text: string) => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      setMessage(text)
      timerRef.current = window.setTimeout(() => {
        setMessage(null)
        timerRef.current = null
      }, durationMs)
    },
    [durationMs],
  )

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  return { message, show }
}

/** True when the given element is a user-editable field where the browser provides native undo. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export default function UndoRedoControls() {
  const { canUndo, canRedo, undoLabel, redoLabel, undo, redo } = useAppHistory()
  const { message, show } = useTransientToast()

  const undoShortcut = shortcutHint('undo')
  const redoShortcut = shortcutHint('redo')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      const isUndo = key === 'z' && !event.shiftKey && !event.altKey
      const isRedo =
        (key === 'z' && event.shiftKey && !event.altKey) ||
        (key === 'y' && !event.shiftKey && !event.altKey)
      if (!isUndo && !isRedo) return

      // Controlled React inputs already break native undo, so intercepting globally (including
      // in text fields) gives a consistent experience. We still bail out for contentEditable
      // regions — those are rare here and deserve native behavior if they show up later.
      if (event.target instanceof HTMLElement && event.target.isContentEditable) return

      if (isUndo) {
        event.preventDefault()
        if (!canUndo) {
          show('Nothing to undo')
          return
        }
        const label = undoLabel
        undo()
        show(label ? `Undid ${label}` : 'Undid last change')
        // Blur editable inputs so a stale IME composition doesn't overwrite the state we just
        // restored.
        if (isEditableTarget(event.target)) (event.target as HTMLElement).blur()
        return
      }

      if (isRedo) {
        event.preventDefault()
        if (!canRedo) {
          show('Nothing to redo')
          return
        }
        const label = redoLabel
        redo()
        show(label ? `Redid ${label}` : 'Redid change')
        if (isEditableTarget(event.target)) (event.target as HTMLElement).blur()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canUndo, canRedo, undoLabel, redoLabel, undo, redo, show])

  const onUndoClick = useCallback(() => {
    if (!canUndo) {
      show('Nothing to undo')
      return
    }
    const label = undoLabel
    undo()
    show(label ? `Undid ${label}` : 'Undid last change')
  }, [canUndo, show, undo, undoLabel])

  const onRedoClick = useCallback(() => {
    if (!canRedo) {
      show('Nothing to redo')
      return
    }
    const label = redoLabel
    redo()
    show(label ? `Redid ${label}` : 'Redid change')
  }, [canRedo, redo, redoLabel, show])

  return (
    <>
      <div className="ftUndoRedo" role="group" aria-label="Undo and redo">
        <button
          type="button"
          className="ftIconBtn ftUndoRedo__btn"
          onClick={onUndoClick}
          disabled={!canUndo}
          aria-label={canUndo && undoLabel ? `Undo ${undoLabel} (${undoShortcut})` : `Undo (${undoShortcut})`}
          title={canUndo && undoLabel ? `Undo ${undoLabel} (${undoShortcut})` : `Undo (${undoShortcut})`}
        >
          <UndoIcon />
        </button>
        <button
          type="button"
          className="ftIconBtn ftUndoRedo__btn"
          onClick={onRedoClick}
          disabled={!canRedo}
          aria-label={canRedo && redoLabel ? `Redo ${redoLabel} (${redoShortcut})` : `Redo (${redoShortcut})`}
          title={canRedo && redoLabel ? `Redo ${redoLabel} (${redoShortcut})` : `Redo (${redoShortcut})`}
        >
          <RedoIcon />
        </button>
      </div>
      <div className="ftUndoRedoToast" role="status" aria-live="polite">
        {message ? <span className="ftUndoRedoToast__chip">{message}</span> : null}
      </div>
    </>
  )
}
