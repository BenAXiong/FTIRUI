import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersistenceFacade } from '../persistence/facade.js';

const createElementStub = () => ({
  disabled: false,
  attributes: {},
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
});

test('persistence facade queues saves and updates storage buttons', () => {
  const undoButton = createElementStub();
  const redoButton = createElementStub();
  const saveButton = createElementStub();
  const loadButton = createElementStub();
  const clearButton = createElementStub();

  let queueSaveCount = 0;
  let saveCount = 0;
  let toastMessage = '';
  let closeMenuCount = 0;

  const expectedSnapshot = { foo: 'bar', figures: null };

  const storage = {
    hasSnapshot: () => true,
    queueSave: (snapshot) => {
      assert.deepEqual(snapshot, expectedSnapshot);
      queueSaveCount += 1;
      return true;
    },
    save: (snapshot) => {
      assert.deepEqual(snapshot, expectedSnapshot);
      saveCount += 1;
      return true;
    },
    clear: () => true,
    load: () => ({ foo: 'bar' }),
    flush: () => {}
  };

  const historyMock = {
    push: () => {},
    undo: () => null,
    redo: () => null,
    canUndo: () => true,
    canRedo: () => false,
    setOnChange: () => {},
    clear: () => {}
  };

  const facade = createPersistenceFacade({
    dom: {
      undo: undoButton,
      redo: redoButton
    },
    menu: {
      save: saveButton,
      load: loadButton,
      clear: clearButton
    },
    historyFactory: () => historyMock,
    historyConfig: {},
    models: {},
    storage,
    hooks: {
      buildSnapshot: () => ({ foo: 'bar' }),
      restoreSnapshot: () => {},
      closeMenu: () => { closeMenuCount += 1; }
    },
    helpers: {
      deepClone: (value) => JSON.parse(JSON.stringify(value))
    },
    notifications: {
      showToast: (message) => { toastMessage = message; }
    }
  });

  facade.persist();
  assert.equal(queueSaveCount, 1, 'queueSave should be invoked');

  facade.saveSnapshot();
  assert.equal(saveCount, 1, 'save should be invoked');
  assert.equal(closeMenuCount, 1, 'menu should be closed before saving');
  assert.equal(toastMessage, 'Workspace snapshot saved locally.');

  // ensure control state updated
  assert.equal(loadButton.disabled, false, 'load should be enabled when snapshot exists');
  assert.equal(loadButton.attributes['aria-disabled'], 'false');

  // cleanup
  facade.teardown();
});
