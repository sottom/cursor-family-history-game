import { useEffect, useState } from 'react'

import { useAppDispatch, useAppState } from '../state/AppProvider'

type TourStep = {
  title: string
  body: string
}

const steps: TourStep[] = [
  {
    title: 'Add your first person',
    body: 'Click on an empty spot of the canvas to create a new person card.',
  },
  {
    title: 'Add photos & details',
    body: 'Select a card, then use “Set Photo” (upload or paste) and “Edit” to fill in names/dates.',
  },
  {
    title: 'Build relationships and export',
    body: 'Use “+ Spouse”, “+ Parent”, and “+ Child”. Select multiple nodes for Align/Distribute, then click “Export for Print”.',
  },
]

export default function OnboardingTourOverlay() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [stepIndex, setStepIndex] = useState(0)

  const visible = !state.ui.hasSeenTour

  const step = steps[stepIndex] ?? steps[0]
  const total = steps.length

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_HAS_SEEN_TOUR', payload: { value: true } })
      }
      if (e.key === 'ArrowRight') setStepIndex((i) => Math.min(total - 1, i + 1))
      if (e.key === 'ArrowLeft') setStepIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dispatch, total, visible])

  const finish = () => dispatch({ type: 'SET_HAS_SEEN_TOUR', payload: { value: true } })

  const canBack = stepIndex > 0
  const canNext = stepIndex < total - 1

  if (!visible) return null

  return (
    <div
      className="ftModalBackdrop"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish()
      }}
    >
      <div className="ftModal" style={{ width: 'min(720px, 100%)' }}>
        <div className="ftModal__header">
          <div className="ftModal__title">Welcome</div>
          <button className="ftIconBtn" onClick={finish} aria-label="Close tour">
            ×
          </button>
        </div>
        <div className="ftModal__body" style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontWeight: 900, color: 'var(--text-h)', fontSize: 18 }}>{step.title}</div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5 }}>{step.body}</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button
              type="button"
              className="ftBtn"
              style={{ padding: '10px 12px', flex: 1 }}
              disabled={!canBack}
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            >
              Back
            </button>
            <button
              type="button"
              className="ftBtn ftBtn--primary"
              style={{ padding: '10px 12px', flex: 1 }}
              onClick={() => {
                if (canNext) setStepIndex((i) => i + 1)
                else finish()
              }}
            >
              {canNext ? 'Next' : 'Finish'}
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text)', textAlign: 'center' }}>
            Step {stepIndex + 1} of {total}
          </div>
        </div>
      </div>
    </div>
  )
}

