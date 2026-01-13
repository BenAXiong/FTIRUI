/**
 * Responsibility: Attach and manage event handlers for the legacy browser tree interactions.
 * Inputs: receives a root element plus callbacks supplied by the canvas controller/runtime.
 * Outputs: invokes provided callbacks on user interactions and exposes a detach routine.
 * Never: never mutate PanelsModel directly, never trigger Plotly, never assume tree markup structure beyond data attributes.
 */
const contexts = new WeakMap();

const noop = () => false;

const callGuarded = (fn, ...args) => {
  try {
    if (typeof fn !== 'function') return false;
    return fn(...args);
  } catch (err) {
    console.error('[treeEvents] handler failed', err);
    return false;
  }
};

const isButtonClick = (event) => {
  const target = event.target;
  if (!target) return false;
  return !!target.closest('button');
};

const resolveSectionId = (element) => {
  if (!element) return null;
  const node = element.closest('[data-section-id]');
  return node?.dataset?.sectionId || null;
};

const resolvePanelId = (element) => {
  if (!element) return null;
  const node = element.closest('[data-panel-id]');
  return node?.dataset?.panelId || null;
};

export function attach(rootEl, options = {}) {
  if (!rootEl || contexts.has(rootEl)) return;

  const context = {
    rootEl,
    onSelectPanel: options.onSelectPanel ?? noop,
    onSelectSection: options.onSelectSection ?? noop,
    onStateChanged: options.onStateChanged ?? noop,
    toggleSectionCollapsed: options.toggleSectionCollapsed ?? noop,
    togglePanelCollapsed: options.togglePanelCollapsed ?? noop,
    toggleSectionVisibility: options.toggleSectionVisibility ?? noop,
    togglePanelVisibility: options.togglePanelVisibility ?? noop,
    addGraphToSection: options.addGraphToSection ?? noop,
    addSubSection: options.addSubSection ?? noop,
    deleteSection: options.deleteSection ?? noop,
    deletePanel: options.deletePanel ?? noop,
    browsePanel: options.browsePanel ?? noop,
    startSectionRename: options.startSectionRename ?? noop,
    startPanelRename: options.startPanelRename ?? noop
  };

  const handleStatefulResult = (result) => {
    if (result !== false) {
      callGuarded(context.onStateChanged);
    }
    return result;
  };

  const handleClick = (event) => {
    const target = event.target;
    if (!target) return;

    const sectionToggle = target.closest('.section-node .toggle');
    if (sectionToggle) {
      const sectionId = resolveSectionId(sectionToggle);
      if (sectionId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.toggleSectionCollapsed, sectionId));
      }
      return;
    }

    const panelToggle = target.closest('.graph-node .toggle');
    if (panelToggle) {
      const panelId = resolvePanelId(panelToggle);
      if (panelId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.togglePanelCollapsed, panelId));
      }
      return;
    }

    const sectionVisibility = target.closest('.section-visibility');
    if (sectionVisibility) {
      const sectionId = resolveSectionId(sectionVisibility);
      if (sectionId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.toggleSectionVisibility, sectionId));
      }
      return;
    }

    const panelVisibility = target.closest('.graph-visibility');
    if (panelVisibility) {
      const panelId = resolvePanelId(panelVisibility);
      if (panelId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.togglePanelVisibility, panelId));
      }
      return;
    }

    const addGraphBtn = target.closest('.section-add-graph');
    if (addGraphBtn) {
      const sectionId = resolveSectionId(addGraphBtn);
      if (sectionId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.addGraphToSection, sectionId));
      }
      return;
    }

    const addSubBtn = target.closest('.section-add-sub');
    if (addSubBtn) {
      const sectionId = resolveSectionId(addSubBtn);
      if (sectionId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.addSubSection, sectionId));
      }
      return;
    }

    const deleteSectionBtn = target.closest('.section-delete');
    if (deleteSectionBtn) {
      const sectionId = resolveSectionId(deleteSectionBtn);
      if (sectionId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.deleteSection, sectionId));
      }
      return;
    }

    const deletePanelBtn = target.closest('.graph-delete');
    if (deletePanelBtn) {
      const panelId = resolvePanelId(deletePanelBtn);
      if (panelId) {
        event.preventDefault();
        handleStatefulResult(callGuarded(context.deletePanel, panelId));
      }
      return;
    }

    const browsePanelBtn = target.closest('.graph-browse');
    if (browsePanelBtn) {
      const panelId = resolvePanelId(browsePanelBtn);
      if (panelId) {
        event.preventDefault();
        callGuarded(context.browsePanel, panelId);
      }
      return;
    }

    const graphHeader = target.closest('.graph-header');
    if (graphHeader && !isButtonClick(event)) {
      const panelId = resolvePanelId(graphHeader);
      if (panelId) {
        handleStatefulResult(callGuarded(context.togglePanelCollapsed, panelId));
        callGuarded(context.onSelectPanel, panelId);
      }
      return;
    }

    const sectionHeader = target.closest('.section-header');
    if (sectionHeader && !isButtonClick(event)) {
      const sectionId = resolveSectionId(sectionHeader);
      if (sectionId) {
        handleStatefulResult(callGuarded(context.toggleSectionCollapsed, sectionId));
        callGuarded(context.onSelectSection, sectionId);
      }
    }
  };

  const handleDoubleClick = (event) => {
    const graphNameEl = event.target?.closest('.graph-name');
    if (graphNameEl) {
      const panelId = resolvePanelId(graphNameEl);
      if (panelId) {
        callGuarded(context.startPanelRename, panelId, graphNameEl, { selectAll: true });
      }
      return;
    }
    const nameEl = event.target?.closest('.section-name');
    if (!nameEl) return;
    const sectionId = nameEl.dataset?.sectionId;
    if (!sectionId) return;
    callGuarded(context.startSectionRename, sectionId, nameEl, { selectAll: true });
  };

  rootEl.addEventListener('click', handleClick);
  rootEl.addEventListener('dblclick', handleDoubleClick);

  contexts.set(rootEl, {
    ...context,
    handlers: {
      handleClick,
      handleDoubleClick
    }
  });
}

export function detach(rootEl) {
  const ctx = contexts.get(rootEl);
  if (!ctx) return;
  const { handlers } = ctx;
  if (handlers) {
    if (handlers.handleClick) {
      ctx.rootEl.removeEventListener('click', handlers.handleClick);
    }
    if (handlers.handleDoubleClick) {
      ctx.rootEl.removeEventListener('dblclick', handlers.handleDoubleClick);
    }
  }
  contexts.delete(rootEl);
}
