# MLIR UI Architecture

This document captures how the current FTIR analysis application is organised and how data flows through it. It is intended to help both Codex and human contributors reason about the codebase quickly, as well as highlight opportunities for future improvements.

---

## 1. High-Level Overview

- **Purpose**: Provide an interactive UI for uploading FTIR spectra, normalising them (auto-detecting transmittance vs absorbance), visualising traces, and managing saved sessions.
- **Tech Stack**: Django backend (apps/ftirui/ft) with custom parsing utilities (core/), vanilla ES modules for the UI (apps/ftirui/ft/static/ft/js), and Plotly for charting.
- **Deployment Targets**: Works as a Django site (manage.py) and is packaged via PyInstaller specs (`FTIR-UI.spec`, `ML-FTIR.spec`) for desktop builds.

---

## 2. Repository Layout

```
mlirui/
├─ apps/
│  ├─ ftirui/              ← Django project
│  │  ├─ ft/               ← Main FTIR Django app
│  │  │  ├─ static/ft/     ← Frontend assets (JS, CSS, demos)
│  │  │  ├─ templates/ft/  ← HTML templates
│  │  │  ├─ views.py       ← REST/HTML endpoints
│  │  │  └─ urls.py        ← Route definitions
│  │  ├─ manage.py, settings, runtime files
│  │  └─ sessions/         ← Saved session JSON blobs
├─ core/                   ← Shared parsing/IO helpers (JCAMP, CSV, etc.)
├─ build/, dist/           ← PyInstaller build artefacts
├─ python-embed/           ← Portable Python runtime (for packaged app)
└─ README.txt, specs, scripts
```

---

## 3. Backend Architecture (Django)

### 3.1 Apps
- `apps/ftirui/ft` is the only feature app. It exposes template views and JSON APIs used by the UI.
- URL patterns live in `apps/ftirui/ft/urls.py`. Key endpoints include:
  - `/` → `index()`: serves `templates/ft/base.html` containing the full UI.
  - `/workspace/` → `workspace_page()`: renders the standalone canvas shell used when dashboards open canvases in a new tab.
  - `/api/xy/` → `api_xy()`: main upload endpoint returning numeric arrays, metadata, and inferred ingest mode.
  - `/api/demos/` → `api_demo_files()`: enumerates demo datasets.
  - `/api/session/…` → CRUD endpoints for saving and loading user sessions (JSON stored under `sessions/`).
  - `/preview` and `/preview_json` for table previews during ingestion.

### 3.2 Parsing & Normalisation
- `_read_tabular_upload` ingests CSV/XLSX/text/JCAMP uploads and attaches metadata when available.
- `_coerce_xy` selects x/y columns and enforces numeric arrays.
- `_normalize_input_units` converts raw Y values to the canonical fractional transmittance representation, returning both the converted array and its inferred mode (abs or tr).
- Shared helpers:
  - `core/jcamp_utils.py`: robust JCAMP parsing and metadata extraction.
  - `core/io.py` & `core/io_utils.py`: additional utilities for batch conversions and CLI usage.

### 3.3 Persistence & Sessions
- Session APIs now persist state in the `PlotSession` model (backed by the project database). Each row stores the JSON payload, its byte size, and metadata placeholders for future external storage; access requires an authenticated user (401 JSON when missing) to guarantee user-scoped data. Responses now surface `size` and `storage` attributes, and oversized payloads trigger HTTP 413 until the external storage path is implemented.
- Dashboard-focused models (`WorkspaceSection`, `WorkspaceProject`, `WorkspaceCanvas`, `WorkspaceCanvasVersion`) mirror modern canvas tools. They expose REST endpoints under `/api/dashboard/...` so the client can list sections, create projects, save canvases (using the PlotSession JSON payload), and take immutable snapshots.
- Existing `PlotSession` rows can be imported into the new hierarchy via `python apps/ftirui/manage.py seed_workspace_from_sessions`. The command creates a default section/project per user and migrates each saved session into a canvas, with `--dry-run` and `--limit` helpers for cautious execution.
- Social login uses django-allauth (Google & GitHub). Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and optional `SITE_ID` in the environment. Minimal login/logout templates live under `templates/account/`.

- `/api/me/` exposes the current authentication status (username, email, avatar hash, cloud-session counts, and login/logout targets) so the front end can render account-aware widgets and keep redirect parameters in sync.
- Legacy JSON files under `MEDIA_ROOT/sessions` remain discoverable via the `python manage.py import_sessions_from_fs` dry-run command, which inventories what will be migrated.
- Uploaded demos are static assets under `static/ft/demos/`; additional demos can be dropped in without code changes.

---

## 4. Frontend Architecture (Vanilla ES Modules)

### 4.1 Entry HTML
- `templates/ft/base.html` defines the layout: upload controls, plot area, and settings panels.
- `/workspace` renders the same `workspace.html` partials outside the tabbed dashboard so users can pop canvases into their own tab without diverging UI contracts.
- Bootstrap provides base styling; custom CSS is under `static/ft/app.css`.

### 4.2 JavaScript Modules
- `static/ft/js/core/state.js` initialises the global application state (folders, traces, global settings) and exports helpers (IDs, colour palette, root folder ID).
- `static/ft/js/core/plot.js` builds Plotly traces/layouts based on the state and triggers re-renders.
- `static/ft/js/core/parse.js` (legacy) contains preview parsing utilities (distinct from backend parsing).
- Legacy Option B UI (`static/ft/js/ui/interfaceB.js`) has been retired. The active workspace experience now lives under `static/ft/js/ui/interface/controller/runtime/`, which orchestrates uploads, plotting, history, and persistence through modular facades.
- `static/ft/app.js` bootstraps shared UI chrome (theme toggle, account widget, toast notifications) and hands off to the dashboard/workspace modules. It consumes `/api/me/`, emits `ftir:user-status` events, and exposes `window.showAppToast` so feature modules can surface consistent feedback.
- `static/ft/js/ui/dashboard/initDashboard.js` pulls `/api/dashboard/...` data, renders sections/projects/canvases, and routes “open canvas” actions by navigating to `/?canvas=<uuid>#pane-plotC` so the workspace loads that canvas.
- `static/ft/js/ui/interface/canvasSnapshots.js` powers the workspace “Save snapshot / Manage snapshots” actions, calling `/api/dashboard/canvases/<id>/versions/` to persist and restore immutable snapshots.
- Additional UI helpers under `static/ft/js/lib/` provide CSRF handling, etc.

### 4.3 Data Flow
1. User selects/drops a file via the workspace IO facade (`static/ft/js/ui/interface/controller/runtime/io/facade.js`) orchestrated by `workspaceRuntime.js`.
2. Front-end FormData posts to `/api/xy/`, passing the current input units preference (`auto|abs|tr`).
3. Django endpoint reads the file, normalises the Y axis, infers the ingest mode, and returns `{x, y, meta, ingest_mode}`.
4. Front-end state stores both raw (`trace.source.y`) and display data (`trace.data.y`); metadata is shown as tooltips in the folder tree.
5. Plotly re-renders when traces or global settings change.
6. Sessions are serialised via `/api/session/…`, rehydrating state on load.

---

## 5. Development Workflow Notes

### 5.1 Environment
- Use the Django project under `apps/ftirui/ftirui` with `manage.py` (standard `python manage.py runserver`).
- Static assets are served directly; no bundler step is required currently.

### 5.2 Common Tasks
- **Run the dev server**: `cd apps/ftirui && python manage.py runserver`
- **Collect static (for deployment)**: `python manage.py collectstatic`
- **Regenerate PyInstaller builds**: Use the `.spec` files in repo root or `apps/ftirui`.
- **Linting/formatting**: Not enforced by tooling; maintainers rely on manual review.
- **Testing**: Django unit tests cover `PlotSession` CRUD and payload limits (`python apps/ftirui/manage.py test ft`). Manual regression is still essential for uploads, plotting, and session UX (cloud/local save, export/import, autosave indicator).

### 5.3 Contributor Tips
- Keep backend parsing deterministic; subtle differences in normalization cascade to the UI.
- When touching the dashboard hierarchy, prefer using the provided management command for test data instead of crafting manual DB entries.
- When touching the workspace runtime stack (`workspaceRuntime.js` and its facades), be mindful of the global state mutations—multiple features depend on consistent keys (`inputAuto`, `inputMode`, folder structures).
- For static assets, maintain ASCII unless existing file uses unicode (project policy).

---

## 6. Known Pain Points

- **Large orchestration modules**: `workspaceRuntime.js` still coordinates many concerns; keep pushing logic into dedicated facades/managers to maintain separation of responsibilities.
- **Limited automated verification**: Lack of tests increases regression risk for parsing and unit conversion logic.
- **Synchronous/local session storage**: Session persistence uses filesystem JSON files, complicating multi-user or cloud deployment.
- **Duplicate parsing logic**: Backend `_read_tabular_upload` and front-end `core/parse.js` are divergent, risking inconsistent behaviour in previews vs full ingestion.

---

## 7. Future Architecture Proposal (Conceptual)

The current structure is functional but monolithic. A more efficient and maintainable architecture could look like this:

1. **API Layer Modernisation**
   - Reorganise backend endpoints into a dedicated Django REST Framework (DRF) app. Define serializers for uploads, traces, and sessions, enabling validation and versioning.
   - Expose session data via authenticated REST endpoints (optional token or user-based storage), paving the way for multi-user deployments.

2. **Service Modules for Parsing**
   - Extract parsing/normalisation logic into a standalone Python package (e.g., `ftir_core`) with full unit coverage.
   - Provide both CLI and programmatic entrypoints, so the UI server and batch conversion scripts share identical code.

3. **Typed Frontend with Componentisation**
   - Replace the monolithic vanilla JS with a component-based SPA (React/Vue/Svelte) compiled by Vite or similar.
   - Encode application state with TypeScript types, separating data stores (e.g., Zustand/Redux) from presentation components.
   - Factor plot logic into dedicated hooks/components, isolating Plotly integration.

4. **Shared Schema Contracts**
   - Define JSON schemas (or OpenAPI) for all API payloads and use code generation for both backend (Pydantic/DRF serializers) and frontend (TypeScript types).
   - This reduces drift between backend responses and frontend expectations (`ingest_mode`, metadata fields, etc.).

5. **Testing & CI**
   - Introduce pytest suites covering parsing heuristics and REST APIs (using DRF test client).
   - Add frontend unit tests (Vitest/Jest) and integration smoke tests (Playwright) for core flows: upload, auto-detect mode, session save/load.
   - Configure CI (GitHub Actions) to run lint + tests on pull requests and PyInstaller packaging on tags.

6. **Deployment Pipeline**
   - Containerise the Django app (Dockerfile) with multi-stage build supporting both web deployment and packaging.
   - For desktop builds, script reproducible PyInstaller artefacts using the unified parsing package.

This proposed architecture emphasises modular boundaries, typed contracts, and automated testing. It would reduce maintenance overhead, facilitate parallel development, and make the system friendlier to both web and desktop deployment scenarios without altering existing features immediately.

---

*Maintainers should keep this document current as modules evolve. Contributions that touch multiple architectural layers should update the relevant sections to reflect the new structure or design decisions.*
