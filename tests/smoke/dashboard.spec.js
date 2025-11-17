import { expect, test } from '@playwright/test';
import {
  expectSavedBadge,
  hasSmokeCredentials,
  openCanvasFromDashboard,
  openSnapshotModal,
  prepareSmokeCanvas,
  saveSnapshotFromToolbar
} from './helpers.js';

test.describe.configure({ mode: 'serial' });

test('opens a seeded dashboard canvas and confirms autosave status', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasSmokeCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  const seededCanvas = await prepareSmokeCanvas(page, baseURL);
  const workspacePage = await openCanvasFromDashboard(page, seededCanvas.canvasId);
  await expectSavedBadge(workspacePage);
});

test('saves and restores a snapshot through the workspace modal', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasSmokeCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  const seededCanvas = await prepareSmokeCanvas(page, baseURL);
  const workspacePage = await openCanvasFromDashboard(page, seededCanvas.canvasId);

  const snapshotLabel = `Smoke Snapshot ${Date.now()}`;
  await saveSnapshotFromToolbar(workspacePage, snapshotLabel, seededCanvas.canvasId);

  const modal = await openSnapshotModal(workspacePage, seededCanvas.canvasId);
  await expect(modal.locator(`text=${snapshotLabel}`)).toBeVisible();

  const targetRow = modal.locator('.snapshot-row').filter({ hasText: snapshotLabel }).first();
  await expect(targetRow).toBeVisible();
  await targetRow.locator('[data-action="restore"]').click();
  await expect(modal).toBeHidden();
  await expectSavedBadge(workspacePage);
});
