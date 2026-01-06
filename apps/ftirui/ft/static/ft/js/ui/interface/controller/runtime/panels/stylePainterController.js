const STYLE_PAINTER_STORAGE_KEY = 'ftir.workspace.stylePainter.v1';
const PRESET_KEYS = new Set(['all', 'scales', 'traces']);
const DETAIL_KEYS = new Set([
  'trace-colors',
  'trace-styles',
  'trace-markers',
  'line-smoothing',
  'color-scales',
  'graph-dimensions',
  'scales',
  'fonts',
  'axis-formatting',
  'gridlines',
  'legend',
  'background',
  'annotations',
  'hover-labels'
]);

const PRESET_DETAILS = {
  all: Array.from(DETAIL_KEYS),
  scales: ['scales'],
  traces: ['trace-colors', 'trace-styles', 'trace-markers', 'line-smoothing', 'color-scales']
};

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = cloneValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const hasPath = (obj, path) => {
  let cursor = obj;
  for (let i = 0; i < path.length; i += 1) {
    if (!cursor || typeof cursor !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, path[i])) return false;
    cursor = cursor[path[i]];
  }
  return true;
};

const getPath = (obj, path) => path.reduce((acc, key) => (acc ? acc[key] : undefined), obj);

const setPath = (obj, path, value) => {
  if (!obj) return;
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

const copyPaths = (target, source, paths = []) => {
  paths.forEach((path) => {
    if (hasPath(source, path)) {
      setPath(target, path, cloneValue(getPath(source, path)));
    }
  });
};

const mergeDeep = (target, patch) => {
  if (!patch || typeof patch !== 'object') return target;
  Object.keys(patch).forEach((key) => {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
};

const axisKeysForLayout = (layout = {}) =>
  Object.keys(layout).filter((key) => /^xaxis\d*$/.test(key) || /^yaxis\d*$/.test(key));

const TRACE_COLOR_PATHS = [
  ['line', 'color'],
  ['marker', 'color'],
  ['marker', 'line', 'color'],
  ['fillcolor']
];
const TRACE_STYLE_PATHS = [
  ['line', 'width'],
  ['line', 'dash'],
  ['opacity'],
  ['mode'],
  ['fill']
];
const TRACE_MARKER_PATHS = [
  ['marker', 'symbol'],
  ['marker', 'size'],
  ['marker', 'opacity'],
  ['marker', 'line', 'width'],
  ['marker', 'line', 'color']
];
const TRACE_SMOOTHING_PATHS = [
  ['line', 'shape'],
  ['line', 'smoothing']
];
const TRACE_COLOR_SCALE_PATHS = [
  ['colorscale'],
  ['autocolorscale'],
  ['cmin'],
  ['cmax'],
  ['cmid'],
  ['reversescale'],
  ['showscale'],
  ['colorbar'],
  ['zmin'],
  ['zmax']
];

const LAYOUT_DIMENSION_PATHS = [
  ['width'],
  ['height'],
  ['autosize'],
  ['margin']
];
const LAYOUT_FONT_PATHS = [
  ['font'],
  ['title', 'font'],
  ['legend', 'font'],
  ['hoverlabel', 'font']
];
const LAYOUT_LEGEND_PATHS = [
  ['showlegend'],
  ['legend']
];
const LAYOUT_BACKGROUND_PATHS = [
  ['paper_bgcolor'],
  ['plot_bgcolor']
];
const LAYOUT_ANNOTATION_PATHS = [
  ['annotations'],
  ['shapes'],
  ['images']
];
const LAYOUT_HOVER_PATHS = [
  ['hovermode'],
  ['hoverlabel'],
  ['hoverdistance'],
  ['spikedistance']
];
const LAYOUT_TRACE_COLOR_PATHS = [
  ['colorway']
];
const LAYOUT_COLOR_SCALE_PATHS = [
  ['coloraxis']
];

const AXIS_SCALE_PATHS = [
  ['type'],
  ['range'],
  ['autorange'],
  ['rangemode']
];
const AXIS_FORMAT_PATHS = [
  ['showline'],
  ['linecolor'],
  ['linewidth'],
  ['mirror'],
  ['ticks'],
  ['ticklen'],
  ['tickwidth'],
  ['tickcolor'],
  ['tickfont'],
  ['tickformat'],
  ['tickangle'],
  ['tickprefix'],
  ['ticksuffix'],
  ['ticklabelposition'],
  ['showticklabels'],
  ['zeroline'],
  ['zerolinecolor'],
  ['zerolinewidth'],
  ['title', 'standoff'],
  ['title', 'textangle']
];
const AXIS_FONT_PATHS = [
  ['title', 'font'],
  ['tickfont']
];
const AXIS_GRID_PATHS = [
  ['showgrid'],
  ['gridcolor'],
  ['gridwidth'],
  ['minor', 'showgrid'],
  ['minor', 'gridcolor'],
  ['minor', 'gridwidth']
];
const AXIS_HOVER_PATHS = [
  ['showspikes'],
  ['spikemode'],
  ['spikesnap'],
  ['spikecolor'],
  ['spikethickness']
];

const buildTraceClone = (trace) => {
  if (!trace || typeof trace !== 'object') return trace;
  const next = { ...trace };
  if (trace.line && typeof trace.line === 'object') {
    next.line = { ...trace.line };
  }
  if (trace.marker && typeof trace.marker === 'object') {
    next.marker = { ...trace.marker };
    if (trace.marker.line && typeof trace.marker.line === 'object') {
      next.marker.line = { ...trace.marker.line };
    }
  }
  if (trace.colorbar && typeof trace.colorbar === 'object') {
    next.colorbar = { ...trace.colorbar };
  }
  return next;
};

const sanitizeSelection = (raw = {}) => {
  const preset = PRESET_KEYS.has(raw?.preset) ? raw.preset : null;
  const details = Array.isArray(raw?.details)
    ? raw.details.filter((detail) => DETAIL_KEYS.has(detail))
    : [];
  return { preset, details };
};

const loadStoredSelection = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { preset: null, details: [] };
  }
  try {
    const raw = window.localStorage.getItem(STYLE_PAINTER_STORAGE_KEY);
    if (!raw) return { preset: null, details: [] };
    return sanitizeSelection(JSON.parse(raw));
  } catch {
    return { preset: null, details: [] };
  }
};

const saveStoredSelection = (selection) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STYLE_PAINTER_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    /* ignore storage failures */
  }
};

export function createStylePainterController({
  canvas = null,
  getPanelDom = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  updatePanelFigure = () => {},
  renderPlot = () => {},
  pushHistory = () => {},
  updateHistoryButtons = () => {},
  persist = () => {},
  panelSupportsPlot = () => true,
  showToast = () => {},
  onTraceStyleChange = () => {}
} = {}) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return null;

  const state = {
    active: false,
    sourcePanelId: null,
    activeButton: null,
    selection: loadStoredSelection()
  };

  const getEffectiveDetails = () => {
    if (state.selection.preset && PRESET_DETAILS[state.selection.preset]) {
      return PRESET_DETAILS[state.selection.preset];
    }
    return Array.isArray(state.selection.details) ? state.selection.details : [];
  };

  const setButtonActive = (btn, active) => {
    if (!btn) return;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  };

  const setCursorActive = (active) => {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('workspace-style-painter-active', active);
  };

  const deactivate = () => {
    state.active = false;
    state.sourcePanelId = null;
    if (state.activeButton) {
      setButtonActive(state.activeButton, false);
    }
    state.activeButton = null;
    setCursorActive(false);
  };

  const activate = (panelId, button) => {
    if (!panelId || !button) return;
    if (state.active && state.sourcePanelId === panelId && state.activeButton === button) {
      deactivate();
      return;
    }
    if (state.activeButton && state.activeButton !== button) {
      setButtonActive(state.activeButton, false);
    }
    state.active = true;
    state.sourcePanelId = panelId;
    state.activeButton = button;
    setButtonActive(button, true);
    setCursorActive(true);
  };

  const applyAxisCopy = (sourceLayout, layoutPatch, paths) => {
    axisKeysForLayout(sourceLayout).forEach((axisKey) => {
      const axis = sourceLayout?.[axisKey];
      if (!axis || typeof axis !== 'object') return;
      if (!layoutPatch[axisKey]) layoutPatch[axisKey] = {};
      copyPaths(layoutPatch[axisKey], axis, paths);
    });
  };

  const applyTraceCopy = (sourceTraces, targetTraces, paths) => {
    const count = Math.min(sourceTraces.length, targetTraces.length);
    for (let i = 0; i < count; i += 1) {
      const sourceTrace = sourceTraces[i];
      const targetTrace = targetTraces[i];
      if (!sourceTrace || !targetTrace) continue;
      copyPaths(targetTrace, sourceTrace, paths);
    }
  };

  const applyStyles = (sourcePanelId, targetPanelId) => {
    if (!sourcePanelId || !targetPanelId || sourcePanelId === targetPanelId) return false;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(targetPanelId)) {
      showToast('Style painter only applies to plot panels.', 'info');
      return false;
    }

    const details = getEffectiveDetails();
    if (!details.length) {
      showToast('Choose formatting to copy first.', 'info');
      return false;
    }

    const sourceFigure = getPanelFigure(sourcePanelId);
    const targetFigure = getPanelFigure(targetPanelId);
    const sourceLayout = sourceFigure?.layout || {};
    const targetLayout = targetFigure?.layout || {};
    const sourceTraces = Array.isArray(sourceFigure?.data) ? sourceFigure.data : [];
    const targetTraces = Array.isArray(targetFigure?.data)
      ? targetFigure.data.map((trace) => buildTraceClone(trace))
      : [];

    const layoutPatch = {};
    details.forEach((detail) => {
      switch (detail) {
        case 'trace-colors':
          applyTraceCopy(sourceTraces, targetTraces, TRACE_COLOR_PATHS);
          copyPaths(layoutPatch, sourceLayout, LAYOUT_TRACE_COLOR_PATHS);
          break;
        case 'trace-styles':
          applyTraceCopy(sourceTraces, targetTraces, TRACE_STYLE_PATHS);
          break;
        case 'trace-markers':
          applyTraceCopy(sourceTraces, targetTraces, TRACE_MARKER_PATHS);
          break;
        case 'line-smoothing':
          applyTraceCopy(sourceTraces, targetTraces, TRACE_SMOOTHING_PATHS);
          break;
        case 'color-scales':
          applyTraceCopy(sourceTraces, targetTraces, TRACE_COLOR_SCALE_PATHS);
          copyPaths(layoutPatch, sourceLayout, LAYOUT_COLOR_SCALE_PATHS);
          break;
        case 'graph-dimensions':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_DIMENSION_PATHS);
          break;
        case 'scales':
          applyAxisCopy(sourceLayout, layoutPatch, AXIS_SCALE_PATHS);
          break;
        case 'fonts':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_FONT_PATHS);
          applyAxisCopy(sourceLayout, layoutPatch, AXIS_FONT_PATHS);
          break;
        case 'axis-formatting':
          applyAxisCopy(sourceLayout, layoutPatch, AXIS_FORMAT_PATHS);
          break;
        case 'gridlines':
          applyAxisCopy(sourceLayout, layoutPatch, AXIS_GRID_PATHS);
          break;
        case 'legend':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_LEGEND_PATHS);
          break;
        case 'background':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_BACKGROUND_PATHS);
          break;
        case 'annotations':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_ANNOTATION_PATHS);
          break;
        case 'hover-labels':
          copyPaths(layoutPatch, sourceLayout, LAYOUT_HOVER_PATHS);
          applyAxisCopy(sourceLayout, layoutPatch, AXIS_HOVER_PATHS);
          break;
        default:
          break;
      }
    });

    const nextFigure = {
      ...targetFigure,
      data: targetTraces,
      layout: mergeDeep({ ...targetLayout }, layoutPatch)
    };

    pushHistory({
      label: 'Paste styles',
      meta: {
        action: 'style-painter',
        detail: details.join(', ')
      }
    });
    updatePanelFigure(targetPanelId, nextFigure);
    renderPlot(targetPanelId);
    onTraceStyleChange?.(targetPanelId);
    persist();
    updateHistoryButtons();
    return true;
  };

  const handleSelectionChange = (panelId, selection) => {
    if (!panelId) return;
    const next = sanitizeSelection(selection || {});
    state.selection = next;
    saveStoredSelection(next);
  };

  const handlePopoverOpen = (panelId, popover) => {
    if (!panelId || !popover) return;
    if (typeof popover.__applySelection === 'function') {
      popover.__applySelection(state.selection);
    } else {
      const preset = state.selection.preset;
      const details = new Set(state.selection.details || []);
      popover.querySelectorAll('[data-style-preset]').forEach((btn) => {
        const active = preset && btn.dataset.stylePreset === preset;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
      popover.querySelectorAll('[data-style-detail]').forEach((btn) => {
        const active = !preset && details.has(btn.dataset.styleDetail);
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }
  };

  const handleCanvasClick = (event) => {
    if (!event || event.defaultPrevented) return;
    const stylePainterBtn = event.target.closest?.('[data-panel-action="style-painter"]');
    if (stylePainterBtn) {
      const panelRoot = stylePainterBtn.closest('.workspace-panel');
      const panelId = panelRoot?.dataset?.panelId;
      activate(panelId, stylePainterBtn);
      return;
    }
    if (!state.active) return;
    if (event.target.closest?.('.workspace-panel-popover')) return;
    const panelRoot = event.target.closest?.('.workspace-panel');
    if (!panelRoot) {
      deactivate();
      return;
    }
    const targetPanelId = panelRoot.dataset?.panelId;
    if (!targetPanelId || targetPanelId === state.sourcePanelId) return;
    const applied = applyStyles(state.sourcePanelId, targetPanelId);
    if (applied) {
      showToast('Styles pasted to graph.', 'success');
      deactivate();
    }
  };

  canvas.addEventListener('click', handleCanvasClick);

  return {
    handleButtonClick: (panelId, buttonEl) => {
      activate(panelId, buttonEl);
    },
    handleSelectionChange,
    handlePopoverOpen,
    deactivate,
    teardown() {
      canvas.removeEventListener('click', handleCanvasClick);
      deactivate();
    }
  };
}
