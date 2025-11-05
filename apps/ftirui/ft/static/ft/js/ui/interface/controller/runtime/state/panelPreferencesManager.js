export function createPanelPreferencesManager({
  panelDom = {},
  preferences = null,
  updateCanvasOffset = () => {},
  requestLayoutSync = () => {}
} = {}) {
  let panelPinned = false;

  const isPanelCollapsed = () => !!panelDom.root?.classList.contains('collapsed');

  const updatePanelToggleUI = (expanded) => {
    if (!panelDom.toggle) return;
    const title = expanded ? 'Collapse browser' : 'Expand browser';
    panelDom.toggle.setAttribute('aria-expanded', String(expanded));
    panelDom.toggle.title = title;
    const icon = panelDom.toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-chevron-double-left', expanded);
      icon.classList.toggle('bi-chevron-double-right', !expanded);
    } else {
      panelDom.toggle.innerHTML = expanded
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
    updatePanelToggleUI(!collapsed);
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
      return;
    }
    panelPinned = next;
    if (!panelPinned) {
      panelDom.root?.classList.add('peeking');
      setCollapsed(false, { persist: false, silent: true });
      preferences?.clearCollapsed?.();
    } else {
      panelDom.root?.classList.remove('peeking');
    }
    updatePanelPinUI();
    updateCanvasOffset();
    updatePanelToggleUI(!isPanelCollapsed());
    if (persist) {
      preferences?.setPinned?.(panelPinned);
    }
  };

  const restoreCollapsed = () => {
    const collapsed = preferences?.readCollapsed?.() ?? false;
    setCollapsed(collapsed, { persist: false });
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
