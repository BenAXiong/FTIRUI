import test from 'node:test';
import assert from 'node:assert/strict';

import { createPanelInteractions } from '../panels/panelInteractions.js';

test('panel interactions no-op when interact is absent', () => {
  const interactions = createPanelInteractions({ interact: null });
  assert.equal(typeof interactions.attach, 'function');
  assert.doesNotThrow(() => interactions.attach('panel-1'));
});
