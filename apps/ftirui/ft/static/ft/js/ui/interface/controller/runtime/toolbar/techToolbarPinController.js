const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const HOVER_GRACE_MS = 280;

export function createTechToolbarPinController({
  dom = {},
  getActivePanelId = () => null,
  getPanelDom = () => null,
  panelSupportsPlot = () => true,
  updateToolbarMetrics = () => {},
  preferences = null
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const toolbar = dom.toolbar
    || documentRoot?.querySelector?.('.workspace-toolbar-vertical')
    || null;
  const toggle = dom.toggle
    || documentRoot?.querySelector?.('[data-tech-pin-toggle]')
    || null;
  if (!toolbar || !toggle) return null;

  let baseVisible = true;
  let floating = false;
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

  const closeMenu = () => {
    if (typeof window === 'undefined') return;
    const menu = toggle.closest('.dropdown-menu');
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

  const shouldShowFloating = () => baseVisible && floating && (hoveringTarget || hoveringToolbar);
  const clearHideTimer = () => {
    if (!hideTimer) return;
    window.clearTimeout(hideTimer);
    hideTimer = null;
  };
  const scheduleHideCheck = () => {
    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      updateFloating();
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
      updateFloating();
    });
    addListener(hoverTarget, 'mouseleave', () => {
      hoveringTarget = false;
      scheduleHideCheck();
    });
  };

  const updateFloating = () => {
    toolbar.dataset.toolbarFloating = floating ? 'true' : 'false';
    if (!floating || !baseVisible) {
      clearHideTimer();
    }
    if (!baseVisible) {
      setToolbarVisibility(false);
      resetToolbarStyles();
      updateToolbarMetrics();
      return;
    }
    if (!floating) {
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

  const setFloating = (next, { persist = true } = {}) => {
    floating = !!next;
    toggle.checked = floating;
    toggle.setAttribute('aria-checked', String(floating));
    if (persist) {
      preferences?.writeTechToolbarPin?.(floating);
    }
    updateFloating();
  };

  const setBaseVisibility = (next) => {
    baseVisible = !!next;
    updateFloating();
  };

  const handleActivePanelChange = () => {
    updateFloating();
  };

  addListener(toggle, 'change', () => {
    setFloating(toggle.checked);
    closeMenu();
  });
  addListener(toolbar, 'mouseenter', () => {
    clearHideTimer();
    hoveringToolbar = true;
    updateFloating();
  });
  addListener(toolbar, 'mouseleave', () => {
    hoveringToolbar = false;
    scheduleHideCheck();
  });
  if (typeof window !== 'undefined') {
    addListener(window, 'resize', () => {
      if (floating && shouldShowFloating()) {
        positionToolbar();
      }
    });
  }

  const initialPinned = preferences?.readTechToolbarPin?.(toggle.checked);
  setFloating(typeof initialPinned === 'boolean' ? initialPinned : toggle.checked, { persist: false });

  return {
    setBaseVisibility,
    handleActivePanelChange,
    isFloating: () => floating,
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
