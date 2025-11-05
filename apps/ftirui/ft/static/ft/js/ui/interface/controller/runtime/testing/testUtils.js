import { createColorCursorManager } from '../state/colorCursorManager.js';
import { createHistoryHelpers } from '../state/historyHelpers.js';
import { createRuntimeState } from '../context/runtimeState.js';

export function createSpy(fn = () => {}) {
  const calls = [];
  const spyFn = (...args) => {
    calls.push(args);
    return fn(...args);
  };
  spyFn.calls = calls;
  spyFn.last = () => (calls.length ? calls[calls.length - 1] : null);
  spyFn.reset = () => {
    calls.length = 0;
  };
  return spyFn;
}

export function createStubColorCursor(initial = 0) {
  const manager = createColorCursorManager(initial);
  const wrap = (methodName) => {
    const original = manager[methodName];
    if (typeof original !== 'function') return () => undefined;
    const spy = createSpy(original);
    manager[methodName] = (...args) => spy(...args);
    manager[methodName].calls = spy.calls;
    manager[methodName].reset = spy.reset;
    return manager[methodName];
  };
  wrap('get');
  wrap('set');
  wrap('reset');
  wrap('increment');
  return manager;
}

export function createStubHistoryHelpers(overrides = {}) {
  const recorded = {
    queueMutation: createSpy(),
    push: createSpy(),
    refresh: createSpy(),
    persist: createSpy()
  };
  const helpers = createHistoryHelpers({
    pushHistory: recorded.push,
    updateHistoryButtons: recorded.refresh,
    persist: recorded.persist,
    ...overrides
  });
  const queueSpy = createSpy(helpers.queueMutation);
  helpers.queueMutation = (...args) => queueSpy(...args);
  helpers.queueMutation.calls = queueSpy.calls;
  helpers.queueMutation.reset = queueSpy.reset;
  helpers.__spies = recorded;
  return helpers;
}

export function createStubPanelPreferences({
  collapsed = false,
  pinned = false
} = {}) {
  let currentCollapsed = !!collapsed;
  let currentPinned = !!pinned;

  return {
    setCollapsed: createSpy((value) => {
      currentCollapsed = !!value;
      return currentCollapsed;
    }),
    setPinned: createSpy((value) => {
      currentPinned = !!value;
      return currentPinned;
    }),
    isPanelCollapsed: createSpy(() => currentCollapsed),
    isPanelPinned: createSpy(() => currentPinned),
    restoreCollapsed: createSpy(() => currentCollapsed),
    restorePinned: createSpy(() => currentPinned)
  };
}

export function createRuntimeStateFixture({
  panelsModel = null,
  sectionManager = null,
  panelDomRegistry = new Map(),
  managers = {},
  services = {},
  helpers = {}
} = {}) {
  return createRuntimeState({
    panelsModel,
    sectionManager,
    panelDomRegistry,
    managers,
    services,
    helpers
  });
}
