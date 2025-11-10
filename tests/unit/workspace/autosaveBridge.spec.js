import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createState } from '../../../apps/ftirui/ft/static/ft/js/core/state/index.js';
import { createBoardBridge } from '../../../apps/ftirui/ft/static/ft/js/ui/interface/sessions.js';
import * as dashboardService from '../../../apps/ftirui/ft/static/ft/js/services/dashboard.js';

const makeDeps = () => ({
  ensureFolderStructure: vi.fn(),
  normalizeGlobalInputState: vi.fn(),
  getDisplayConfig: vi.fn().mockReturnValue({ key: 'tr' }),
  renderFolderTree: vi.fn(),
  syncInputControls: vi.fn(),
  applyDisplayUnits: vi.fn(),
  renderPlot: vi.fn(),
  updateHistoryButtons: vi.fn(),
  syncDemoButton: vi.fn(),
  updateWorkspaceSummary: vi.fn()
});

const sampleState = (title = 'Cloud Board') => ({
  version: 2,
  global: { sessionTitle: title },
  order: ['trace-1'],
  traces: {
    'trace-1': {
      id: 'trace-1',
      meta: { label: title },
      data: { x: [1, 2], y: [3, 4] },
      source: { x: [1, 2], y: [3, 4] }
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

describe('createBoardBridge', () => {
  let deps;
  let instance;

  beforeEach(() => {
    deps = makeDeps();
    instance = {
      state: {
        ...createState(),
        global: { sessionTitle: 'Local workspace' }
      }
    };
    window.showAppToast = vi.fn();
  });

  it('loads board state from the dashboard API', async () => {
    const bridge = createBoardBridge('board-42', instance, deps);
    const fetchSpy = vi.spyOn(dashboardService, 'fetchBoardState').mockResolvedValue({
      id: 'board-42',
      title: 'Cloud Board',
      state: sampleState()
    });

    await bridge.load();

    expect(fetchSpy).toHaveBeenCalledWith('board-42');
    expect(instance.state.global.sessionTitle).toBe('Cloud Board');
    expect(window.showAppToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Board ready', variant: 'success' })
    );
  });

  it('reports failures while loading board state', async () => {
    const bridge = createBoardBridge('board-99', instance, deps);
    vi.spyOn(dashboardService, 'fetchBoardState').mockRejectedValue(new Error('offline'));

    await bridge.load();

    expect(window.showAppToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Unable to load board', variant: 'danger' })
    );
  });

  it('persists board snapshots through saveBoardState', async () => {
    const bridge = createBoardBridge('board-7', instance, deps);
    const saveSpy = vi.spyOn(dashboardService, 'saveBoardState').mockResolvedValue({});
    const payload = sampleState('Workspace Sync');

    await bridge.save(payload, 'Workspace Sync');

    expect(saveSpy).toHaveBeenCalledWith('board-7', {
      state: payload,
      version_label: 'Workspace Sync'
    });
  });
});

