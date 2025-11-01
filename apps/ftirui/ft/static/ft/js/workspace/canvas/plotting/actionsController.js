import { applyLayoutPatch, guardAxisGrid, cloneFigure } from './patchLayout.js';

// Simple DI container so we don't import models inside UI controllers.
let _getFigureById = null;
let _setFigureById = null;
let _renderNow = null;

/**
 * Wire model + renderer from workspaceCanvas.
 * workspaceCanvas calls: Actions.__wire({ getFigureById, setFigureById, renderNow })
 */
export function __wire({ getFigureById, setFigureById, renderNow }) {
  _getFigureById = getFigureById;
  _setFigureById = setFigureById;
  _renderNow = renderNow;
}

/**
 * Apply a dotted-key layout patch to a panel's figure and re-render.
 * Example patch: { 'xaxis.showgrid': true, hovermode: 'x' }
 */
export function applyLayout(panelId, patch) {
  if (!_getFigureById || !_setFigureById || !_renderNow) return;
  const cur = _getFigureById(panelId);
  if (!cur) return;

  // Make an isolated copy, apply patch, run any guards, then persist.
  const next = applyLayoutPatch(cur, patch);

  // Optional: keep axis invariants sane (e.g., minor grid implies major grid).
  guardAxisGrid(next.layout, 'xaxis');
  guardAxisGrid(next.layout, 'yaxis');

  _setFigureById(panelId, next);
  _renderNow(panelId);
}

/**
 * Replace the whole figure (rare). Kept for future “replace theme” operations.
 */
export function setFigure(panelId, figure) {
  if (!_setFigureById || !_renderNow) return;
  const safe = cloneFigure(figure || { data: [], layout: {} });
  _setFigureById(panelId, safe);
  _renderNow(panelId);
}

// Toggle Plotly legend visibility
export function toggleLegend(panelId) {
  if (!_getFigureById) return;
  const cur = _getFigureById(panelId);
  const current = !!cur?.layout?.showlegend;
  applyLayout(panelId, { showlegend: !current });
}

// Set axis type: axisKey is 'xaxis' or 'yaxis', type is 'linear'|'log'|'category'|'date'
export function setAxisType(panelId, axisKey, type) {
  if (!axisKey) return;
  applyLayout(panelId, { [`${axisKey}.type`]: type });
}

// Toggle major grid for a given axis ('xaxis' | 'yaxis')
export function toggleMajorGrid(panelId, axisKey) {
  const cur = _getFigureById(panelId);
  const curr = !!cur?.layout?.[axisKey]?.showgrid;
  applyLayout(panelId, { [`${axisKey}.showgrid`]: !curr });
}

// Set line width for a trace by index (simple, index-based version)
export function setTraceLineWidth(panelId, traceIndex, widthPx = 2) {
  const fig = _getFigureById(panelId);
  if (!fig) return;
  const next = cloneFigure(fig);
  next.data = (next.data || []).map((d, i) =>
    i === traceIndex ? { ...d, line: { ...(d.line || {}), width: widthPx } } : d
  );
  _setFigureById(panelId, next);
  _renderNow(panelId);
}

