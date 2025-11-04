const toStorage = (store) => {
  try {
    return store ?? null;
  } catch {
    return null;
  }
};

export function createUiPreferencesFacade({
  collapseKey = 'ftir.workspace.panelCollapsed.v1',
  pinKey = 'ftir.workspace.panelPinned.v1',
  sessionStorage: session = typeof globalThis !== 'undefined' ? globalThis.sessionStorage : undefined,
  localStorage: local = typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined
} = {}) {
  const sessionStore = toStorage(session);
  const localStore = toStorage(local);

  const setCollapsed = (collapsed) => {
    if (!sessionStore) return;
    try {
      if (collapsed) {
        sessionStore.setItem(collapseKey, '1');
      } else {
        sessionStore.removeItem(collapseKey);
      }
    } catch {
      /* ignore storage failures */
    }
  };

  const clearCollapsed = () => {
    if (!sessionStore) return;
    try {
      sessionStore.removeItem(collapseKey);
    } catch {
      /* ignore storage failures */
    }
  };

  const readCollapsed = () => {
    if (!sessionStore) return false;
    try {
      return sessionStore.getItem(collapseKey) === '1';
    } catch {
      return false;
    }
  };

  const setPinned = (pinned) => {
    if (!localStore) return;
    try {
      localStore.setItem(pinKey, pinned ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  };

  const readPinned = (fallback = false) => {
    if (!localStore) return fallback;
    try {
      const stored = localStore.getItem(pinKey);
      if (stored === null) return fallback;
      return stored === '1';
    } catch {
      return fallback;
    }
  };

  const clearPinned = () => {
    if (!localStore) return;
    try {
      localStore.removeItem(pinKey);
    } catch {
      /* ignore storage failures */
    }
  };

  const teardown = () => {};

  return {
    setCollapsed,
    clearCollapsed,
    readCollapsed,
    setPinned,
    readPinned,
    clearPinned,
    teardown
  };
}
