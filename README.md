# FTIRUI

[![CI](https://github.com/BenAXiong/FTIRUI/actions/workflows/ci.yml/badge.svg)](https://github.com/BenAXiong/FTIRUI/actions/workflows/ci.yml)

Workspace-first Django + Vite/Vitest project for managing FTIR canvases. The repository now ships with split backend tests, Vitest coverage, and Playwright smoke flows that mirror the production autosave pipeline.

## Local setup

```bash
python -m venv .venv && .venv/Scripts/activate  # or use your preferred env manager
pip install -r apps/ftirui/requirements.txt
npm ci
```

Python 3.11+ and Node 20 LTS are used in CI; matching those locally avoids surprises (see `.github/workflows/ci.yml`).

## Test suites

- **Django API/tests:** `python apps/ftirui/manage.py test ft`
  - Tests live under `apps/ftirui/ft/tests/` and now include autosave fixtures plus dashboard/session coverage.
- **Frontend unit tests:** `npm run test:unit`
  - Specs live under `tests/unit/` (dashboard harness + workspace autosave bridge).
- **Playwright smoke tests:** `npm run test:smoke`
  - Specs live under `tests/smoke/` and are skipped unless smoke env vars are provided (see below).

## Smoke test configuration

Playwright relies on a running FTIRUI deployment and a staff user that can access Django admin (smoke scripts log in there to reuse the resulting session cookie).

Environment variables:

| Variable | Purpose |
| --- | --- |
| `SMOKE_BASE_URL` | Base URL of the deployed app (e.g., `https://ftirui.example.com`). |
| `SMOKE_USERNAME` | Username for the Django admin/staff account used in smoke runs. |
| `SMOKE_PASSWORD` | Password for the smoke user. |

When these are set, `npm run test:smoke` will:

1. Log into `/admin/`.
2. Seed a dashboard board via the public API.
3. Open the board from the dashboard and assert autosave UI state.
4. Save & restore a workspace snapshot via the modal buttons.

Omitting any of the env vars causes the suite to skip gracefully, which keeps local runs fast when you only need unit coverage.

## Continuous integration

`/.github/workflows/ci.yml` defines three jobs:

1. **Django tests** – installs `apps/ftirui/requirements.txt` (now including `python-dotenv`) and runs `python apps/ftirui/manage.py test ft`.
2. **Vitest** – runs `npm ci` + `npm run test:unit`.
3. **Playwright smoke** – optional gated job that runs when the `SMOKE_*` secrets exist; it installs browsers via `npx playwright install --with-deps` and executes `npm run test:smoke`.

Add repository secrets named `SMOKE_BASE_URL`, `SMOKE_USERNAME`, and `SMOKE_PASSWORD` to exercise the smoke job in CI.

## Developer handoff checklist

- **Dependencies installed:** Python packages from `apps/ftirui/requirements.txt` (now includes `python-dotenv`) and Node dev dependencies via `npm ci`.
- **Tests live here:** backend (`apps/ftirui/ft/tests/`), frontend unit (`tests/unit/`), Playwright smoke (`tests/smoke/`).
- **Relevant commands:** `python apps/ftirui/manage.py test ft`, `npm run test:unit`, `npm run test:smoke`.

Phase 6 (Docker + deployment scripts) builds on this foundation; see `architecture.md` for broader context.
