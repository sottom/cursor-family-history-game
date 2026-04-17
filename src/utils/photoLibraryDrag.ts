/** Same-tab drag from photo library tray → person cards (React Flow + custom MIME quirks). */

export const PHOTO_LIBRARY_DATA_PREFIX = 'ftlib:'

let libraryPhotoDragId: string | null = null

export function setLibraryPhotoDragId(id: string | null): void {
  libraryPhotoDragId = id
}

export function getLibraryPhotoDragId(): string | null {
  return libraryPhotoDragId
}

export function resolveLibraryPhotoIdFromDrop(dataTransfer: DataTransfer): string | null {
  const fromRef = getLibraryPhotoDragId()
  if (fromRef) return fromRef
  const t = dataTransfer.getData('text/plain')
  if (t.startsWith(PHOTO_LIBRARY_DATA_PREFIX)) return t.slice(PHOTO_LIBRARY_DATA_PREFIX.length)
  return null
}
