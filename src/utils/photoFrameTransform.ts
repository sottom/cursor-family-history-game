import type { CSSProperties } from 'react'

import type { PhotoTransform } from '../state/appState'

/**
 * Wrapper styles for a framed photo (object-fit: contain).
 * Translate + scale on the same element with origin top-left matches the zoom-to-cursor math in
 * the keepsake card editor, and keeps canvas / print / export aligned.
 */
export function personPhotoFrameWrapperStyle(t: PhotoTransform): CSSProperties {
  return {
    width: '100%',
    height: '100%',
    transform: `translate(${t.xPercent}%, ${t.yPercent}%) scale(${t.scale})`,
    transformOrigin: '0 0',
  }
}
