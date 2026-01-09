import { getDisplayConfig } from '../../../../config/display.js';

const DISPLAY_UNITS_KEY = 'workspaceDisplayUnits';
const RAW_Y_KEY = 'workspaceRawY';
const RAW_UNITS_KEY = 'workspaceRawUnits';
const RAW_SCALE_KEY = 'workspaceRawScale';
const TRANS_SCALE_KEY = 'workspaceTransmittanceScale';

const cloneArray = (values) => (Array.isArray(values) ? values.slice() : []);

const normalizeUnitsLabel = (label) => {
  if (!label) return null;
  const text = String(label).trim().toLowerCase();
  if (!text) return null;
  if (text.includes('abs')) return 'absorbance';
  if (text.includes('trans') || text.includes('%t') || text.includes('t%')) return 'transmittance';
  return null;
};

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

const resolveAxisLabel = ({ displayUnits, scale }) => {
  if (displayUnits === 'absorbance') {
    return getDisplayConfig('absorbance').axis || 'Absorbance (A)';
  }
  if (scale === 'percent') {
    return 'Transmittance (%)';
  }
  return getDisplayConfig('fraction').axis || 'Transmittance';
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
  const toggleUnits = (panelId) => {
    const resolvedPanelId = panelId || getActivePanelId?.();
    if (!resolvedPanelId) {
      showToast('Select a graph to toggle units.', 'info');
      return false;
    }
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(resolvedPanelId)) {
      showToast('Units can only be toggled for plot panels.', 'info');
      return false;
    }
    if (typeof isPanelEditLocked === 'function' && isPanelEditLocked(resolvedPanelId)) {
      showToast('Unlock the graph to toggle units.', 'warning');
      return false;
    }
    const figure = getPanelFigure(resolvedPanelId);
    if (!figure) return false;
    const traces = Array.isArray(figure.data) ? figure.data : [];
    const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : {};
    const layoutLabel = readAxisTitleText(layout.yaxis);
    const currentDisplay = resolveCurrentDisplayUnits(layout, traces);
    const nextDisplay = currentDisplay === 'absorbance' ? 'transmittance' : 'absorbance';
    const layoutMeta = layout.meta && typeof layout.meta === 'object' ? { ...layout.meta } : {};
    let transmittanceScale = layoutMeta[TRANS_SCALE_KEY];
    if (transmittanceScale !== 'percent' && transmittanceScale !== 'fraction') {
      transmittanceScale = null;
    }

    const nextTraces = traces.map((trace) => {
      const rawState = ensureTraceRawMeta(trace, layoutLabel);
      const rawUnits = rawState.rawUnits || currentDisplay;
      let rawScale = rawState.rawScale;
      if (!rawState.rawUnits && rawUnits === 'transmittance') {
        rawScale = detectTransmittanceScale(rawState.rawY, layoutLabel);
      }
      if (!transmittanceScale && rawUnits === 'transmittance') {
        transmittanceScale = rawScale || detectTransmittanceScale(rawState.rawY, layoutLabel);
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

    if (!transmittanceScale) {
      transmittanceScale = 'fraction';
    }
    layoutMeta[DISPLAY_UNITS_KEY] = nextDisplay;
    layoutMeta[TRANS_SCALE_KEY] = transmittanceScale;
    const nextLayout = { ...layout, meta: layoutMeta };
    const axisLabel = resolveAxisLabel({ displayUnits: nextDisplay, scale: transmittanceScale });
    Object.keys(nextLayout).forEach((axisKey) => {
      if (!/^yaxis\\d*$/.test(axisKey)) return;
      const axis = nextLayout[axisKey];
      const axisObj = axis && typeof axis === 'object' ? axis : {};
      const title = axisObj.title && typeof axisObj.title === 'object'
        ? { ...axisObj.title, text: axisLabel }
        : { text: axisLabel };
      nextLayout[axisKey] = { ...axisObj, title };
    });

    pushHistory({ label: `Switch to ${nextDisplay === 'absorbance' ? 'Absorbance' : 'Transmittance'}` });
    const nextFigure = {
      ...figure,
      data: nextTraces,
      layout: nextLayout
    };
    updatePanelFigure(resolvedPanelId, nextFigure, { source: 'units-toggle' });
    renderPlot(resolvedPanelId);
    persist();
    updateHistoryButtons();
    return true;
  };

  return {
    handleToggle: (panelId) => toggleUnits(panelId)
  };
}
