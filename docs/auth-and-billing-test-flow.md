# Auth And Billing Test Flow

This document is the source of truth for account login/signup behavior, fake billing activation, and practical testing conventions.

It complements, but does not replace:
- `apps/ftirui/ft/static/ft/js/ui/interface/controller/runtime/ARCHITECTURE.md`

That runtime architecture document covers:
- shell selection
- guest workspace ownership
- migration
- quota lock behavior

This document covers:
- how users authenticate
- how free vs paid test accounts are created
- how plan state is activated
- how to test quotas safely

## Product-Level Summary

The app currently supports these identity/product states:

1. Guest
- no explicit account login
- backend-backed workspace owner is created behind the session
- guest quotas are strict:
  - 1 project
  - 1 canvas

2. Authenticated Free
- standard account signup/login
- uses normal backend workspace entities
- default free quotas:
  - 1 project
  - 3 canvases

3. Authenticated Paid Test Plans
- `pro`
- `team`
- both currently behave as unlimited for workspace quotas
- this is temporary test-billing behavior, not real payments

4. Admin
- standard Django admin/staff/superuser concept
- separate from free/pro/team plan state

## Current Authentication Model

The project uses:
- Django auth
- `django-allauth`

Current login behavior:
- password login accepts either:
  - username
  - email
- social login remains available:
  - Google
  - GitHub

Current signup behavior:
- email is required
- username is required
- password is required
- password confirmation is required

Important rule:
- emails are now enforced unique in the account flow
- this is enforced in the account adapter layer, case-insensitively
- it is intentionally not a DB-level unique constraint on `auth_user.email` yet

Reason:
- enforcing uniqueness in app flow is low-risk and good enough for current MVP/dev work
- mutating Django’s built-in auth table with a hard unique DB migration is a later cleanup, not required for current functionality

## Technical Source Of Truth

### Login / Signup

Settings:
- `apps/ftirui/ftirui/settings.py`

Key settings now used:
- `ACCOUNT_LOGIN_METHODS = {'email', 'username'}`
- `ACCOUNT_SIGNUP_FIELDS = ['email*', 'username*', 'password1*', 'password2*']`
- `ACCOUNT_EMAIL_VERIFICATION = 'none'`
- `ACCOUNT_ADAPTER = 'ft.account_adapter.WorkspaceAccountAdapter'`

Account adapter:
- `apps/ftirui/ft/account_adapter.py`

What it does:
- normalizes email to lowercase
- trims surrounding whitespace
- rejects duplicate emails case-insensitively

Templates:
- `apps/ftirui/ft/templates/account/login.html`
- `apps/ftirui/ft/templates/account/signup.html`

The login page is intentionally hybrid:
- password login form
- social login buttons

## Email Verification Policy

There is currently no email verification step.

This is intentional for dev speed and controlled MVP testing:
- `ACCOUNT_EMAIL_VERIFICATION = 'none'`

Practical consequence:
- any syntactically valid email address can be used for signup
- the app does not require inbox access
- the email only needs to be unique within the app

This means fake/test addresses are valid for local and dev use.

## Recommended Test Identifier Conventions

Use tier-prefixed usernames and emails so test state is obvious at a glance.

Recommended usernames:
- `free_alice`
- `pro_alice`
- `team_alice`
- `admin_alice`

Recommended emails:
- `free.alice@example.test`
- `pro.alice@example.test`
- `team.alice@example.test`
- `admin.alice@example.test`

Why `example.test`:
- syntactically valid
- reserved for testing/documentation
- no real inbox required

## How To Create A Fake Pro Account

You do not need a real email inbox.

Use this flow:

1. Open:
- `/accounts/signup/`

2. Sign up with:
- username: `pro_alice`
- email: `pro.alice@example.test`
- password: any valid password

3. After login, open:
- `/plans/`

4. Choose `Pro`

5. On:
- `/plans/checkout/?plan=pro`

Tick the test checkbox and submit:
- `Activate Pro (test)`

Result:
- the account remains a normal authenticated account
- plan changes to `pro`
- workspace quotas become unlimited

No email verification is involved.

## Temporary Billing Flow

Current billing flow is intentionally fake but persistent.

Pages:
- `/plans/`
- `/plans/checkout/`

Model:
- `WorkspaceSubscription`
- file: `apps/ftirui/ft/models.py`

Policy layer:
- `apps/ftirui/ft/workspace_policy.py`

Current plan values:
- `free`
- `pro`
- `team`

Current billing status values:
- `inactive`
- `active`

Activation path:
- checkout `POST` activates a test subscription for the current authenticated user

Downgrade path:
- available in profile/settings flow
- resets the account back to free

## Quota Behavior

Guest:
- 1 project
- 1 canvas

Authenticated free:
- 1 project
- 3 canvases

Authenticated paid test plans:
- unlimited quotas

Overflow behavior for canvases on free:
- create still succeeds
- least-recently-updated excess canvas becomes `quota_locked`
- locked canvases are:
  - visible
  - openable
  - read-only

Important:
- dashboard “Latest” view and quota locking now both use recency semantics based on `updated_at`, not creation order

## Migration / Identity Continuity

Guest-to-account continuity is already implemented at the backend workspace-owner layer.

Current rules:
- pristine untouched guest bootstrap should not migrate
- meaningful guest work migrates into the signed-in account if under quota
- if migration would exceed quota, the work is staged instead of silently merged

This matters because auth and billing work must not reintroduce a split where:
- guests use local-only workspace state
- authenticated users use model-backed workspace state

That split has already been removed and should stay removed.

## Testing Guidance

Use these tiers for manual testing:

### Guest
- stay signed out
- test guest quotas
- test guest onboarding
- test guest -> signup migration

### Free
- create account with `free_<name>` / `free.<name>@example.test`
- verify free quotas and locking behavior

### Pro / Team
- create normal account first
- activate via `/plans/`
- verify unlimited behavior
- verify downgrade returns locking/quota behavior

### Admin
- create or elevate through Django admin if needed
- admin/staff is separate from plan state

## Fail-Safe Constraints

Do not change all of these at once without tests:
- login methods
- signup required fields
- email uniqueness handling
- guest migration
- quota lookup
- paid-plan unlimited behavior

If future work introduces real billing:
- keep the route shape and CTA wiring if possible
- replace the fake checkout backend, not the whole flow surface
- keep `workspace_policy.py` as the quota entitlement layer

## Regression Expectations

When touching auth/billing, verify at minimum:

1. Username login works
2. Email login works
3. Duplicate email signup fails
4. Signup requires email
5. Free quotas still apply
6. Paid test activation removes quota limits
7. Downgrade restores free behavior
8. Guest migration still behaves correctly
