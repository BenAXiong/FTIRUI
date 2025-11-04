import test from 'node:test';
import assert from 'node:assert/strict';

import { createPanelDomFacade } from '../panels/panelDomFacade.js';

test('panelDomFacade.mountPanel returns null when required data missing', () => {
  const facade = createPanelDomFacade();

  assert.equal(facade.mountPanel({ panelState: {} }), null);
  assert.equal(facade.mountPanel({ panelId: 'panel-1' }), null);
});
