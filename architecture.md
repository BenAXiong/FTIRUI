# MLIR UI Architecture

This document is a current-state mechanics map for the checked-in repository. It is intended to make it easy to answer "where does this live?" and "what actually happens today?" without re-tracing the code every time.

It focuses on the current implementation, not aspirational architecture. Forward-looking routing and analytics work is tracked separately in `docs/routing-and-analytics-implementation-plan.md`.

---

## 1. High-Level Overview

- Purpose: an FTIR-focused Django application for uploading spectra, normalizing input units, plotting and editing traces in a workspace canvas, and persisting saved state for authenticated users.
- Backend stack: Django 4.2.x application under `apps/ftirui/`, with a single feature app `ft` and reusable parsing helpers under `core/`.
- Frontend stack: server-rendered templates plus vanilla ES modules under `apps/ftirui/ft/static/ft/js`.
- Visualization stack: Plotly-backed workspace panels coordinated by `workspaceRuntime.js`.
- Auth stack: Django session auth plus `django-allauth` social login for Google and GitHub.
- Deployment targets: local Django dev server, Docker web deployment, and PyInstaller-packaged desktop builds.

Important repo reality:

- `apps/ftirui/ftirui/settings.py` is the effective default settings module.
- The file header in `settings.py` still says Django 5.2.x, but the pinned dependency is Django 4.2 (`apps/ftirui/requirements.txt`).
- The checked-in default database configuration is SQLite, even though `.env.example` and some docs still mention Postgres and `DATABASE_URL`.

---

## 2. Repository Layout

```text
mlirui/
|- apps/
|  |- ftirui/
|  |  |- ft/                      # Django feature app
|  |  |  |- management/commands/ # migration + seed helpers
|  |  |  |- migrations/          # schema history
|  |  |  |- static/ft/           # JS, CSS, vendor assets, demos
|  |  |  |- templates/           # Django templates
|  |  |  |- context_processors.py
|  |  |  |- models.py
|  |  |  |- sessions_repository.py
|  |  |  |- urls.py
|  |  |  |- views.py
|  |  |- ftirui/
|  |  |  |- settings.py
|  |  |  |- urls.py
|  |  |  |- wsgi.py / asgi.py
|  |  |- manage.py
|  |  |- setting_dist.py         # desktop-oriented settings override
|- core/                         # parsing + conversion helpers
|- docs/                         # supporting architecture docs
|- tests/                        # Playwright + unit tests outside Django app
|- README.md
|- architecture.md
|- apps-architecture.md
```

Useful subdocuments:

- `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/ARCHITECTURE.md`
  - detailed workspace runtime/facade architecture and guardrails
- `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/README.md`
  - quick index of workspace runtime directories
- `docs/workspace-panel-architecture.md`
  - panel-specific notes

---

## 3. Django Project Structure

### 3.1 Project URLs

The top-level URL configuration in `apps/ftirui/ftirui/urls.py` is intentionally small:

- `/admin/` -> Django admin
- `/accounts/` -> `allauth` routes
- `/` -> everything in `ft.urls`

### 3.2 Installed Apps and Middleware

Auth-relevant installed apps in `apps/ftirui/ftirui/settings.py`:

- `django.contrib.auth`
- `django.contrib.sessions`
- `django.contrib.sites`
- `allauth`
- `allauth.account`
- `allauth.socialaccount`
- `allauth.socialaccount.providers.google`
- `allauth.socialaccount.providers.github`

Relevant middleware:

- `django.contrib.sessions.middleware.SessionMiddleware`
- `django.middleware.csrf.CsrfViewMiddleware`
- `django.contrib.auth.middleware.AuthenticationMiddleware`
- `allauth.account.middleware.AccountMiddleware`

### 3.3 Settings Reality

Current default settings behavior:

- `DATABASES['default']` is SQLite at `apps/ftirui/db.sqlite3`.
- `AUTHENTICATION_BACKENDS` includes Django `ModelBackend` plus the allauth backend.
- `LOGIN_URL` is `/accounts/login/`.
- `LOGIN_REDIRECT_URL` and `LOGOUT_REDIRECT_URL` default to `/`.
- `ACCOUNT_EMAIL_VERIFICATION = 'none'`.
- `ACCOUNT_RATE_LIMITS` only explicitly configures failed login throttling.
- `SOCIALACCOUNT_LOGIN_ON_GET = True`.
- Feature flags exposed from settings:
  - `WORKSPACE_LEGACY_ENABLED`
  - `WORKSPACE_DEV_SHORTCUT_ENABLED`
  - `DASHBOARD_V2_ENABLED`

Known config drift:

- `.env.example` mentions `DATABASE_URL`, but the default `settings.py` does not read it.
- `MEDIA_ROOT` and `MEDIA_URL` are commented out in `settings.py`, while `ft.views` expects them.
- `apps/ftirui/setting_dist.py` defines `MEDIA_ROOT` explicitly for desktop packaging, so packaged builds are less ambiguous than the default web settings path.

---

## 4. Routing and Page Modes

The repo currently supports three major user-visible shells:

1. Dashboard + tabs on `/`
2. Standalone workspace shell on `/workspace/`
3. Profile page on `/profile/`

### 4.1 Home Route: `/`

`ft.views.index()` renders `templates/ft/base.html` and chooses between guest-first and signed-in contexts:

- Authenticated user:
  - `workspace_only = False`
  - `workspace_pane_active = False`
  - dashboard is the primary shell
- Anonymous user:
  - `workspace_only = True`
  - `workspace_pane_active = True`
  - `guest_workspace_landing = True`
  - guest is dropped directly into the workspace shell

This means `/` is not a neutral landing page today. It is already auth-sensitive and doubles as a routing decision point.

### 4.2 Workspace Route: `/workspace/`

`ft.views.workspace_page()` renders the standalone workspace shell used when a dashboard canvas opens outside the tabbed dashboard.

Behavior:

- always renders workspace mode
- accepts `?canvas=<uuid>`
- if the user is authenticated and owns the canvas, the view injects `active_canvas`
- if the canvas id is missing, invalid, or belongs to another user, the shell still renders but without a loaded server-backed canvas
- `?dev=true` forces the non-standalone wrapper behavior used by feature-flag/dev flows

### 4.3 Profile Route: `/profile/`

`ft.views.profile()` is the only HTML route in `ft` protected with `@login_required`. It renders user details and the cloud-state card.

### 4.4 Template Context Flags

The current route behavior is driven by template flags more than by separate pages:

- `workspace_only`
- `workspace_pane_active`
- `active_canvas`
- `requested_canvas_id`
- `guest_workspace_landing`

These values are consumed by:

- `templates/ft/base.html`
- `templates/ft/layouts/app_shell.html`
- `templates/ft/partials/header_nav.html`
- `templates/ft/workspace/components/workspace_hud.html`

`ft.context_processors.feature_flags()` also injects:

- `workspace_tab_enabled`
- `workspace_pane_active`
- `workspace_dev_shortcut_enabled`
- `workspace_dev_active`
- `dashboard_v2_enabled`

### 4.5 Dashboard -> Workspace Navigation

The dashboard frontend opens canvases via `static/ft/js/ui/dashboard/initDashboard.js`.

Current behavior:

- if the workspace tab is enabled, navigation stays on the current page and appends:
  - `?canvas=<id>`
  - `#pane-plotC`
- if the workspace tab is disabled, navigation goes to:
  - `/workspace?canvas=<id>`
  - and preserves `dev=true` when active

This route split is important for future first-time-user routing changes because the client already contains logic that depends on whether the workspace is tabbed or standalone.

---

## 5. Authentication and User Model

### 5.1 Current User Model

- No custom `AUTH_USER_MODEL` is configured.
- All ownership relations point to Django's built-in user model via `get_user_model()`.

### 5.2 Login Mechanism

The app uses Django session auth plus `django-allauth`.

Current UI characteristics:

- `/accounts/login/` uses a custom template with only social login buttons:
  - Google
  - GitHub
- `/accounts/logout/` uses a custom logout confirmation template
- there is no custom in-app username/password login form
- Django admin still exists and is used by smoke tests for staff login

### 5.3 Auth State API

`ft.views.api_me()` is the frontend's auth bootstrap endpoint. It returns:

- `authenticated`
- `username`
- `email`
- `avatar` (Gravatar hash from email)
- `session_count`
- `login_url`
- `logout_url`

Important nuance:

- `session_count` counts legacy `PlotSession` rows, not dashboard canvases.

### 5.4 Frontend Auth Bootstrap

`static/ft/app.js`:

- fetches `/api/me/`
- updates sign-in/sign-out UI
- sets `document.body.dataset.userAuthenticated`
- dispatches a `ftir:user-status` event for other modules

The workspace runtime listens for that event to toggle guest-specific behavior.

### 5.5 API Authorization Model

Protected JSON routes use a lightweight custom decorator in `ft.views`:

- `_require_json_auth`
  - returns JSON `401 {"error": "Authentication required"}` for anonymous users

Ownership is enforced by user-scoped ORM queries:

- sections are fetched by `owner=user`
- projects are fetched by `owner=user`
- canvases are fetched by `owner=user`

Effectively:

- anonymous user -> `401`
- authenticated wrong user -> object lookup fails and usually returns `404`

There is no custom role/permission system on top of this for the `ft` endpoints.

---

## 6. Persistence Model

There are two server-backed persistence layers in the repo today:

1. Legacy user sessions (`PlotSession`)
2. Dashboard/workspace hierarchy (`WorkspaceSection`, `WorkspaceProject`, `WorkspaceCanvas`, `WorkspaceCanvasVersion`)

### 6.1 PlotSession

`PlotSession` is the legacy cloud-save/session API model.

Fields:

- `id` (UUID)
- `owner` (nullable FK to user, `SET_NULL`)
- `title`
- `state_json`
- `state_size`
- `storage_backend`
- `payload_locator`
- timestamps

The backing repository module is `ft/sessions_repository.py`.

Current repository behavior:

- everything is stored inline in the DB
- `storage_backend` is currently always `db`
- payloads above `MAX_EMBEDDED_BYTES = 2_000_000` raise `SessionTooLargeError`

### 6.2 Dashboard Workspace Hierarchy

These models back the newer Projects/Folders/Canvases experience:

- `WorkspaceSection`
  - top-level user-owned grouping
- `WorkspaceProject`
  - belongs to a section
- `WorkspaceCanvas`
  - editable current canvas state
- `WorkspaceCanvasVersion`
  - immutable snapshots of a canvas

Important `WorkspaceCanvas` fields:

- `state_json`
- `state_size`
- `thumbnail_url`
- `version_label`
- `autosave_token`
- `is_favorite`
- `tags`

Delete semantics:

- sections/projects/canvases generally use `CASCADE`
- canvas versions use `SET_NULL` for `created_by`

### 6.3 Migration Helpers

Management commands under `ft/management/commands/`:

- `migrate_sessions`
  - moves `PlotSession` rows into workspace canvases
- `seed_dashboard_demo`
  - creates demo section/project/canvas data for an existing user
- `import_sessions_from_fs`
  - inspects legacy JSON session files under `MEDIA_ROOT/sessions`
  - current behavior is dry-run only; commit/import is not implemented

### 6.4 Local / Browser-Side Persistence

The workspace also has browser-side persistence for guest/offline flows:

- the runtime persistence facade and state helpers manage local snapshot/autosave behavior
- the UI explicitly treats logout/guest mode as "local only" rather than as complete lockout

This local path is separate from `PlotSession` and `WorkspaceCanvas` server persistence.

---

## 7. Backend Endpoints

### 7.1 HTML Endpoints

Defined in `ft.urls`:

- `/` -> `index`
- `/workspace/` -> `workspace_page`
- `/profile/` -> `profile`

### 7.2 Upload / Utility JSON Endpoints

Public endpoints include:

- `/data/`
- `/preview/`
- `/api/xy/`
- `/export/png/`
- `/notes/`
- `/logs/`
- `/api/demos/`

These are primarily used for ingest, preview, export, demos, and utility features.

### 7.3 Auth-Aware JSON Endpoints

`/api/me/`

- current auth state
- login/logout targets
- session count

### 7.4 Protected Session Endpoints

- `/api/session/` -> create
- `/api/session/list/` -> list
- `/api/session/<uuid>/` -> get/update/delete

These are protected by `_require_json_auth`.

### 7.5 Protected Dashboard Endpoints

- `/api/dashboard/sections/`
- `/api/dashboard/sections/<uuid>/`
- `/api/dashboard/sections/<uuid>/projects/`
- `/api/dashboard/projects/<uuid>/`
- `/api/dashboard/projects/<uuid>/canvases/`
- `/api/dashboard/canvases/<uuid>/`
- `/api/dashboard/canvases/<uuid>/state/`
- `/api/dashboard/canvases/<uuid>/thumbnail/`
- `/api/dashboard/canvases/<uuid>/versions/`
- `/api/dashboard/canvases/<uuid>/versions/<uuid>/`

These are the main server contract for the modern dashboard and workspace canvas flows.

---

## 8. Frontend Architecture

### 8.1 Shared Boot Layer

`static/ft/app.js` is the cross-page boot layer. It handles:

- theme toggle
- user status bootstrap
- sign-in/sign-out UI state
- toast notifications
- global `window.showAppToast`

It is the best current insertion point for route/auth analytics because it already centralizes auth-state resolution and top-level chrome behavior.

### 8.2 Services Layer

Lightweight wrappers live under `static/ft/js/services/`:

- `dashboard.js`
  - wraps `/api/dashboard/...`
- `sessions.js`
  - wraps `/api/session/...`
- `uploads.js`
  - upload helpers
- `demos.js`
  - demo file listing

Notable behavior:

- `sessions.js` treats `401` as a normal "requires sign-in" state for list/load/delete/save flows
- this is why guest mode remains usable instead of failing hard

### 8.3 Dashboard UI

Main entry point:

- `static/ft/js/ui/dashboard/initDashboard.js`

Responsibilities:

- fetch and render sections/projects/canvases
- apply filters and sidebar state
- create/update/delete dashboard entities
- open canvases in either tabbed or standalone workspace mode

### 8.4 Workspace UI

Main orchestration entry point:

- `static/ft/js/ui/interface/controller/runtime/workspaceRuntime.js`

The runtime is intentionally split into facades and helpers, documented in:

- `static/ft/js/ui/interface/controller/runtime/ARCHITECTURE.md`

Major runtime areas:

- `browser/`
- `io/`
- `panels/`
- `persistence/`
- `preferences/`
- `sections/`
- `state/`
- `toolbar/`
- `thumbnails/`

Important runtime auth interaction:

- it reads `document.body.dataset.userAuthenticated`
- it listens for `ftir:user-status`
- it only enables dashboard cloud hydrate/sync when the user is authenticated and a canvas id is present
- otherwise it falls back to local snapshot restore and shows guest/offline messaging

### 8.5 Legacy / Transitional Code

There is still legacy or transitional frontend code in the repo:

- `static/ft/js/core/*`
- `static/ft/js/legacy/*`
- some dashboard/workspace overlap in older modules

When tracing behavior, prefer the newer paths unless the template explicitly references a legacy script.

---

## 9. Core Data Flows

### 9.1 Auth Bootstrap Flow

1. User loads `/` or `/workspace/`.
2. Django renders template flags based on auth state and route params.
3. `app.js` requests `/api/me/`.
4. `app.js` updates UI, sets body dataset, and dispatches `ftir:user-status`.
5. Workspace/dashboard modules adapt behavior based on the resolved auth state.

### 9.2 Dashboard Canvas Open Flow

1. Dashboard fetches workspace hierarchy from `/api/dashboard/...`.
2. User clicks a canvas.
3. `initDashboard.js` routes to:
   - same-page tabbed workspace with `?canvas=<id>#pane-plotC`, or
   - standalone `/workspace?canvas=<id>`
4. `workspace_page()` injects `active_canvas` if the user owns it.
5. Workspace runtime hydrates remote canvas state when cloud sync is allowed.

### 9.3 Upload / Ingest Flow

1. User selects or drops a file in the workspace.
2. Runtime IO facade posts to `/api/xy/`.
3. Django reads tabular or JCAMP input and normalizes the Y axis.
4. Response returns arrays plus metadata and ingest mode.
5. Workspace runtime inserts or updates traces/panels and re-renders Plotly.

### 9.4 Legacy Session Save Flow

1. Authenticated user saves via session UI.
2. Frontend posts to `/api/session/`.
3. `sessions_repository.py` serializes and size-checks the state.
4. `PlotSession` row is created or updated.

### 9.5 Dashboard Canvas Save Flow

1. User edits a server-backed canvas.
2. Frontend saves state through `/api/dashboard/canvases/<id>/state/`.
3. `WorkspaceCanvas.state_json` and related metadata are updated.
4. Snapshots are created separately via `/versions/`.
5. Thumbnail capture is sent separately to `/thumbnail/`.

---

## 10. Testing and Operational Tooling

Backend tests:

- `apps/ftirui/ft/tests/test_sessions.py`
- `apps/ftirui/ft/tests/test_dashboard.py`
- `apps/ftirui/ft/tests/test_profile.py`

Covered areas include:

- `/api/me/`
- anonymous rejection for protected APIs
- `PlotSession` CRUD and payload limits
- dashboard canvas/version CRUD flows
- profile auth protection
- demo seed command path

Frontend tests:

- Vitest runtime and helper tests under the workspace runtime tree and `tests/unit/`
- Playwright smoke and accessibility checks under `tests/`

Operational scripts / packaging:

- `docker-compose.yml`
- `Dockerfile`
- `docker/entrypoint.sh`
- PyInstaller spec files in repo root

Smoke tests currently log in through Django admin with a staff user and then reuse that session for app flows.

---

## 11. Known Drift and Caveats

These are the main mismatches or gotchas worth remembering:

1. `architecture.md` before this rewrite contained stale claims about filesystem-backed session storage. The current `/api/session/` implementation uses the DB-backed `PlotSession` model.
2. `.env.example` and README mention Postgres and `DATABASE_URL`, but the checked-in default settings still use SQLite directly.
3. `MEDIA_ROOT` / `MEDIA_URL` handling is inconsistent across settings modules. Views assume them; default web settings do not clearly define them.
4. `session_count` in `/api/me/` reflects `PlotSession` only, not the newer workspace hierarchy.
5. The dashboard/workspace route split already exists. Any first-time-user or logged-in-user routing change must account for:
   - guest `/`
   - authenticated `/`
   - `/workspace?canvas=<id>`
   - tabbed workspace `?canvas=<id>#pane-plotC`
   - `dev=true` feature-flag override flows
6. `workspaceRuntime.js` is still very large, even though the facade split is in progress. Use the runtime architecture document before changing its wiring.

---

## 12. Current Gaps Relevant to Future Routing and Analytics Work

There is currently no first-class analytics implementation in the repo:

- no PostHog, Plausible, Mixpanel, or similar client SDK
- no backend analytics service wrapper
- no event taxonomy document
- no server-side billing/analytics sync layer

Because routing already depends on auth state, canvas context, and feature flags, the clean insertion points for future routing/analytics work are:

- backend route resolution in `ft.views.index()` and `ft.views.workspace_page()`
- auth status contract in `ft.views.api_me()`
- top-level client bootstrap in `static/ft/app.js`
- dashboard navigation in `static/ft/js/ui/dashboard/initDashboard.js`
- workspace auth-aware cloud sync logic in `workspaceRuntime.js`

See `docs/routing-and-analytics-implementation-plan.md` for the proposed implementation sequence.

---

Keep this document current when the route model, auth model, or persistence model changes. It should stay useful as a "what exists now" reference, not a wish list.
