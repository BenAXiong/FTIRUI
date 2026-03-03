# Render Free Alpha Readiness Plan

This document defines the minimum work needed to put the current app on Render's temporary free tier for an alpha share, without wasting time on work that will be thrown away when the project moves to Render Starter.

It is written for the current repo state on March 3, 2026.

## Implementation Checklist

Use this as the execution tracker. Tick each item only when the code/config/docs work is actually complete. Stamp the completion time when each item is done.

- [x] 0. Implementation start
  - Started: `2026-03-03 18:45:33 +08:00`
- [ ] 1. Add real production database configuration
  - Completed:
  - [ ] Add `DATABASE_URL` support in Django settings
  - [ ] Keep SQLite as local-dev fallback only
  - [ ] Update `.env.example`
  - [ ] Verify migrations and core workspace/auth flows against Postgres
- [ ] 2. Tighten production settings and secrets handling
  - Completed:
  - [ ] Replace wildcard `ALLOWED_HOSTS` with env-driven configuration
  - [ ] Move `CSRF_TRUSTED_ORIGINS` to env-driven configuration
  - [ ] Confirm `DEBUG=false` deploy behavior
  - [ ] Confirm `SECRET_KEY` and other required env vars are documented
  - [ ] Run Django deployment checks
- [ ] 3. Decide the free-tier media strategy explicitly
  - Completed:
  - [ ] Inventory all user-visible features that depend on `MEDIA_ROOT`
  - [ ] Mark each as `must work`, `can degrade`, or `hide until Starter`
  - [ ] Implement graceful fallback or temporary gating for unstable free-tier file features
  - [ ] Verify dashboard/workspace behavior after restart/redeploy scenarios
- [ ] 4. Add an alpha-specific deployment checklist and smoke pass
  - Completed:
  - [ ] Write the deployment runbook
  - [ ] Run manual smoke coverage on the deployed alpha
  - [ ] Verify behavior after cold start
  - [ ] Verify behavior after redeploy
- [ ] 5. Add free-tier operational guardrails
  - Completed:
  - [ ] Record Render Postgres expiry date
  - [ ] Document expected free-tier cold starts and limits
  - [ ] Add a simple rollback/recovery note
- [ ] 6. Keep PostHog and transactions as the next phase, not the alpha blocker
  - Completed:
  - [ ] Implement PostHog first pass
  - [ ] Replace placeholder checkout with real transactions
  - [ ] Connect final billing truth to workspace entitlements

## Goal

Use Render free only as a short-lived alpha environment for:

- sharing the product with a small group of testers
- validating the current workspace/dashboard flow
- collecting early feedback
- leaving room to add PostHog and real transactions next

This is not a production launch plan.

## Current Repo Constraints

The current codebase is close to deployable, but not yet safe for Render free as-is:

- production DB is still SQLite-first in `apps/ftirui/ftirui/settings.py`
- `ALLOWED_HOSTS` is currently `"*"` in `apps/ftirui/ftirui/settings.py`
- several features write files under `MEDIA_ROOT` in `apps/ftirui/ft/views.py`
- Render free web services have an ephemeral filesystem and spin down after idle time
- Render free Postgres expires after 30 days unless upgraded

That means the free-tier alpha plan must protect:

- database persistence
- basic deploy safety
- graceful behavior around non-durable local files

## Success Criteria For The Temporary Free Alpha

The alpha environment is good enough if all of the following are true:

- signed-in users can create accounts and reopen their canvases later
- dashboard and workspace state survive deploys and instance restarts
- the app can cold-start without data corruption
- file-backed features that are not durable on free either degrade cleanly or are temporarily disabled
- the deployment can be upgraded to Render Starter without re-architecting the app again

## Action Plan

### 1. Add real production database configuration

Why:

- This is the single most important blocker.
- Render free web instances cannot be trusted with SQLite on local disk.

Work:

- Add `DATABASE_URL` support in Django settings.
- Keep SQLite as local-dev fallback only.
- Provision a free Render Postgres instance for alpha.
- Run migrations against Postgres.
- Verify account signup/login, dashboard load, canvas create/open/save, and quota flows against Postgres.

Repo touch points:

- `apps/ftirui/ftirui/settings.py`
- `.env.example`
- deployment environment variables

Estimate:

- `2 to 4 hours`

Carryover to Starter:

- `Yes`
- This work is required on Starter too.

### 2. Tighten production settings and secrets handling

Why:

- The app should not go public-ish with wildcard hosts and demo-grade production defaults.

Work:

- Replace `ALLOWED_HOSTS = ["*"]` with env-driven hosts.
- Keep `DEBUG=false` in deployment and verify no debug-only behavior leaks through.
- Move `CSRF_TRUSTED_ORIGINS` fully to env configuration instead of relying on broad defaults only.
- Confirm `SECRET_KEY` is provided in Render env vars.
- Run Django's deployment checks before the alpha goes live.

Repo touch points:

- `apps/ftirui/ftirui/settings.py`
- `.env.example`
- deployment setup notes

Estimate:

- `1.5 to 3 hours`

Carryover to Starter:

- `Yes`
- This is required on Starter too.

### 3. Decide the free-tier media strategy explicitly

Why:

- The code writes uploads, converted outputs, notes, sessions, and canvas thumbnails under `MEDIA_ROOT`.
- Render free does not give durable local disk.

Work:

- Inventory which user-visible features depend on `MEDIA_ROOT`.
- Separate them into:
  - must work during alpha
  - can degrade temporarily
  - should be hidden until Starter
- For the alpha, prefer the smallest change that keeps the core product stable:
  - keep DB-backed canvas state as the source of truth
  - treat thumbnails and local converted-file links as non-critical unless the alpha specifically depends on them
  - disable or clearly soften any feature that would look broken after a restart
- Add graceful fallbacks where needed:
  - no broken dashboard image behavior when thumbnails disappear
  - no hard dependency on local converted file URLs across restarts
  - no reliance on server-local notes storage for core workflows

Important decision:

- Do not build full object storage only for the temporary free alpha unless the alpha absolutely needs durable file downloads and durable thumbnails across restarts.
- If the alpha can be evaluated mainly on workspace state, plotting, dashboard organization, and account continuity, then graceful degradation is a better time investment than adding S3/R2 now.

Repo touch points:

- `apps/ftirui/ft/views.py`
- dashboard/workspace templates and UI
- any feature flags used to hide unstable features

Estimate:

- `3 to 6 hours` for inventory, fallback handling, and selective feature gating
- `8 to 16 hours` if you decide to add object storage now instead

Carryover to Starter:

- `Partial`
- graceful fallbacks are still useful later
- free-tier-specific feature hiding may be temporary
- full object storage is optional for Starter if you instead use a persistent disk there

### 4. Add an alpha-specific deployment checklist and smoke pass

Why:

- A free-tier alpha will look worse than it is if cold starts or missing env vars create random breakage.

Work:

- Write a short deployment runbook:
  - required Render env vars
  - migration command
  - static file behavior
  - admin bootstrap
  - how to verify login, dashboard, canvas save, and upgrade entry points
- Run a manual smoke pass on the deployed alpha:
  - sign up
  - sign in
  - create/open canvas
  - save and reload
  - wait through a cold start
  - confirm no fatal regressions after redeploy

Good enough for alpha:

- manual smoke coverage is acceptable here
- a full CI-to-Render deployment pipeline can wait

Estimate:

- `1.5 to 3 hours`

Carryover to Starter:

- `Yes`
- The runbook and smoke checklist still matter after upgrade.

### 5. Add free-tier operational guardrails

Why:

- Render free is disposable infrastructure.
- The team should know exactly when to upgrade and what failure modes are expected.

Work:

- Put the Render Postgres expiration date on the calendar.
- Document that cold starts are expected after idle periods.
- Keep the alpha audience small enough that cold-start UX remains acceptable.
- Avoid promising uptime or persistence for media-backed extras during the alpha.
- Add a simple rollback/recovery note for redeploy problems.

Estimate:

- `0.5 to 1.5 hours`

Carryover to Starter:

- `Mostly no`
- The calendar reminder for free-DB expiry is free-tier-only.
- The general ops notes still help, but they are small.

### 6. Keep PostHog and transactions as the next phase, not the alpha blocker

Why:

- The alpha deployment should validate the product before the billing and analytics stack gets heavier.
- The repo already has a planning document that points toward PostHog.

Work after the alpha is live:

- implement PostHog using the route/event plan in `docs/routing-and-analytics-implementation-plan.md`
- replace placeholder checkout with real transactions
- connect final billing truth to workspace entitlements

Estimate:

- PostHog first pass: `4 to 8 hours`
- transaction flow replacement: `10 to 24 hours`, depending on provider choice and how much of the current placeholder UX is reused

Carryover to Starter:

- `Yes`
- This is post-alpha product work, not free-tier adaptation work.

## Estimated Time Investment

If you choose the lean path and avoid object storage for the temporary free alpha:

- DB config and migration: `2 to 4 hours`
- settings and secrets cleanup: `1.5 to 3 hours`
- media fallback / selective feature gating: `3 to 6 hours`
- deployment runbook and smoke pass: `1.5 to 3 hours`
- free-tier guardrails: `0.5 to 1.5 hours`

Total:

- `8.5 to 17.5 hours`

If you decide to add durable object storage before alpha:

- add `5 to 10+ hours` on top of the lean path

## Work To Avoid On The Temporary Free Tier

Do not spend time on these unless your alpha absolutely depends on them:

- adding a keep-alive / anti-sleep hack just to fight Render free spin-down
- full object storage migration only because Render free local disk is ephemeral
- polishing a multi-environment deployment topology before you even have alpha feedback
- implementing complex free-tier-specific infrastructure that you will discard on Starter
- making SQLite survive on free web instances

## What Changes Again On Starter

Once you move to Render Starter:

- the web service no longer has the main free-tier sleep/disposable-hosting problem
- you can choose between:
  - attaching a persistent disk and keeping the file-backed model temporarily
  - or moving to object storage if you want a more scalable file story
- the free Postgres expiry issue goes away

The main point:

- do the DB and settings work now
- treat media durability as a scoped alpha decision
- avoid building free-tier-only infrastructure you will immediately delete after feedback

## Suggested Alpha Scope If Time Is Tight

If you want the fastest safe path to a shared alpha, optimize for these working well:

- auth
- dashboard
- canvas persistence
- plotting flow
- workspace reopen/resume

If needed, temporarily soften or hide:

- durable thumbnail expectations
- persistent converted download links
- any non-core note/file behavior that relies on server-local disk

That gives you a credible alpha on Render free while keeping the upgrade path to Starter clean.

## Reference Material

- Render pricing: <https://render.com/pricing>
- Render free tier docs: <https://render.com/docs/free>
- Existing analytics plan: `docs/routing-and-analytics-implementation-plan.md`
- Existing auth/billing placeholder plan: `docs/auth-and-billing-test-flow.md`
