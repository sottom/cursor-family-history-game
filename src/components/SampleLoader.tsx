import { useAppDispatch, useAppState } from '../state/AppProvider'
import { buildFourGenerationSampleState } from '../state/defaultSampleTree'

/** Replaces the canvas with the default 15-person, four-generation tree (same as a first visit). */
export default function SampleLoader() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const onLoadSample = () => {
    const next = buildFourGenerationSampleState()
    next.ui.hasSeenTour = state.ui.hasSeenTour

    dispatch({ type: 'SET_STATE', payload: { state: next } })
  }

  return (
    <button type="button" className="ftBtn" onClick={onLoadSample} style={{ padding: '10px 12px' }}>
      Load Sample
    </button>
  )
}
