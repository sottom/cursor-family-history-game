# Family History Tree Builder - Requirements Summary

## Product Goal

Build a single-page web app that lets users create, edit, arrange, and export family-tree cards and a visual family tree without authentication. All data must persist locally in the browser and be resilient for projects with many large photos.

## Core Constraints

- No login required.
- Local-first persistence in browser storage.
- Robust support for at least ~21 large uploaded photos.
- UX-first decisions when requirements conflict; prefer discoverability and low friction.
- Printable export quality suitable for high-resolution print output.

## Primary User Flows

1. Add people to a canvas.
2. Enter person details and upload/paste photos.
3. Create relationships (parent/child/spouse).
4. Select and align/distribute nodes as needed.
5. Auto-layout when desired, then fine-tune manually.
6. Export cards/tree/data/groupings/photos as a ZIP.

## Person Card Requirements

Each person node/card supports:

- `fullName`
- `shortName` (optimized label for tree display)
- `dob` date + location
- multiple `marriages` entries (spouse/date/location + current spouse flag)
- `dod` date + location
- optional notes
- `photoMain` and `photoThumb`, each with independent transform metadata:
  - `xPercent`
  - `yPercent`
  - `scale`

## Canvas + Interaction Requirements

- Draggable visual canvas with person nodes.
- Explicit add flow (no accidental node creation on plain canvas clicks).
- Node toolbar actions:
  - Add Parent
  - Add Spouse
  - Add Child
  - Edit
  - Set Photo
  - Adjust Photo
- Toolbar appears only on intentional single-node selection (not during drag).
- Node selection:
  - click-select
  - box selection with partial hit support
  - Shift multi-select toggle behavior
- Multi-select visual state must be clear.
- Align/distribute controls visible when >= 2 nodes selected.
- Keyboard behavior:
  - Escape closes modals / cancels placement
  - Delete/Backspace removes selected nodes when not typing in an input

## Relationship Requirements

Supported edge types:

- spouse
- parent-child
- (sibling optional/derived)

Behavior requirements:

- Spouses are shown side-by-side with subtle visual connection.
- Spouse clusters move together when dragging cluster members.
- New spouse placement should be position-aware (prefer opposite side before extending outward).
- Add-child flow must support:
  - selecting a spouse pair
  - selecting only the current person
  - selecting any other existing person as co-parent
  - text filtering by name when picking parents
- Add-parent flow for a child with existing parents must ask whether the new parent is married to one existing parent.
- Parent chooser should support name filtering.
- Current spouse can be marked on marriage entries.

## Auto-Layout Requirements

- Use `dagre` hierarchical top-down layout.
- Keep children visually close to direct parents.
- Preserve spouse-group ordering stability.
- Handle complex families (multiple spouses, divorced co-parents, remarriages) without confusing overlaps.
- Divorced/non-spouse co-parents should remain on the logical side of shared children and not collapse into unrelated spouse clusters.

## Edge/Line Styling Requirements

- Parent-child edges should be angular/step-like with slight corner radius (not flowy bezier).
- For most people, parent-child lines should use centered handles.
- Only offset parent source handles when needed to disambiguate multi-spouse parent scenarios.
- Relationship routing should remain legible in dense graphs.

## Photo Handling Requirements

- Photo input methods:
  - file upload
  - clipboard paste
- `photoMain` and `photoThumb` are independently adjustable.
- Adjust overlay modal:
  - drag to reposition
  - wheel to zoom
  - non-passive native wheel interception to prevent canvas zoom interference
- Preview in adjust overlay should be crisp (not blurry), especially for thumbnail adjustment.
- Card preview and export should reflect transforms consistently.

## Modal + UX Requirements

- All modals should close on backdrop click.
- Guided onboarding/tour for first run.
- Helpful tooltips and clear cursor affordances by mode.
- Clear primary CTA: **Export for Print**.
- Subtle save-state indicator (saving/saved/error).

## Persistence + Storage Requirements

- Persist all app state locally using IndexedDB (via `localforage`).
- Store app index/state JSON separately from blob assets.
- Store images as blobs (compressed display variants + original full-resolution where needed).
- Debounced persistence for smoother interaction.
- Reloading the app restores nodes, edges, positions, forms, and photos.

## Export Requirements

ZIP export should include:

- `cards/` - one print-ready PNG per person card
- `tree.png` - full tree image
- `data.csv` - flattened person and transform data
- `data.json` - full app state snapshot
- `groupings.json` - grouping metadata
- `groupings.csv` - equal-year-range grouping output
- `photos/` - uploaded photos at original/full resolution when available

Export quality requirements:

- High pixel ratio rendering for print-quality outputs.
- Card and tree exports must include visible images and relationship lines reliably.
- Export rendering should avoid `blob:` URL capture failures.

## Grouping/Range Requirements

Date kinds:

- birth
- marriage
- death

Current export expectation:

- Groupings in CSV should use equal year spreads between earliest and latest year for each kind.
- People/events are assigned into those computed ranges.

## Theming + Visual Style

- Warm, elegant, modern "family history" aesthetic.
- Keep visuals simple and readable; avoid overly decorative styling.

## Technical Stack (Current Direction)

- React + TypeScript + Vite
- `@xyflow/react` for canvas graph
- `dagre` for auto-layout
- `dom-to-image-more` for DOM-to-PNG
- `jszip` for ZIP generation
- `localforage` for IndexedDB persistence

## Acceptance Criteria (Consolidated)

- Can create a root person, spouses, and children with correct relationship behavior.
- Can pick specific co-parent when adding children, including searchable selection.
- Auto-layout remains stable and legible in multi-spouse + divorced/remarried scenarios.
- Photo upload/paste + adjust produces accurate visual results in cards and exports.
- Reload restores full work.
- ZIP export includes all required files with high-quality images and visible lines.
