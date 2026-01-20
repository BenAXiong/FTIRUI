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
  peakDefaultsKey = 'ftir.workspace.peakDefaults.v1',
  techToolbarPinKey = 'ftir.workspace.tb2.pin.v1',
  techToolbarModeKey = 'ftir.workspace.tb2.mode.v1',
  techToolbarHideHeadersKey = 'ftir.workspace.tb2.hideHeaders.v1',
  techToolbarHideModebarKey = 'ftir.workspace.tb2.hideModebar.v1',
  projectTreeCollapseKey = 'ftir.workspace.projectTreeCollapsed.v1',
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

  const readPeakDefaults = (fallback = {}) => {
    if (!localStore) return fallback;
    try {
      const raw = localStore.getItem(peakDefaultsKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  const writePeakDefaults = (value) => {
    if (!localStore) return;
    try {
      localStore.setItem(peakDefaultsKey, JSON.stringify(value || {}));
    } catch {
      /* ignore storage failures */
    }
  };

  const clearPeakDefaults = () => {
    if (!localStore) return;
    try {
      localStore.removeItem(peakDefaultsKey);
    } catch {
      /* ignore storage failures */
    }
  };

  const readTechToolbarPin = (fallback = false) => {
    if (!localStore) return fallback;
    try {
      const stored = localStore.getItem(techToolbarPinKey);
      if (stored === null) return fallback;
      return stored === '1';
    } catch {
      return fallback;
    }
  };

  const writeTechToolbarPin = (enabled) => {
    if (!localStore) return;
    try {
      localStore.setItem(techToolbarPinKey, enabled ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  };

  const readTechToolbarMode = (fallback = null) => {
    if (!localStore) return fallback;
    try {
      const stored = localStore.getItem(techToolbarModeKey);
      if (stored === null) return fallback;
      const trimmed = stored.trim();
      return trimmed ? trimmed : fallback;
    } catch {
      return fallback;
    }
  };

  const writeTechToolbarMode = (mode) => {
    if (!localStore) return;
    try {
      if (mode === null || mode === undefined) {
        localStore.removeItem(techToolbarModeKey);
      } else {
        localStore.setItem(techToolbarModeKey, String(mode));
      }
    } catch {
      /* ignore storage failures */
    }
  };

  const readTechToolbarHideHeaders = (fallback = false) => {
    if (!localStore) return fallback;
    try {
      const stored = localStore.getItem(techToolbarHideHeadersKey);
      if (stored === null) return fallback;
      return stored === '1';
    } catch {
      return fallback;
    }
  };

  const writeTechToolbarHideHeaders = (enabled) => {
    if (!localStore) return;
    try {
      localStore.setItem(techToolbarHideHeadersKey, enabled ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  };

  const readTechToolbarHideModebar = (fallback = false) => {
    if (!localStore) return fallback;
    try {
      const stored = localStore.getItem(techToolbarHideModebarKey);
      if (stored === null) return fallback;
      return stored === '1';
    } catch {
      return fallback;
    }
  };

  const writeTechToolbarHideModebar = (enabled) => {
    if (!localStore) return;
    try {
      localStore.setItem(techToolbarHideModebarKey, enabled ? '1' : '0');
    } catch {
      /* ignore storage failures */
    }
  };

  const readProjectTreeCollapse = (fallback = { sections: [], folders: [] }) => {
    if (!localStore) return fallback;
    try {
      const raw = localStore.getItem(projectTreeCollapseKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
      const folders = Array.isArray(parsed?.folders) ? parsed.folders : [];
      return { sections, folders };
    } catch {
      return fallback;
    }
  };

  const writeProjectTreeCollapse = (state) => {
    if (!localStore) return;
    try {
      const payload = {
        sections: Array.isArray(state?.sections) ? state.sections : [],
        folders: Array.isArray(state?.folders) ? state.folders : []
      };
      localStore.setItem(projectTreeCollapseKey, JSON.stringify(payload));
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
    readPeakDefaults,
    writePeakDefaults,
    clearPeakDefaults,
    readTechToolbarPin,
    writeTechToolbarPin,
    readTechToolbarMode,
    writeTechToolbarMode,
    readTechToolbarHideHeaders,
    writeTechToolbarHideHeaders,
    readTechToolbarHideModebar,
    writeTechToolbarHideModebar,
    readProjectTreeCollapse,
    writeProjectTreeCollapse,
    teardown
  };
}
