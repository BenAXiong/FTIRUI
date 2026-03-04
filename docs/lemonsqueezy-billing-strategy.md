# Lemon Squeezy Billing Strategy

This document defines the recommended path for replacing the current fake checkout flow with a real Lemon Squeezy subscription integration.

It is intentionally technical and repo-specific. Read it as an implementation strategy, not as polished product copy.

## Goal

Replace the current placeholder billing flow with a real subscription system that:

- keeps Lemon Squeezy as the billing source of truth
- keeps Django as the entitlement projection used by the app
- preserves the existing `/plans/` and `/plans/checkout/` route shape where practical
- upgrades and downgrades workspace entitlements without reworking the whole dashboard/workspace model

## Big Picture

Recommended architecture:

- Lemon Squeezy owns:
  - checkout
  - payment processing
  - tax / VAT handling
  - subscription lifecycle
  - customer billing portal
- Django owns:
  - the currently signed-in app user
  - the mapping from Lemon Squeezy objects to that user
  - the app-facing entitlement state used by `workspace_policy.py`
  - local auditability of subscription changes
- Webhooks are the truth boundary.
  - frontend redirects are UX only
  - webhook events are what should grant, retain, or revoke paid access

Short version:

- checkout redirect starts the billing flow
- Lemon Squeezy processes the payment
- webhook updates `WorkspaceSubscription`
- quota / plan lookup reads the synced local state

## Current Repo State

The current placeholder flow lives in:

- [views.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/views.py)
  - `plans_page`
  - `checkout_placeholder_page`
  - `downgrade_subscription`
- [models.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/models.py)
  - `WorkspaceSubscription`
- [auth-and-billing-test-flow.md](c:/Users/Ben/Documents/Projects/MLIR/mlirui/docs/auth-and-billing-test-flow.md)
  - current test-only billing behavior
- [mvp-prelaunch-trim-checklist.md](c:/Users/Ben/Documents/Projects/MLIR/mlirui/docs/mvp-prelaunch-trim-checklist.md)
  - launch cleanup items that real billing must satisfy

Current limitation:

- `WorkspaceSubscription` is too small for real billing.
- It only tracks `plan`, `billing_status`, `billing_provider`, and timestamps.
- It does not yet store provider ids, provider subscription status, renewal/end dates, or webhook reconciliation state.

## Recommended Product / Billing Model

For this app, the simplest durable first model is:

- `free`
- `pro`
- `team` only if you are sure you need it now

If `team` is still fuzzy, do not build extra billing complexity around it yet. Launch with one paid variant first if necessary.

Recommended entitlement policy:

- `on_trial` -> paid access
- `active` -> paid access
- `paused` -> paid access, but no collection
- `past_due` -> temporary paid access
- `cancelled` -> paid access until `ends_at`
- `unpaid` -> remove paid access unless you intentionally choose a grace policy
- `expired` -> remove paid access

That keeps the app policy aligned with Lemon Squeezy subscription semantics and dunning behavior.

## Current Product Decisions

These are the currently chosen billing/product defaults unless explicitly changed later:

- paid plan lineup:
  - `pro`
  - optional `lifetime` only if it does not add unreasonable implementation complexity
- billing cadences:
  - `monthly`
  - `yearly`
- trial:
  - `7 days`

Practical interpretation for implementation:

- build the first real billing path around `pro`
- treat `lifetime` as a follow-on variant only if Lemon Squeezy product setup and entitlement handling stay simple
- do not let `lifetime` delay the first subscription-based launch path

## User-Owned Setup

These are the actions you must do yourself outside the codebase.

### 1. Create And Configure The Lemon Squeezy Store

- create the Lemon Squeezy account and store
- complete merchant/business/tax setup
- decide store branding and checkout branding
- decide whether you want a store custom domain now or later

This is no-code/operator work.

### 2. Define The Billing Catalog

- create the real products and variants in `test mode`
- decide whether you have:
  - one paid plan now
  - or `pro` and `team`
- decide monthly vs yearly pricing
- decide whether you want a trial

Important:

- test-mode products do not automatically become live products
- when ready, you must copy products to live mode or recreate them there

### 3. Create Billing Credentials

- create a `test mode` API key
- later create a separate `live mode` API key
- create a webhook endpoint in Lemon Squeezy
- choose only the events you actually need
- set a webhook signing secret

### 4. Configure Render

You will need to set the billing env vars yourself in Render.

Recommended env set:

- `LEMONSQUEEZY_ENABLED=true`
- `LEMONSQUEEZY_API_KEY=...`
- `LEMONSQUEEZY_STORE_ID=...`
- `LEMONSQUEEZY_WEBHOOK_SECRET=...`
- `LEMONSQUEEZY_PRO_VARIANT_ID=...`
- `LEMONSQUEEZY_TEAM_VARIANT_ID=...` if `team` exists
- `LEMONSQUEEZY_CHECKOUT_SUCCESS_URL=https://scix-ui1e.onrender.com/plans/checkout/success/`
- `LEMONSQUEEZY_CHECKOUT_CANCEL_URL=https://scix-ui1e.onrender.com/plans/checkout/failed/`

Optional if you keep a mode flag:

- `LEMONSQUEEZY_MODE=test`

You will also need to point Lemon Squeezy at your public webhook URL, for example:

- `https://scix-ui1e.onrender.com/api/billing/lemonsqueezy/webhook/`

### 5. Run End-To-End Billing Tests

You need to do the live operator checks that code alone cannot prove:

- create test purchases in Lemon Squeezy test mode
- simulate subscription events
- verify recovery/dunning behavior you actually want
- copy products to live when ready
- switch Render from test credentials to live credentials

## Practical Payout Note

Practical recommendation for your current situation:

- start with your existing TWD bank account
- set Lemon Squeezy payouts to monthly if possible, or at least avoid overly frequent small payouts
- only open a foreign-currency account if you confirm Lemon Squeezy can actually settle to your Taiwan bank in that foreign currency without forcing conversion to TWD first

The one practical test that decides this:

- in Lemon Squeezy payout settings, check whether you can choose payout currency = `USD` for bank transfer
- confirm that Lemon Squeezy accepts your Taiwan bank details for `USD` settlement
- if Lemon Squeezy forces payout in `TWD` or local-currency conversion first, a foreign-currency account will not help for this specific payout path

## Implementation Strategy In This Repo

### Phase 1. Stabilize The Local Billing Model

Extend `WorkspaceSubscription` so it can represent synced provider state.

Recommended additional fields:

- `provider_customer_id`
- `provider_subscription_id`
- `provider_order_id`
- `provider_product_id`
- `provider_variant_id`
- `provider_status`
- `provider_test_mode`
- `current_period_ends_at`
- `cancelled_at`
- `ends_at`
- `last_event_name`
- `last_event_at`

Keep `plan` as the app-facing entitlement tier, but stop pretending it is the billing truth by itself.

Recommended interpretation:

- `plan` = normalized app tier
- `provider_status` = raw-ish provider lifecycle state
- `billing_status` = app UI summary if you still want it

### Phase 2. Replace The Placeholder Checkout Flow

Keep:

- `/plans/`
- `/plans/checkout/`

Replace the current fake activation logic inside `checkout_placeholder_page`.

Instead of:

- `activate_test_subscription(auth_user, plan)`

Do:

- require an authenticated user
- resolve the target Lemon Squeezy variant id for the requested plan
- create a checkout using the Lemon Squeezy API
- pass app linkage in `checkout_data.custom`
- redirect the user to the returned checkout URL

Pass custom linkage data like:

- internal `user_id`
- requested `plan`
- maybe a `source` field such as `plans_page` or `quota_gate`

That gives your webhook handler a stable way to link a checkout back to the Django user.

### Phase 3. Add A Webhook Endpoint

Create a dedicated billing webhook endpoint in Django.

Recommended route:

- `/api/billing/lemonsqueezy/webhook/`

Handler requirements:

- accept `POST`
- verify `X-Signature`
- reject invalid signatures
- log/store enough event data for debugging
- process idempotently because Lemon Squeezy retries failed deliveries
- return `200` only when the event is safely accepted

Recommended first-pass webhook events:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_recovered`

You do not need the full event catalog for the first release.

### Phase 4. Move Entitlements Behind Synced Subscription State

`workspace_policy.py` should stop depending on placeholder test activation semantics.

Instead:

- derive paid/free access from the synced `WorkspaceSubscription`
- normalize Lemon Squeezy statuses into app entitlements
- keep plan/quota lookup centralized there

This is the key design rule:

- webhook sync updates the local subscription record
- workspace policy reads that record
- UI and quotas do not talk to Lemon Squeezy directly

### Phase 5. Replace Fake Downgrade / Cancellation

The current `downgrade_subscription` view is only mutating the local model.

Real behavior should be:

- either redirect to the Lemon Squeezy customer portal
- or call the Lemon Squeezy subscription API from a protected backend route

Recommendation:

- use the Lemon Squeezy customer portal first
- do not build your own subscription-management UI until the core billing sync is stable

### Phase 6. Add Billing Reconciliation And Debuggability

At minimum, make it easy to answer:

- what subscription state does Lemon Squeezy think this user has
- what subscription state does Django think this user has
- what was the last webhook applied
- when does paid access end

This can be:

- a webhook event log model
- admin fields on `WorkspaceSubscription`
- an internal-only billing admin view

## Recommended Manual-to-Code Split

### You Must Do Yourself

- create the Lemon Squeezy account/store
- finish tax/business onboarding
- create test-mode products and variants
- decide final plan lineup and prices
- create API keys
- create webhook configuration and signing secret
- set Render environment variables
- copy products and credentials to live mode later
- run actual test purchases and event simulations

### The Code Should Do

- create checkout sessions/URLs
- attach checkouts to the current authenticated user
- verify webhook signatures
- sync provider lifecycle into `WorkspaceSubscription`
- update quota entitlements from synced state
- expose portal/cancel/update-payment flows through safe backend routes
- keep the plans/profile UI honest about the real billing state

## Proposed Data Model Evolution

Minimum safe evolution:

- keep `WorkspaceSubscription`
- migrate it forward instead of replacing it immediately
- add external ids and lifecycle dates
- expand status support

Recommended normalized fields:

- `plan`
  - `free`, `pro`, `team`
- `billing_provider`
  - `lemonsqueezy`
- `provider_status`
  - raw subscription status
- `billing_status`
  - app display summary

If you want cleaner semantics later, you can eventually split this into:

- `WorkspaceSubscription`
- `BillingCustomer`
- `BillingEvent`

But that is not required for the first real integration.

## Checkout Strategy

For this app, the best first checkout strategy is:

- server-created checkout URLs
- redirect-based checkout
- pass custom user linkage

Why:

- safer than trusting frontend plan input alone
- easy to attach the current authenticated user
- easy to inject plan-specific variant ids
- easy to add success/cancel URLs

Do not treat the return URL as a successful upgrade by itself.

Use the return URL only to show:

- pending confirmation
- success copy after the webhook already synced
- or failure/cancel copy

## Customer Portal Strategy

Use the Lemon Squeezy customer portal instead of building your own billing-management UI first.

Recommended pattern:

- add a protected backend route like `/billing/portal/`
- when clicked, fetch or derive a fresh signed customer portal URL
- redirect the user there

Why:

- faster to ship
- less billing edge-case UI
- payment method updates, cancellations, and subscription management already exist there

## Webhook Processing Rules

Non-negotiable rules:

- verify signatures
- process idempotently
- keep a small local event trail
- never downgrade or upgrade permanently from frontend redirect parameters alone
- do not assume event arrival order is perfect

Recommended sync behavior:

- `subscription_created` / `subscription_updated`
  - upsert the local subscription
- `subscription_cancelled`
  - keep paid access until `ends_at`
- `subscription_expired`
  - revoke paid access
- `subscription_payment_failed`
  - mark as delinquent / past due
- `subscription_payment_recovered`
  - restore active paid access

## Suggested App-Level Entitlement Mapping

Recommended first pass:

- `free`
  - normal free quotas
- `pro`
  - paid quotas / unlocked canvases
- `team`
  - same as `pro` unless real team functionality exists

Do not overbuild team billing semantics before the product actually has team features.

If `team` is currently just “more paid”, either:

- keep it as pricing only
- or drop it for now

## Render / Deployment Notes

Your app is already on Render and already has Postgres.

Billing-specific deployment notes:

- the webhook endpoint must be publicly reachable from Lemon Squeezy
- the signing secret must exist in Render before webhook testing
- test and live credentials must never be mixed
- switching to live requires both:
  - live API key
  - live product/variant ids

## Testing Plan

### Test Mode

Verify:

- checkout start from `/plans/checkout/`
- successful purchase
- cancelled checkout
- webhook delivery and signature verification
- `subscription_created`
- cancellation flow
- resumed subscription
- payment failure simulation
- payment recovery simulation
- expiry behavior

### App-Level Verification

For each scenario, verify:

- profile plan state
- dashboard upgrade UI
- canvas quota behavior
- locked/unlocked canvas behavior after downgrade/upgrade
- persistence across logout/login and redeploy

## Recommended Execution Order

1. Freeze the product decision:
   - one paid plan or `pro` + `team`
2. Do the user-owned Lemon Squeezy setup in test mode.
3. Add env vars and provider settings support in Django.
4. Extend `WorkspaceSubscription`.
5. Replace fake checkout with server-created Lemon Squeezy checkout redirects.
6. Add webhook endpoint with signature verification and idempotent sync.
7. Rewire `workspace_policy.py` to read final synced entitlement state.
8. Replace fake downgrade with customer portal or API-backed cancellation.
9. Run end-to-end test-mode scenarios.
10. Clean up the placeholder billing copy and test-only UI.
11. Copy the billing catalog to live mode and swap Render to live credentials.

## What Can Wait

Do not block first real billing on these unless they become necessary:

- custom billing admin dashboard
- custom subscription management UI
- deep invoice history UI
- usage-based billing
- seat management
- tax-region-specific UX branching beyond what Lemon Squeezy already handles

## Recommended Next Code Changes

When implementation starts, the first code pass should touch:

- [models.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/models.py)
- [views.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/views.py)
- [workspace_policy.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/workspace_policy.py)
- [urls.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ftirui/urls.py)
- [.env.example](c:/Users/Ben/Documents/Projects/MLIR/mlirui/.env.example)
- [auth-and-billing-test-flow.md](c:/Users/Ben/Documents/Projects/MLIR/mlirui/docs/auth-and-billing-test-flow.md)

Likely additions:

- a Lemon Squeezy client/helper module
- a webhook sync module
- tests for checkout creation and webhook reconciliation

## Sources

- Lemon Squeezy developer guide: https://docs.lemonsqueezy.com/guides/developer-guide
- Taking payments: https://docs.lemonsqueezy.com/guides/developer-guide/taking-payments
- Sync with webhooks: https://docs.lemonsqueezy.com/guides/developer-guide/webhooks
- Customer portal: https://docs.lemonsqueezy.com/guides/developer-guide/customer-portal
- Test mode: https://docs.lemonsqueezy.com/help/getting-started/test-mode
- Subscriptions and statuses: https://docs.lemonsqueezy.com/help/products/subscriptions
- Recovery and dunning: https://docs.lemonsqueezy.com/help/online-store/recovery-dunning
