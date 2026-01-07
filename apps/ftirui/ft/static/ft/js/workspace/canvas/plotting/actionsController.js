/**
 * Responsibility: Apply high-level plot layout and trace actions using injected model and renderer callbacks.
 * Inputs: wired getters/setters plus render callback supplied by the canvas controller at boot.
 * Outputs: mutates panel figures via the provided setter and triggers re-render callbacks.
 * Never: never import the PanelsModel directly, never talk to Plotly, never perform DOM queries.
 */
import { applyLayoutPatch, guardAxisGrid, cloneFigure } from './patchLayout.js';

let _getFigureById = null;
let _setFigureById = null;
let _renderNow = null;
const isPanelEditLocked = (panelId) => {
  if (!_getFigureById) return false;
  const fig = _getFigureById(panelId);
  return fig?.layout?.meta?.workspacePanel?.editLocked === true;
};

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
  if (isPanelEditLocked(panelId)) return;

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
  const layout = cur?.layout || {};
  const current = Object.prototype.hasOwnProperty.call(layout, 'showlegend')
    ? !!layout.showlegend
    : true;
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

// Toggle minor grid visibility for an axis ('xaxis' | 'yaxis')
export function toggleMinorGrid(panelId, axisKey) {
  const cur = _getFigureById(panelId);
  const current = !!cur?.layout?.[axisKey]?.minor?.show;
  const patch = {
    [`${axisKey}.minor.show`]: !current,
    [`${axisKey}.minor.showgrid`]: !current
  };
  applyLayout(panelId, patch);
}

// Enable/disable axis zero line
export function setZeroLine(panelId, axisKey, enabled) {
  applyLayout(panelId, { [`${axisKey}.zeroline`]: !!enabled });
}

// Set legend orientation: 'h' | 'v'
export function setLegendOrientation(panelId, orientation) {
  if (!orientation) return;
  applyLayout(panelId, { 'legend.orientation': orientation });
}

// Set plot margins
export function setMargins(panelId, { l, r, t, b } = {}) {
  const patch = {};
  if (Number.isFinite(l)) patch['margin.l'] = l;
  if (Number.isFinite(r)) patch['margin.r'] = r;
  if (Number.isFinite(t)) patch['margin.t'] = t;
  if (Number.isFinite(b)) patch['margin.b'] = b;
  if (Object.keys(patch).length === 0) return;
  applyLayout(panelId, patch);
}

// Set hovermode
export function setHoverMode(panelId, mode) {
  applyLayout(panelId, { hovermode: mode || false });
}

// Set line width for a trace by index (simple, index-based version)
export function setTraceLineWidth(panelId, traceIndex, widthPx = 2) {
  if (!_getFigureById || !_setFigureById || !_renderNow) return;
  const fig = _getFigureById(panelId);
  if (!fig) return;
  if (isPanelEditLocked(panelId)) return;
  const next = cloneFigure(fig);
  const numericWidth = Number(widthPx);
  const width = Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : 1;
  next.data = (next.data || []).map((trace, idx) => {
    if (idx !== traceIndex) return trace;
    const line = { ...(trace?.line || {}), width };
    return { ...trace, width, line };
  });
  _setFigureById(panelId, next);
  _renderNow(panelId);
}

export function setTraceColor(panelId, traceIndex, color) {
  if (!_getFigureById || !_setFigureById || !_renderNow) return;
  const fig = _getFigureById(panelId);
  if (!fig) return;
  if (isPanelEditLocked(panelId)) return;
  const next = cloneFigure(fig);
  const resolved = typeof color === 'string' && color ? color : '#1f77b4';
  next.data = (next.data || []).map((trace, idx) => {
    if (idx !== traceIndex) return trace;
    const line = { ...(trace?.line || {}), color: resolved };
    const markerLine = trace?.marker?.line ? { ...trace.marker.line, color: resolved } : { color: resolved };
    const marker = trace?.marker
      ? { ...trace.marker, color: resolved, line: markerLine }
      : { color: resolved, line: markerLine };
    const meta = { ...(trace?.meta || {}) };
    meta.manualColor = true;
    delete meta.autoColorIndex;
    return { ...trace, color: resolved, line, marker, meta };
  });
  _setFigureById(panelId, next);
  _renderNow(panelId);
}

export function setTraceLineDash(panelId, traceIndex, dash) {
  if (!_getFigureById || !_setFigureById || !_renderNow) return;
  const fig = _getFigureById(panelId);
  if (!fig) return;
  if (isPanelEditLocked(panelId)) return;
  const next = cloneFigure(fig);
  const resolved = typeof dash === 'string' && dash ? dash : 'solid';
  next.data = (next.data || []).map((trace, idx) => {
    if (idx !== traceIndex) return trace;
    const line = { ...(trace?.line || {}), dash: resolved };
    return { ...trace, dash: resolved, line };
  });
  _setFigureById(panelId, next);
  _renderNow(panelId);
}

export function setTraceOpacity(panelId, traceIndex, opacity) {
  if (!_getFigureById || !_setFigureById || !_renderNow) return;
  const fig = _getFigureById(panelId);
  if (!fig) return;
  if (isPanelEditLocked(panelId)) return;
  const next = cloneFigure(fig);
  const numeric = Number(opacity);
  const resolved = Number.isFinite(numeric) ? Math.min(1, Math.max(0.05, numeric)) : 1;
  next.data = (next.data || []).map((trace, idx) => {
    if (idx !== traceIndex) return trace;
    return { ...trace, opacity: resolved };
  });
  _setFigureById(panelId, next);
  _renderNow(panelId);
}

