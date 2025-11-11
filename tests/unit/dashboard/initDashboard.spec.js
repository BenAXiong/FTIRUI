import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { initDashboard } from '../../../apps/ftirui/ft/static/ft/js/ui/dashboard/initDashboard.js';
import * as dashboardService from '../../../apps/ftirui/ft/static/ft/js/services/dashboard.js';

const ORIGINAL_LOCATION = window.location;

const setupDom = () => {
  document.body.innerHTML = `
    <div id="dashboard_root">
      <span data-dashboard-title></span>
      <div data-dashboard-empty class="dashboard-empty"></div>
      <div data-dashboard-sections></div>
    </div>
    <aside class="dashboard-sidebar">
      <nav data-sidebar-nav>
        <button class="sidebar-nav-link" data-view="home">Home</button>
        <button class="sidebar-nav-link" data-view="latest">Latest</button>
        <button class="sidebar-nav-link" data-view="favorites">Favorites</button>
      </nav>
      <button id="dashboard_sidebar_new_project" type="button">+</button>
      <div data-dashboard-sidebar></div>
    </aside>
    <button id="dashboard_action_new_section"></button>
    <button id="dashboard_action_new_board"></button>
  `;
};

const mockLocation = (href = 'https://app.test/') => {
  const location = new URL(href);
  Object.defineProperty(window, 'location', {
    value: location,
    writable: true,
    configurable: true
  });
};

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setupDom();
  window.showAppToast = vi.fn();
  window.prompt = vi.fn().mockReturnValue('New Section');
  mockLocation();
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: ORIGINAL_LOCATION,
    configurable: true
  });
});

describe('initDashboard', () => {
  it('renders empty state when no sections exist', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({ items: [] });

    initDashboard();
    await flushPromises();

    const emptyState = document.querySelector('[data-dashboard-empty]');
    expect(emptyState?.classList.contains('is-visible')).toBe(true);
  });

  it('renders sections/projects and opens boards via button click', async () => {
    const boardId = 'board-123';
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({
      items: [
        {
          id: 'sec-1',
          name: 'Reports',
          projects: [
            {
              id: 'proj-1',
              title: 'Week 42',
              summary: 'Daily summary',
              boards: [
                {
                  id: boardId,
                  title: 'Initial board',
                  updated: '2025-11-10T08:00:00Z'
                }
              ]
            }
          ]
        }
      ]
    });

    initDashboard();
    await flushPromises();

    const sectionTitle = document.querySelector('.dashboard-section-header h6');
    expect(sectionTitle?.textContent).toBe('Reports');

    const boardButton = document.querySelector('[data-action="open-board"]');
    boardButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(window.location.href).toContain(`board=${boardId}`);
    expect(window.location.hash).toBe('#pane-plotC');
  });

  it('builds the explorer pane and opens the first board of a project', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({
      items: [
        {
          id: 'sec-9',
          name: 'Lab',
          projects: [
            {
              id: 'proj-9',
              title: 'Spectra',
              boards: [
                { id: 'board-9', title: 'IR stack', updated: '2025-11-10T08:00:00Z' }
              ]
            }
          ]
        }
      ]
    });

    initDashboard();
    await flushPromises();

    const sidebar = document.querySelector('[data-dashboard-sidebar]');
    expect(sidebar?.textContent).toContain('Lab');
    const projectToggle = sidebar?.querySelector('[data-action="toggle-project"]');
    projectToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const folderToggle = sidebar?.querySelector('[data-action="toggle-folder"]');
    folderToggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    const boardLink = sidebar?.querySelector('[data-action="sidebar-open-board"]');
    expect(boardLink?.textContent).toContain('IR stack');
    boardLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(window.location.href).toContain('board-9');
    const title = document.querySelector('[data-dashboard-title]');
    expect(title?.textContent).toBe('Spectra');
  });

  it('invokes quick actions for new sections and boards', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({ items: [] });
    const createSection = vi.spyOn(dashboardService, 'createSection').mockResolvedValue({
      id: 'sec-new',
      name: 'Automation',
      projects: []
    });
    const createProject = vi.spyOn(dashboardService, 'createProject').mockResolvedValue({
      id: 'proj-new',
      title: 'Workspace',
      boards: []
    });
    const createBoard = vi.spyOn(dashboardService, 'createBoard').mockResolvedValue({
      id: 'board-new',
      title: 'Untitled board',
      updated: '2025-11-10T08:00:00Z'
    });

    window.prompt.mockReturnValue('Automation');
    initDashboard();
    await flushPromises();

    document.getElementById('dashboard_action_new_section')?.click();
    await flushPromises();
    expect(createSection).toHaveBeenCalledWith({ name: 'Automation', description: '' });

    document.getElementById('dashboard_action_new_board')?.click();
    await flushPromises();
    expect(createProject).toHaveBeenCalled();
    expect(createBoard).toHaveBeenCalledWith(
      'proj-new',
      expect.objectContaining({ title: 'Untitled board' })
    );
  });

  it('surfaces a toast when section retrieval fails', async () => {
    const error = new Error('offline');
    vi.spyOn(dashboardService, 'fetchSections').mockRejectedValue(error);

    initDashboard();
    await flushPromises();

    expect(window.showAppToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Unable to load projects',
        variant: 'danger'
      })
    );
  });
});
