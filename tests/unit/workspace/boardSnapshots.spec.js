import { beforeEach, describe, expect, it, vi } from 'vitest';

import { initBoardSnapshots } from '../../../apps/ftirui/ft/static/ft/js/ui/interface/boardSnapshots.js';
import * as dashboardService from '../../../apps/ftirui/ft/static/ft/js/services/dashboard.js';

const createModalScaffold = () => {
  document.body.innerHTML = `
    <button id="save"></button>
    <button id="manage"></button>
    <div id="modal">
      <div data-snapshot-empty class="d-none">Empty</div>
      <div data-snapshot-list></div>
    </div>
  `;
  return {
    saveButton: document.getElementById('save'),
    manageButton: document.getElementById('manage'),
    modal: document.getElementById('modal')
  };
};

const modalInstance = () => ({
  show: vi.fn(),
  hide: vi.fn()
});

describe('boardSnapshots controller', () => {
  beforeEach(() => {
    window.showAppToast = vi.fn();
    window.prompt = vi.fn();
    global.bootstrap = {
      Modal: {
        getOrCreateInstance: vi.fn(() => modalInstance())
      }
    };
  });

  it('creates snapshots when Save is clicked', async () => {
    const { saveButton, manageButton, modal } = createModalScaffold();
    window.prompt.mockReturnValue('Snapshot A');
    const createMock = vi.spyOn(dashboardService, 'createBoardVersion').mockResolvedValue({});

    const bridge = {
      id: 'board-1',
      defaultTitle: 'Board 1',
      save: vi.fn(),
      applyLocal: vi.fn()
    };

    initBoardSnapshots({ bridge, saveButton, manageButton, modal });

    saveButton?.dispatchEvent(new MouseEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createMock).toHaveBeenCalledWith('board-1', { label: 'Snapshot A' });
    expect(window.showAppToast).toHaveBeenCalled();
  });

  it('loads and restores snapshots from the modal', async () => {
    const { saveButton, manageButton, modal } = createModalScaffold();
    const versions = [{ id: 'v1', label: 'Alpha', state_size: 42, created: '2025-11-10T08:00:00Z' }];
    vi.spyOn(dashboardService, 'createBoardVersion').mockResolvedValue({});
    vi.spyOn(dashboardService, 'listBoardVersions').mockResolvedValue({ items: versions });
    vi.spyOn(dashboardService, 'fetchBoardVersion').mockResolvedValue({
      id: 'v1',
      label: 'Alpha',
      state_size: 42,
      state: { version: 2 },
      created: '2025-11-10T08:00:00Z'
    });

    const bridge = {
      id: 'board-9',
      defaultTitle: 'Board 9',
      save: vi.fn().mockResolvedValue(),
      applyLocal: vi.fn()
    };

    initBoardSnapshots({ bridge, saveButton, manageButton, modal });

    manageButton?.dispatchEvent(new MouseEvent('click'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const restoreButton = modal.querySelector('[data-action="restore"]');
    expect(restoreButton).toBeTruthy();

    restoreButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dashboardService.fetchBoardVersion).toHaveBeenCalledWith('board-9', 'v1');
    expect(bridge.save).toHaveBeenCalledWith({ version: 2 }, 'Alpha');
    expect(bridge.applyLocal).toHaveBeenCalledWith({ version: 2 });
  });
});
