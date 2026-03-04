# Lemon Squeezy Test-Mode Implementation Plan

This document is the concrete execution plan for wiring Lemon Squeezy into the current Django app in `test mode`.

It is narrower than [lemonsqueezy-billing-strategy.md](c:/Users/Ben/Documents/Projects/MLIR/mlirui/docs/lemonsqueezy-billing-strategy.md). That strategy doc explains the architecture and tradeoffs. This file is the actionable implementation sequence for the first real integration pass.

## Current Test Inputs

Use these exact test-mode values unless they change later:

- `LEMONSQUEEZY_STORE_ID=305843`
- `LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID=1364880`
- `LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID=1364816`

Current known labels:

- store: `scix.lemonsqueezy.com`
- product: `SciX Pro`
- monthly trial variant: `SciX Pro - Monthly (free trial 7d)`
- yearly variant: `Pro Yearly`

## Scope

This first pass should deliver:

- real checkout creation from `/plans/checkout/`
- Lemon Squeezy webhook verification and sync
- `WorkspaceSubscription` updated from real provider events
- plan/quota enforcement based on synced subscription state
- customer-portal-first cancellation path

This first pass should not try to deliver:

- team billing
- lifetime billing
- custom invoice UI
- custom subscription-management UI
- seat management

## Operator Tasks You Must Do Yourself

These are outside the codebase.

### Before Code Can Be Tested

- create and store a fresh `test mode` API key
- create a Lemon Squeezy webhook
- copy the webhook signing secret
- add Render environment variables
- later, simulate or trigger real test purchases from Lemon Squeezy checkout

### Render Env Vars You Will Need

Required:

- `LEMONSQUEEZY_ENABLED=true`
- `LEMONSQUEEZY_MODE=test`
- `LEMONSQUEEZY_API_KEY=...`
- `LEMONSQUEEZY_STORE_ID=305843`
- `LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID=1364880`
- `LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID=1364816`
- `LEMONSQUEEZY_WEBHOOK_SECRET=...`
- `LEMONSQUEEZY_CHECKOUT_SUCCESS_URL=https://scix-ui1e.onrender.com/plans/checkout/success/`
- `LEMONSQUEEZY_CHECKOUT_CANCEL_URL=https://scix-ui1e.onrender.com/plans/checkout/failed/`

Public webhook target you must configure in Lemon Squeezy:

- `https://scix-ui1e.onrender.com/api/billing/lemonsqueezy/webhook/`

## Code Work Summary

### Files That Should Change First

- [models.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/models.py)
- [workspace_policy.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/workspace_policy.py)
- [views.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/views.py)
- [urls.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ftirui/urls.py)
- [.env.example](c:/Users/Ben/Documents/Projects/MLIR/mlirui/.env.example)
- [auth-and-billing-test-flow.md](c:/Users/Ben/Documents/Projects/MLIR/mlirui/docs/auth-and-billing-test-flow.md)

Likely new files:

- `apps/ftirui/ft/billing/lemonsqueezy.py`
- `apps/ftirui/ft/billing/webhooks.py`
- `apps/ftirui/ft/tests/test_billing_lemonsqueezy.py`

## Recommended Execution Order

- [ ] 1. Add Lemon Squeezy settings and env parsing
- [ ] 2. Extend `WorkspaceSubscription` for provider sync
- [ ] 3. Add a checkout client/helper for Lemon Squeezy
- [ ] 4. Replace fake checkout activation with real checkout redirect
- [ ] 5. Add and verify webhook signature handling
- [ ] 6. Sync webhook events into `WorkspaceSubscription`
- [ ] 7. Rewire `workspace_policy.py` to use synced provider state
- [ ] 8. Replace fake downgrade with customer portal / cancellation path
- [ ] 9. Add tests for checkout + webhook + entitlement behavior
- [ ] 10. Run full Render test-mode verification

## Step 1. Add Lemon Squeezy Settings And Env Parsing

Add settings/env support for:

- `LEMONSQUEEZY_ENABLED`
- `LEMONSQUEEZY_MODE`
- `LEMONSQUEEZY_API_KEY`
- `LEMONSQUEEZY_STORE_ID`
- `LEMONSQUEEZY_PRO_MONTHLY_VARIANT_ID`
- `LEMONSQUEEZY_PRO_YEARLY_VARIANT_ID`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `LEMONSQUEEZY_CHECKOUT_SUCCESS_URL`
- `LEMONSQUEEZY_CHECKOUT_CANCEL_URL`

Output of this step:

- app boots safely with billing disabled by default
- `.env.example` documents the full test-mode config

## Step 2. Extend `WorkspaceSubscription`

Current model is too small for real provider sync.

Add fields for:

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

Do not remove the current fields yet.

Keep:

- `plan`
- `billing_status`
- `billing_provider`
- `activated_at`

Reason:

- existing app surfaces already read these
- first integration should be additive and reversible

## Step 3. Add Lemon Squeezy Checkout Helper

Create one backend helper that:

- creates a checkout via the Lemon Squeezy API
- picks the correct variant id from plan + interval
- attaches the current internal user id in custom data
- returns the hosted checkout URL

Recommended custom payload:

- `user_id`
- `plan=pro`
- `interval=monthly|yearly`
- `source=plans_page|quota_gate|profile`

Do not create checkout logic in templates or frontend JS.

## Step 4. Replace Fake Checkout Activation

Current placeholder behavior:

- `checkout_placeholder_page` calls `activate_test_subscription(...)`

Replace that with:

- authenticated-user requirement
- backend checkout creation
- redirect to Lemon Squeezy hosted checkout

Keep the existing route shape:

- `/plans/`
- `/plans/checkout/`
- `/plans/checkout/success/`
- `/plans/checkout/failed/`

Success and failed pages remain UX surfaces only.

They should not mutate billing state directly.

## Step 5. Add Webhook Endpoint

Add a real webhook route:

- `/api/billing/lemonsqueezy/webhook/`

The handler must:

- accept `POST`
- verify the webhook signature
- fail closed on bad signatures
- be idempotent
- log enough context for debugging

If webhook verification fails, do not update local entitlements.

## Step 6. Sync Provider Events Into `WorkspaceSubscription`

First event set to support:

- `subscription_created`
- `subscription_updated`
- `subscription_cancelled`
- `subscription_resumed`
- `subscription_expired`
- `subscription_payment_success`
- `subscription_payment_failed`
- `subscription_payment_recovered`

Normalization rule:

- provider event updates raw provider fields
- sync layer derives:
  - local `plan`
  - local `billing_status`
  - `activated_at`
  - current paid-access window

Recommended first-pass local mapping:

- `active` and `on_trial` -> `plan=pro`, `billing_status=active`
- `cancelled` with future `ends_at` -> keep `billing_status=active`
- `expired` -> `plan=free`, `billing_status=inactive`
- `payment_failed` -> keep local paid access only if you intentionally allow a grace state

## Step 7. Rewire `workspace_policy.py`

Current behavior:

- `get_workspace_plan_state` only treats `billing_status=active` as paid
- `activate_test_subscription` is still the activation mechanism

Required change:

- paid/free access must now come from the synced Lemon Squeezy state
- `activate_test_subscription` should be retired from the real checkout path

Preferred implementation:

- keep `get_workspace_plan_state(...)` as the single app-facing source
- update its internal subscription interpretation only

This keeps the rest of the app stable.

## Step 8. Replace Fake Downgrade

Current behavior:

- `downgrade_subscription` mutates the local model directly

First real version should instead:

- redirect user to Lemon Squeezy customer portal
- or call Lemon Squeezy cancellation API from a backend route

Recommendation:

- use customer portal first
- do not build a custom subscription-management surface yet

## Step 9. Tests

Minimum automated coverage:

- env-disabled billing is a safe no-op
- checkout route requires auth
- monthly/yearly plan selection resolves to the correct variant id
- webhook signature verification accepts valid signatures and rejects invalid ones
- webhook sync creates/updates `WorkspaceSubscription`
- paid subscription unlocks unlimited workspace quotas
- expired/cancelled subscription falls back to free behavior correctly

Files likely to need updates:

- [test_dashboard.py](c:/Users/Ben/Documents/Projects/MLIR/mlirui/apps/ftirui/ft/tests/test_dashboard.py)
- new `test_billing_lemonsqueezy.py`

## Step 10. Render Test-Mode Verification

After code is deployed and env vars are set, run this manual test sequence:

### Billing Start

- sign in as a normal user
- open `/plans/`
- select monthly
- confirm redirect to Lemon Squeezy test checkout

### Successful Checkout

- complete a successful test checkout
- confirm webhook delivery in Lemon Squeezy
- confirm app user becomes `pro`
- confirm dashboard/profile show paid state
- confirm free canvas limit no longer applies

### Cancel / Failure

- trigger a failed or cancelled checkout
- confirm no paid upgrade occurs

### Subscription Lifecycle

- simulate `subscription_updated`
- simulate `subscription_cancelled`
- simulate `subscription_expired`
- confirm local app state changes match the policy

### Latest Verification Snapshot

Latest confirmed test-mode behavior:

- hosted checkout opens successfully from the live SciX app
- Lemon Squeezy orders are created successfully from SciX
- monthly checkout with `7-day` trial completed successfully
- cancellation path completed successfully in test mode
- yearly checkout completed successfully in test mode
- live app state was manually verified after checkout:
  - `plan=pro`
  - `billing_status=active`

Remaining follow-up:

- confirm webhook delivery history directly in Lemon Squeezy for the main subscription events
- verify one end-to-end downgrade/expiry path against the final entitlement policy you want to keep
- decide and document the final `Recovery & Dunning` policy in Lemon Squeezy:
  - how long failed payments should retry
  - whether dunning should auto-cancel
  - what local entitlement state should remain during unpaid / past-due windows
- confirm final product / variant pricing behavior in Lemon Squeezy:
  - billing currency
  - `7-day` trial behavior
  - yearly discount behavior
  - coupon behavior
  - whether the `NT$` checkout / receipt display is the intended currency outcome

## Beta Profile Requirement

For beta, the user profile should explicitly show the subscription state to the user.

Minimum profile states to expose:

- normal active subscription status
- cancelled subscription status

Practical expectation:

- a user with an active paid subscription should be able to see that they are paid
- a user who has cancelled but still has access until period end should be able to see that clearly in profile instead of being shown only a generic paid/free badge

## Immediate Practical Recommendation

For the first code pass, use:

- monthly test variant with trial: `1364880`
- yearly variant: `1364816`

Ignore these for now:

- `team`
- `lifetime`
- ambiguous default/monthly id `866507`
- test monthly no-trial variant `1364850`

That keeps the first implementation aligned with the chosen product direction:

- `pro`
- `monthly + yearly`
- `7-day free trial`

## Notes For Later

After test mode is stable:

- copy the product catalog to live mode
- create fresh live API credentials
- create a live webhook
- add the live values in Render
- then update the docs so test/live ids are clearly separated
