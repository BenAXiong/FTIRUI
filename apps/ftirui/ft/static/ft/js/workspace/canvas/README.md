## Workspace Canvas Package

This package is the new home for everything that powers the interactive “plot canvas” experience.  
The goal is to replace the legacy `ui/interface/workspaceCanvas.js` entrypoint with a composable set of
modules that are easier to test, share, and evolve.

### Subfolder Ownership

| Folder        | Responsibility |
|---------------|----------------|
| `controller/` | Thin façade that wires initial bootstrap calls to the modules in `init/` and coordinates high‑level events (e.g. launching the canvas inside the shell app). |
| `core/`       | Low-level primitives that are independent from the DOM: id generators, history helpers, schema/version constants, serialisation utilities, and storage adapters. |
| `init/`       | Startup scripts that hydrate state, register services, and attach the controller to the host document. |
| `io/`         | File/network adapters dedicated to ingest/export (reserved for future extraction of upload/download helpers currently living in `ui/interface/workspaceCanvas.js`). |
| `plotting/`   | Plotly specific rendering helpers, layout builders, and data-normalisation utilities. |
| `services/`   | Cross-cutting helpers that interact with the rest of the FTIR application (toast service, session API bridges, feature flags, etc.). |
| `state/`      | Reactive data models that represent long-lived canvas state. At the moment this folder contains `panelsModel.js` and `sectionsModel.js`; future migrations will add derived selectors and persistence helpers. |
| `ui/`         | Pure presentational logic and DOM bindings. This is split into sub-folders (`browser/`, `panel/`, `styling/`, `viewport/`) and will eventually replace the monolithic UI code path in `ui/interface/workspaceCanvas.js`. |

### Migration Plan

1. **Model Convergence (DONE)**  
   - Move `panelsModel` and `sectionsModel` into `workspace/canvas/state/`.  
   - Update the legacy entrypoint to consume the new models as the single source of truth.

2. **Runtime Extraction (IN PROGRESS)**  
   - Carve out UI helpers (panel controls, browser tree, viewport sync) into `workspace/canvas/ui/**`.  
   - Introduce `core/` utilities to replace ad-hoc helpers that are currently nested in the legacy file.

3. **Controller Wiring (PLANNED)**  
   - Replace direct `initWorkspaceCanvas()` calls with the controller bootstrap.  
   - Route lifecycle events (load, reset, session restore) through the controller to make testing easier.

4. **IO & Plotting Modules (PLANNED)**  
   - Relocate upload/export logic into `io/`.  
   - Move Plotly-specific adapters into `plotting/` so that alternative renderers can be introduced in the future.

5. **Service Integration (PLANNED)**  
   - Port toast/session helpers into `workspace/canvas/services/`.  
   - Remove duplicated service calls from the old UI layer once consumers are migrated.

6. **Legacy Entry Removal (OUTSTANDING)**  
   - Delete `ui/interface/workspaceCanvas.js` once all UI and controller code has moved into this package.  
   - Update application bootstrap to import the new controller directly.

> **Tip:** During migration the legacy entry-point still bootstraps everything. Make incremental moves by exporting modules from this package and requiring them in the old file until the final cut-over.
