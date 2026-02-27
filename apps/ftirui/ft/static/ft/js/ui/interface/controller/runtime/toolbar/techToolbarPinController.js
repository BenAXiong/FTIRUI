const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const HOVER_GRACE_MS = 280;

const resolveMode = (value, fallback) => {
  if (!value) return fallback;
  const normalized = String(value).toLowerCase();
  return normalized || fallback;
};

export function createTechToolbarPinController({
  dom = {},
  getActivePanelId = () => null,
  getPanelDom = () => null,
  panelSupportsPlot = () => true,
  updateToolbarMetrics = () => {},
  preferences = null,
  sidePanelController = null,
  hoverController = null
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const toolbar = dom.toolbar
    || documentRoot?.querySelector?.('.workspace-toolbar-vertical')
    || null;
  const modeButtons = dom.modeButtons
    || Array.from(documentRoot?.querySelectorAll?.('[data-tech-toolbar-mode]') || []);

  if (!toolbar || !modeButtons.length) return null;

  const modeMap = new Map();
  modeButtons.forEach((button) => {
    const mode = button?.getAttribute?.('data-tech-toolbar-mode');
    if (mode) {
      modeMap.set(mode, button);
    }
  });
  const fallbackMode = modeMap.has('menus')
    ? 'menus'
    : (modeMap.keys().next().value || 'menus');

  let baseVisible = true;
  let mode = fallbackMode;
  let hoverTarget = null;
  let hoveringTarget = false;
  let hoveringToolbar = false;
  let hideTimer = null;
  const listeners = [];

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const removeListeners = (nodes = []) => {
    listeners
      .filter((item) => nodes.includes(item.node))
      .forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
  };

  const closeMenu = (source) => {
    if (typeof window === 'undefined') return;
    const origin = source || modeButtons[0];
    const menu = origin?.closest?.('.dropdown-menu');
    if (!menu) return;
    const labelledBy = menu.getAttribute('aria-labelledby');
    if (!labelledBy) return;
    const trigger = documentRoot?.getElementById?.(labelledBy);
    if (!trigger || !window.bootstrap?.Dropdown) return;
    const dropdown = window.bootstrap.Dropdown.getInstance(trigger)
      || new window.bootstrap.Dropdown(trigger);
    dropdown.hide();
  };

  const setToolbarVisibility = (visible) => {
    if (!visible && typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active && toolbar.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
    }
    toolbar.hidden = !visible;
    toolbar.setAttribute('aria-hidden', String(!visible));
    if (!visible) {
      toolbar.setAttribute('inert', '');
    } else {
      toolbar.removeAttribute('inert');
    }
  };

  const resetToolbarStyles = () => {
    toolbar.style.left = '';
    toolbar.style.top = '';
    toolbar.style.right = '';
    toolbar.style.transform = '';
  };

  const positionToolbar = () => {
    if (!hoverTarget) return;
    const anchorRect = hoverTarget.getBoundingClientRect();
    const container = toolbar.offsetParent || toolbar.parentElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const desiredLeft = anchorRect.right - containerRect.left + 12;
    const desiredTop = anchorRect.top - containerRect.top + (anchorRect.height - toolbarRect.height) / 2;
    const left = clamp(desiredLeft, 8, containerRect.width - toolbarRect.width - 8);
    const top = clamp(desiredTop, 8, containerRect.height - toolbarRect.height - 8);
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
    toolbar.style.right = 'auto';
    toolbar.style.transform = 'none';
  };

  const isFloating = () => mode === 'floating';
  const isPanel = () => mode === 'panel';
  const shouldShowFloating = () => baseVisible && isFloating() && (hoveringTarget || hoveringToolbar);
  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = null;
  };
  const scheduleHideCheck = () => {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      updateModeState();
    }, HOVER_GRACE_MS);
  };

  const detachHoverTarget = () => {
    if (hoverTarget) {
      removeListeners([hoverTarget]);
    }
    hoverTarget = null;
    hoveringTarget = false;
  };

  const attachHoverTarget = (target) => {
    if (!target) return;
    if (hoverTarget === target) return;
    detachHoverTarget();
    hoverTarget = target;
    addListener(hoverTarget, 'mouseenter', () => {
      clearHideTimer();
      hoveringTarget = true;
      updateModeState();
    });
    addListener(hoverTarget, 'mouseleave', () => {
      hoveringTarget = false;
      scheduleHideCheck();
    });
  };

  const syncModeButtons = () => {
    modeMap.forEach((button, key) => {
      const active = key === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  const syncSidePanel = () => {
    if (!sidePanelController?.setMode) return;
    sidePanelController.setMode(mode, { visibleOverride: isPanel() && baseVisible });
  };

  const updateModeState = () => {
    toolbar.dataset.toolbarFloating = isFloating() ? 'true' : 'false';
    hoverController?.setSuppressed?.(isPanel());
    syncSidePanel();
    if (!isFloating() || !baseVisible) {
      clearHideTimer();
    }
    if (!baseVisible) {
      setToolbarVisibility(false);
      resetToolbarStyles();
      updateToolbarMetrics();
      return;
    }
    if (isPanel()) {
      detachHoverTarget();
      resetToolbarStyles();
      setToolbarVisibility(false);
      updateToolbarMetrics();
      return;
    }
    if (!isFloating()) {
      detachHoverTarget();
      resetToolbarStyles();
      setToolbarVisibility(true);
      updateToolbarMetrics();
      return;
    }
    const panelId = getActivePanelId?.();
    if (!panelId || (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId))) {
      detachHoverTarget();
      setToolbarVisibility(false);
      resetToolbarStyles();
      updateToolbarMetrics();
      return;
    }
    const panelDom = getPanelDom?.(panelId);
    attachHoverTarget(panelDom?.rootEl || null);
    const visible = shouldShowFloating();
    setToolbarVisibility(visible);
    if (visible) {
      positionToolbar();
    }
    updateToolbarMetrics();
  };

  const setMode = (next, { persist = true } = {}) => {
    mode = resolveMode(next, fallbackMode);
    if (!modeMap.has(mode)) {
      mode = fallbackMode;
    }
    syncModeButtons();
    if (persist) {
      preferences?.writeTechToolbarMode?.(mode);
    }
    updateModeState();
  };

  const setBaseVisibility = (next) => {
    baseVisible = !!next;
    sidePanelController?.setBaseVisibility?.(baseVisible);
    updateModeState();
  };

  const handleActivePanelChange = () => {
    updateModeState();
  };

  modeButtons.forEach((button) => {
    addListener(button, 'click', () => {
      const nextMode = button.getAttribute('data-tech-toolbar-mode');
      setMode(nextMode);
      closeMenu(button);
    });
  });
  addListener(toolbar, 'mouseenter', () => {
    clearHideTimer();
    hoveringToolbar = true;
    updateModeState();
  });
  addListener(toolbar, 'mouseleave', () => {
    hoveringToolbar = false;
    scheduleHideCheck();
  });
  if (typeof window !== 'undefined') {
    addListener(window, 'resize', () => {
      if (isFloating() && shouldShowFloating()) {
        positionToolbar();
      }
    });
  }

  const storedMode = preferences?.readTechToolbarMode?.(null);
  if (storedMode && modeMap.has(storedMode)) {
    setMode(storedMode, { persist: false });
  } else {
    const panelState = preferences?.readTechToolbarPanelState?.(null);
    const wantsPanelMode = modeMap.has('panel')
      && (
        panelState?.mode === 'panel'
        || panelState?.visible === true
      );
    if (wantsPanelMode) {
      setMode('panel', { persist: false });
    } else {
    const legacyPinned = preferences?.readTechToolbarPin?.(null);
    if (typeof legacyPinned === 'boolean') {
      setMode(legacyPinned ? 'menus' : 'floating', { persist: false });
    } else {
      setMode(fallbackMode, { persist: false });
    }
    }
  }

  return {
    setBaseVisibility,
    handleActivePanelChange,
    setMode,
    isFloating: () => isFloating(),
    getMode: () => mode,
    teardown() {
      clearHideTimer();
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
      detachHoverTarget();
    }
  };
}
