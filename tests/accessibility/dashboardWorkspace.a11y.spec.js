import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  hasSmokeCredentials,
  openCanvasFromDashboard,
  prepareSmokeCanvas
} from '../smoke/helpers.js';

const severeImpacts = new Set(['serious', 'critical']);

test.describe.configure({ mode: 'serial' });

test('dashboard view has no critical accessibility violations', async ({ page, baseURL }, testInfo) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasSmokeCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  await prepareSmokeCanvas(page, baseURL);

  const results = await new AxeBuilder({ page })
    .include('#dashboard_root')
    .disableRules(['color-contrast']) // color contrast is tracked separately with design tokens
    .analyze();

  await attachViolations(testInfo, 'dashboard', results.violations);
  assertNoSevereViolations(results.violations, 'dashboard');
});

test('workspace canvas has no critical accessibility violations', async ({ page, baseURL }, testInfo) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasSmokeCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  const seededCanvas = await prepareSmokeCanvas(page, baseURL);
  const workspacePage = await openCanvasFromDashboard(page, seededCanvas.canvasId);
  await workspacePage.waitForLoadState('domcontentloaded');

  const results = await new AxeBuilder({ page: workspacePage })
    .include('body')
    .disableRules(['color-contrast']) // same reasoning as dashboard scan
    .analyze();

  await attachViolations(testInfo, 'workspace', results.violations);
  assertNoSevereViolations(results.violations, 'workspace');
});

async function attachViolations(testInfo, scope, violations) {
  if (!violations?.length) {
    return;
  }
  await testInfo.attach(`axe-${scope}.json`, {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json'
  });
}

function assertNoSevereViolations(violations = [], scope) {
  const severe = violations.filter((violation) => severeImpacts.has(violation.impact || ''));
  if (!severe.length) {
    return;
  }
  const message = [
    `Critical/serious accessibility violations detected on ${scope}:`,
    ...severe.map(
      (violation) =>
        `- [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`
    )
  ].join('\n');
  expect(severe, message).toHaveLength(0);
}
