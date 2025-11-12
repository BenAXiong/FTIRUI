import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../apps/ftirui/ft/static/ft/js/ui/interface/workspaceCanvas.js', () => ({
  initWorkspaceCanvas: vi.fn()
}));

import {
  mountWorkspace,
  __resetWorkspaceMountForTests
} from '../../../apps/ftirui/ft/static/ft/js/ui/workspace/initControls.js';
import { initWorkspaceCanvas } from '../../../apps/ftirui/ft/static/ft/js/ui/interface/workspaceCanvas.js';

describe('mountWorkspace', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    __resetWorkspaceMountForTests();
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('no-ops when workspace pane is missing', () => {
    expect(mountWorkspace()).toBe(false);
    expect(initWorkspaceCanvas).not.toHaveBeenCalled();
  });

  it('boots the workspace canvas once when pane exists', () => {
    document.body.innerHTML = `
      <div id="pane-plotC">
        <div class="workspace-canvas-wrapper">
          <div id="c_canvas_root"></div>
        </div>
      </div>
    `;
    expect(mountWorkspace()).toBe(true);
    expect(initWorkspaceCanvas).toHaveBeenCalledTimes(1);
    // Subsequent calls should be ignored.
    mountWorkspace();
    expect(initWorkspaceCanvas).toHaveBeenCalledTimes(1);
  });
});

