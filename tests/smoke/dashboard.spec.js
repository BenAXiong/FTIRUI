import { expect, test } from '@playwright/test';

const hasCredentials = Boolean(process.env.SMOKE_USERNAME && process.env.SMOKE_PASSWORD);

test.describe.configure({ mode: 'serial' });

test('opens a seeded dashboard board and confirms autosave status', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  await loginWithAdmin(page, baseURL);
  const seededBoard = await seedBoardViaApi(page, baseURL);
  await openDashboardTab(page, baseURL);

  const boardButton = page.locator(`[data-action="open-board"][data-board="${seededBoard.boardId}"]`).first();
  await boardButton.waitFor({ state: 'visible' });
  await boardButton.click();
  await page.waitForURL(new RegExp(`\\?board=${seededBoard.boardId}`));

  const autosaveText = page.locator('#autosave_indicator .autosave-text');
  await expect(autosaveText).toContainText('Saved', { timeout: 10000 });
});

test('saves and restores a snapshot through the workspace modal', async ({ page, baseURL }) => {
  test.skip(!baseURL, 'SMOKE_BASE_URL not set');
  test.skip(!hasCredentials, 'SMOKE_USERNAME/SMOKE_PASSWORD not provided');

  await loginWithAdmin(page, baseURL);
  const seededBoard = await seedBoardViaApi(page, baseURL);
  await openDashboardTab(page, baseURL);
  await openBoardFromDashboard(page, seededBoard.boardId);

  await page.click('#c_canvas_more_btn');
  const dialogPromise = page.waitForEvent('dialog');
  await page.click('#c_canvas_snapshot_save');
  const dialog = await dialogPromise;
  await dialog.accept('Smoke Snapshot');

  await page.click('#c_canvas_more_btn');
  await page.click('#c_canvas_snapshot_manage');

  const modal = page.locator('#c_canvas_snapshot_modal.show');
  await expect(modal).toBeVisible();
  const restoreButton = modal.locator('[data-action="restore"]').first();
  await restoreButton.waitFor({ state: 'visible' });
  await restoreButton.click();
  await expect(modal).toBeHidden();
});

async function loginWithAdmin(page, baseURL) {
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

async function openDashboardTab(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.locator('#dashboard')).toBeVisible();
}

async function openBoardFromDashboard(page, boardId) {
  const boardButton = page.locator(`[data-action="open-board"][data-board="${boardId}"]`).first();
  await boardButton.waitFor({ state: 'visible' });
  await boardButton.click();
  await page.waitForURL(new RegExp(`\\?board=${boardId}`));
}

async function seedBoardViaApi(page, baseURL) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  const title = `Smoke Board ${Date.now()}`;
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
      project.boards = [];
    }

    const board = await request(`/api/dashboard/projects/${project.id}/boards/`, {
      method: 'POST',
      body: {
        title: newTitle,
        state: ensureState()
      }
    });

    return { boardId: board.id, boardTitle: board.title };
  }, { newTitle: title });
}
