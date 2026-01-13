import { createBrowserTreeState } from './treeState.js';
import { renderBrowserTree } from './renderTree.js';
import { attachBrowserEvents } from './events.js';
import { attachBrowserDragDrop } from './dragDrop.js';

export function createBrowserFacade({
  dom = {},
  state = {},
  selectors = {},
  actions = {},
  drag = {},
  services = {},
  flags = {}
} = {}) {
  let eventsHandle = null;
  let dragHandle = null;

  const render = () => {
    const sectionOrder = typeof state.getSectionOrder === 'function'
      ? state.getSectionOrder()
      : state.sectionOrder;

    const treeState = createBrowserTreeState({
      searchTerm: state.getSearchTerm?.() ?? '',
      sections: state.sections,
      sectionOrder,
      defaultSectionId: state.defaultSectionId,
      getPanelsOrdered: state.getPanelsOrdered,
      coerceNumber: state.coerceNumber,
      isPlotPanel: selectors.isPlotPanel,
      isPanelTypeEnabled: selectors.isPanelTypeEnabled,
      isPanelTagEnabled: selectors.isPanelTagEnabled
    });

    const panelTypeFilters = selectors.getPanelTypeFilters?.() ?? null;
    const tagFilters = selectors.getPanelTagFilters?.() ?? null;
    const hasTypeFilters = !!(panelTypeFilters && Object.values(panelTypeFilters).some((enabled) => enabled === false));
    const hasTagFilters = !!(tagFilters && Object.values(tagFilters).some((enabled) => enabled === false));
    const hasActivePanelFilters = hasTypeFilters || hasTagFilters;

    const renderContext = {
      panelDom: dom.panelDom,
      sections: state.sections,
      sectionOrder,
      defaultSectionId: state.defaultSectionId,
      ensureArray: selectors.ensureArray,
      getPanelTraces: selectors.getPanelTraces,
      normalizePanelTraces: selectors.normalizePanelTraces,
      renderPlot: actions.renderPlot,
      updateTraceChip: actions.updateTraceChip,
      pushHistory: actions.pushHistory,
      history: actions.history,
      persist: actions.persist,
      updateHistoryButtons: actions.updateHistoryButtons,
      addGraphToSection: actions.addGraphToSection,
      toggleGraphVisibility: actions.toggleGraphVisibility,
      togglePanelCollapsedState: actions.togglePanelCollapsedState,
      toggleSectionCollapsedState: actions.toggleSectionCollapsedState,
      toggleSectionVisibility: actions.toggleSectionVisibility,
      moveTrace: actions.moveTrace,
      moveGraph: actions.moveGraph,
      removePanel: actions.removePanel,
      deleteSectionInteractive: actions.deleteSectionInteractive,
      deleteGraphInteractive: actions.deleteGraphInteractive,
      requestGraphFileBrowse: actions.requestGraphFileBrowse,
      showToast: actions.showToast,
      getPanelRecord: selectors.getPanelRecord,
      panelsModel: services.panelsModel,
      queueSectionRename: actions.queueSectionRename,
      startSectionRename: actions.startSectionRename,
      getPendingRenameSectionId: actions.getPendingRenameSectionId,
      clearPendingRenameSectionId: actions.clearPendingRenameSectionId,
      setDropTarget: drag.setDropTarget,
      getDragState: drag.getDragState,
      setDragState: drag.setDragState,
      traceDragMime: drag.traceDragMime,
      applyActivePanelState: actions.applyActivePanelState,
      ensureChipPanelsMount: actions.ensureChipPanelsMount,
      refreshPanelVisibility: actions.refreshPanelVisibility,
      isSectionVisible: selectors.isSectionVisible,
      focusSectionById: actions.focusSectionById,
      focusPanelById: actions.focusPanelById,
      bringPanelToFront: actions.bringPanelToFront,
      createSection: actions.createSection,
      renameSection: actions.renameSection,
      setSectionCollapsed: actions.setSectionCollapsed,
      getPanelFigure: selectors.getPanelFigure,
      setActivePanel: actions.setActivePanel,
      requestRender: render,
      activePanelId: state.getActivePanelId?.(),
      panelTypeFilters,
      hasActivePanelFilters
    };

    renderBrowserTree(renderContext, treeState);
  };

  const attachEvents = () => {
    eventsHandle?.detach?.();
    eventsHandle = attachBrowserEvents({
      panelDom: dom.panelDom,
      isPanelPinned: flags.isPanelPinned,
      focusPanelById: actions.focusPanelById,
      focusSectionById: actions.focusSectionById,
      renderBrowser: render,
      toggleSectionCollapsedState: actions.toggleSectionCollapsedState,
      togglePanelCollapsedState: actions.togglePanelCollapsedState,
      toggleSectionVisibility: actions.toggleSectionVisibility,
      toggleGraphVisibility: actions.toggleGraphVisibility,
      addGraphToSection: actions.addGraphToSection,
      pushHistory: actions.pushHistory,
      createSection: actions.createSection,
      queueSectionRename: actions.queueSectionRename,
      persist: actions.persist,
      updateHistoryButtons: actions.updateHistoryButtons,
      deleteSectionInteractive: actions.deleteSectionInteractive,
      deleteGraphInteractive: actions.deleteGraphInteractive,
      requestGraphFileBrowse: actions.requestGraphFileBrowse,
      startSectionRename: actions.startSectionRename,
      startPanelRename: actions.startPanelRename,
      chipPanelsBridge: services.chipPanelsBridge
    });
  };

  const attachDragDrop = () => {
    dragHandle?.detach?.();
    dragHandle = attachBrowserDragDrop({
      panelDom: dom.panelDom,
      getPanelTraces: selectors.getPanelTraces,
      setDropTarget: drag.setDropTarget,
      getDragState: drag.getDragState,
      setDragState: drag.setDragState,
      pushHistory: actions.pushHistory,
      moveTrace: actions.moveTrace,
      history: actions.history,
      sections: state.sections,
      getPanelRecord: selectors.getPanelRecord,
      moveGraph: actions.moveGraph,
      moveSection: actions.moveSection,
      defaultSectionId: state.defaultSectionId,
      renderBrowser: render,
      persist: actions.persist,
      updateHistoryButtons: actions.updateHistoryButtons
    });
  };

  const teardown = () => {
    eventsHandle?.detach?.();
    eventsHandle = null;
    dragHandle?.detach?.();
    dragHandle = null;
  };

  return {
    render,
    attachEvents,
    attachDragDrop,
    teardown
  };
}
