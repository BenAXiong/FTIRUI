# JavaScript Architecture (FTIR UI)

This document captures the current layout and responsibilities of the FTIR front‑end code living under
`apps/ftirui/ft/static/ft/js/`. It is the canonical reference when deciding where new logic should live
and how existing modules interact.

---

## 1. Directory Overview

```
static/ft/js/
├── architecture_js.md   # this document
├── workspace/           # workspace (plot canvas) domain
│   └── canvas/          # new modular home for the plot canvas
│       ├── controller/  # orchestration + bootstrap entry
│       ├── core/        # DOM-agnostic utilities (ids, history, storage, schema)
│       ├── init/        # initialization scripts for the controller
│       ├── io/          # upload/export adapters (to be populated during migration)
│       ├── plotting/    # Plotly layout/data helpers (extraction in progress)
│       ├── services/    # shared service wrappers (toast, sessions, feature flags)
│       ├── state/       # source-of-truth models (panelsModel, sectionsModel)
│       └── ui/          # DOM bindings split by feature (browser, panel, styling, viewport)
├── core/                # legacy modules still consumed by the workspace & other screens
│   ├── state/           # re-exports of legacy state helpers (to be consolidated into workspace/core)
│   ├── plot/            # Plotly renderer helpers used by non-workspace screens
│   └── parse/           # File parsing/downsampling utilities
├── services/            # HTTP service wrappers (uploads, demos, sessions)
└── ui/                  # User-interface packages outside the canvas migration
    ├── config/          # Shared display configuration
    ├── utils/           # Styling + trace metadata + DOM helpers
    └── interface/       # Legacy workspace UI (being replaced by workspace/canvas/ui)
```

> **Migration status:** the monolithic `ui/interface/workspaceCanvas.js` still bootstraps the experience
> but now delegates storage, ordering, and UI rendering to the new workspace/canvas modules. Once the
> remaining UI fragments are extracted the legacy entry point will be removed.

---

## 2. Canvas Data Flow

1. **Models (`workspace/canvas/state/`)**  
   - `panelsModel.js` and `sectionsModel.js` encapsulate all persisted state: geometry, visibility,
     traces, and section hierarchy. They expose pure functions that return immutable snapshots to the rest of the UI.

2. **Controller (`workspace/canvas/controller/`)**  
   - The controller will become the single entry point when the migration finishes. Today the legacy
     `initWorkspaceCanvas()` still performs bootstrapping, but it already leans on controller helpers
     for viewport syncing and history coordination.

3. **UI Bindings (`workspace/canvas/ui/**`)**  
   - UI modules subscribe to model snapshots and issue write operations through the models. The legacy
     file currently forwards events (drag/drop, clicks) to the new helpers until the final cut-over.

4. **Services (`workspace/canvas/services/` + `static/ft/js/services/`)**  
   - Network interactions (uploads, demos, session persistence) are provided by the top-level services
     package. The workspace controller wraps these and re-exposes a typed API for the UI layer.

5. **Plotting (`workspace/canvas/plotting/`)**  
   - Plotly-specific logic is being migrated from `ui/interface/workspaceCanvas.js` into this folder.
     The plan is to have `buildLayout`, `buildData`, and `render` in Plotly-specific modules so alternative
     renderers can coexist in the future.

---

## 3. Models & Persistence

| Model              | Responsibility | Notes |
|--------------------|----------------|-------|
| `panelsModel`      | Panel layout (position, geometry, z-index), trace list & figure payload, visibility | Now the **only** source of truth for panels; all UI reads go through helper shims. |
| `sectionsModel`    | Section hierarchy, ordering, and collapsed state                                  | Used by the browser tree and session persistence. |

Both models expose:

- `register*` / `remove*` methods for CRUD operations.
- `snapshot()` to obtain serialisable dumps for sessions/autosave.
- Getter helpers that always return cloned data to avoid accidental mutation.

The legacy session loader already uses these models and the new controller will soon wrap them for
initialisation and undo/redo orchestration.

---

## 4. Services

- `services/uploads.js` – handles file uploads to `/api/xy/`.
- `services/demos.js`   – queries demo spectra.
- `services/sessions.js`– list/save/load/delete workspace sessions.
- `workspace/canvas/services/toast.js` – lightweight wrapper around `window.showAppToast` used by the new UI modules.

All network calls return plain Promises and leave caching or retry behaviour up to the consumer.  As the
controller matures, service access will be centralised there to keep UI modules stateless.

---

## 5. Migration Checklist

- ✅ Models moved under `workspace/canvas/state/` and set as single source of truth.  
- ✅ Legacy `workspaceCanvas.js` updated to read/write through the models.  
- 🚧 UI extraction into `workspace/canvas/ui/` (browser tree, panel controls, viewport syncing).  
- 🚧 Plot and IO helpers relocation.  
- 🚧 Controller bootstrap replacing `initWorkspaceCanvas`.  
- ⏳ Remove `ui/interface/workspaceCanvas.js` once consumers import the controller directly.

For day-to-day work:

- When adding cross-cutting utilities, prefer `workspace/canvas/core/`.  
- When touching the legacy entry, favour delegating to a new module in the workspace package instead of adding more inline logic.  
- Update this document whenever new folders or responsibilities appear.

---

Questions or suggestions? Reach out in `#ftir-frontend` and reference this document so we can keep the architecture aligned with reality. :sparkles:
