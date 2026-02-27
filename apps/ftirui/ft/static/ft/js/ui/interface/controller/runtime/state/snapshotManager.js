import { serializePanelsSnapshot, hydratePanelsSnapshot } from './panelSnapshotSerializer.js';

export function createSnapshotManager({
  panelsModel,
  sectionManager,
  historyHelpers,
  persistence = {},
  dom = {},
  registerPanel,
  updateCanvasState = () => {},
  renderBrowser = () => {},
  setActivePanel = () => {},
  getActivePanelId = () => null,
  colorCursor
} = {}) {
  if (!panelsModel) {
    throw new Error('snapshotManager requires panelsModel');
  }

  const {
    panelDomRegistry = new Map(),
    detachPanelDom = () => {}
  } = dom || {};

  const clearPanels = () => {
    Array.from(panelDomRegistry.entries()).forEach(([panelId, handles]) => {
      handles?.rootEl?.remove();
      detachPanelDom(panelId);
    });
    panelsModel.load({ counter: 0, items: [] });
    setActivePanel(null);
    colorCursor?.reset?.();
  };

  const snapshot = () => ({
    sections: sectionManager?.snapshot?.() ?? null,
    panels: serializePanelsSnapshot(
      typeof panelsModel.snapshot === 'function'
        ? panelsModel.snapshot()
        : { counter: 0, items: [] }
    ),
    uiPrefs: {
      colorCursor: colorCursor?.get?.() ?? 0,
      activePanelId: getActivePanelId?.() || null
    }
  });

  const restore = (snapshotValue, { skipHistory = false } = {}) => {
    const run = () => {
      clearPanels();
      const uiPrefs = snapshotValue?.uiPrefs && typeof snapshotValue.uiPrefs === 'object'
        ? { ...snapshotValue.uiPrefs }
        : {};
      if (Object.prototype.hasOwnProperty.call(snapshotValue || {}, 'colorCursor') && !('colorCursor' in uiPrefs)) {
        uiPrefs.colorCursor = snapshotValue.colorCursor;
      }
      if (colorCursor?.set) {
        colorCursor.set(Number(uiPrefs.colorCursor) || 0);
      }
      sectionManager?.load?.(snapshotValue?.sections);
      const panelSnapshot = hydratePanelsSnapshot(snapshotValue?.panels || { counter: 0, items: [] });
      panelsModel.load(panelSnapshot);
      panelsModel.getPanelsInIndexOrder().forEach((state) => {
        registerPanel?.(state, {
          skipHistory: true,
          skipPersist: true,
          preserveIndex: true,
          useModelState: true
        });
      });
      const requestedActivePanelId =
        typeof uiPrefs.activePanelId === 'string'
          ? uiPrefs.activePanelId
          : null;
      if (requestedActivePanelId) {
        const exists = panelsModel.getPanelsInIndexOrder().some((panel) => panel?.id === requestedActivePanelId);
        if (exists) {
          setActivePanel(requestedActivePanelId);
        }
      }
      updateCanvasState();
      renderBrowser();
      persistence?.persist?.();
      if (!skipHistory) {
        historyHelpers?.refresh?.();
      }
    };

    if (skipHistory) {
      run();
      return;
    }
    if (historyHelpers?.queueMutation) {
      historyHelpers.queueMutation(run, { persistChange: false });
    } else {
      run();
    }
  };

  return {
    clear: clearPanels,
    snapshot,
    restore
  };
}
