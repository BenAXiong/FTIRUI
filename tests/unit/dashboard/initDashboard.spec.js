import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import { initDashboard } from '../../../apps/ftirui/ft/static/ft/js/ui/dashboard/initDashboard.js';
import * as dashboardService from '../../../apps/ftirui/ft/static/ft/js/services/dashboard.js';

const ORIGINAL_LOCATION = window.location;

const setupDom = () => {
  document.body.innerHTML = `
    <div id="dashboard_root">
      <span data-dashboard-title></span>
      <div data-dashboard-empty class="dashboard-empty"></div>
      <div class="dashboard-list-view" data-dashboard-list></div>
      <div class="dashboard-gallery-view d-none" data-dashboard-gallery></div>
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
    <button id="dashboard_action_new_canvas"></button>
    <div data-dashboard-view-toggle>
      <button data-view="list">List</button>
      <button data-view="gallery">Gallery</button>
    </div>
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
  window.prompt = vi.fn().mockReturnValue('New Folder');
  mockLocation();
  document.body.dataset.workspaceTabEnabled = 'true';
  document.body.dataset.workspaceRoute = '/workspace/';
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: ORIGINAL_LOCATION,
    configurable: true
  });
  vi.restoreAllMocks();
});

describe('initDashboard', () => {
  it('renders empty state when no sections exist', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({ items: [] });

    initDashboard();
    await flushPromises();

    const emptyState = document.querySelector('[data-dashboard-empty]');
    expect(emptyState?.classList.contains('is-visible')).toBe(true);
  });

  it('renders sections/projects and opens canvases via button click', async () => {
    const canvasId = 'canvas-123';
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
              canvases: [
                {
                  id: canvasId,
                  title: 'Initial canvas',
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

    const firstRow = document.querySelector('[data-dashboard-list] tbody tr');
    expect(firstRow?.textContent).toContain('Reports');

    const canvasButton = document.querySelector('[data-action="open-canvas"]');
    canvasButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(window.location.href).toContain(`canvas=${canvasId}`);
    expect(window.location.hash).toBe('#pane-plotC');
  });

  it('opens standalone workspace route when workspace tab is disabled', async () => {
    document.body.dataset.workspaceTabEnabled = 'false';
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({});

    const canvasId = 'canvas-standalone';
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
              canvases: [{ id: canvasId, title: 'Standalone canvas', updated: '2025-11-10T08:00:00Z' }]
            }
          ]
        }
      ]
    });

    initDashboard();
    await flushPromises();

    const canvasButton = document.querySelector('[data-action="open-canvas"]');
    canvasButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(openSpy).toHaveBeenCalledTimes(1);
    const urlOpened = openSpy.mock.calls[0][0];
    expect(urlOpened).toContain('/workspace');
    expect(urlOpened).toContain(canvasId);
  });

  it('builds the explorer pane and opens the first canvas of a project', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({
      items: [
        {
          id: 'sec-9',
          name: 'Lab',
          projects: [
            {
              id: 'proj-9',
              title: 'Spectra',
              canvases: [
                { id: 'canvas-9', title: 'IR stack', updated: '2025-11-10T08:00:00Z' }
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
    const canvasLink = sidebar?.querySelector('[data-action="sidebar-open-canvas"]');
    expect(canvasLink?.textContent).toContain('IR stack');
    canvasLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(window.location.href).toContain('canvas-9');
    const title = document.querySelector('[data-dashboard-title]');
    expect(title?.textContent).toBe('Spectra');
  });

  it('invokes quick actions for new sections and canvases', async () => {
    vi.spyOn(dashboardService, 'fetchSections').mockResolvedValue({ items: [] });
    const createSection = vi.spyOn(dashboardService, 'createSection').mockResolvedValue({
      id: 'sec-new',
      name: 'Automation',
      projects: []
    });
    const createProject = vi.spyOn(dashboardService, 'createProject').mockResolvedValue({
      id: 'proj-new',
      title: 'Workspace',
      canvases: []
    });
    const createCanvas = vi.spyOn(dashboardService, 'createCanvas').mockResolvedValue({
      id: 'canvas-new',
      title: 'Untitled canvas',
      updated: '2025-11-10T08:00:00Z'
    });

    window.prompt.mockReturnValue('Automation');
    initDashboard();
    await flushPromises();

    document.getElementById('dashboard_action_new_section')?.click();
    await flushPromises();
    expect(createSection).toHaveBeenCalledWith({ name: 'Automation', description: '' });

    document.getElementById('dashboard_action_new_canvas')?.click();
    await flushPromises();
    expect(createProject).toHaveBeenCalled();
    expect(createCanvas).toHaveBeenCalledWith(
      'proj-new',
      expect.objectContaining({ title: 'Untitled canvas' })
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
