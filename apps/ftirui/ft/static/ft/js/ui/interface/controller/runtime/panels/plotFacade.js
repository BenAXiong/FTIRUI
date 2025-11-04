import * as Render from '../../../../workspace/canvas/plotting/render.js';

export function createPlotFacade({
  getPanelDom = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  setPanelFigure = () => {},
  actionsController = {}
} = {}) {
  const getPlotContainerEl = (panelId) => {
    const refs = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    return refs?.plotEl;
  };

  const renderNow = (panelId) => {
    if (!panelId) return;
    const el = getPlotContainerEl(panelId);
    if (!el) return;
    const fig = getPanelFigure(panelId);
    if (!Render.isRendered(el)) {
      return Render.renderInitial(panelId, el, fig);
    }
    return Render.renderUpdate(panelId, el, fig);
  };

  const scheduleRender = (panelId) => renderNow(panelId);

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
    resize
  };
}
