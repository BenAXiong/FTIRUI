const defaultDeepClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export function createPersistenceFacade({
  dom = {},
  menu = {},
  historyFactory,
  historyConfig = {},
  models = {},
  storage,
  hooks = {},
  helpers = {},
  notifications = {},
  snapshot: snapshotManager = null
} = {}) {
  const {
    undo: undoButton = null,
    redo: redoButton = null
  } = dom;

  const history = historyFactory
    ? historyFactory({
        limit: historyConfig.limit,
        tolerance: historyConfig.tolerance
      })
    : null;

  const panelsModel = models.panelsModel || null;
  const deepClone = helpers.deepClone || defaultDeepClone;

  const {
    buildSnapshot: buildSnapshotHook,
    restoreSnapshot: restoreSnapshotHook,
    closeMenu: closeMenuHook
  } = hooks || {};

  const snapshotApi = snapshotManager || {};
  const buildSnapshot = typeof snapshotApi.snapshot === 'function'
    ? () => snapshotApi.snapshot()
    : (typeof buildSnapshotHook === 'function' ? buildSnapshotHook : () => ({}));
  const restoreSnapshot = typeof snapshotApi.restore === 'function'
    ? (value, options) => snapshotApi.restore(value, options)
    : (typeof restoreSnapshotHook === 'function' ? restoreSnapshotHook : () => {});
  const clearSnapshotState = typeof snapshotApi.clear === 'function'
    ? () => snapshotApi.clear()
    : () => {};
  const closeMenu = typeof closeMenuHook === 'function' ? closeMenuHook : () => {};

  const showToast = notifications.showToast || (() => {});

  let storageQueueWarningShown = false;
  let listeners = [];

  const collectFigureSnapshots = () => {
    if (!panelsModel || typeof panelsModel.getPanelsInIndexOrder !== 'function') {
      return {};
    }
    const panelStates = panelsModel.getPanelsInIndexOrder();
    if (!Array.isArray(panelStates)) return {};
    return panelStates.reduce((acc, panel) => {
      if (!panel || !panel.id) return acc;
      const figure = panel.figure ? deepClone(panel.figure) : { data: [], layout: {} };
      acc[panel.id] = figure;
      return acc;
    }, {});
  };

  const buildStorageSnapshot = () => {
    const base = { ...buildSnapshot() };
    const figures = collectFigureSnapshots();
    const hasFigures = Object.keys(figures).length > 0;
    return {
      ...base,
      figures: hasFigures ? figures : null
    };
  };

  const updateHistoryButtons = () => {
    if (undoButton) {
      const canUndo = history?.canUndo?.() ?? false;
      undoButton.disabled = !canUndo;
      undoButton.setAttribute?.('aria-disabled', String(!canUndo));
      undoButton.setAttribute?.(
        'title',
        canUndo ? 'Undo last action' : 'Nothing to undo'
      );
    }
    if (redoButton) {
      const canRedo = history?.canRedo?.() ?? false;
      redoButton.disabled = !canRedo;
      redoButton.setAttribute?.('aria-disabled', String(!canRedo));
      redoButton.setAttribute?.(
        'title',
        canRedo ? 'Redo last undone action' : 'Nothing to redo'
      );
    }
  };

  const updateStorageButtons = () => {
    const hasSnapshot = storage?.hasSnapshot?.() ?? false;
    if (menu.save) {
      menu.save.disabled = false;
      menu.save.setAttribute?.('title', 'Save workspace snapshot');
      menu.save.setAttribute?.('aria-disabled', 'false');
    }
    if (menu.load) {
      menu.load.disabled = !hasSnapshot;
      menu.load.setAttribute?.('aria-disabled', String(!hasSnapshot));
      menu.load.setAttribute?.(
        'title',
        hasSnapshot ? 'Load saved workspace snapshot' : 'No saved workspace available'
      );
    }
    if (menu.clear) {
      menu.clear.disabled = !hasSnapshot;
      menu.clear.setAttribute?.('aria-disabled', String(!hasSnapshot));
      menu.clear.setAttribute?.(
        'title',
        hasSnapshot ? 'Remove saved workspace snapshot' : 'No saved workspace to clear'
      );
    }
  };

  const persist = () => {
    if (!storage?.queueSave) return false;
    const queued = storage.queueSave(buildStorageSnapshot());
    if (!queued) {
      if (!storageQueueWarningShown) {
        storageQueueWarningShown = true;
        console.warn('[workspaceRuntime] Failed to queue workspace autosave');
        if (typeof window !== 'undefined') {
          window.showAppToast?.({
            message: 'Autosave is unavailable; workspace changes will not be saved.',
            variant: 'danger'
          });
        }
      }
    } else if (storageQueueWarningShown) {
      storageQueueWarningShown = false;
    }
    updateStorageButtons();
    return queued;
  };

  const pushHistory = (label) => {
    history?.push?.(buildSnapshot(), label);
  };

  const undo = () => {
    if (!history?.undo) return false;
    const snapshot = history.undo(buildSnapshot());
    if (!snapshot) return false;
    restoreSnapshot(snapshot, { skipHistory: true });
    updateHistoryButtons();
    return true;
  };

  const redo = () => {
    if (!history?.redo) return false;
    const snapshot = history.redo(buildSnapshot());
    if (!snapshot) return false;
    restoreSnapshot(snapshot, { skipHistory: true });
    updateHistoryButtons();
    return true;
  };

  const saveSnapshot = () => {
    closeMenu();
    if (!storage?.save) return;
    const success = storage.save(buildStorageSnapshot());
    if (success) {
      storageQueueWarningShown = false;
      showToast('Workspace snapshot saved locally.', 'success');
    } else {
      storageQueueWarningShown = true;
      showToast('Unable to save workspace snapshot locally.', 'danger');
    }
    updateStorageButtons();
  };

  const loadSnapshot = () => {
    closeMenu();
    if (!storage?.load) return;
    const hadSnapshot = storage.hasSnapshot?.() ?? false;
    if (!hadSnapshot) {
      showToast('No saved workspace snapshot found.', 'info');
      return;
    }
    const beforeState = buildSnapshot();
    const snapshot = storage.load();
    if (snapshot) {
      storageQueueWarningShown = false;
      history?.push?.(beforeState, 'Before manual load');
      restoreSnapshot(snapshot, { skipHistory: true });
      showToast('Workspace snapshot loaded.', 'success');
      updateHistoryButtons();
    } else {
      showToast('Saved workspace snapshot could not be loaded. Using current workspace.', 'warning');
    }
    updateStorageButtons();
  };

  const clearSnapshot = () => {
    closeMenu();
    if (!storage?.clear) return;
    const hadSnapshot = storage.hasSnapshot?.() ?? false;
    const cleared = storage.clear();
    if (hadSnapshot && cleared) {
      clearSnapshotState();
      storageQueueWarningShown = false;
      showToast('Saved workspace snapshot cleared.', 'info');
    } else if (!hadSnapshot) {
      showToast('No saved workspace snapshot to clear.', 'info');
    } else {
      showToast('Unable to clear saved workspace snapshot.', 'danger');
    }
    updateStorageButtons();
  };

  const flush = () => {
    storage?.flush?.();
  };

  const handleBeforeUnload = () => {
    const flushed = storage?.flush?.();
    if (flushed) return;
    if (typeof storage?.save === 'function') {
      storage.save(buildStorageSnapshot());
    }
  };

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flush();
    }
  };

  const addListener = (target, type, handler) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, handler);
    listeners.push({ target, type, handler });
  };

  const detachEvents = () => {
    listeners.forEach(({ target, type, handler }) => {
      if (typeof target.removeEventListener === 'function') {
        target.removeEventListener(type, handler);
      }
    });
    listeners = [];
  };

  const attachEvents = () => {
    detachEvents();
    addListener(undoButton, 'click', undo);
    addListener(redoButton, 'click', redo);
    addListener(menu.save, 'click', saveSnapshot);
    addListener(menu.load, 'click', loadSnapshot);
    addListener(menu.clear, 'click', clearSnapshot);
  };

  history?.setOnChange?.(updateHistoryButtons);
  updateHistoryButtons();
  updateStorageButtons();

  const teardown = () => {
    detachEvents();
    history?.setOnChange?.(() => {});
    flush();
  };

  return {
    history,
    persist,
    pushHistory,
    undo,
    redo,
    saveSnapshot,
    loadSnapshot,
    clearSnapshot,
    restoreSnapshot,
    updateHistoryButtons,
    updateStorageButtons,
    attachEvents,
    detachEvents,
    handleBeforeUnload,
    handleVisibilityChange,
    flush,
    teardown
  };
}
