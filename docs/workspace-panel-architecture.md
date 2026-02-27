# Workspace Panel Architecture

This document captures the current structure we use to build panels inside the workspace so future work (spreadsheets, Jupyter, images, etc.) can stay consistent.

## Panel Registry

* Files: `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/panels/registry/*.js`
* `registry/index.js` exposes `registerPanelType`, `getPanelType`, and `listPanelTypes`.
* Each panel type module (e.g., `plotPanel.js`, `markdownPanel.js`) registers itself with an id, label, capabilities, default title logic, plus optional hooks:
  * `prepareInitialState(state, context)` → normalize incoming panel state (default width/height, content payload).
  * `mountContent({ panelId, hostEl, actions, selectors })` → render into the panel body and return any handles (e.g., `plotEl`, `refreshContent`).
  * `serializeState(panelState)` / `hydrateState(panelState)` → transform panel data when writing/reading snapshots or remote payloads.

## Content Store

* File: `apps/ftirui/ft/static/ft/js/workspace/canvas/state/contentStore.js`
* Provides `registerContentKind`, `normalizeContentPayload`, and `cloneContentPayload`.
* Panel types register custom serializers (Markdown already does) so `panelsModel`, storage, and snapshots can safely persist arbitrary payloads without copying logic everywhere.

## Panels Model & Snapshot Flow

* `panelsModel` now stores `record.content` using the content store helpers.
* `snapshotManager` runs panel snapshots through `panelSnapshotSerializer`, which consults each panel type’s `serializeState/hydrateState`.
* `core/storage.js` also uses the content store so autosave/restore handles new panel kinds automatically.
* UI prefs in snapshots include runtime view state used by sidebar/panel controllers (for example `uiPrefs.activePanelId`), so refresh restore can re-apply graph focus and side-tab context.

## Toolbar & Creation

* `toolbar/globalCommands.js` binds TB1 buttons to registry-driven actions (currently Markdown). It receives DOM buttons plus a `createPanel(typeId, state)` callback from `workspaceRuntime`.
* `workspaceRuntime` exposes a `createPanelOfType` helper that pushes a panel into the model via `registerPanel`, ensuring future buttons all follow the same path.

## Panel DOM Facade

* `panelDomFacade` only handles shared shell pieces (header, title, close button).
* After mounting, it calls `panelType.mountContent` so each type renders its body UI and returns handles (plot container, markdown editor, etc.).
* Header controls are capability-aware: Plot panels keep the full toolbar; non-plot panels get a lightweight header while still honoring drag/resize logic.

## Spreadsheet Panel (current, subject to change)

The spreadsheet panel is already implemented and wired into the runtime. This section documents the current
behavior so future refactors can keep feature parity.

Primary files:
* Panel UI + behavior: `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/panels/registry/spreadsheetPanel.js`
* Plot insertion action: `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/panels/headerActions.js` (action: `spreadsheet-plot-columns`)

### UI/UX surface

* Grid editor with column headers, row headers, and per-cell inputs.
* Inline column header editing (name/axis/units/formula rows).
* Formula row (per column) with error hints.
* Toolbar with quick tips, add/remove rows/columns.
* Header rows include: `Actions`, `Columns`, `Name`, `Axis`, `Units`, `Formula`, `Preview` (visibility/height persisted in `content.ui`).
* Plot controls:
  - X-axis select (single column).
  - Y-series list (multi-select, minimum 1).
  - Graph targets list (existing plots + "New graph").
  - Actions: "Add to graph(s)", "Copy selection", "Export CSV".
* Paste handling: tab/newline matrix paste from clipboard into the grid.

### Data model + persistence

* Content kind: `spreadsheet` registered in `workspace/canvas/state/contentStore.js`.
* Serialized payload shape:
  - `columns`: `{ id, label, axis, units, width, type, formula }[]`
  - `rows`: `{ id, [columnId]: value }[]`
  - `formulas`: `{ [columnId]: string }`
  - `plot`: `{ x: string[], y: string[] }`
  - `ui`: header visibility/row heights/copy-mode/render prefs
  - `version`: `CURRENT_VERSION`
* Autosave is debounced (650ms) and uses `setPanelContent` with history batching.
* `beforeunload` flush ensures pending edits persist.

### Formulas

* Expressions compiled via `new Function` with a scoped `with(ctx){...}` context.
* Supported tokens:
  - column tokens (`colA`, `c1`, column id, slugified label)
  - row metadata (`rowIndex`, `rowNumber`, `row()`, `ROW()`)
  - math helpers (sin/cos/log/etc.).
* Evaluation happens per row; errors are tracked per column and shown inline.

### Plotting flow

* `buildTracePayloads` uses evaluated rows; it sanitizes numeric values and skips empty columns.
* `spreadsheet-plot-columns` header action:
  - `mode: "new"` creates a new plot panel from payloads.
  - `mode: "existing"` appends traces to a chosen plot panel.
  - Both paths attach trace `meta` including source ids plus axis metadata (`xAxisLabel/Units/Title`, `yAxisLabel/Units/Title`).
  - Both paths patch Plotly axis titles from spreadsheet axis metadata after plot insertion.

### Axis/Units sync semantics

* Spreadsheet `Axis` + `Units` are intended to drive graph axis titles.
* In default mapping mode, Y columns are grouped by their nearest selected X column.
  - Y columns in the same X group share a single editable `Axis` and `Units` owner (first Y in group).
  - Other Y columns in that group are read-only mirrors in the header row.
* X columns remain independently editable for `Axis` and `Units`.

### Data tab bootstrap fallback

* Data side-tab prefers trace meta (`xAxis*`, `yAxis*`) when present.
* If missing on initial sync, it falls back to the active graph `layout.xaxis.title.text` / `layout.yaxis.title.text` to avoid generic labels like `X 1`.

### Notes for upcoming changes

* Treat this as a baseline snapshot; UI structure and plot controls are likely to change.
* If refactoring formulas, keep the token mapping and per-row evaluation behavior aligned.
* Ensure new UI still feeds the same header action or update it in one place.

## Next Steps

* When adding new panel types (spreadsheets, Jupyter, images), create a new registry module that:
  * Registers its id/capabilities, prepares default state, and registers a content serializer if needed.
  * Implements `mountContent` to render its UI inside the provided host.
  * Optionally adds `serializeState/hydrateState` when the panel’s saved representation differs from the runtime shape.
* Wire any TB1/TB2 buttons through the toolbar controller using the registry id to keep creation flows consistent.

Keeping to this structure ensures we can extend panels without bloating `workspaceRuntime` or duplicating persistence logic.
