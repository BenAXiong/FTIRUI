export function createPanelPreferencesManager({
  panelDom = {},
  preferences = null,
  updateCanvasOffset = () => {},
  requestLayoutSync = () => {}
} = {}) {
  let panelPinned = false;

  const isPanelCollapsed = () => !!panelDom.root?.classList.contains('collapsed');

  const computeExpanded = () => {
    if (!panelDom.root) return false;
    if (!panelDom.root.classList.contains('collapsed')) return true;
    return panelDom.root.classList.contains('peeking') || panelDom.root.classList.contains('is-active');
  };

  const updatePanelToggleUI = () => {
    if (!panelDom.toggle) return;
    const pinned = panelPinned;
    const expanded = computeExpanded();
    const title = pinned ? 'Unpin browser' : 'Pin browser';
    panelDom.toggle.setAttribute('aria-expanded', String(expanded));
    panelDom.toggle.setAttribute('aria-pressed', String(pinned));
    panelDom.toggle.title = title;
    panelDom.toggle.setAttribute('aria-label', title);
    panelDom.toggle.classList.toggle('is-active', pinned);
    const icon = panelDom.toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-chevron-double-left', pinned);
      icon.classList.toggle('bi-chevron-double-right', !pinned);
    } else {
      panelDom.toggle.innerHTML = pinned
        ? '<i class="bi bi-chevron-double-left"></i>'
        : '<i class="bi bi-chevron-double-right"></i>';
    }
  };

  const setCollapsed = (collapsed, { persist = true, silent = false } = {}) => {
    if (!panelDom.root) return;
    panelDom.root.classList.toggle('collapsed', collapsed);
    if (!collapsed) {
      panelDom.root.classList.remove('peeking');
    }
    updatePanelToggleUI();
    if (persist) {
      preferences?.setCollapsed?.(collapsed);
    }
    if (!silent) {
      updateCanvasOffset();
    }
    requestLayoutSync();
  };

  const updatePanelPinUI = () => {
    if (panelDom.pin) {
      panelDom.pin.classList.toggle('is-active', panelPinned);
      panelDom.pin.setAttribute('aria-pressed', String(panelPinned));
      panelDom.pin.setAttribute('title', panelPinned ? 'Unpin browser' : 'Pin browser');
      panelDom.pin.innerHTML = panelPinned
        ? '<i class="bi bi-pin-angle-fill"></i>'
        : '<i class="bi bi-pin-angle"></i>';
    }
    if (panelDom.root) {
      panelDom.root.classList.toggle('is-floating', !panelPinned);
      panelDom.root.classList.toggle('is-pinned', panelPinned);
      if (panelPinned) {
        panelDom.root.classList.remove('is-active');
      }
    }
    requestLayoutSync();
  };

  const setPinned = (value, { persist = true } = {}) => {
    const next = !!value;
    if (panelPinned === next) {
      updatePanelPinUI();
      updateCanvasOffset();
      updatePanelToggleUI();
      return;
    }
    panelPinned = next;
    if (!panelPinned) {
      panelDom.root?.classList.add('peeking');
      setCollapsed(true, { persist: false, silent: true });
      if (persist) {
        preferences?.clearCollapsed?.();
      }
    } else {
      panelDom.root?.classList.remove('peeking');
      if (isPanelCollapsed()) {
        setCollapsed(false, { persist: false });
      }
      if (persist) {
        preferences?.setCollapsed?.(false);
      }
    }
    updatePanelPinUI();
    updateCanvasOffset();
    updatePanelToggleUI();
    if (persist) {
      preferences?.setPinned?.(panelPinned);
    }
  };

  const restoreCollapsed = () => {
    const stored = preferences?.readCollapsed?.() ?? false;
    if (panelPinned) {
      setCollapsed(!!stored, { persist: false });
    } else {
      setCollapsed(true, { persist: false });
    }
  };

  const restorePinned = () => {
    panelPinned = preferences?.readPinned?.(panelPinned) ?? panelPinned;
    setPinned(panelPinned, { persist: false });
  };

  return {
    setCollapsed,
    setPinned,
    isPanelCollapsed,
    isPanelPinned: () => panelPinned,
    restoreCollapsed,
    restorePinned
  };
}
