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
