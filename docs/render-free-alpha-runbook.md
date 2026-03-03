# Render Free Alpha Runbook

This runbook is the short operational checklist for the temporary Render free alpha deployment.

## Render Service

- Service type: `Web Service`
- Runtime: `Docker`
- Branch: `main`
- Dockerfile path: `Dockerfile`
- Root directory: blank
- Build command: blank
- Start command: blank

The image build is defined in `Dockerfile`, and runtime startup happens through `docker/entrypoint.sh`.

## Required Env Vars

Set these on the Render web service:

- `DATABASE_URL`
  Use the Render Postgres internal URL.
- `SECRET_KEY`
  Must be a long random value.
- `DEBUG=false`
- `DJANGO_SETTINGS_MODULE=ftirui.settings`

Recommended:

- `DB_CONN_MAX_AGE=60`
- `SITE_ID=1`
- `RENDER_EXTERNAL_HOSTNAME=<your-service>.onrender.com`
- `ALLOWED_HOSTS=<your-service>.onrender.com`
- `CSRF_TRUSTED_ORIGINS=https://<your-service>.onrender.com`
- `WORKSPACE_LEGACY_ENABLED=false`
- `WORKSPACE_DEV_SHORTCUT_ENABLED=false`
- `DASHBOARD_V2_ENABLED=true`
- `SERVE_MEDIA_FILES=true`
- `MEDIA_STORAGE_TRANSIENT=true`

Optional:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

## Database And Migrations

Migrations run automatically during container startup via `docker/entrypoint.sh`.

Useful checks in the Render shell:

```bash
python apps/ftirui/manage.py showmigrations
python apps/ftirui/manage.py migrate --plan
python apps/ftirui/manage.py check --deploy
```

## Admin Bootstrap

Create a superuser from the Render shell if needed:

```bash
python apps/ftirui/manage.py createsuperuser
```

## Alpha Smoke Checklist

Run these after each meaningful deploy:

1. Open the live app URL.
2. Verify the alpha storage notice appears.
3. Sign up or sign in with email/password.
4. Verify Google login still works if enabled.
5. Create a new canvas.
6. Reload and confirm the canvas still exists.
7. Upload/import a file and verify the workspace still renders correctly.
8. Confirm a dashboard thumbnail appears after editing.
9. Redeploy once and confirm:
   - canvas data still exists
   - thumbnail may be gone
   - the app remains usable

Cold start check:

1. Leave the app idle long enough for the free instance to spin down.
2. Open the app again.
3. Confirm the first load is slow but successful.
4. Confirm login, dashboard, and canvas reopen still work.

## Known Free-Tier Behavior

- Canvas state persists because it is stored in Postgres.
- Thumbnails are temporary because they are stored on local disk under `MEDIA_ROOT`.
- Generated converted files are temporary and should be downloaded immediately.
- The server `notes.md` endpoint should not be treated as durable user storage.
- Cold starts are expected after idle periods on Render free.

## Recovery Notes

If a deploy fails:

1. Check the Render deploy log first.
2. Confirm env vars are still present.
3. Run `python apps/ftirui/manage.py check --deploy` in the shell.
4. Confirm Postgres is reachable.
5. Redeploy the latest known-good commit from `main`.

If media-backed extras look broken after restart:

- this is expected on the free-tier alpha
- verify that canvas data still exists
- continue unless core auth/dashboard/canvas persistence is broken
