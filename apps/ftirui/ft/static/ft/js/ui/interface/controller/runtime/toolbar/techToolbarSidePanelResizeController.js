const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const MAX_PANEL_VIEWPORT_RATIO = 0.8;
const MAX_PANEL_WIDTH_PX = 854;

export function createTechToolbarSidePanelResizeController({
  panel,
  handle,
  getContainer = () => panel?.offsetParent || panel?.parentElement || null,
  onResize = () => {},
  preferences = null
} = {}) {
  if (!panel || !handle) return null;

  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  const listeners = [];

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const setBodyDragging = (active) => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('workspace-tech-panel-resizing', active);
  };

  const getBounds = () => {
    const container = getContainer?.();
    const containerRect = container?.getBoundingClientRect?.() || { width: 0 };
    const viewportMax = window?.innerWidth
      ? window.innerWidth * MAX_PANEL_VIEWPORT_RATIO
      : MAX_PANEL_WIDTH_PX;
    const containerMax = containerRect.width
      ? Math.max(260, containerRect.width - 240)
      : MAX_PANEL_WIDTH_PX;
    const maxWidth = Math.min(MAX_PANEL_WIDTH_PX, viewportMax, containerMax);
    return {
      minWidth: 220,
      maxWidth: Math.max(220, maxWidth)
    };
  };

  const onPointerMove = (event) => {
    if (!dragging) return;
    const delta = startX - event.clientX;
    const { minWidth, maxWidth } = getBounds();
    const nextWidth = clamp(startWidth + delta, minWidth, maxWidth);
    panel.style.width = `${Math.round(nextWidth)}px`;
    onResize?.(nextWidth);
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    setBodyDragging(false);
    panel.classList.remove('is-resizing');
    const width = panel.getBoundingClientRect().width;
    if (Number.isFinite(width)) {
      preferences?.writeTechToolbarPanelWidth?.(Math.round(width));
    }
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDrag);
    window.removeEventListener('pointercancel', stopDrag);
  };

  const startDrag = (event) => {
    if (panel.hidden || panel.getAttribute('aria-hidden') === 'true') return;
    dragging = true;
    startX = event.clientX;
    startWidth = panel.getBoundingClientRect().width;
    setBodyDragging(true);
    panel.classList.add('is-resizing');
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDrag);
    window.addEventListener('pointercancel', stopDrag);
  };

  addListener(handle, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    startDrag(event);
  });

  const storedWidth = preferences?.readTechToolbarPanelWidth?.(null);
  if (Number.isFinite(storedWidth)) {
    const { minWidth, maxWidth } = getBounds();
    const nextWidth = clamp(storedWidth, minWidth, maxWidth);
    panel.style.width = `${Math.round(nextWidth)}px`;
    onResize?.(nextWidth);
  }

  return {
    teardown() {
      stopDrag();
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
    }
  };
}
