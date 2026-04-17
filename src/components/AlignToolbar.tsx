import { useEffect } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'
import type { AlignMode, DistributeMode } from '../state/appState'

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="ftNodeBtn" onClick={(e) => { e.stopPropagation(); onClick() }}>
      {children}
    </button>
  )
}

export default function AlignToolbar() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const selected = state.selectedPersonIds

  useEffect(() => {
    if (selected.length < 2) return
    const personIds = selected
    const align = (mode: AlignMode) =>
      dispatch({ type: 'ALIGN_SELECTED', payload: { mode, personIds } })
    const distribute = (axis: DistributeMode) =>
      dispatch({ type: 'DISTRIBUTE_SELECTED', payload: { axis, personIds } })

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack keys while editing inputs.
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (personIds.length < 2) return

      switch (e.key) {
        case '1':
          align('left')
          break
        case '2':
          align('cx')
          break
        case '3':
          align('right')
          break
        case '4':
          align('top')
          break
        case '5':
          align('cy')
          break
        case '6':
          align('bottom')
          break
        case '7':
          distribute('h')
          break
        case '8':
          distribute('v')
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, selected])

  if (selected.length < 2) return null

  const align = (mode: AlignMode) => dispatch({ type: 'ALIGN_SELECTED', payload: { mode, personIds: selected } })
  const distribute = (axis: DistributeMode) =>
    dispatch({ type: 'DISTRIBUTE_SELECTED', payload: { axis, personIds: selected } })

  return (
    <div
      className="ftAlignToolbar"
      onPointerDown={(e) => e.stopPropagation()}
      role="toolbar"
      aria-label="Align and distribute"
    >
      <div className="ftAlignToolbar__group">
        <div className="ftAlignToolbar__label">Align</div>
        <div className="ftAlignToolbar__row">
          <Btn onClick={() => align('left')}>Left</Btn>
          <Btn onClick={() => align('cx')}>Center X</Btn>
          <Btn onClick={() => align('right')}>Right</Btn>
          <Btn onClick={() => align('top')}>Top</Btn>
          <Btn onClick={() => align('cy')}>Center Y</Btn>
          <Btn onClick={() => align('bottom')}>Bottom</Btn>
        </div>
      </div>

      <div className="ftAlignToolbar__group">
        <div className="ftAlignToolbar__label">Distribute</div>
        <div className="ftAlignToolbar__row">
          <Btn onClick={() => distribute('h')}>Horiz</Btn>
          <Btn onClick={() => distribute('v')}>Vert</Btn>
        </div>
      </div>
    </div>
  )
}

