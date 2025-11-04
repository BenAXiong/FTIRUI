export function createPanelContext({
  panelId,
  runtimeState
} = {}) {
  if (!panelId) {
    throw new Error('createPanelContext requires a panelId');
  }

  const state = runtimeState || {};
  const panels = state.panels || {};
  const sections = state.sections || {};
  const ui = state.ui || {};

  const getRecord = () => (typeof panels.getRecord === 'function' ? panels.getRecord(panelId) : null);
  const getTraces = () => (typeof panels.getTraces === 'function' ? panels.getTraces(panelId) : []);
  const getFigure = () => (typeof panels.getFigure === 'function' ? panels.getFigure(panelId) : { data: [], layout: {} });

  return {
    id: panelId,
    getRecord,
    getTraces,
    getFigure,
    getDom: () => (typeof ui.getPanelDom === 'function' ? ui.getPanelDom(panelId) : null),
    getActivePanelId: typeof ui.getActivePanelId === 'function' ? ui.getActivePanelId : () => null,
    setActivePanel: typeof ui.setActivePanel === 'function' ? ui.setActivePanel : () => {},
    hasSection: (sectionId) => (typeof sections.has === 'function' ? sections.has(sectionId) : false),
    defaultSectionId: sections.defaultId
  };
}
