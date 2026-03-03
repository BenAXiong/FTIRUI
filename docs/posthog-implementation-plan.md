# PostHog Implementation Plan

This document defines the minimum PostHog implementation for the current product so we capture useful product signal early without having to rewrite the schema later.

It is scoped to the current repo state on March 3, 2026.

## Implementation Checklist

Use this as the execution tracker. Tick each item only when the code/config/docs work is actually complete. Stamp the completion time when each item is done.

- [x] 0. Implementation start
  - Started: 26/03/03 22:26
- [ ] 1. Add PostHog project configuration
  - Completed:
  - [ ] Create the PostHog project
  - [ ] Add project API key and host env vars
  - [x] Decide whether to load PostHog only in production or also in local dev
  - Note: code-side env wiring is ready; the actual PostHog project and live env values are still pending.
- [x] 2. Add a single frontend analytics wrapper
  - Completed: 26/03/03 22:26
  - [x] Create one `analytics` service wrapper
  - [x] Initialize PostHog in one place only
  - [x] Make analytics a safe no-op when env vars are missing
- [x] 3. Lock the base event schema
  - Completed: 26/03/03 22:26
  - [x] Define required base properties
  - [x] Define the first event names
  - [x] Document privacy rules so raw payloads do not leak into events
- [x] 4. Instrument the top product events
  - Completed: 26/03/03 22:26
  - [x] Route and auth events
  - [x] Dashboard and canvas lifecycle events
  - [x] File import and export events
  - [x] Plan / upgrade intent events
- [ ] 5. Verify identity flow
  - Completed:
  - [ ] Anonymous user gets an anonymous distinct id
  - [ ] Authenticated user is identified after auth state resolves
  - [ ] Logout resets analytics identity cleanly
  - Note: the client-side identify/reset flow is wired, but it still needs live verification in a real PostHog project.
- [ ] 6. Validate event quality
  - Completed:
  - [ ] Confirm events appear in PostHog live events
  - [ ] Confirm event properties are populated consistently
  - [ ] Confirm no raw canvas JSON, filenames, or sensitive payloads are sent

## Goal

Track the smallest useful event set that answers the first real product questions:

- are users reaching the dashboard and workspace successfully
- are they creating, opening, and saving canvases
- are they importing data
- are they showing upgrade intent

This first pass should optimize for schema stability, not event volume.

## Top Events To Capture First

These are the top events worth instrumenting first for this product:

- `route_resolved`
- `auth_state_resolved`
- `login_completed`
- `canvas_created`
- `canvas_opened`
- `canvas_saved`
- `file_imported`
- `snapshot_created`
- `snapshot_restored`
- `plan_checkout_started`

If you want an even smaller first pass, keep only:

- `route_resolved`
- `login_completed`
- `canvas_opened`
- `canvas_saved`
- `file_imported`
- `plan_checkout_started`

## Base Properties

Every event should include these properties where available:

- `path`
- `route_name`
- `auth_state`
  - `guest` or `authenticated`
- `workspace_mode`
  - `tabbed`, `standalone`, or `dashboard`
- `workspace_plan`
  - `free`, `pro`, or `team`
- `billing_status`
  - `inactive` or `active`
- `canvas_id`
- `project_id`
- `section_id`
- `dashboard_enabled`
- `workspace_tab_enabled`
- `render_host`

## Event-Specific Properties

Use these so the schema stays useful later without becoming noisy now.

- `route_resolved`
  - `entry_surface`
  - `has_canvas_id`
  - `dev_override`

- `login_completed`
  - `provider`
    - `password`, `google`, `github`

- `canvas_created`
  - `source`
    - `dashboard`, `workspace`, `guest_bootstrap`

- `canvas_opened`
  - `open_source`
    - `dashboard`, `workspace_resume`, `direct_link`
  - `quota_locked`

- `canvas_saved`
  - `save_mode`
    - `manual`, `autosave`
  - `state_size_bucket`
    - `xs`, `sm`, `md`, `lg`
  - `trace_count_bucket`
    - `0`, `1`, `2_5`, `6_10`, `11_plus`

- `file_imported`
  - `source_kind`
    - `upload`, `demo`
  - `file_type`
    - `csv`, `tsv`, `txt`, `jcamp`, `xlsx`, `feather`, `unknown`
  - `import_count_bucket`

- `snapshot_created`
  - `has_thumbnail`

- `snapshot_restored`
  - `restore_source`
    - `version_list`, `inline`

- `plan_checkout_started`
  - `target_plan`
  - `entry_point`
    - `plans_page`, `quota_gate`, `profile`

## Privacy And Data Hygiene

Hard rules:

- do not send raw canvas JSON
- do not send uploaded file contents
- do not send full filenames
- do not use email as the primary PostHog identity
- do not send free-form notes text
- prefer buckets over exact raw sizes when practical

## Recommended Identity Rule

Use one stable internal id after authentication:

- anonymous user: keep PostHog anonymous distinct id
- authenticated user: call `identify(<internal user id>)`
- logout: call `reset()`

Do not use email addresses as the main distinct id.

## Suggested Repo Touch Points

- `apps/ftirui/ft/static/ft/js/services/analytics.js`
- `apps/ftirui/ft/static/ft/app.js`
- `apps/ftirui/ft/static/ft/js/ui/dashboard/initDashboard.js`
- `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/workspaceRuntime.js`
- `apps/ftirui/ft/views.py`
- `.env.example`

## Estimated Time Investment

- PostHog project and env wiring: `0.5 to 1.5 hours`
- analytics wrapper: `1 to 2 hours`
- event schema and instrumentation first pass: `3 to 6 hours`
- identity and validation pass: `1.5 to 3 hours`

Total:

- `6 to 12.5 hours`

## Next Rule

Do not add more events until the first event set is visible in PostHog and clearly answering product questions.
