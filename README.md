# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

---

## Family Tree Cards (Local-first, no login)

This app lets you build, edit, and export printable family-tree “family tree cards” with photo positioning. Everything is persisted locally in your browser (no sign-in).

### Run / Build
1. Install dependencies:
   - `npm install`
2. Dev server:
   - `npm run dev`
3. Production build:
   - `npm run build`

### Key Implementation Choices
- Local persistence for app data + blobs:
  - `localforage` (IndexedDB) for image blobs
  - IndexedDB-backed JSON index for all metadata
- Photo transforms:
  - Stored as `{ xPercent, yPercent, scale }`
  - Applied consistently in the node preview and the photo adjust overlay
- Export:
  - Uses `dom-to-image-more` with `pixelRatio: 3` for high-resolution PNGs
  - Builds a ZIP on the client via `jszip`

### Export ZIP Contents
When you click `Export for Print`, the ZIP includes:
- `cards/<personId>.png`
- `tree.png`
- `data.csv`
- `data.json`
- `groupings.json`

### Manual QA Checklist (including acceptance criteria)
1. Load sample dataset:
   - Click `Load Sample` (top bar)
2. Export and verify acceptance:
   - Click `Export for Print`
   - Open `tree.png` inside the ZIP
   - Confirm the spouse pair exists and that each of the 3 children has edges drawn from *both* the root and spouse parents to that child
3. Photo positioning (if photos are present):
   - Select a node, click `Adjust Photo`
   - Drag to reposition and mouse wheel to zoom
   - Confirm the card preview updates live and persists after reload
4. Alignment/distribution:
   - Box-select 3+ nodes
   - Use the align/distribute buttons in `AlignToolbar` (or keyboard `1`–`8`)
5. Persistence:
   - Refresh the page and verify nodes/relationships/transforms still reappear.

### Keyboard Shortcuts (alignment/distribution)
- When 2+ nodes are selected:
  - `1` Align Left
  - `2` Align Center X
  - `3` Align Right
  - `4` Align Top
  - `5` Align Center Y
  - `6` Align Bottom
  - `7` Distribute Horizontally
  - `8` Distribute Vertically

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
