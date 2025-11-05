export function createRuntimeState({
  panelsModel,
  sections,
  sectionManager,
  defaultSectionId,
  panelDomRegistry,
  getPanelDom,
  getActivePanelId,
  setActivePanel,
  getNextPanelSequence,
  managers: externalManagers = {},
  services: externalServices = {},
  helpers: externalHelpers = {}
} = {}) {
  const safePanelsModel = panelsModel || null;
  const safeSectionManager = sectionManager || null;
  const safeSections = safeSectionManager?.getMap?.() || sections || new Map();
  const safeRegistry = panelDomRegistry || new Map();
  const fallbackDefault = typeof defaultSectionId === 'string' ? defaultSectionId : 'section_all';

  const panels = {
    getRecord(id) {
      if (!id || !safePanelsModel) return null;
      return safePanelsModel.getPanel(id) || null;
    },
    getOrdered() {
      if (!safePanelsModel || typeof safePanelsModel.getPanelsInIndexOrder !== 'function') {
        return [];
      }
      return safePanelsModel.getPanelsInIndexOrder();
    },
    getTraces(id) {
      if (!id || !safePanelsModel || typeof safePanelsModel.getPanelTraces !== 'function') {
        return [];
      }
      return safePanelsModel.getPanelTraces(id) || [];
    },
    getFigure(id) {
      if (!id || !safePanelsModel || typeof safePanelsModel.getPanelFigure !== 'function') {
        return { data: [], layout: {} };
      }
      return safePanelsModel.getPanelFigure(id) || { data: [], layout: {} };
    }
  };

  const sectionsApi = {
    get(id) {
      if (!id) return null;
      if (safeSectionManager && typeof safeSectionManager.get === 'function') {
        return safeSectionManager.get(id);
      }
      return safeSections.get(id) || null;
    },
    has(id) {
      if (!id) return false;
      if (safeSectionManager && typeof safeSectionManager.has === 'function') {
        return safeSectionManager.has(id);
      }
      return safeSections.has(id);
    },
    entries() {
      if (safeSectionManager && typeof safeSectionManager.getMap === 'function') {
        return Array.from(safeSectionManager.getMap().entries());
      }
      return Array.from(safeSections.entries());
    },
    getOrder() {
      if (safeSectionManager && typeof safeSectionManager.getOrder === 'function') {
        return safeSectionManager.getOrder();
      }
      return Array.from(safeSections.keys());
    },
    get defaultId() {
      if (safeSectionManager && typeof safeSectionManager.defaultSectionId === 'string') {
        return safeSectionManager.defaultSectionId;
      }
      return fallbackDefault;
    },
    get map() {
      if (safeSectionManager && typeof safeSectionManager.getMap === 'function') {
        return safeSectionManager.getMap();
      }
      return safeSections;
    },
    manager: safeSectionManager
  };

  const managers = {
    sections: safeSectionManager,
    ...externalManagers
  };

  const ui = {
    panelDomRegistry: safeRegistry,
    getPanelDom: typeof getPanelDom === 'function' ? getPanelDom : () => null,
    getActivePanelId: typeof getActivePanelId === 'function' ? getActivePanelId : () => null,
    setActivePanel: typeof setActivePanel === 'function' ? setActivePanel : () => {}
  };

  const workspace = {
    getNextPanelSequence: typeof getNextPanelSequence === 'function'
      ? getNextPanelSequence
      : () => ui.panelDomRegistry.size + 1,
    hasPanels: () => ui.panelDomRegistry.size > 0
  };

  const services = {
    ...externalServices
  };

  const helpers = {
    ...externalHelpers
  };

  return {
    panels,
    sections: sectionsApi,
    ui,
    workspace,
    managers,
    services,
    helpers
  };
}
