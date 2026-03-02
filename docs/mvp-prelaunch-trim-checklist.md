# MVP Pre-Launch Trim Checklist

This file tracks temporary, test-only, and placeholder surfaces that should be removed, replaced, or explicitly validated before the MVP is considered production-ready.

Use this as an operational checklist, not a long-form architecture note.

## How To Use This File

- `[ ]` not done
- `[~]` partially addressed / product decision still needed
- `[x]` done

For each item:
- keep the replacement path explicit
- avoid deleting temporary hooks until the real path is in place and tested

## Billing / Plans

- [ ] Replace `/plans/` placeholder content with final plan copy, pricing, and entitlements.
- [ ] Replace `/plans/checkout/` fake checkout flow with real billing provider integration.
- [ ] Remove the `test_bypass` checkbox from checkout.
- [ ] Remove any “temporary placeholder” or “fake billing” language from plans/checkout UI.
- [ ] Confirm final plan matrix:
  - guest
  - authenticated free
  - paid
  - admin/staff behavior
- [ ] Decide whether `team` remains a real plan or is collapsed into another paid tier.
- [ ] Add a real upgrade success/failure handling flow.
- [ ] Add a real downgrade / cancellation policy and UI.

## Subscription / Quota Backend

- [ ] Replace placeholder `WorkspaceSubscription` semantics with final billing-source-of-truth semantics.
- [ ] Decide whether the placeholder model is migrated forward or replaced.
- [ ] Make quota lookup fully plan-aware from the final billing state.
- [ ] Confirm what should happen to over-quota canvases after real downgrade:
  - read-only
  - hidden
  - disabled
  - oldest-first lock
- [ ] Implement the final unlock policy after upgrade/downgrade.
- [ ] Confirm whether duplication of locked canvases remains allowed in production.

## Guest / Account Migration

- [ ] Finalize guest-to-account adoption policy.
- [ ] Implement the staged guest-workspace resolution UI if staged migration is kept.
- [ ] Decide what happens when a user signs into an account that is already over quota.
- [ ] Validate that pristine guest bootstrap work never pollutes real accounts.
- [ ] Decide whether guests should remain backend-backed exactly as now, or get a refined owner model later.

## Auth / Account UX

- [ ] Decide whether the testing-identifiers hints should remain in production or be removed.
- [ ] Decide whether social-only, password-only, or hybrid login remains the long-term UX.
- [ ] Decide whether email uniqueness should also become a DB-level constraint later.
- [ ] Add a production-grade account recovery / reset flow if password auth is kept.
- [ ] Review account deletion policy and UX.

## Dashboard / Workspace UX

- [ ] Remove any quota/testing-only warning copy that is too dev-oriented.
- [ ] Review lock badges and read-only overlays for final production wording.
- [ ] Validate that all locked-canvas disabled states are complete and intentional.
- [ ] Decide whether `Upgrade` entry points are placed in all intended surfaces or reduced to a smaller set.
- [ ] Validate that `Latest` sorting and lock semantics are aligned with final product expectations.

## Guest Onboarding / Empty Canvas

- [~] Confirm whether the animated guest overlay is the final onboarding direction or a temporary experiment.
- [ ] Decide whether the guest-only visual differences should stay, be reduced, or be generalized to first-time users.
- [ ] Review overlay copy for final product voice.
- [ ] Review whether the DnD onboarding button styling is final or temporary.
- [ ] Polish onboarding dim/cutout behavior, especially for dashboard tutorial steps where the current cutout is visually too large or awkward around small targets (esp. dashboard and cnavas hb).
- [ ] Before launch, review whether `onboarding/config.js -> ENABLE_ALL_COACH_FEATURES` should remain as an internal polish switch, move to a safer release-only toggle, or be removed.

## Test / Dev Convenience Surfaces

- [ ] Remove or hide any UI that exists only to exercise fake billing flows.
- [ ] Remove or revise any copy mentioning “test subscription”, “temporary”, or “placeholder”.
- [ ] Decide whether the avatar `PRO`/`TEAM` pill styling is final.
- [ ] Add or remove any internal-only testing shortcuts before launch.

## Documentation / Cleanup

- [ ] Keep `docs/auth-and-billing-test-flow.md` aligned with the live auth/billing implementation.
- [ ] Keep runtime `ARCHITECTURE.md` aligned with shell, guest, migration, and quota behavior.
- [ ] Remove stale terminology once the final production shell/routing model is fixed.
- [ ] Audit docs for references to superseded placeholder behavior.

## Release Gate

Do not call the MVP ready until these are true:

- [ ] Auth flow is final enough for real users.
- [ ] Billing flow is real or explicitly disabled from user-facing production.
- [ ] Quotas are enforced consistently and explained clearly.
- [ ] Guest migration behavior is stable and tested.
- [ ] Locked/read-only behavior is complete and intentional.
- [ ] Temporary testing language is removed from user-facing flows.
