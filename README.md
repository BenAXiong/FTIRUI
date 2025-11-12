# FTIRUI

[![CI](https://github.com/BenAXiong/FTIRUI/actions/workflows/ci.yml/badge.svg)](https://github.com/BenAXiong/FTIRUI/actions/workflows/ci.yml)

Workspace-first Django + Vite/Vitest project for managing FTIR canvases. The repository now ships with split backend tests, Vitest coverage, Playwright smoke flows, and a Dockerized deployment story for Phase 6.

## Local setup

```bash
python -m venv .venv && .venv/Scripts/activate  # or use your preferred env manager
pip install -r apps/ftirui/requirements.txt
npm ci
```

Python 3.11+ and Node 20 LTS are used in CI; matching those locally avoids surprises (see `.github/workflows/ci.yml`).

## Environment variables

Copy `.env.example` to `.env` and tweak anything sensitive:

```bash
cp .env.example .env
```

Key values:

- `DJANGO_SETTINGS_MODULE`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`.
- `DATABASE_URL` (defaults to the Postgres container in `docker-compose.yml`; omit to stay on SQLite).
- Social auth secrets (Google/GitHub) if you plan to enable OAuth.
- `SMOKE_BASE_URL`, `SMOKE_USERNAME`, `SMOKE_PASSWORD` for Playwright runs (local or CI).
- `WORKSPACE_LEGACY_ENABLED` (default `true` in dev, `false` in prod) to expose the legacy Workspace tab. Keep it `false` in production—design/devs can press `Ctrl+Shift+W` (when `WORKSPACE_DEV_SHORTCUT_ENABLED=true`) to toggle a `?dev=true` query param and temporarily reveal the canvas tab. The shortcut works on both `/dashboard` and `/workspace`, so you can flip between tabbed vs. standalone layouts without touching settings.
- `DASHBOARD_V2_ENABLED` (default `true`) gates the new Projects/Folders dashboard. Set it to `false` to fall back to the legacy cards while you finish migrations; you can still append `?dev=true` to preview the new explorer without flipping the flag.
- When the workspace tab is disabled (default), dashboards still open canvases in a new tab at `/workspace?canvas=<ID>` so users can keep navigation/search open while editing. That page reuses the exact same browser/canvas/toolbar partials; only the wrapper differs, so behaviour stays consistent across routes.

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
2. Seed a dashboard canvas via the public API.
3. Open the canvas from the dashboard and assert autosave UI state.
4. Save & restore a workspace snapshot via the modal buttons.

Omitting any of the env vars causes the suite to skip gracefully, which keeps local runs fast when you only need unit coverage.

## Docker & docker-compose

Phase 6 introduces a multi-stage `Dockerfile` with baked-in static assets plus migrations at runtime via `docker/entrypoint.sh`.

```bash
docker build -t ftirui:dev .
docker run --env-file .env -p 8000:8000 ftirui:dev
```

For local dev with Postgres + optional Playwright smoke checks:

```bash
docker compose up --build web db
# (optional)
docker compose run --rm playwright
```

`docker-compose.yml` wires three services:

1. `web`: Django + Gunicorn, hot-reloading code from your working tree, using environment variables from `.env`.
2. `db`: Postgres 15 with a persistent `pgdata` volume.
3. `playwright`: image built from `docker/Playwright.Dockerfile`; it runs `npm run test:smoke` against `SMOKE_BASE_URL` (defaults to the `web` container).

## Continuous integration & releases

`/.github/workflows/ci.yml` now includes:

1. **Django tests** – `python apps/ftirui/manage.py test ft`.
2. **Vitest** – `npm run test:unit`.
3. **Playwright smoke** – gated on `SMOKE_*` secrets.
4. **Docker publish** – on `main`, builds the production image and pushes `ghcr.io/<org>/ftirui:latest`.

Secrets required for the smoke/Docker stages:

- `SMOKE_BASE_URL`, `SMOKE_USERNAME`, `SMOKE_PASSWORD`.

Releases are automated via `/.github/workflows/release.yml`:

- Re-runs the full test matrix.
- Builds & pushes a versioned Docker image (tagged with the release tag or `manual-<sha>` if invoked manually).
- Generates a Windows desktop build with PyInstaller (artifact uploaded for download).

## Developer handoff checklist

- **Dependencies installed:** Python packages from `apps/ftirui/requirements.txt` (now includes `python-dotenv`, `psycopg[binary]`) and Node dev dependencies via `npm ci`.
- **Tests live here:** backend (`apps/ftirui/ft/tests/`), frontend unit (`tests/unit/`), Playwright smoke (`tests/smoke/`).
- **Relevant commands:** `python apps/ftirui/manage.py test ft`, `npm run test:unit`, `npm run test:smoke`, `docker compose up --build`.

Phase 6 delivers the runnable artifacts (Docker & desktop) so Phase 7 can focus on distribution; see `architecture.md` for broader context.
- **Migrate legacy PlotSession rows**: run `python apps/ftirui/manage.py migrate_sessions` (add `--delete-source` once you’ve verified the canvases) to move `/api/session/` saves into the Projects/Folders hierarchy. This is the same helper the older `seed_workspace_from_sessions` command used, but it now supports dry-runs, limits, and optional cleanup.
- **Seed demo data**: for local smoke tests, run `python apps/ftirui/manage.py seed_dashboard_demo <username> [--replace]` to create a sample section/project/canvas set you can explore without manually uploading traces.

- **Feature flags recap**:
  - `WORKSPACE_LEGACY_ENABLED` or `?dev=true` toggles the Workspace tab for devs.
  - `DASHBOARD_V2_ENABLED` controls whether the new dashboard loads; set it to `false` for quick rollbacks and use the `dashboard_legacy` pane until QA signs off.
