import { getDisplayConfig } from '../../../../config/display.js';

const DISPLAY_UNITS_KEY = 'workspaceDisplayUnits';
const RAW_Y_KEY = 'workspaceRawY';
const RAW_UNITS_KEY = 'workspaceRawUnits';
const RAW_SCALE_KEY = 'workspaceRawScale';
const TRANS_SCALE_KEY = 'workspaceTransmittanceScale';
const AUTO_LABEL_KEY = 'workspaceUnitsAutoAxisLabel';
const AUTO_LABEL_VALUE_KEY = 'workspaceUnitsAxisLabel';

const cloneArray = (values) => (Array.isArray(values) ? values.slice() : []);

const normalizeUnitsLabel = (label) => {
  if (!label) return null;
  const text = String(label).trim().toLowerCase();
  if (!text) return null;
  if (text.includes('abs')) return 'absorbance';
  if (text.includes('trans') || text.includes('%t') || text.includes('t%')) return 'transmittance';
  return null;
};

const formatUnitsLabel = (unitsKey) => (
  unitsKey === 'absorbance' ? 'Absorbance' : 'Transmittance'
);

const readAxisTitleText = (axis) => {
  if (!axis || typeof axis !== 'object') return '';
  const title = axis.title;
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object' && typeof title.text === 'string') return title.text;
  return '';
};

const resolveUnitsFromTrace = (trace = {}, fallbackLabel = '') => {
  const meta = trace.meta && typeof trace.meta === 'object' ? trace.meta : {};
  const label = meta.DISPLAY_UNITS || meta.Y_UNITS || fallbackLabel;
  return normalizeUnitsLabel(label);
};

const resolveUnitsSource = (layout = {}, traces = []) => {
  for (const trace of traces) {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    if (normalizeUnitsLabel(meta[RAW_UNITS_KEY])) return 'metadata';
    if (normalizeUnitsLabel(meta.DISPLAY_UNITS || meta.Y_UNITS)) return 'metadata';
  }
  return 'guess';
};

const resolveRawUnits = (traces = [], layoutLabel = '') => {
  for (const trace of traces) {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    const rawUnits = normalizeUnitsLabel(meta[RAW_UNITS_KEY]);
    if (rawUnits) return rawUnits;
    const fallback = resolveUnitsFromTrace(trace, layoutLabel);
    if (fallback) return fallback;
  }
  return null;
};

const resolveRawScale = (traces = [], layoutLabel = '', rawUnits = null) => {
  if (rawUnits !== 'transmittance') return null;
  for (const trace of traces) {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    const rawScale = meta[RAW_SCALE_KEY];
    if (rawScale === 'percent' || rawScale === 'fraction') return rawScale;
  }
  for (const trace of traces) {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    const rawY = meta[RAW_Y_KEY];
    if (Array.isArray(rawY) && rawY.length) {
      return detectTransmittanceScale(rawY, layoutLabel);
    }
  }
  return null;
};

const formatUnitsToken = ({ displayUnits, scale } = {}) => {
  if (displayUnits === 'absorbance') return 'A';
  if (displayUnits === 'transmittance' && scale === 'percent') return 'T%';
  return 'T';
};

const detectTransmittanceScale = (values = [], label = '') => {
  const labelText = String(label || '');
  if (labelText.includes('%')) return 'percent';
  let hasLarge = false;
  values.forEach((value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    if (num > 1.5) hasLarge = true;
  });
  return hasLarge ? 'percent' : 'fraction';
};

const toNumberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const mapNumbers = (values = [], mapper) => values.map((value) => {
  const num = toNumberOrNull(value);
  if (num == null) return null;
  return mapper(num);
});

const resolveCurrentDisplayUnits = (layout = {}, traces = []) => {
  const meta = layout.meta && typeof layout.meta === 'object' ? layout.meta : {};
  const explicit = normalizeUnitsLabel(meta[DISPLAY_UNITS_KEY]);
  if (explicit) return explicit;
  const layoutLabel = readAxisTitleText(layout.yaxis);
  const fromAxis = normalizeUnitsLabel(layoutLabel);
  if (fromAxis) return fromAxis;
  for (const trace of traces) {
    const fromTrace = resolveUnitsFromTrace(trace, layoutLabel);
    if (fromTrace) return fromTrace;
  }
  return 'transmittance';
};

const resolveTransmittanceScale = ({ layout = {}, traces = [], layoutLabel = '' } = {}) => {
  const meta = layout.meta && typeof layout.meta === 'object' ? layout.meta : {};
  const explicit = meta[TRANS_SCALE_KEY];
  if (explicit === 'percent' || explicit === 'fraction') return explicit;
  for (const trace of traces) {
    const metaTrace = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    const rawScale = metaTrace[RAW_SCALE_KEY];
    if (rawScale === 'percent' || rawScale === 'fraction') return rawScale;
  }
  const values = [];
  traces.forEach((trace) => {
    if (!trace) return;
    values.push(...(Array.isArray(trace.y) ? trace.y : []));
  });
  return detectTransmittanceScale(values, layoutLabel);
};

const resolveAutoLabelSetting = (layout = {}) => {
  const meta = layout.meta && typeof layout.meta === 'object' ? layout.meta : {};
  return typeof meta[AUTO_LABEL_KEY] === 'boolean' ? meta[AUTO_LABEL_KEY] : true;
};

const resolveAxisLabel = ({ displayUnits, scale }) => {
  if (displayUnits === 'absorbance') {
    return getDisplayConfig('absorbance').axis || 'Absorbance (A)';
  }
  if (scale === 'percent') {
    return 'Transmittance (%)';
  }
  return getDisplayConfig('fraction').axis || 'Transmittance';
};

const shouldAutoUpdateAxisLabel = ({
  layout = {},
  currentDisplay,
  currentScale
} = {}) => {
  const autoEnabled = resolveAutoLabelSetting(layout);
  if (!autoEnabled) return false;
  const meta = layout.meta && typeof layout.meta === 'object' ? layout.meta : {};
  const lastAuto = typeof meta[AUTO_LABEL_VALUE_KEY] === 'string' ? meta[AUTO_LABEL_VALUE_KEY] : '';
  const currentTitle = readAxisTitleText(layout.yaxis);
  if (!currentTitle) return true;
  const expected = resolveAxisLabel({ displayUnits: currentDisplay, scale: currentScale });
  if (currentTitle === expected) return true;
  if (lastAuto && currentTitle === lastAuto) return true;
  return false;
};

const applyAxisLabel = (layout = {}, label, { updateMeta = true } = {}) => {
  const nextLayout = { ...layout };
  const nextMeta = nextLayout.meta && typeof nextLayout.meta === 'object' ? { ...nextLayout.meta } : {};
  Object.keys(nextLayout).forEach((axisKey) => {
    if (!/^yaxis\\d*$/.test(axisKey)) return;
    const axis = nextLayout[axisKey];
    const axisObj = axis && typeof axis === 'object' ? axis : {};
    const title = axisObj.title && typeof axisObj.title === 'object'
      ? { ...axisObj.title, text: label }
      : { text: label };
    nextLayout[axisKey] = { ...axisObj, title };
  });
  if (updateMeta) {
    nextMeta[AUTO_LABEL_VALUE_KEY] = label;
  }
  if (Object.keys(nextMeta).length) {
    nextLayout.meta = nextMeta;
  }
  return nextLayout;
};

const applyYAxisAutoscale = (layout = {}) => {
  const nextLayout = { ...layout };
  Object.keys(nextLayout).forEach((axisKey) => {
    if (!/^yaxis\\d*$/.test(axisKey)) return;
    const axis = nextLayout[axisKey];
    const axisObj = axis && typeof axis === 'object' ? { ...axis } : {};
    axisObj.autorange = true;
    if (Object.prototype.hasOwnProperty.call(axisObj, 'range')) {
      delete axisObj.range;
    }
    nextLayout[axisKey] = axisObj;
  });
  return nextLayout;
};

const ensureTraceRawMeta = (trace = {}, layoutLabel = '') => {
  const nextMeta = trace.meta && typeof trace.meta === 'object' ? { ...trace.meta } : {};
  let changed = false;
  let rawY = nextMeta[RAW_Y_KEY];
  if (!Array.isArray(rawY)) {
    rawY = cloneArray(trace.y);
    nextMeta[RAW_Y_KEY] = rawY;
    changed = true;
  }
  let rawUnits = normalizeUnitsLabel(nextMeta[RAW_UNITS_KEY]);
  if (!rawUnits) {
    rawUnits = resolveUnitsFromTrace({ meta: nextMeta }, layoutLabel);
    if (rawUnits) {
      nextMeta[RAW_UNITS_KEY] = rawUnits;
      changed = true;
    }
  }
  let rawScale = nextMeta[RAW_SCALE_KEY];
  if (rawUnits === 'transmittance' && rawScale !== 'percent' && rawScale !== 'fraction') {
    const label = nextMeta.DISPLAY_UNITS || nextMeta.Y_UNITS || layoutLabel;
    rawScale = detectTransmittanceScale(rawY, label);
    nextMeta[RAW_SCALE_KEY] = rawScale;
    changed = true;
  }
  return {
    meta: nextMeta,
    rawY,
    rawUnits,
    rawScale,
    changed
  };
};

const convertToAbsorbance = ({ rawY, rawScale }) => {
  const fraction = mapNumbers(rawY, (num) => (rawScale === 'percent' ? num / 100 : num));
  return getDisplayConfig('absorbance').apply(fraction);
};

const convertToTransmittance = ({ rawY, scale }) => {
  const base = mapNumbers(rawY, (num) => Math.pow(10, -num));
  if (scale === 'percent') {
    return base.map((value) => (value == null ? null : value * 100));
  }
  return base;
};

export function createUnitsToggleController({
  dom = {},
  getActivePanelId = () => null,
  getPanelDom = () => null,
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
    || documentRoot?.getElementById('tb2_peak_integration')
    || null;
  const menu = dom.menu
    || documentRoot?.querySelector?.('[data-units-menu]')
    || null;
  const currentLabelEl = menu?.querySelector?.('[data-units-current]') || null;
  const originalLabelEl = menu?.querySelector?.('[data-units-original]') || null;
  const scaleButtons = menu
    ? Array.from(menu.querySelectorAll('[data-units-scale]'))
    : [];
  const autoLabelToggle = menu?.querySelector?.('[data-units-auto-label]') || null;
  const listeners = [];

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const resolvePanelId = (panelId) => panelId || getActivePanelId?.();

  const markSkipRelayout = (panelId) => {
    if (!panelId) return;
    const panelDom = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    const plotEl = panelDom?.plotEl || null;
    if (!plotEl) return;
    plotEl.__workspaceSkipRelayoutUntil = Date.now() + 500;
  };

  const applyYAxisAutoscaleRelayout = (panelId) => {
    if (!panelId) return;
    const panelDom = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    const plotEl = panelDom?.plotEl || null;
    const Plotly = typeof window !== 'undefined' ? window.Plotly : null;
    if (!plotEl || !Plotly?.relayout) return;
    const layout = getPanelFigure(panelId)?.layout || {};
    const axisKeys = Object.keys(layout).filter((key) => /^yaxis\d*$/.test(key));
    const updates = {};
    if (!axisKeys.length) {
      updates['yaxis.autorange'] = true;
    } else {
      axisKeys.forEach((axisKey) => {
        updates[`${axisKey}.autorange`] = true;
      });
    }
    if (!Object.keys(updates).length) return;
    plotEl.__workspaceSkipRelayoutUntil = Date.now() + 500;
    Plotly.relayout(plotEl, updates);
  };

  const scheduleYAxisAutoscale = (panelId) => {
    if (!panelId) return;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => applyYAxisAutoscaleRelayout(panelId));
    } else {
      setTimeout(() => applyYAxisAutoscaleRelayout(panelId), 0);
    }
  };

  const getPanelState = (panelId) => {
    const resolvedPanelId = resolvePanelId(panelId);
    if (!resolvedPanelId) return null;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(resolvedPanelId)) {
      return null;
    }
    const figure = getPanelFigure(resolvedPanelId);
    if (!figure) return null;
    const traces = Array.isArray(figure.data) ? figure.data : [];
    const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : {};
    const layoutLabel = readAxisTitleText(layout.yaxis);
    const currentDisplay = resolveCurrentDisplayUnits(layout, traces);
    const rawUnits = resolveRawUnits(traces, layoutLabel) || currentDisplay;
    const transmittanceScale = resolveTransmittanceScale({ layout, traces, layoutLabel })
      || 'fraction';
    const unitsSource = resolveUnitsSource(layout, traces);
    const autoLabelEnabled = resolveAutoLabelSetting(layout);
    const toggled = rawUnits !== currentDisplay;
    const rawScale = resolveRawScale(traces, layoutLabel, rawUnits) || 'fraction';
    return {
      panelId: resolvedPanelId,
      figure,
      traces,
      layout,
      layoutLabel,
      currentDisplay,
      rawUnits,
      transmittanceScale,
      rawScale,
      unitsSource,
      autoLabelEnabled,
      toggled
    };
  };

  const syncButtonState = (state) => {
    if (!toggleButton) return;
    const icon = toggleButton.querySelector('[data-units-icon]')
      || toggleButton.querySelector('.workspace-toolbar-icon');
    const isIdle = !state;
    const displayKey = state?.currentDisplay || 'transmittance';
    const letter = isIdle ? 'A/T' : (displayKey === 'absorbance' ? 'A' : 'T');
    if (icon) {
      icon.textContent = letter;
      icon.classList.remove('bi');
      icon.classList.forEach((cls) => {
        if (cls.startsWith('bi-')) icon.classList.remove(cls);
      });
    }
    const isActive = !!state?.toggled;
    toggleButton.classList.toggle('is-active', isActive);
    toggleButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  };

  const syncMenuState = (state) => {
    if (!menu) return;
    const hasPanel = !!state;
    if (originalLabelEl) {
      if (!hasPanel) {
        originalLabelEl.textContent = 'No active graph';
      } else {
        const labelKey = state.rawUnits || state.currentDisplay;
        const suffix = state.unitsSource === 'metadata' ? 'metadata' : 'guess';
        originalLabelEl.textContent = `${formatUnitsToken({
          displayUnits: labelKey,
          scale: state.rawScale
        })} (${suffix})`;
      }
    }
    if (currentLabelEl) {
      if (!hasPanel) {
        currentLabelEl.textContent = 'A/T';
      } else {
        currentLabelEl.textContent = formatUnitsToken({
          displayUnits: state.currentDisplay,
          scale: state.transmittanceScale
        });
      }
    }
    scaleButtons.forEach((button) => {
      if (!button) return;
      const scale = button.getAttribute('data-units-scale');
      const isActive = hasPanel && scale === state.transmittanceScale;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      button.disabled = !hasPanel;
    });
    if (autoLabelToggle) {
      autoLabelToggle.disabled = !hasPanel;
      autoLabelToggle.checked = hasPanel ? !!state.autoLabelEnabled : false;
    }
  };

  const syncUi = (panelId) => {
    const state = getPanelState(panelId);
    syncButtonState(state);
    syncMenuState(state);
  };

  const updateLayoutMeta = (layout = {}, patch = {}) => {
    const nextLayout = { ...layout };
    const nextMeta = nextLayout.meta && typeof nextLayout.meta === 'object' ? { ...nextLayout.meta } : {};
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined) return;
      nextMeta[key] = value;
    });
    nextLayout.meta = nextMeta;
    return nextLayout;
  };

  const pushHistoryIfNeeded = (label) => {
    if (!label) return;
    pushHistory({ label });
    updateHistoryButtons();
  };

  const applyFigureUpdate = (panelId, nextFigure, { label, source, autoscale } = {}) => {
    updatePanelFigure(panelId, nextFigure, { source: source || 'units-toggle' });
    if (label) {
      pushHistoryIfNeeded(label);
    }
    markSkipRelayout(panelId);
    renderPlot(panelId);
    if (autoscale) {
      scheduleYAxisAutoscale(panelId);
    }
    persist();
    updateHistoryButtons();
  };

  const applyDisplayUpdate = (state, nextDisplay, { autoscale = true } = {}) => {
    const layoutMeta = state.layout.meta && typeof state.layout.meta === 'object'
      ? { ...state.layout.meta }
      : {};
    let transmittanceScale = layoutMeta[TRANS_SCALE_KEY];
    if (transmittanceScale !== 'percent' && transmittanceScale !== 'fraction') {
      transmittanceScale = state.transmittanceScale || 'fraction';
    }
    const nextTraces = state.traces.map((trace) => {
      const rawState = ensureTraceRawMeta(trace, state.layoutLabel);
      const rawUnits = rawState.rawUnits || state.currentDisplay;
      let rawScale = rawState.rawScale;
      if (!rawState.rawUnits && rawUnits === 'transmittance') {
        rawScale = detectTransmittanceScale(rawState.rawY, state.layoutLabel);
      }
      if (!transmittanceScale && rawUnits === 'transmittance') {
        transmittanceScale = rawScale || detectTransmittanceScale(rawState.rawY, state.layoutLabel);
      }
      let nextY = cloneArray(rawState.rawY);
      if (nextDisplay === 'absorbance') {
        if (rawUnits === 'absorbance') {
          nextY = mapNumbers(rawState.rawY, (num) => num);
        } else {
          nextY = convertToAbsorbance({ rawY: rawState.rawY, rawScale });
        }
      } else {
        const scale = transmittanceScale || rawScale || 'fraction';
        if (rawUnits === 'transmittance') {
          nextY = mapNumbers(rawState.rawY, (num) => {
            if (scale === 'percent' && rawScale === 'fraction') return num * 100;
            if (scale === 'fraction' && rawScale === 'percent') return num / 100;
            return num;
          });
        } else {
          nextY = convertToTransmittance({ rawY: rawState.rawY, scale });
        }
      }
      const nextMeta = rawState.changed ? rawState.meta : (trace.meta ? { ...trace.meta } : undefined);
      if (nextMeta && rawUnits !== rawState.rawUnits) {
        nextMeta[RAW_UNITS_KEY] = rawUnits;
      }
      if (nextMeta && rawUnits === 'transmittance' && rawScale && rawScale !== rawState.rawScale) {
        nextMeta[RAW_SCALE_KEY] = rawScale;
      }
      return {
        ...trace,
        y: nextY,
        meta: nextMeta
      };
    });

    layoutMeta[DISPLAY_UNITS_KEY] = nextDisplay;
    layoutMeta[TRANS_SCALE_KEY] = transmittanceScale || 'fraction';
    const nextLayoutBase = { ...state.layout, meta: layoutMeta };
    let nextLayout = nextLayoutBase;
    const shouldUpdateLabel = shouldAutoUpdateAxisLabel({
      layout: state.layout,
      currentDisplay: state.currentDisplay,
      currentScale: state.transmittanceScale
    });
    if (shouldUpdateLabel) {
      const axisLabel = resolveAxisLabel({ displayUnits: nextDisplay, scale: layoutMeta[TRANS_SCALE_KEY] });
      nextLayout = applyAxisLabel(nextLayout, axisLabel);
    }
    if (autoscale) {
      nextLayout = applyYAxisAutoscale(nextLayout);
    }
    return {
      data: nextTraces,
      layout: nextLayout,
      transmittanceScale: layoutMeta[TRANS_SCALE_KEY]
    };
  };

  const toggleUnits = (panelId) => {
    const state = getPanelState(panelId);
    if (!state) {
      showToast('Select a graph to toggle units.', 'info');
      return false;
    }
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(state.panelId)) {
      showToast('Units can only be toggled for plot panels.', 'info');
      return false;
    }
    if (typeof isPanelEditLocked === 'function' && isPanelEditLocked(state.panelId)) {
      showToast('Unlock the graph to toggle units.', 'warning');
      return false;
    }
    const nextDisplay = state.currentDisplay === 'absorbance' ? 'transmittance' : 'absorbance';
    const { data, layout } = applyDisplayUpdate(state, nextDisplay, { autoscale: true });
    const nextFigure = {
      ...state.figure,
      data,
      layout
    };
    applyFigureUpdate(state.panelId, nextFigure, {
      label: `Switch to ${nextDisplay === 'absorbance' ? 'Absorbance' : 'Transmittance'}`,
      autoscale: true
    });
    syncUi(state.panelId);
    return true;
  };

  const setTransmittanceScale = (panelId, nextScale) => {
    const state = getPanelState(panelId);
    if (!state) return false;
    if (nextScale !== 'percent' && nextScale !== 'fraction') return false;
    const nextLayout = updateLayoutMeta(state.layout, { [TRANS_SCALE_KEY]: nextScale });
    if (state.currentDisplay !== 'transmittance') {
      const nextFigure = { ...state.figure, layout: nextLayout };
      updatePanelFigure(state.panelId, nextFigure, { source: 'units-toggle' });
      persist();
      syncUi(state.panelId);
      return true;
    }
    const updatedState = { ...state, layout: nextLayout, transmittanceScale: nextScale };
    const { data, layout } = applyDisplayUpdate(updatedState, 'transmittance', { autoscale: true });
    const nextFigure = {
      ...state.figure,
      data,
      layout
    };
    applyFigureUpdate(state.panelId, nextFigure, {
      label: `Set Transmittance to ${nextScale === 'percent' ? 'Percent' : 'Fraction'}`,
      autoscale: true
    });
    syncUi(state.panelId);
    return true;
  };

  const setAutoLabel = (panelId, enabled) => {
    const state = getPanelState(panelId);
    if (!state) return false;
    const nextLayout = updateLayoutMeta(state.layout, { [AUTO_LABEL_KEY]: !!enabled });
    let layout = nextLayout;
    if (enabled) {
      const axisLabel = resolveAxisLabel({
        displayUnits: state.currentDisplay,
        scale: state.transmittanceScale
      });
      if (shouldAutoUpdateAxisLabel({
        layout: state.layout,
        currentDisplay: state.currentDisplay,
        currentScale: state.transmittanceScale
      })) {
        layout = applyAxisLabel(layout, axisLabel);
      }
    }
    const nextFigure = { ...state.figure, layout };
    updatePanelFigure(state.panelId, nextFigure, { source: 'units-toggle' });
    persist();
    syncUi(state.panelId);
    return true;
  };

  addListener(toggleButton, 'click', (event) => {
    if (event?.defaultPrevented) return;
    toggleUnits();
  });
  addListener(toggleButton, 'show.bs.dropdown', () => syncUi());
  scaleButtons.forEach((button) => {
    addListener(button, 'click', (event) => {
      event.preventDefault();
      const scale = button.getAttribute('data-units-scale');
      setTransmittanceScale(null, scale);
    });
  });
  addListener(autoLabelToggle, 'change', () => {
    setAutoLabel(null, !!autoLabelToggle.checked);
  });
  if (documentRoot) {
    addListener(documentRoot, 'workspace:tech-change', () => {
      requestAnimationFrame(() => syncUi());
    });
  }

  syncUi();

  return {
    handleToggle: (panelId) => toggleUnits(panelId),
    handleActivePanelChange: (panelId) => syncUi(panelId),
    handlePanelFigureUpdate: (panelId) => {
      const active = resolvePanelId();
      if (!panelId || panelId === active) {
        syncUi(panelId);
      }
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
