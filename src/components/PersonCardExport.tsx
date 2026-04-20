import type { Person } from '../state/appState'
import KeepsakeCard from './KeepsakeCard'

/** Fixed CSS width for the exported Keepsake card. Matches the native pixel
 *  width of `/cards/blankCard.png` (738 px) so the background artwork renders
 *  1:1 at CSS resolution — the rasterizer's pixelRatio then gives us a sharp
 *  print-ready PNG (~738 × ~984 @ 4× ≈ 2950 × 3940). */
const EXPORT_CARD_WIDTH_PX = 738

/**
 * Renders a single person's card for the ZIP export. This is exactly the same
 * visual as the modal preview — we delegate to `KeepsakeCard` so changes flow
 * to both places automatically — and just pin a crisp export width and pass
 * pre-resolved data URLs so `domtoimage` can capture the photos.
 */
export default function PersonCardExport(props: {
  personId: string
  person: Person
  photoMainUrl?: string | null
  photoThumbUrl?: string | null
  /** Optional data URL for the blank-card background (so rasterization captures it reliably). */
  backgroundUrl?: string
}) {
  return (
    <KeepsakeCard
      personId={props.personId}
      photoMainUrl={props.photoMainUrl ?? null}
      photoThumbUrl={props.photoThumbUrl ?? null}
      width={EXPORT_CARD_WIDTH_PX}
      backgroundUrl={props.backgroundUrl}
      exportMode
    />
  )
}
