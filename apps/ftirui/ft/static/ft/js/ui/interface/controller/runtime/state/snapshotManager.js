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
  setColorCursor = () => {},
  getColorCursor = () => 0
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
  };

  const snapshot = () => ({
    sections: sectionManager?.snapshot?.() ?? null,
    panels: typeof panelsModel.snapshot === 'function'
      ? panelsModel.snapshot()
      : { counter: 0, items: [] },
    uiPrefs: {
      colorCursor: getColorCursor()
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
      setColorCursor(Number(uiPrefs.colorCursor) || 0);
      sectionManager?.load?.(snapshotValue?.sections);
      const panelSnapshot = snapshotValue?.panels || { counter: 0, items: [] };
      panelsModel.load(panelSnapshot);
      panelsModel.getPanelsInIndexOrder().forEach((state) => {
        registerPanel?.(state, {
          skipHistory: true,
          skipPersist: true,
          preserveIndex: true,
          useModelState: true
        });
      });
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
    historyHelpers?.queueMutation?.(run, { persistChange: false });
  };

  return {
    clear: clearPanels,
    snapshot,
    restore
  };
}

