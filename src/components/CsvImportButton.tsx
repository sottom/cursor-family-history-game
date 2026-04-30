import { useRef, useState, type ChangeEvent } from 'react'
import { useAppDispatch, useAppState } from '../state/AppProvider'
import { importFamilySheetCsv } from '../utils/importFamilyCsv'

export default function CsvImportButton() {
  const dispatch = useAppDispatch()
  const state = useAppState()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const onPickFile = () => {
    inputRef.current?.click()
  }

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    try {
      setIsImporting(true)
      const csvText = await file.text()
      const result = importFamilySheetCsv(csvText, state)
      dispatch({ type: 'SET_STATE', payload: { state: result.state } })
      window.alert(`Imported ${result.importedCount} people from ${file.name}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to import this file.'
      window.alert(`Import failed: ${message}`)
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <>
      <button type="button" className="ftBtn" onClick={onPickFile} disabled={isImporting}>
        {isImporting ? 'Importing...' : 'Import CSV'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="ftPhotoLibraryPanel__hiddenInput"
        onChange={onFileChange}
      />
    </>
  )
}
