const ensureArray = (value) => (Array.isArray(value) ? value : []);
const cloneValue = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};
const AUTO_TICKFORMAT_META_KEY = 'workspaceAxisTickformat';

const axisKeysForLayout = (layout = {}) => (
  Object.keys(layout).filter((key) => /^(xaxis\d*|yaxis\d*)$/.test(key))
);

const normalizeNumber = (value, precision = 12) => {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(precision));
};

const countDecimals = (value) => {
  if (!Number.isFinite(value)) return 0;
  const normalized = normalizeNumber(Math.abs(value));
  if (!Number.isFinite(normalized) || Number.isInteger(normalized)) return 0;
  const text = normalized.toString();
  if (text.includes('e-')) {
    const parts = text.split('e-');
    const exponent = Number(parts[1]);
    if (!Number.isFinite(exponent)) return 0;
    const baseDecimals = (parts[0].split('.')[1] || '').length;
    return exponent + baseDecimals;
  }
  const pieces = text.split('.');
  return pieces[1] ? pieces[1].length : 0;
};

const resolveAxisTickformat = (axis) => {
  if (!axis || typeof axis !== 'object') return null;
  if (axis.type && axis.type !== 'linear') return null;
  if (axis.tickformatstops) return null;
  if (!Number.isFinite(axis.dtick)) return null;
  const decimals = countDecimals(axis.dtick);
  if (!decimals) return null;
  return `.${decimals}f`;
};

const readAxisTickformatMeta = (layout = {}) => {
  const meta = layout?.meta;
  const value = meta && typeof meta === 'object' ? meta[AUTO_TICKFORMAT_META_KEY] : null;
  return value && typeof value === 'object' ? value : {};
};

const syncAxisTickformatMeta = (layout, nextMeta) => {
  const meta = layout.meta && typeof layout.meta === 'object' ? { ...layout.meta } : {};
  if (nextMeta && Object.keys(nextMeta).length) {
    meta[AUTO_TICKFORMAT_META_KEY] = nextMeta;
  } else if (Object.prototype.hasOwnProperty.call(meta, AUTO_TICKFORMAT_META_KEY)) {
    delete meta[AUTO_TICKFORMAT_META_KEY];
  }
  layout.meta = meta;
};

const getAutoTickformatState = ({ fullLayout, layout }) => {
  if (!fullLayout || !layout) return { patch: {}, meta: {} };
  const axisKeys = axisKeysForLayout(fullLayout);
  if (!axisKeys.length) return { patch: {}, meta: {} };
  const currentMeta = readAxisTickformatMeta(layout);
  const patch = {};
  const nextMeta = {};
  axisKeys.forEach((axisKey) => {
    const axis = fullLayout[axisKey];
    const desired = resolveAxisTickformat(axis);
    const layoutAxis = layout?.[axisKey];
    const layoutAxisObj = layoutAxis && typeof layoutAxis === 'object' ? layoutAxis : {};
    const currentFormat = layoutAxisObj.tickformat;
    const autoFormat = currentMeta?.[axisKey];
    const hasUserFormat = typeof currentFormat === 'string'
      && currentFormat.length
      && currentFormat !== autoFormat
      && currentFormat !== desired;
    if (hasUserFormat) {
      return;
    }
    if (desired) {
      nextMeta[axisKey] = desired;
      if (currentFormat !== desired) {
        patch[`${axisKey}.tickformat`] = desired;
      }
      return;
    }
    if (autoFormat && currentFormat === autoFormat) {
      patch[`${axisKey}.tickformat`] = null;
    }
  });
  return { patch, meta: nextMeta };
};

const hasRelayoutPrefix = (relayoutData, prefix) => {
  if (!relayoutData || typeof relayoutData !== 'object') return false;
  const keys = Object.keys(relayoutData);
  return keys.some((key) => key === prefix || key.startsWith(`${prefix}[`));
};

const readPlotLayoutList = (plotEl, key) => {
  if (!plotEl) return [];
  const list = plotEl.layout?.[key] ?? plotEl._fullLayout?.[key];
  return ensureArray(list);
};

const filterOverlayItems = (items) => (
  ensureArray(items).filter((item) => item?.meta?.peakOverlay !== true)
);

const parseRangeUpdates = (relayoutData) => {
  const rangeUpdates = {};
  Object.entries(relayoutData || {}).forEach(([key, value]) => {
    const match = key.match(/^(xaxis\d*|yaxis\d*)\.range(?:\[(0|1)\])?$/);
    if (!match) return;
    const axisKey = match[1];
    if (!rangeUpdates[axisKey]) rangeUpdates[axisKey] = { values: [] };
    if (match[2]) {
      const idx = Number(match[2]);
      rangeUpdates[axisKey].values[idx] = value;
    } else if (Array.isArray(value) && value.length === 2) {
      rangeUpdates[axisKey].values = value.slice();
    }
  });
  return rangeUpdates;
};

const applyLayoutUpdates = (relayoutData, nextLayout) => {
  Object.entries(relayoutData || {}).forEach(([key, value]) => {
    if (key === 'hovermode') {
      nextLayout.hovermode = value;
      return;
    }
    const match = key.match(/^(xaxis\d*|yaxis\d*)\.(showspikes|spikemode|spikesnap|spikethickness)$/);
    if (!match) return;
    const axisKey = match[1];
    const prop = match[2];
    nextLayout[axisKey] = {
      ...(nextLayout[axisKey] || {}),
      [prop]: value
    };
  });
};

const applyTickformatUpdates = (relayoutData, nextLayout) => {
  Object.entries(relayoutData || {}).forEach(([key, value]) => {
    const match = key.match(/^(xaxis\d*|yaxis\d*)\.tickformat$/);
    if (!match) return;
    const axisKey = match[1];
    const axisLayout = nextLayout[axisKey] && typeof nextLayout[axisKey] === 'object'
      ? { ...nextLayout[axisKey] }
      : {};
    if (value == null) {
      if (Object.prototype.hasOwnProperty.call(axisLayout, 'tickformat')) {
        delete axisLayout.tickformat;
      }
    } else {
      axisLayout.tickformat = value;
    }
    nextLayout[axisKey] = axisLayout;
  });
};

const applyRangeUpdates = ({ rangeUpdates, updates, nextLayout }) => {
  Object.entries(rangeUpdates).forEach(([axisKey, info]) => {
    if (!Array.isArray(info.values) || info.values.length !== 2) return;
    nextLayout[axisKey] = {
      ...(nextLayout[axisKey] || {}),
      range: info.values.slice(),
      autorange: false
    };
  });
  Object.entries(updates).forEach(([key, value]) => {
    const match = key.match(/^(xaxis\d*|yaxis\d*)\.(range|autorange)$/);
    if (!match) return;
    const axisKey = match[1];
    const prop = match[2];
    nextLayout[axisKey] = {
      ...(nextLayout[axisKey] || {}),
      [prop]: Array.isArray(value) ? value.slice() : value
    };
  });
};

export function createPlotRelayoutHandler({
  panelId,
  plotEl,
  getPanelFigure,
  updatePanelFigure,
  pushHistory,
  updateHistoryButtons,
  persist,
  scheduleCanvasSync,
  baseFigureWithoutOverlays,
  computeTraceRange,
  expandRange,
  applyRelayout,
  historyThrottleMs = 500
} = {}) {
  let lastHistoryAt = 0;
  return (relayoutData) => {
    const skipUntil = Number(plotEl?.__workspaceSkipRelayoutUntil);
    if (Number.isFinite(skipUntil) && skipUntil > Date.now()) {
      plotEl.__workspaceSkipRelayoutUntil = 0;
      return;
    }
    const rangeUpdates = parseRangeUpdates(relayoutData);
    const wantsXAuto = relayoutData?.['xaxis.autorange'];
    const wantsYAuto = relayoutData?.['yaxis.autorange'];
    const wantsAnnotations = hasRelayoutPrefix(relayoutData, 'annotations');
    const wantsShapes = hasRelayoutPrefix(relayoutData, 'shapes');
    const wantsTickformat = Object.keys(relayoutData || {}).some((key) => (
      /^(xaxis\d*|yaxis\d*)\.tickformat$/.test(key)
    ));
    const wantsSpikes = Object.keys(relayoutData || {}).some((key) => (
      key === 'hovermode'
      || /^(xaxis\d*|yaxis\d*)\.(showspikes|spikemode|spikesnap|spikethickness)$/.test(key)
    ));
    const hasRangeUpdates = Object.keys(rangeUpdates).length > 0;
    const needsPersist = wantsAnnotations || wantsShapes || wantsSpikes || wantsTickformat || wantsXAuto || wantsYAuto || hasRangeUpdates;
    if (!needsPersist) return;

    const figure = typeof getPanelFigure === 'function' ? getPanelFigure(panelId) : null;
    if (!figure) return;
    const base = typeof baseFigureWithoutOverlays === 'function'
      ? baseFigureWithoutOverlays(figure)
      : { data: ensureArray(figure?.data), layout: figure?.layout || {} };

    const updates = {};
    if (wantsXAuto && typeof computeTraceRange === 'function') {
      const xRange = computeTraceRange(base.data, 'x');
      if (xRange) {
        const currentAuto = figure?.layout?.xaxis?.autorange;
        const isReversed = wantsXAuto === 'reversed' || currentAuto === 'reversed';
        const range = xRange;
        updates['xaxis.range'] = isReversed ? [range[1], range[0]] : range;
        updates['xaxis.autorange'] = false;
      }
    }
    if (wantsYAuto && typeof computeTraceRange === 'function') {
      const shouldToggleYZero = !!(wantsYAuto && !wantsXAuto);
      let useZeroBaseline = plotEl?.__workspaceYAxisZeroMode === true;
      if (shouldToggleYZero) {
        useZeroBaseline = !useZeroBaseline;
        if (plotEl) {
          plotEl.__workspaceYAxisZeroMode = useZeroBaseline;
        }
      }
      const yRange = computeTraceRange(base.data, 'y');
      if (yRange) {
        let nextRange = yRange;
        if (useZeroBaseline) {
          const [min, max] = yRange;
          if (max <= 0) {
            nextRange = [min, 0];
          } else if (min >= 0) {
            nextRange = [0, max];
          } else {
            nextRange = yRange;
          }
        } else if (typeof expandRange === 'function') {
          nextRange = expandRange(yRange) || yRange;
        }
        updates['yaxis.range'] = nextRange;
        updates['yaxis.autorange'] = false;
      }
    }

    if (Object.keys(updates).length && typeof applyRelayout === 'function') {
      applyRelayout(updates);
    }
    const autoTickformat = getAutoTickformatState({
      fullLayout: plotEl?._fullLayout,
      layout: figure.layout || {}
    });
    if (!wantsTickformat && !Object.keys(updates).length && Object.keys(autoTickformat.patch).length && typeof applyRelayout === 'function') {
      applyRelayout(autoTickformat.patch);
    }

    const shouldPersist = hasRangeUpdates || Object.keys(updates).length || wantsAnnotations || wantsShapes || wantsSpikes || wantsTickformat;
    if (!shouldPersist) return;
    const shouldRecordHistory = wantsAnnotations || wantsShapes || wantsSpikes || wantsXAuto || wantsYAuto;
    if (shouldRecordHistory && typeof pushHistory === 'function') {
      const now = Date.now();
      if (!Number.isFinite(lastHistoryAt) || now - lastHistoryAt > historyThrottleMs) {
        lastHistoryAt = now;
        const label = (wantsAnnotations || wantsShapes)
          ? 'Edit plot drawings'
          : (wantsSpikes ? 'Toggle crosshair' : 'Reset axes');
        pushHistory({ label, meta: { action: 'plotly-modebar' } });
        if (typeof updateHistoryButtons === 'function') {
          updateHistoryButtons();
        }
      }
    }

    const nextFigure = {
      ...figure,
      layout: {
        ...(figure.layout || {})
      }
    };

    applyRangeUpdates({ rangeUpdates, updates, nextLayout: nextFigure.layout });
    if (wantsSpikes) {
      applyLayoutUpdates(relayoutData, nextFigure.layout);
    }
    if (wantsTickformat) {
      applyTickformatUpdates(relayoutData, nextFigure.layout);
      const nextMeta = getAutoTickformatState({
        fullLayout: plotEl?._fullLayout,
        layout: nextFigure.layout
      }).meta;
      syncAxisTickformatMeta(nextFigure.layout, nextMeta);
    }

    if (wantsAnnotations) {
      const annotations = cloneValue(filterOverlayItems(readPlotLayoutList(plotEl, 'annotations')));
      nextFigure.layout.annotations = annotations;
    }
    if (wantsShapes) {
      const shapes = cloneValue(filterOverlayItems(readPlotLayoutList(plotEl, 'shapes')));
      nextFigure.layout.shapes = shapes;
    }

    if (typeof updatePanelFigure === 'function') {
      updatePanelFigure(panelId, nextFigure, { source: 'relayout', skipTemplateDirty: true });
    }
    if (typeof persist === 'function') {
      persist();
    }
    if (typeof scheduleCanvasSync === 'function') {
      scheduleCanvasSync();
    }
  };
}
