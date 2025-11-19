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

## Toolbar & Creation

* `toolbar/globalCommands.js` binds TB1 buttons to registry-driven actions (currently Markdown). It receives DOM buttons plus a `createPanel(typeId, state)` callback from `workspaceRuntime`.
* `workspaceRuntime` exposes a `createPanelOfType` helper that pushes a panel into the model via `registerPanel`, ensuring future buttons all follow the same path.

## Panel DOM Facade

* `panelDomFacade` only handles shared shell pieces (header, title, close button).
* After mounting, it calls `panelType.mountContent` so each type renders its body UI and returns handles (plot container, markdown editor, etc.).
* Header controls are capability-aware: Plot panels keep the full toolbar; non-plot panels get a lightweight header while still honoring drag/resize logic.

## Next Steps

* When adding new panel types (spreadsheets, Jupyter, images), create a new registry module that:
  * Registers its id/capabilities, prepares default state, and registers a content serializer if needed.
  * Implements `mountContent` to render its UI inside the provided host.
  * Optionally adds `serializeState/hydrateState` when the panel’s saved representation differs from the runtime shape.
* Wire any TB1/TB2 buttons through the toolbar controller using the registry id to keep creation flows consistent.

Keeping to this structure ensures we can extend panels without bloating `workspaceRuntime` or duplicating persistence logic.
