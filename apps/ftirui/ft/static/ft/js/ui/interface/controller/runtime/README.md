# Workspace Runtime Index

This directory houses the runtime controller that powers the modern workspace canvas. Use this file as a quick map when hopping between modules; see `ARCHITECTURE.md` for the narrative deep dive on how they cooperate.

## Top-Level Entry Points

- `workspaceRuntime.js` – orchestrates initialisation/teardown, creates the runtime context, and wires every facade exposed to the UI.
- `ARCHITECTURE.md` – explains the lifecycle, context factories, and testing strategy in prose.

## Subdirectories

- `context/`
  - `runtimeState.js`, `panelContext.js` – factories that compose the shared runtime state and per-panel helpers passed into facades.
- `panels/`
  - `facade.js`, `panelDomFacade.js`, `panelInteractions.js`, `headerActions.js`, `plotFacade.js` – CRUD + DOM + interaction surface for canvas panels.
- `browser/`
  - `facade.js`, `renderTree.js`, `treeState.js`, `events.js`, `dragDrop.js` – file browser pane rendering and behaviour.
- `io/`
  - `facade.js` – file ingest/export, drag/drop wiring, toolbar hooks.
- `persistence/`
  - `facade.js` – autosave, snapshots, undo/redo orchestration.
- `preferences/`
  - `facade.js` – pin/collapse storage plus other UI preference helpers.
- `sections/`
  - `manager.js` – manages workspace sections/groups exposed through the runtime state.
- `state/`
  - `historyHelpers.js`, `snapshotManager.js`, `panelPreferencesManager.js`, `colorCursorManager.js` – shared state utilities.
- `testing/`
  - `testUtils.js` – helpers/mocks for runtime unit tests.
- `__tests__/`
  - Node-based tests that exercise the facades and state helpers in isolation.

### How to Extend

1. Decide which facade owns the new behaviour; prefer adding to an existing directory rather than pushing logic into `workspaceRuntime.js`.
2. Update or create the relevant module, exporting only the minimal API needed by the controller.
3. Register the facade call inside `workspaceRuntime.js` and document the new entry in `ARCHITECTURE.md` so future contributors can discover it here quickly.
