# Runtime Controller Architecture

The workspace runtime is intentionally organised as a collection of small facades that expose focused capabilities to the controller.  Each facade receives an explicit context object generated inside `workspaceRuntime.js`, avoiding direct access to runtime singletons and keeping the orchestration layer lean.

## Context Factories

* `context/runtimeState.js` builds the shared runtime state. It wraps raw models and exposes read-only APIs for panels, sections, and UI handles (`panelDomRegistry`, `getPanelDom`, active panel helpers, etc.). The factory also returns references to live managers (e.g. the section manager) so downstream facades can opt into richer mutations without reaching back into `workspaceRuntime.js`.
* `context/panelContext.js` creates per‑panel views used by the panels facade when operating on specific graphs (move, reindex, etc.), again relying on the runtime state contract.

## Facades

* `panels/facade.js` handles panel CRUD, trace management, and geometry updates. It consumes the runtime state to discover panel records, sections, and DOM handles, while delegating persistence and history signalling via callbacks.
* `io/facade.js` owns file ingest/export, drag/drop behaviour, and toolbar wiring. It receives the runtime state to validate panel ids, compute sequence counters, and determine whether the workspace has active panels.
* `persistence/facade.js` (introduced earlier) centralises autosave, snapshot menu, and undo/redo buttons.
* `preferences/facade.js` encapsulates UI preference storage (panel pin/collapse) so the runtime never touches `localStorage`/`sessionStorage` directly.
* `browser/facade.js` renders the folder tree and attaches tree interactions.
* `panels/panelDomFacade.js` builds panel shells, header controls, and popovers. It accepts runtime actions and callbacks so panel wiring lives outside of `registerPanel`.

Each facade exposes a minimal API back to the controller (`panelsFacade` returns `appendFilesToGraph`, `moveGraph`, etc.), allowing `workspaceRuntime.js` to orchestrate functionality without exposing raw models elsewhere.

## Lifecycle

`workspaceRuntime.init` composes the state and facades in this order:

1. Build models (`panelsModel`) and initialise the section manager (owner of the sections map/order).
2. Instantiate the runtime state context (models + managers) and hand it to the panels and IO facades.
3. Wire the panel DOM, persistence, and browser facades, providing only the constrained APIs they require.
4. On teardown, delegate to each facade’s `teardown`/`detach` method to release listeners and flush storage.

## Testing

Fast Node tests cover:

* `browser/treeState` ordering and search normalisation.
* Panels facade upload flow using mocked models and services.
* Persistence facade snapshot orchestration with stubbed DOM/storage elements.
* Section manager invariants (default group, hierarchy, snapshot/load).
* Panel DOM facade guard paths to ensure safe mounting when required data is missing.

These tests live in `runtime/__tests__` and exercise the new context contracts in isolation.
