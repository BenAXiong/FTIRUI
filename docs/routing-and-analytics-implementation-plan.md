# Routing and Minimal Analytics Implementation Plan

This document logs the current plan for combining route changes for first-time and logged-in users with a minimal but solid analytics foundation.

It is intentionally forward-looking. For the current repo mechanics, see `architecture.md`.

---

## 1. Goals

Primary product goals:

- make first-time-user routing explicit instead of implicit
- keep guest and signed-in flows understandable
- add analytics from day 1 without coupling product behavior to analytics delivery
- capture enough signal to answer adoption and routing questions later

Non-goals for the first pass:

- building internal analytics dashboards in Django
- mirroring a full billing system into the app database
- adding a large event taxonomy
- blocking navigation or save flows on analytics success

---

## 2. Current Constraints From the Repo

The implementation has to fit the existing route model:

- `/` is already auth-sensitive
- `/workspace/` already supports standalone canvas loading
- dashboard canvas open already branches between tabbed workspace and standalone workspace
- `app.js` already resolves auth state via `/api/me/`
- `workspaceRuntime.js` already toggles cloud/local behavior based on auth state and active canvas presence

This means the safest approach is to formalize and instrument the existing route decisions rather than invent a separate routing layer first.

---

## 3. Recommended Analytics Shape

Recommended MVP stack:

- PostHog for product analytics
- Stripe Billing for future subscription flows
- no `dj-stripe` initially unless we later decide we need Stripe objects mirrored into Django models

Why:

- PostHog already handles anonymous distinct ids and identify flows cleanly
- the repo already has a clear auth bootstrap point in `app.js`
- the current backend does not yet justify a heavier billing sync layer

Important implementation choice:

- do not invent a custom anonymous-id merge protocol if PostHog is the chosen tool
- let the analytics SDK own the anonymous distinct id
- call `identify(user_id)` when auth becomes known
- call `reset()` on logout
- only use aliasing if we later introduce two separate stable ids that genuinely need joining

---

## 4. Minimal Event Taxonomy

Keep names boring and consistent.

### 4.1 Base Event Properties

Every analytics event should add the same base properties where available:

- `route_name`
- `path`
- `auth_state` = `guest|authenticated`
- `workspace_mode` = `tabbed|standalone|guest_landing`
- `has_canvas_id` = boolean
- `dashboard_enabled` = boolean
- `workspace_tab_enabled` = boolean
- `dev_override` = boolean
- `app_surface` = `dashboard|workspace|profile|auth`

### 4.2 Initial Canonical Events

Routing and auth:

- `route_resolved`
- `auth_state_resolved`
- `login_started`
- `login_completed`
- `logout_completed`

Workspace and dashboard:

- `canvas_opened`
- `canvas_saved`
- `snapshot_created`
- `snapshot_restored`
- `session_saved_legacy`
- `session_loaded_legacy`

Import/export:

- `file_imported`
- `export_completed`

Suggested event props:

- `canvas_saved`
  - `storage = cloud|local`
  - `size_bucket`
  - `canvas_linked`
  - `trace_count_bucket`
- `export_completed`
  - `format = png|svg|csv|bundle`
  - `duration_ms_bucket`
- `file_imported`
  - `filetype`
  - `ingest_mode = auto|abs|tr`
  - `source_kind = upload|demo`

Keep the first version deliberately small. Add events only after they answer a real product question.

---

## 5. Route Decision Model to Formalize

The current code already behaves like a route resolver. The planned change is to make that decision model explicit and observable.

### 5.1 State Axes

The route decision should be based on:

- auth state
- first-time vs returning
- whether a server canvas id is present
- whether the workspace tab is enabled
- whether a dev override is active

### 5.2 Proposed Route Outcomes

At the decision-model level, the outcomes should be named and tracked:

- `guest_workspace_landing`
- `authenticated_dashboard_home`
- `standalone_canvas_open`
- `tabbed_canvas_open`
- `profile_view`

### 5.3 First-Time State

Do not derive first-time state from analytics alone.

Track it separately:

- guest-first-use marker in localStorage, for example `ftir.onboarding_seen.v1`
- authenticated-first-use marker in durable business state later, for example:
  - `first_workspace_opened_at`
  - `onboarding_completed_at`

This keeps routing deterministic even if analytics are blocked.

---

## 6. Proposed Implementation Structure

### 6.1 Backend

Add a small route-resolution helper rather than expanding inline view branching.

Recommended new module:

- `apps/ftirui/ft/routing.py`

Responsibilities:

- derive a normalized route outcome
- centralize flags derived from:
  - auth state
  - `canvas` query param
  - feature flags
  - `dev=true`
- return a compact context object used by:
  - `index()`
  - `workspace_page()`
  - later analytics hooks if needed

Possible companion module:

- `apps/ftirui/ft/analytics.py`

Responsibilities:

- backend-safe no-op wrapper when analytics is disabled
- small helper API such as:
  - `capture_server_event(name, user=None, properties=None)`
- future home for Stripe webhook or server-truth events

### 6.2 Frontend

Add one analytics wrapper, not direct SDK calls everywhere.

Recommended new file:

- `apps/ftirui/ft/static/ft/js/services/analytics.js`

Responsibilities:

- initialize analytics provider if configured
- expose:
  - `capture(name, props)`
  - `identify(userId, props)`
  - `reset()`
  - `captureRouteResolved(props)`
- append shared base props from body datasets and runtime state
- fail silently when analytics is unavailable

### 6.3 Existing Insertion Points

Use these existing modules first:

- `ft.views.index()`
  - route resolution source of truth for `/`
- `ft.views.workspace_page()`
  - route resolution source of truth for standalone workspace
- `ft.views.api_me()`
  - auth bootstrap contract for the frontend
- `static/ft/app.js`
  - auth-state resolution, sign-in/sign-out state changes, initial route analytics
- `static/ft/js/ui/dashboard/initDashboard.js`
  - canvas open events and dashboard navigation decisions
- `static/ft/js/ui/interface/controller/runtime/workspaceRuntime.js`
  - cloud-vs-local canvas behavior and workspace-specific usage events

Do not put analytics logic directly into low-level Plotly/panel internals unless the event truly belongs there.

---

## 7. Implementation Phases

### Phase 1: Document and Normalize Routing

Tasks:

- add a backend route-resolution helper
- make route outcomes explicit in view code
- expose the normalized route outcome on the page via body dataset
- update docs to reflect the real route matrix

Deliverables:

- easier future changes to first-time and logged-in routing
- stable analytics context for route events

### Phase 2: Add Analytics Wrapper

Tasks:

- add `services/analytics.js`
- support provider initialization through environment-backed template config
- ensure no-op behavior when analytics is disabled

Deliverables:

- one place to change analytics provider behavior
- no product code coupled to vendor SDK details

### Phase 3: Identity Lifecycle

Tasks:

- initialize analytics on page boot
- on `/api/me/` resolution:
  - if authenticated -> `identify(user.id)` or stable internal id exposed by backend
  - if anonymous -> leave provider anonymous id alone
- on logout completion -> `reset()`

Important rule:

- use stable internal ids, not email addresses, as primary analytics identities

### Phase 4: Instrument the Minimal Event Set

Tasks:

- capture `route_resolved`
- capture `auth_state_resolved`
- capture `canvas_opened`
- capture `canvas_saved`
- capture `snapshot_created`
- capture `file_imported`
- capture `export_completed`

Deliverables:

- enough data to validate route design and early product adoption

### Phase 5: Add Server-Truth Events

Only after the client flow is stable.

Tasks:

- emit backend events for actions where the server is authoritative
- likely examples:
  - canvas state persisted
  - snapshot persisted
  - future billing entitlement changed
  - future webhook processed

Do not duplicate every client event on the server. Only emit events where server truth matters.

---

## 8. Privacy and Data Hygiene Rules

These should be treated as hard constraints:

- never send raw canvas JSON
- never send uploaded file contents
- never send full filenames if avoidable
- bucket sizes instead of sending exact sizes unless truly needed
- prefer normalized filetype labels over free-form metadata
- do not use email as the analytics primary id

If an event payload feels convenient but not clearly necessary, remove it.

---

## 9. Dashboards and Reporting

Do not build analytics dashboards in Django.

Django should only:

- emit analytics events
- store business state that the product actually depends on
- maintain auth, routing, and entitlements
- log operational errors separately

Analytics dashboards belong in the analytics tool.

---

## 10. Open Decisions

These need product decisions before coding the full route change:

1. What should a first-time anonymous user see on `/`?
   - current behavior is guest workspace
2. What should a returning anonymous user see on `/`?
   - same as first-time, or a different landing?
3. Should authenticated users always land on dashboard, or resume the last canvas context?
4. Should first-time authenticated users have a different route from returning authenticated users?
5. Does the route resolver need a durable server-side onboarding state yet, or is localStorage enough for the first pass?

Until these are decided, analytics should observe the current routing, not force a speculative route model into production code.

---

## 11. Recommended First Code Changes

If implementation starts now, the safest order is:

1. Extract route resolution from `ft.views.index()` and `ft.views.workspace_page()` into a helper.
2. Expose normalized route metadata on the rendered page.
3. Add `services/analytics.js` as a no-op wrapper.
4. Instrument `app.js` for `route_resolved` and `auth_state_resolved`.
5. Instrument dashboard canvas open and workspace save/open actions.
6. Add backend event wrapper only after the client event taxonomy is stable.

This keeps the first refactor reversible and makes it easy to verify the route model before subscriptions or billing complexity enter the picture.
