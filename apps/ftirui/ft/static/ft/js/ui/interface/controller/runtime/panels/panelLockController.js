const PANEL_META_KEY = 'workspacePanel';

const readFigureLockState = (figure) => {
  const meta = figure?.layout?.meta;
  const panelMeta = meta && typeof meta === 'object' ? meta[PANEL_META_KEY] : null;
  return {
    editLocked: panelMeta?.editLocked === true,
    pinned: panelMeta?.pinned === true
  };
};

const readContentLockState = (content) => {
  const meta = content?.meta;
  const panelMeta = meta && typeof meta === 'object' ? meta[PANEL_META_KEY] : null;
  return {
    editLocked: panelMeta?.editLocked === true,
    pinned: panelMeta?.pinned === true
  };
};

const mergeLockState = (figure, patch = {}) => {
  const current = readFigureLockState(figure);
  const next = {
    editLocked: typeof patch.editLocked === 'boolean' ? patch.editLocked : current.editLocked,
    pinned: typeof patch.pinned === 'boolean' ? patch.pinned : current.pinned
  };
  const changed = current.editLocked !== next.editLocked || current.pinned !== next.pinned;
  if (!changed) {
    return { figure, state: current, changed: false };
  }
  const layout = figure?.layout && typeof figure.layout === 'object' ? figure.layout : {};
  const meta = layout.meta && typeof layout.meta === 'object' ? { ...layout.meta } : {};
  if (next.editLocked || next.pinned) {
    const existing = meta[PANEL_META_KEY] && typeof meta[PANEL_META_KEY] === 'object'
      ? meta[PANEL_META_KEY]
      : {};
    meta[PANEL_META_KEY] = { ...existing, ...next };
  } else if (Object.prototype.hasOwnProperty.call(meta, PANEL_META_KEY)) {
    delete meta[PANEL_META_KEY];
  }
  const nextFigure = {
    ...figure,
    layout: {
      ...layout,
      meta
    }
  };
  return { figure: nextFigure, state: next, changed: true };
};

const mergeContentLockState = (content, patch = {}) => {
  const current = readContentLockState(content);
  const next = {
    editLocked: typeof patch.editLocked === 'boolean' ? patch.editLocked : current.editLocked,
    pinned: typeof patch.pinned === 'boolean' ? patch.pinned : current.pinned
  };
  const changed = current.editLocked !== next.editLocked || current.pinned !== next.pinned;
  if (!changed) {
    return { content, state: current, changed: false };
  }
  const base = content && typeof content === 'object' ? { ...content } : {};
  const meta = base.meta && typeof base.meta === 'object' ? { ...base.meta } : {};
  if (next.editLocked || next.pinned) {
    const existing = meta[PANEL_META_KEY] && typeof meta[PANEL_META_KEY] === 'object'
      ? meta[PANEL_META_KEY]
      : {};
    meta[PANEL_META_KEY] = { ...existing, ...next };
  } else if (Object.prototype.hasOwnProperty.call(meta, PANEL_META_KEY)) {
    delete meta[PANEL_META_KEY];
  }
  base.meta = meta;
  return { content: base, state: next, changed: true };
};

const buildHistoryLabel = (prevState, nextState, noun = 'graph') => {
  if (prevState.editLocked !== nextState.editLocked) {
    return nextState.editLocked ? `Lock ${noun}` : `Unlock ${noun}`;
  }
  if (prevState.pinned !== nextState.pinned) {
    return nextState.pinned ? `Pin ${noun}` : `Unpin ${noun}`;
  }
  return `Update ${noun} lock`;
};

export function createPanelLockController({
  getPanelDom = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  getPanelContent = () => null,
  updatePanelFigure = () => {},
  updatePanelContent = () => {},
  renderPlot = () => {},
  pushHistory = () => {},
  updateHistoryButtons = () => {},
  persist = () => {},
  panelSupportsPlot = () => true,
  showToast = () => {},
  allowNonPlot = false
} = {}) {
  const disableButtonForLock = (btn) => {
    if (!btn) return;
    if (!btn.disabled) {
      btn.dataset.lockDisabled = '1';
    }
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('is-locked');
  };

  const restoreButtonFromLock = (btn) => {
    if (!btn) return;
    if (btn.dataset.lockDisabled !== '1') return;
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    btn.classList.remove('is-locked');
    delete btn.dataset.lockDisabled;
  };

  const syncPanelDomState = (panelId, state) => {
    const dom = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    const rootEl = dom?.rootEl;
    if (!rootEl) return;
    rootEl.classList.toggle('is-edit-locked', state.editLocked);
    rootEl.classList.toggle('is-panel-pinned', state.pinned);
    const buttons = rootEl.querySelectorAll('.workspace-panel-action-btn');
    buttons.forEach((btn) => {
      const action = btn.dataset?.panelAction || '';
      if (state.editLocked) {
        if (action === 'lock') return;
        disableButtonForLock(btn);
      } else {
        restoreButtonFromLock(btn);
      }
    });
  };

  const setLockState = (panelId, patch, { render = true } = {}) => {
    if (!panelId) return false;
    const supportsPlot = typeof panelSupportsPlot === 'function' ? panelSupportsPlot(panelId) : true;
    if (!supportsPlot && !allowNonPlot) {
      showToast('Locking is only available for plot panels.', 'info');
      return false;
    }
    if (!supportsPlot) {
      const content = getPanelContent(panelId);
      if (!content) return false;
      const currentState = readContentLockState(content);
      const { content: nextContent, state, changed } = mergeContentLockState(content, patch);
      if (!changed) {
        syncPanelDomState(panelId, currentState);
        return true;
      }
      pushHistory({
        label: buildHistoryLabel(readContentLockState(content), state, 'panel'),
        meta: {
          action: 'panel-lock',
          value: state
        }
      });
      updatePanelContent(panelId, nextContent);
      syncPanelDomState(panelId, state);
      persist();
      updateHistoryButtons();
      return true;
    }

    const figure = getPanelFigure(panelId);
    if (!figure) return false;
    const current = readFigureLockState(figure);
    const { figure: nextFigure, state, changed } = mergeLockState(figure, patch);
    if (!changed) {
      syncPanelDomState(panelId, current);
      return true;
    }

    pushHistory({
      label: buildHistoryLabel(current, state, supportsPlot ? 'graph' : 'panel'),
      meta: {
        action: 'panel-lock',
        value: state
      }
    });
    updatePanelFigure(panelId, nextFigure, { source: 'panel-lock', skipTemplateDirty: true });
    syncPanelDomState(panelId, state);
    if (render && supportsPlot) {
      renderPlot(panelId);
    }
    persist();
    updateHistoryButtons();
    return true;
  };

  return {
    isPanelEditLocked: (panelId) => {
      if (!panelId) return false;
      const supportsPlot = typeof panelSupportsPlot === 'function' ? panelSupportsPlot(panelId) : true;
      if (!supportsPlot) {
        return readContentLockState(getPanelContent(panelId)).editLocked === true;
      }
      return readFigureLockState(getPanelFigure(panelId)).editLocked === true;
    },
    isPanelPinned: (panelId) => {
      if (!panelId) return false;
      const supportsPlot = typeof panelSupportsPlot === 'function' ? panelSupportsPlot(panelId) : true;
      if (!supportsPlot) {
        return readContentLockState(getPanelContent(panelId)).pinned === true;
      }
      return readFigureLockState(getPanelFigure(panelId)).pinned === true;
    },
    handleLockToggle: (panelId, { on } = {}) => setLockState(panelId, { editLocked: !!on }, { render: true }),
    handlePinToggle: (panelId, { on } = {}) => setLockState(panelId, { pinned: !!on }, { render: false }),
    handlePanelFigureUpdate: (panelId) => {
      if (!panelId) return;
      const supportsPlot = typeof panelSupportsPlot === 'function' ? panelSupportsPlot(panelId) : true;
      const state = supportsPlot
        ? readFigureLockState(getPanelFigure(panelId))
        : readContentLockState(getPanelContent(panelId));
      syncPanelDomState(panelId, state);
    }
  };
}
