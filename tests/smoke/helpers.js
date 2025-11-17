import { expect } from '@playwright/test';

export const hasSmokeCredentials = Boolean(process.env.SMOKE_USERNAME && process.env.SMOKE_PASSWORD);

export async function loginWithAdmin(page, baseURL) {
  await page.goto(`${baseURL}/admin/login/?next=/admin/`, { waitUntil: 'networkidle' });
  const alreadyAuthed = await page.locator('text=Site administration').first().isVisible().catch(() => false);
  if (alreadyAuthed) {
    return;
  }
  await page.fill('#id_username', process.env.SMOKE_USERNAME || '');
  await page.fill('#id_password', process.env.SMOKE_PASSWORD || '');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('input[type="submit"]')
  ]);
}

export async function openDashboardTab(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
}

export async function seedCanvasViaApi(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const title = `Smoke Canvas ${Date.now()}`;
  return page.evaluate(async ({ newTitle }) => {
    const csrf = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrftoken='))
      ?.split('=')[1];

    const request = async (path, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (options.method && options.method.toUpperCase() !== 'GET') {
        headers.set('Content-Type', 'application/json');
        if (csrf) headers.set('X-CSRFToken', csrf);
      }
      const init = {
        credentials: 'same-origin',
        ...options,
        headers,
        body: options.body && typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
      };
      const resp = await fetch(path, init);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `${resp.status}`);
      }
      if (resp.status === 204) return null;
      return resp.json();
    };

    const ensureState = () => ({
      version: 2,
      global: { sessionTitle: newTitle },
      order: ['trace-1'],
      traces: {
        'trace-1': {
          id: 'trace-1',
          data: { x: [1], y: [2] },
          source: { x: [1], y: [2] }
        }
      },
      folders: {
        root: {
          id: 'root',
          name: 'Root',
          parent: null,
          folders: [],
          traces: ['trace-1'],
          collapsed: false
        }
      },
      folderOrder: ['root'],
      ui: { activeFolder: 'root' }
    });

    const sections = await request('/api/dashboard/sections/?include=full');
    let section = sections.items?.[0] || null;
    if (!section) {
      section = await request('/api/dashboard/sections/', {
        method: 'POST',
        body: { name: 'Smoke Section', description: 'Seeded by smoke tests' }
      });
      section.projects = [];
    }

    let project = section.projects?.[0] || null;
    if (!project) {
      project = await request(`/api/dashboard/sections/${section.id}/projects/`, {
        method: 'POST',
        body: { title: 'Smoke Project', summary: 'CI workspace' }
      });
      project.canvases = [];
    }

    const canvas = await request(`/api/dashboard/projects/${project.id}/canvases/`, {
      method: 'POST',
      body: {
        title: newTitle,
        state: ensureState()
      }
    });

    return { canvasId: canvas.id, canvasTitle: canvas.title };
  }, { newTitle: title });
}

export async function prepareSmokeCanvas(page, baseURL) {
  await loginWithAdmin(page, baseURL);
  const seededCanvas = await seedCanvasViaApi(page, baseURL);
  await openDashboardTab(page, baseURL);
  return seededCanvas;
}

export async function openCanvasFromDashboard(page, canvasId) {
  const canvasButton = page.locator(`[data-action="open-canvas"][data-canvas="${canvasId}"]`).first();
  await canvasButton.waitFor({ state: 'visible' });
  const [workspacePage] = await Promise.all([
    page.waitForEvent('popup'),
    canvasButton.click()
  ]);
  await workspacePage.waitForURL(new RegExp(`/workspace.*canvas=${canvasId}`));
  return workspacePage;
}

export async function expectSavedBadge(workspacePage) {
  const autosaveIndicator = workspacePage.locator('#autosave_indicator');
  await expect(autosaveIndicator).toBeVisible();
  const autosaveText = autosaveIndicator.locator('.autosave-text');
  await expect(autosaveText).toContainText('Saved', { timeout: 10000 });
}

export async function saveSnapshotFromToolbar(workspacePage, label, canvasId) {
  await workspacePage.click('#c_canvas_more_btn');
  const dialogPromise = workspacePage.waitForEvent('dialog');
  const createResponse = workspacePage.waitForResponse((response) => {
    return (
      response.url().includes(`/api/dashboard/canvases/${canvasId}/versions/`) &&
      response.request().method() === 'POST' &&
      response.status() === 201
    );
  });
  await workspacePage.click('#c_canvas_snapshot_save');
  const dialog = await dialogPromise;
  await dialog.accept(label);
  await createResponse;
}

export async function openSnapshotModal(workspacePage, canvasId) {
  const versionsResponse = workspacePage.waitForResponse((response) => {
    return (
      response.url().includes(`/api/dashboard/canvases/${canvasId}/versions/`) &&
      response.request().method() === 'GET'
    );
  });
  await workspacePage.click('#c_canvas_more_btn');
  await workspacePage.click('#c_canvas_snapshot_manage');
  await versionsResponse;
  const modal = workspacePage.locator('#c_canvas_snapshot_modal.show');
  await expect(modal).toBeVisible();
  return modal;
}
