static/ft/js/
├─ core/
│  ├─ state/
│  │  └─ index.js          -> exports `createState`, `rootFolderId`, `newId`, `newFolderId`, `nextColor`, `palette`
│  ├─ plot/
│  │  ├─ renderer.js       -> houses `buildData`, `buildLayout`, `render`
│  │  └─ index.js          -> re-exports renderer helpers
│  └─ parse/
│     ├─ file.js           -> `parseFileToXY`, `checksumFile`
│     ├─ preview.js        -> `downsamplePreview`
│     └─ index.js          -> aggregates parse helpers
├─ services/
│  ├─ uploads.js           -> posts files to `/api/xy/`, returns payload JSON
│  ├─ demos.js             -> retrieves demo file list/blob data
│  └─ sessions.js          -> session save/list/get/delete requests
└─ ui/
   ├─ config/
   │  └─ display.js        -> shared display configuration + `getDisplayConfig`
   ├─ utils/
   │  ├─ styling.js        -> `normalizeDashValue`, dash icons, colour helpers
   │  ├─ traceMeta.js      -> metadata normalisation/summarisation
   │  └─ dom.js            -> HTML escape helpers
   └─ interface/
      ├─ state.js          -> folder-tree state helpers (ensure structure, move/reorder)
      ├─ history.js        -> history stack + undo/redo bindings
      ├─ sessions.js       -> session modal wiring around service calls
      ├─ dropzone.js       -> drag/drop binding + FileSystemEntry helpers
      ├─ panel.js          -> panel toggles, empty state handling
      ├─ folderTree.js     -> render tree, trace rows, trace drag/drop wiring
      ├─ demos.js          -> demo button show/hide + preload orchestrator
      ├─ inputMode.js      -> global input-mode state syncing + toggle binding
      ├─ controls.js       -> binds global plot/input controls to state + Plotly
      └─ index.js          -> planned bootstrap entry (future extraction)

Legacy entry-points (`core/state.js`, `core/plot.js`, `core/parse.js`) now re-export the modular equivalents so existing imports keep working during the transition.

## Session Schema v2 (UI)

- `ui/interface/sessions.js` persists sessions with `version: 2` via `buildSessionState`.
- Root payload keys: `version`, `global`, `order`, `traces`, `folders`, `folderOrder`, `ui`.
- `traces` is a map of trace id -> trace snapshot; each trace stores runtime fields (colour, visibility, folder membership, ingest mode, meta) plus:
  - `data.x`/`data.y`: arrays cloned from the displayed trace.
  - `source.y` (and optional `source.x`): canonical spectra used to recompute display units on load.
- Load path rebuilds state from the stored arrays and immediately invokes `applyDisplayUnits` so the plot reflects the active unit preference.
- Older meta-only session files are no longer supported; attempting to load them will surface validation errors during JSON parsing instead of partial state.
- Large spectra are written as plain JSON arrays; expect session files to scale with the number of points (~16 bytes per sample pair before compression).
- Exporting from the UI downloads `.ben` files (JSON with `{schema: "ftir-session", version: 2, exported_at, title, state}`); importing expects the same schema and only accepts version 2 payloads.
- Autosave mirrors the same snapshot into IndexedDB (`sciben`, store `autosave`, key `plot-session-v2`) every few seconds but only after the UI has been idle for a full interval; tab-hide/exit still forces a flush, and the indicator badge surfaces "saving/saved/error" transitions.
- The "Clear" action wipes the current workspace, drops the autosave entry, and rehydrates the empty browser/demo state without requiring a full page reload.
- Session modal now surfaces backend metadata (`size`, `storage`, `updated`) and disables save/load controls when authentication is required. Oversized payloads trigger HTTP 413 and the UI relays the limit message directly to users.

## Workspace Summary & Auth UX

- `app.js` fetches `/api/me/`, renders the header account widget, and issues `ftir:user-status` events plus toast notifications when authentication state changes.
- `ui/interfaceB.js` listens for those events (and for session-save updates) to populate the `workspace_summary` card with login badge, cloud-session counts, and quick actions (open modal, export `.ben`).
- Global toasts (`window.showAppToast`) replace ad-hoc alerts so session operations (save/import/delete) and auth transitions present consistent feedback.
