const MULTI_TRACE_META_KEY = 'multiTrace';
const BASE_Y_KEY = 'workspaceMultiTraceBaseY';
const LEGEND_META_KEY = 'multiTraceLegend';

const DEFAULT_CONFIG = {
  display: 'overlapped',
  offsetMode: 'percent',
  offsetValue: 0,
  individualLegend: false
};

const cloneArray = (values) => (Array.isArray(values) ? values.slice() : []);

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const normalizeDisplay = (value) => (value === 'stacked' ? 'stacked' : 'overlapped');
const normalizeOffsetMode = (value) => (value === 'units' ? 'units' : 'percent');
const normalizeOffsetValue = (value) => Math.max(0, toNumber(value, 0));
const normalizeLegend = (value, display) => (display === 'stacked' ? !!value : false);

const normalizeConfig = (config = {}) => {
  const display = normalizeDisplay(config.display);
  const offsetMode = normalizeOffsetMode(config.offsetMode);
  const offsetValue = normalizeOffsetValue(config.offsetValue);
  const individualLegend = normalizeLegend(config.individualLegend, display);
  const next = {
    display,
    offsetMode,
    offsetValue,
    individualLegend
  };
  if (typeof config.legendShowlegend === 'boolean') {
    next.legendShowlegend = config.legendShowlegend;
  }
  return next;
};

const readConfig = (layout = {}) => {
  const meta = layout.meta && typeof layout.meta === 'object' ? layout.meta : {};
  const raw = meta[MULTI_TRACE_META_KEY] && typeof meta[MULTI_TRACE_META_KEY] === 'object'
    ? meta[MULTI_TRACE_META_KEY]
    : {};
  return normalizeConfig({ ...DEFAULT_CONFIG, ...raw });
};

const updateLayoutMeta = (layout = {}, config = {}) => {
  const nextLayout = { ...layout };
  const meta = nextLayout.meta && typeof nextLayout.meta === 'object' ? { ...nextLayout.meta } : {};
  const nextConfig = normalizeConfig(config);
  const existing = meta[MULTI_TRACE_META_KEY] && typeof meta[MULTI_TRACE_META_KEY] === 'object'
    ? { ...meta[MULTI_TRACE_META_KEY] }
    : {};
  const merged = { ...existing, ...nextConfig };
  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined) delete merged[key];
  });
  meta[MULTI_TRACE_META_KEY] = merged;
  nextLayout.meta = meta;
  return nextLayout;
};

const findRange = (values) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let found = false;
  values.forEach((value) => {
    const num = toNumber(value, null);
    if (num == null) return;
    found = true;
    if (num < min) min = num;
    if (num > max) max = num;
  });
  if (!found || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max, range: max - min };
};

const resolveTraceBase = (trace, expectedOffset = 0, shouldValidate = true) => {
  const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
  const base = Array.isArray(meta[BASE_Y_KEY]) ? meta[BASE_Y_KEY] : null;
  const current = Array.isArray(trace?.y) ? trace.y : [];
  if (!base || !base.length) {
    return { base: cloneArray(current), needsStore: true };
  }
  if (!shouldValidate) {
    return { base, needsStore: false };
  }
  const offset = toNumber(expectedOffset, 0);
  if (!Number.isFinite(offset) || offset === 0) {
    const match = base.length === current.length
      && base.every((value, idx) => {
        const currentValue = toNumber(current[idx], null);
        const baseValue = toNumber(value, null);
        if (currentValue == null && baseValue == null) return true;
        if (currentValue == null || baseValue == null) return false;
        return Math.abs(currentValue - baseValue) <= 1e-9;
      });
    if (!match) {
      return { base: cloneArray(current), needsStore: true };
    }
    return { base, needsStore: false };
  }
  const sampleCount = Math.min(base.length, 4);
  const step = sampleCount > 1 ? Math.floor((base.length - 1) / (sampleCount - 1)) : 1;
  let matched = true;
  for (let idx = 0; idx < base.length; idx += step) {
    const currentValue = toNumber(current[idx], null);
    const baseValue = toNumber(base[idx], null);
    if (currentValue == null && baseValue == null) continue;
    if (currentValue == null || baseValue == null) {
      matched = false;
      break;
    }
    if (Math.abs(currentValue - (baseValue + offset)) > 1e-6) {
      matched = false;
      break;
    }
  }
  if (!matched) {
    return { base: cloneArray(current), needsStore: true };
  }
  return { base, needsStore: false };
};

const computeOffsetStep = ({ offsetMode, offsetValue }, bases = []) => {
  if (!offsetValue) return 0;
  if (offsetMode === 'units') return offsetValue;
  const flattened = bases.flatMap((values) => values);
  const range = findRange(flattened);
  if (!range || !Number.isFinite(range.range) || range.range <= 0) return 0;
  return range.range * (offsetValue / 100);
};

const applyOffsets = (values, offset = 0) => values.map((value) => {
  const num = toNumber(value, null);
  if (num == null) return null;
  return num + offset;
});

const stripLegendAnnotations = (annotations = []) => (
  annotations.filter((item) => item?.meta?.[LEGEND_META_KEY] !== true)
);

const applyYAxisAutoscale = (layout = {}) => {
  const nextLayout = { ...layout };
  let updated = false;
  Object.keys(nextLayout).forEach((axisKey) => {
    if (!/^yaxis\d*$/.test(axisKey)) return;
    const axis = nextLayout[axisKey];
    const axisObj = axis && typeof axis === 'object' ? { ...axis } : {};
    axisObj.autorange = true;
    if (Object.prototype.hasOwnProperty.call(axisObj, 'range')) {
      delete axisObj.range;
    }
    nextLayout[axisKey] = axisObj;
    updated = true;
  });
  if (!updated) {
    nextLayout.yaxis = { ...(nextLayout.yaxis || {}), autorange: true };
    if (Object.prototype.hasOwnProperty.call(nextLayout.yaxis, 'range')) {
      delete nextLayout.yaxis.range;
    }
  }
  return nextLayout;
};

const buildLegendAnnotations = (traces = []) => {
  const annotations = [];
  traces.forEach((trace, idx) => {
    if (!trace) return;
    const xValues = Array.isArray(trace.x) ? trace.x : [];
    const yValues = Array.isArray(trace.y) ? trace.y : [];
    if (!xValues.length || !yValues.length) return;
    let anchorIndex = -1;
    for (let i = yValues.length - 1; i >= 0; i -= 1) {
      const yVal = toNumber(yValues[i], null);
      const xVal = toNumber(xValues[i], null);
      if (yVal != null && xVal != null) {
        anchorIndex = i;
        break;
      }
    }
    if (anchorIndex < 0) return;
    const label = trace.name || `Trace ${idx + 1}`;
    annotations.push({
      x: xValues[anchorIndex],
      y: yValues[anchorIndex],
      text: label,
      showarrow: false,
      xanchor: 'left',
      yanchor: 'middle',
      xshift: 8,
      font: { size: 11 },
      meta: { [LEGEND_META_KEY]: true }
    });
  });
  return annotations;
};

const applyLegendMode = (layout, traces, config) => {
  const nextLayout = { ...layout };
  const meta = nextLayout.meta && typeof nextLayout.meta === 'object' ? { ...nextLayout.meta } : {};
  const multiMeta = meta[MULTI_TRACE_META_KEY] && typeof meta[MULTI_TRACE_META_KEY] === 'object'
    ? { ...meta[MULTI_TRACE_META_KEY] }
    : {};
  const annotations = Array.isArray(nextLayout.annotations) ? nextLayout.annotations.slice() : [];
  const cleaned = stripLegendAnnotations(annotations);
  const wantsIndividual = config.display === 'stacked' && config.individualLegend;

  if (wantsIndividual) {
    if (typeof multiMeta.legendShowlegend !== 'boolean') {
      multiMeta.legendShowlegend = Object.prototype.hasOwnProperty.call(nextLayout, 'showlegend')
        ? !!nextLayout.showlegend
        : true;
    }
    nextLayout.showlegend = false;
    nextLayout.annotations = [...cleaned, ...buildLegendAnnotations(traces)];
  } else {
    if (typeof multiMeta.legendShowlegend === 'boolean') {
      nextLayout.showlegend = multiMeta.legendShowlegend;
      delete multiMeta.legendShowlegend;
    }
    if (cleaned.length) {
      nextLayout.annotations = cleaned;
    } else if (Object.prototype.hasOwnProperty.call(nextLayout, 'annotations')) {
      delete nextLayout.annotations;
    }
  }

  meta[MULTI_TRACE_META_KEY] = multiMeta;
  nextLayout.meta = meta;
  return nextLayout;
};

const buildStackedTraces = (traces, config) => {
  const bases = traces.map((trace, idx) => {
    const resolved = resolveTraceBase(trace, 0, false);
    return resolved.base;
  });
  let offsetStep = computeOffsetStep(config, bases);
  const withOffsets = traces.map((trace, idx) => {
    const expected = offsetStep * idx;
    const resolved = resolveTraceBase(trace, expected, true);
    return {
      trace,
      base: resolved.base,
      needsStore: resolved.needsStore
    };
  });
  if (config.offsetMode === 'percent') {
    const updatedBases = withOffsets.map((entry) => entry.base);
    offsetStep = computeOffsetStep(config, updatedBases);
  }
  return { bases: withOffsets, offsetStep };
};

const applyMultiTraceDisplay = (state, config) => {
  const { display } = config;
  if (display !== 'stacked') {
    const nextTraces = state.traces.map((trace) => {
      if (!trace) return trace;
      const meta = trace.meta && typeof trace.meta === 'object' ? { ...trace.meta } : {};
      const base = Array.isArray(meta[BASE_Y_KEY]) ? meta[BASE_Y_KEY] : null;
      if (!base) {
        return trace;
      }
      delete meta[BASE_Y_KEY];
      return {
        ...trace,
        y: cloneArray(base),
        meta: Object.keys(meta).length ? meta : undefined
      };
    });
    let nextLayout = updateLayoutMeta(state.layout, config);
    nextLayout = applyLegendMode(nextLayout, nextTraces, config);
    return { data: nextTraces, layout: nextLayout };
  }

  const { bases, offsetStep } = buildStackedTraces(state.traces, config);
  const nextTraces = bases.map((entry, idx) => {
    const trace = entry.trace || {};
    const meta = trace.meta && typeof trace.meta === 'object' ? { ...trace.meta } : {};
    if (entry.needsStore) {
      meta[BASE_Y_KEY] = cloneArray(entry.base);
    } else if (!meta[BASE_Y_KEY]) {
      meta[BASE_Y_KEY] = cloneArray(entry.base);
    }
    const offset = offsetStep * idx;
    return {
      ...trace,
      y: applyOffsets(entry.base, offset),
      meta
    };
  });
  let nextLayout = updateLayoutMeta(state.layout, config);
  nextLayout = applyLegendMode(nextLayout, nextTraces, config);
  return { data: nextTraces, layout: nextLayout };
};

const resolveOffsetLimits = ({ offsetMode, offsetValue }, traces) => {
  if (offsetMode === 'percent') {
    return {
      min: 0,
      max: Math.max(100, Math.ceil(offsetValue || 0)),
      step: 1,
      unit: '%'
    };
  }
  const values = traces.flatMap((trace) => {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    return Array.isArray(meta[BASE_Y_KEY]) ? meta[BASE_Y_KEY] : (trace?.y || []);
  });
  const range = findRange(values);
  let max = range ? Math.max(1, range.range * 0.5) : 10;
  max = Math.max(max, offsetValue || 0, 1);
  const step = max >= 10 ? 1 : max >= 1 ? 0.1 : 0.01;
  return {
    min: 0,
    max: Number(max.toFixed(2)),
    step,
    unit: 'units'
  };
};

export function createMultiTraceController({
  dom = {},
  getActivePanelId = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  updatePanelFigure = () => {},
  renderPlot = () => {},
  pushHistory = () => {},
  updateHistoryButtons = () => {},
  persist = () => {},
  panelSupportsPlot = () => true,
  isPanelEditLocked = () => false,
  showToast = () => {}
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const toggleButton = dom.toggleButton
    || dom.button
    || documentRoot?.getElementById?.('tb2_multi_trace')
    || null;
  const menu = dom.menu
    || documentRoot?.querySelector?.('[data-multitrace-menu]')
    || null;
  const displayButtons = menu
    ? Array.from(menu.querySelectorAll('[data-multitrace-display]'))
    : [];
  const modeButtons = menu
    ? Array.from(menu.querySelectorAll('[data-multitrace-offset-mode]'))
    : [];
  const offsetInput = menu?.querySelector?.('[data-multitrace-offset-input]') || null;
  const offsetRange = menu?.querySelector?.('[data-multitrace-offset-range]') || null;
  const offsetUnit = menu?.querySelector?.('[data-multitrace-offset-unit]') || null;
  const legendToggle = menu?.querySelector?.('[data-multitrace-legend-toggle]') || null;

  const listeners = [];
  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const resolvePanelId = (panelId) => panelId || getActivePanelId?.();

  const getPanelState = (panelId) => {
    const resolved = resolvePanelId(panelId);
    if (!resolved) return null;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(resolved)) {
      return null;
    }
    const figure = getPanelFigure(resolved);
    if (!figure) return null;
    const traces = Array.isArray(figure.data) ? figure.data : [];
    const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : {};
    const config = readConfig(layout);
    return {
      panelId: resolved,
      figure,
      traces,
      layout,
      config
    };
  };

  const syncUi = (panelId) => {
    const state = getPanelState(panelId);
    const hasPanel = !!state;
    const config = state?.config || DEFAULT_CONFIG;
    displayButtons.forEach((button) => {
      if (!button) return;
      const mode = button.getAttribute('data-multitrace-display');
      const active = hasPanel && mode === config.display;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !hasPanel;
    });
    modeButtons.forEach((button) => {
      if (!button) return;
      const mode = button.getAttribute('data-multitrace-offset-mode');
      const active = hasPanel && mode === config.offsetMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = !hasPanel;
    });
    if (offsetInput) {
      offsetInput.disabled = !hasPanel;
      offsetInput.value = String(config.offsetValue ?? 0);
    }
    if (offsetRange) {
      offsetRange.disabled = !hasPanel;
      offsetRange.value = String(config.offsetValue ?? 0);
    }
    if (offsetUnit) {
      offsetUnit.textContent = config.offsetMode === 'percent' ? '%' : 'units';
    }
    const offsetLimits = state ? resolveOffsetLimits(config, state.traces) : null;
    if (offsetRange && offsetLimits) {
      offsetRange.min = String(offsetLimits.min);
      offsetRange.max = String(offsetLimits.max);
      offsetRange.step = String(offsetLimits.step);
    }
    if (offsetInput && offsetLimits) {
      offsetInput.step = String(offsetLimits.step);
    }
    if (legendToggle) {
      const enabled = hasPanel && config.display === 'stacked';
      legendToggle.disabled = !enabled;
      legendToggle.checked = enabled && config.individualLegend;
    }
  };

  const pushHistoryIfNeeded = (label) => {
    if (!label) return;
    pushHistory({ label });
    updateHistoryButtons();
  };

  const applyFigureUpdate = (panelId, nextFigure, { label } = {}) => {
    updatePanelFigure(panelId, nextFigure, { source: 'multi-trace' });
    if (label) {
      pushHistoryIfNeeded(label);
    }
    renderPlot(panelId);
    persist();
    updateHistoryButtons();
  };

  const applyConfig = (panelId, patch, { label, autoscale = false } = {}) => {
    const state = getPanelState(panelId);
    if (!state) {
      showToast('Select a graph to adjust multi-trace options.', 'info');
      return false;
    }
    if (typeof isPanelEditLocked === 'function' && isPanelEditLocked(state.panelId)) {
      showToast('Unlock the graph to adjust multi-trace options.', 'warning');
      return false;
    }
    const nextConfig = normalizeConfig({ ...state.config, ...patch });
    if (nextConfig.display !== 'stacked') {
      nextConfig.individualLegend = false;
    }
    const { data, layout } = applyMultiTraceDisplay(state, nextConfig);
    const nextFigure = {
      ...state.figure,
      data,
      layout: autoscale ? applyYAxisAutoscale(layout) : layout
    };
    applyFigureUpdate(state.panelId, nextFigure, { label });
    syncUi(state.panelId);
    return true;
  };

  const handleToggle = (panelId) => {
    const state = getPanelState(panelId);
    if (!state) {
      showToast('Select a graph to adjust multi-trace options.', 'info');
      return false;
    }
    const nextDisplay = state.config.display === 'stacked' ? 'overlapped' : 'stacked';
    return applyConfig(state.panelId, { display: nextDisplay }, {
      label: nextDisplay === 'stacked' ? 'Stack traces' : 'Overlap traces',
      autoscale: true
    });
  };

  displayButtons.forEach((button) => {
    addListener(button, 'click', (event) => {
      event.preventDefault();
      const mode = button.getAttribute('data-multitrace-display');
      applyConfig(null, { display: mode }, { label: `Display ${mode}`, autoscale: true });
    });
  });

  modeButtons.forEach((button) => {
    addListener(button, 'click', (event) => {
      event.preventDefault();
      const mode = button.getAttribute('data-multitrace-offset-mode');
      applyConfig(null, { offsetMode: mode }, { label: 'Update offset mode' });
    });
  });

  addListener(offsetInput, 'input', () => {
    applyConfig(null, { offsetValue: toNumber(offsetInput.value, 0) }, { autoscale: true });
    if (offsetRange) {
      offsetRange.value = offsetInput.value;
    }
  });
  addListener(offsetRange, 'input', () => {
    applyConfig(null, { offsetValue: toNumber(offsetRange.value, 0) }, { autoscale: true });
    if (offsetInput) {
      offsetInput.value = offsetRange.value;
    }
  });

  addListener(legendToggle, 'change', () => {
    applyConfig(null, { individualLegend: !!legendToggle.checked }, {
      label: legendToggle.checked ? 'Enable individual legend' : 'Disable individual legend'
    });
  });

  addListener(toggleButton, 'show.bs.dropdown', () => syncUi());

  syncUi();

  return {
    handleToggle,
    handleActivePanelChange: (panelId) => syncUi(panelId),
    handlePanelFigureUpdate: (panelId, options = {}) => {
      if (options?.source === 'multi-trace') return;
      const state = getPanelState(panelId);
      if (!state) return;
      if (state.config.display !== 'stacked') {
        syncUi(panelId);
        return;
      }
      const { data, layout } = applyMultiTraceDisplay(state, state.config);
      const nextFigure = { ...state.figure, data, layout };
      updatePanelFigure(state.panelId, nextFigure, { source: 'multi-trace' });
      renderPlot(state.panelId);
      persist();
      syncUi(state.panelId);
    },
    teardown: () => {
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
    }
  };
}
