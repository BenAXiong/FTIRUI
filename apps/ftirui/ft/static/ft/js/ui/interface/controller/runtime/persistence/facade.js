const defaultDeepClone = (value) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const AUTOSAVE_FEEDBACK_DELAY_MS = 1800;
const AUTOSAVE_UI_DEBOUNCE_MS = 2000;

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

  const toButtonList = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    const isNodeList = typeof NodeList !== 'undefined' && value instanceof NodeList;
    const isHtmlCollection = typeof HTMLCollection !== 'undefined' && value instanceof HTMLCollection;
    if (isNodeList || isHtmlCollection) {
      return Array.from(value).filter(Boolean);
    }
    return [value].filter(Boolean);
  };

  const undoButtons = toButtonList(undoButton);
  const redoButtons = toButtonList(redoButton);

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
    closeMenu: closeMenuHook,
    onPersist: onPersistHook
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
  const onPersist = typeof onPersistHook === 'function' ? onPersistHook : null;

  const showToast = notifications.showToast || (() => {});
  const autosaveStatus = typeof notifications.autosaveStatus === 'function' ? notifications.autosaveStatus : null;
  let autosaveStatusTimer = null;
  let autosavePendingTimer = null;

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
      workspaceTitle:
        (typeof document !== 'undefined' && document.body?.dataset?.activeCanvasTitle) ||
        'Untitled canvas',
      figures: hasFigures ? figures : null
    };
  };

  const normalizeHistoryInfo = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        label: typeof value.label === 'string' ? value.label : null
      };
    }
    return {
      label: typeof value === 'string' ? value : null
    };
  };

  const updateHistoryButtons = () => {
    const canUndo = history?.canUndo?.() ?? false;
    undoButtons.forEach((btn) => {
      btn.disabled = !canUndo;
      btn.setAttribute?.('aria-disabled', String(!canUndo));
      btn.setAttribute?.(
        'title',
        canUndo ? 'Undo last action' : 'Nothing to undo'
      );
    });
    const canRedo = history?.canRedo?.() ?? false;
    redoButtons.forEach((btn) => {
      btn.disabled = !canRedo;
      btn.setAttribute?.('aria-disabled', String(!canRedo));
      btn.setAttribute?.(
        'title',
        canRedo ? 'Redo last undone action' : 'Nothing to redo'
      );
    });
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
      autosaveStatus?.('error', 'Autosave unavailable');
      if (autosavePendingTimer) {
        clearTimeout(autosavePendingTimer);
        autosavePendingTimer = null;
      }
      if (autosaveStatusTimer) {
        clearTimeout(autosaveStatusTimer);
        autosaveStatusTimer = null;
      }
    } else if (storageQueueWarningShown) {
      storageQueueWarningShown = false;
    } else {
      if (autosavePendingTimer) {
        clearTimeout(autosavePendingTimer);
      }
      if (autosaveStatusTimer) {
        clearTimeout(autosaveStatusTimer);
        autosaveStatusTimer = null;
      }
      autosavePendingTimer = setTimeout(() => {
        autosavePendingTimer = null;
        autosaveStatus?.('saving');
        autosaveStatusTimer = setTimeout(() => {
          autosaveStatus?.('saved');
        }, AUTOSAVE_FEEDBACK_DELAY_MS);
      }, AUTOSAVE_UI_DEBOUNCE_MS);
    }
    updateStorageButtons();
    if (queued && onPersist) {
      onPersist({ queued });
    }
    return queued;
  };

  const pushHistory = (info = null) => {
    const { label } = normalizeHistoryInfo(info);
    history?.push?.(buildSnapshot(), label);
    return info;
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
    undoButtons.forEach((btn) => addListener(btn, 'click', undo));
    redoButtons.forEach((btn) => addListener(btn, 'click', redo));
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
