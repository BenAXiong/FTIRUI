import test from 'node:test';
import assert from 'node:assert/strict';

import { createHeaderActions } from '../panels/headerActions.js';

test('legend action toggles legend via actions controller', () => {
  let toggled = 0;
  let historyPushed = 0;
  let persisted = 0;
  let historyUpdated = 0;

  const { handleHeaderAction } = createHeaderActions({
    actionsController: {
      toggleLegend: () => {
        toggled += 1;
      }
    },
    history: {
      pushHistory: () => {
        historyPushed += 1;
      },
      updateHistoryButtons: () => {
        historyUpdated += 1;
      }
    },
    persistence: {
      persist: () => {
        persisted += 1;
      }
    },
    selectors: {
      getPanelDom: () => ({}),
      getPanelFigure: () => ({})
    }
  });

  handleHeaderAction('panel-1', 'legend');

  assert.equal(toggled, 1);
  assert.equal(historyPushed, 1);
  assert.equal(historyUpdated, 1);
  assert.equal(persisted, 1);
});

test('legend action with explicit visibility applies layout patch', () => {
  let toggled = 0;
  let appliedPatch = null;

  const { handleHeaderAction } = createHeaderActions({
    actionsController: {
      toggleLegend: () => {
        toggled += 1;
      },
      applyLayout: (panelId, patch) => {
        appliedPatch = { panelId, patch };
      }
    },
    selectors: {
      getPanelDom: () => ({}),
      getPanelFigure: () => ({})
    }
  });

  handleHeaderAction('panel-2', 'legend', { on: false });

  assert.equal(toggled, 0);
  assert.deepEqual(appliedPatch, { panelId: 'panel-2', patch: { showlegend: false } });
});

test('export action defaults filename to graph title and single trace name', async () => {
  const originalDocument = global.document;
  let clicked = 0;
  const link = {
    href: '',
    download: '',
    click: () => { clicked += 1; },
    remove: () => {}
  };
  global.document = {
    createElement: (tag) => {
      assert.equal(tag, 'a');
      return link;
    }
  };

  let exportOpts = null;

  try {
    const { handleHeaderAction } = createHeaderActions({
      selectors: {
        getPanelDom: () => ({
          plotEl: {},
          rootEl: {
            dataset: { graphTitle: 'Graph 3', graphIndex: '3' }
          }
        }),
        getPanelFigure: () => ({
          data: [{ name: 'Absorbance' }],
          layout: {}
        })
      },
      plot: {
        exportFigure: (panelId, opts) => {
          exportOpts = opts;
          return Promise.resolve('blob:test');
        }
      }
    });

    handleHeaderAction('panel-3', 'export', {});
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(exportOpts, 'exportFigure should be called');
    assert.equal(exportOpts.format, 'png');
    assert.equal(exportOpts.scale, 2);
    assert.equal(exportOpts.width, 800);
    assert.equal(exportOpts.height, 600);
    assert.equal(clicked, 1);
    assert.equal(link.download, 'Graph 3 - Absorbance.png');
  } finally {
    if (typeof originalDocument === 'undefined') {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
  }
});
