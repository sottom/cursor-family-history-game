import { useMemo, useState } from 'react'
import FamilyCanvas from './components/FamilyCanvas'
import { AppProvider, usePersistStatus } from './state/AppProvider'
import PersonForm from './components/PersonForm'
import PhotoAdjustOverlay from './components/PhotoAdjustOverlay'
import ExportDrawer from './components/ExportDrawer'
import OnboardingTourOverlay from './components/OnboardingTourOverlay'
import SampleLoader from './components/SampleLoader'

function AppShell() {
  const [exportOpen, setExportOpen] = useState(false)
  const persistStatus = usePersistStatus()

  const onExportClick = useMemo(() => {
    return () => setExportOpen(true)
  }, [])

  return (
    <div className="ftApp">
      <header className="ftTopbar">
          <div className="ftTopbar__left">
            <div className="ftTitle">Family Tree Cards</div>
            <div className="ftSubtitle">Build cards, position photos, export for print.</div>
          </div>

          <div className="ftTopbar__right">
            <div className={`ftSaveStatus ftSaveStatus--${persistStatus}`}>
              {persistStatus === 'saving'
                ? 'Saving...'
                : persistStatus === 'error'
                  ? 'Save issue'
                  : 'Saved'}
            </div>
            <SampleLoader />
            <button className="ftBtn ftBtn--primary" onClick={onExportClick}>
              Export for Print
            </button>
          </div>
        </header>

      <main className="ftMain ftMain--full">
        <FamilyCanvas />
      </main>

        {/* Export for Print */}
      {exportOpen ? (
        <ExportDrawer onClose={() => setExportOpen(false)} />
      ) : null}

        {/* Modals driven by AppState (no auth / all local) */}
      <OnboardingTourOverlay />
      <PersonForm />
      <PhotoAdjustOverlay />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
