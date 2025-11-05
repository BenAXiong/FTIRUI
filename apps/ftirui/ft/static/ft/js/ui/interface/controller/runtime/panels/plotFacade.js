import * as Render from '../../../../workspace/canvas/plotting/render.js';

export function createPlotFacade({
  getPanelDom = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  setPanelFigure = () => {},
  actionsController = {},
  timers = {},
  instrumentation = {}
} = {}) {
  const globalObject = typeof window !== 'undefined' ? window : null;
  const requestFrame = typeof timers.request === 'function'
    ? timers.request
    : (typeof globalObject?.requestAnimationFrame === 'function'
      ? (cb) => globalObject.requestAnimationFrame(cb)
      : (cb) => setTimeout(cb, 0));
  const cancelFrame = typeof timers.cancel === 'function'
    ? timers.cancel
    : (typeof globalObject?.cancelAnimationFrame === 'function'
      ? (handle) => globalObject.cancelAnimationFrame(handle)
      : (handle) => clearTimeout(handle));
  const pendingFrames = new Map();
  const {
    onRenderStart = () => {},
    onRenderComplete = () => {}
  } = instrumentation || {};

  const getPlotContainerEl = (panelId) => {
    const refs = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    return refs?.plotEl;
  };

  const renderNow = (panelId, { reason = 'manual' } = {}) => {
    if (!panelId) return;
    const el = getPlotContainerEl(panelId);
    if (!el) return;
    const fig = getPanelFigure(panelId);
    onRenderStart(panelId, { reason });
    try {
      if (!Render.isRendered(el)) {
        return Render.renderInitial(panelId, el, fig);
      }
      return Render.renderUpdate(panelId, el, fig);
    } finally {
      onRenderComplete(panelId, { reason });
    }
  };

  const cancelScheduled = (panelId) => {
    if (!panelId || !pendingFrames.has(panelId)) return false;
    const handle = pendingFrames.get(panelId);
    cancelFrame(handle);
    pendingFrames.delete(panelId);
    return true;
  };

  const scheduleRender = (panelId, { reason = 'schedule' } = {}) => {
    if (!panelId) return;
    cancelScheduled(panelId);
    const handle = requestFrame(() => {
      pendingFrames.delete(panelId);
      renderNow(panelId, { reason });
    });
    pendingFrames.set(panelId, handle);
    return () => cancelScheduled(panelId);
  };

  const exportFigure = (panelId, opts) => {
    const el = getPlotContainerEl(panelId);
    return Render.exportFigure(panelId, el, opts);
  };

  const resize = (panelId) => {
    const el = getPlotContainerEl(panelId);
    return Render.resize(panelId, el);
  };

  if (actionsController && typeof actionsController.__wire === 'function') {
    actionsController.__wire({
      getFigureById: getPanelFigure,
      setFigureById: setPanelFigure,
      renderNow
    });
  }

  return {
    renderNow,
    scheduleRender,
    exportFigure,
    resize,
    cancelScheduled
  };
}
