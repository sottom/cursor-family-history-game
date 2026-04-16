import { PERSON_CARD_H, PERSON_CARD_W } from '../state/appState'

export const CARD_WIDTH = PERSON_CARD_W
export const CARD_HEIGHT = PERSON_CARD_H

// These boxes define where photo variants are drawn on the person card.
// They are intentionally fixed (px) so xPercent/yPercent translations match across:
// - on-canvas preview
// - photo adjust overlay
export const PHOTO_THUMB_FRAME = {
  x: 10,
  y: 10,
  w: 56,
  h: 56,
}

export const PHOTO_MAIN_FRAME = {
  x: 10,
  y: 74,
  w: CARD_WIDTH - 20,
  h: 150,
}

