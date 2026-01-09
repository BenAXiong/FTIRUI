import { createPanelContext } from '../context/panelContext.js';

export function createPanelsFacade({
  models = {},
  plot = {},
  history: historyApi = {},
  persistence = {},
  browser = {},
  dom = {},
  state = {},
  sections = {},
  utils = {},
  services = {},
  actions = {},
  env = {},
  registry = {}
} = {}) {
  const {
    panelsModel
  } = models;

  if (!panelsModel) {
    throw new Error('createPanelsFacade requires panelsModel');
  }

  const {
    renderNow: renderNowUnsafe
  } = plot;

  const renderPlot = (panelId) => {
    if (!panelId || typeof renderNowUnsafe !== 'function') return;
    renderNowUnsafe(panelId);
  };

  const {
    history = null,
    pushHistory = () => {},
    updateHistoryButtons = () => {}
  } = historyApi;

  const {
    persist = () => {}
  } = persistence;

  const {
    renderBrowser = () => {},
    refreshPanelVisibility = () => {},
    updateCanvasState = () => {}
  } = browser;

  const {
    panels: panelsState = {},
    ui: uiState = {},
    sections: sectionsState = {},
    workspace: workspaceState = {}
  } = state || {};

  const getPanelRecord = typeof panelsState.getRecord === 'function'
    ? panelsState.getRecord
    : (id) => (id ? panelsModel.getPanel(id) || null : null);
  const getPanelsOrdered = typeof panelsState.getOrdered === 'function'
    ? panelsState.getOrdered
    : () => (typeof panelsModel.getPanelsInIndexOrder === 'function' ? panelsModel.getPanelsInIndexOrder() : []);
  const getPanelTraces = typeof panelsState.getTraces === 'function'
    ? panelsState.getTraces
    : (id) => (id && typeof panelsModel.getPanelTraces === 'function' ? panelsModel.getPanelTraces(id) || [] : []);
  const getPanelFigure = typeof panelsState.getFigure === 'function'
    ? panelsState.getFigure
    : (id) => (id && typeof panelsModel.getPanelFigure === 'function' ? panelsModel.getPanelFigure(id) || { data: [], layout: {} } : { data: [], layout: {} });

  const panelDomRegistry = uiState.panelDomRegistry
    || dom.panelDomRegistry
    || new Map();
  const getPanelDom = typeof uiState.getPanelDom === 'function'
    ? uiState.getPanelDom
    : (typeof dom.getPanelDom === 'function' ? dom.getPanelDom : () => ({}));
  const getActivePanelId = typeof uiState.getActivePanelId === 'function'
    ? uiState.getActivePanelId
    : () => null;
  const setActivePanel = typeof uiState.setActivePanel === 'function'
    ? uiState.setActivePanel
    : () => {};
  const detachPanelDom = typeof dom.detachPanelDom === 'function' ? dom.detachPanelDom : () => {};

  const hasSection = typeof sectionsState.has === 'function'
    ? sectionsState.has
    : (id) => (sections?.map instanceof Map ? sections.map.has(id) : true);
  const defaultSectionId = sectionsState.defaultId ?? sections?.defaultSectionId ?? 'section_all';

  const getNextPanelSequence = typeof workspaceState.getNextPanelSequence === 'function'
    ? workspaceState.getNextPanelSequence
    : () => panelDomRegistry.size + 1;

  const {
    ensureArray = (value) => (Array.isArray(value) ? value : []),
    deepClone = (value) => JSON.parse(JSON.stringify(value)),
    decodeName = (value) => value,
    ensureTraceId = () => {},
    toHexColor = (value) => value,
    defaultLayout = () => ({ data: [], layout: {} }),
    pickColor = () => '#1f77b4',
    allocateTraceColor = null,
    showToast = () => {},
    clampGeometryToCanvas = (geometry) => geometry,
    fallbackColor = '#1f77b4'
  } = utils;
  const getFallbackColor = () => {
    const candidate = typeof fallbackColor === 'function' ? fallbackColor() : fallbackColor;
    return toHexColor(candidate || '#1f77b4');
  };

  const {
    uploadTraceFile = async () => null
  } = services;

  const {
    registerPanel = () => null
  } = registry;

  const RAW_Y_KEY = 'workspaceRawY';
  const RAW_UNITS_KEY = 'workspaceRawUnits';
  const RAW_SCALE_KEY = 'workspaceRawScale';

  const normalizeUnitsLabel = (label) => {
    if (!label) return null;
    const text = String(label).trim().toLowerCase();
    if (!text) return null;
    if (text.includes('abs')) return 'absorbance';
    if (text.includes('trans') || text.includes('%t') || text.includes('t%')) return 'transmittance';
    return null;
  };

  const detectTransmittanceScale = (label) => {
    if (!label) return null;
    const text = String(label);
    return text.includes('%') ? 'percent' : null;
  };

  const syncTraceAppearance = (trace) => {
    if (!trace) return trace;
    trace.line = trace.line || {};
    const resolvedColor = toHexColor(
      trace.color
      || trace.line.color
      || getFallbackColor()
    );
    trace.color = resolvedColor;
    trace.line.color = resolvedColor;

    const resolvedWidth = Number.isFinite(trace.width)
      ? trace.width
      : Number.isFinite(trace.line.width) ? trace.line.width : 2;
    trace.width = resolvedWidth;
    trace.line.width = resolvedWidth;

    const resolvedDash = typeof trace.dash === 'string'
      ? trace.dash
      : (typeof trace.line.dash === 'string' ? trace.line.dash : 'solid');
    trace.dash = resolvedDash;
    trace.line.dash = resolvedDash;

    const resolvedOpacity = Number.isFinite(trace.opacity) ? trace.opacity : 1;
    trace.opacity = resolvedOpacity;
    return trace;
  };

  const normalizePanelTraces = (panelId, figureOverride = null) => {
    if (!panelId) return null;
    const figure = figureOverride || getPanelFigure(panelId);
    const traces = ensureArray(figure.data).map((original) => {
      if (!original) return original;
      const trace = deepClone(original);
      syncTraceAppearance(trace);
      if (typeof trace.name === 'string') trace.name = decodeName(trace.name);
      if (typeof trace.filename === 'string') trace.filename = decodeName(trace.filename);
      if (trace.meta) {
        if (typeof trace.meta.name === 'string') trace.meta.name = decodeName(trace.meta.name);
        if (typeof trace.meta.filename === 'string') trace.meta.filename = decodeName(trace.meta.filename);
      }
      ensureTraceId(trace);
      trace.opacity = Number.isFinite(trace.opacity) ? trace.opacity : 1;
      trace.visible = trace.visible !== false;
      trace.line = trace.line || {};
      trace.line.color = toHexColor(trace.line.color || getFallbackColor());
      trace.line.width = Number.isFinite(trace.line.width) ? trace.line.width : 2;
      trace.line.dash = trace.line.dash || 'solid';
      trace.color = trace.line.color;
      trace.width = trace.line.width;
      trace.dash = trace.line.dash;
      return trace;
    });
    const nextFigure = {
      ...figure,
      data: traces
    };
    panelsModel.updatePanelFigure(panelId, nextFigure);
    return nextFigure;
  };

  const createTraceFromPayload = (payload = {}, file = null) => {
    const baseLine = payload?.line || {};
    const paletteSelection = typeof allocateTraceColor === 'function'
      ? allocateTraceColor()
      : { color: pickColor(), index: null };
    const providedColor = payload?.color || payload?.line?.color || null;
    const colorValue = providedColor || paletteSelection.color;
    const traceName = decodeName(payload?.name || payload?.meta?.name || '');
    const rawX = ensureArray(payload?.x);
    const rawY = ensureArray(payload?.y || payload?.values);
    const xValues = rawX.length ? rawX : ensureArray(payload?.wavenumber);
    const yValues = rawY.length ? rawY : ensureArray(payload?.intensity);

    const trace = {
      name: traceName || (file ? decodeName(file.name) : 'Trace'),
      filename: decodeName(payload?.filename || file?.name || ''),
      type: payload?.type || 'scatter',
      mode: payload?.mode || 'lines',
      x: xValues,
      y: yValues,
      line: {
        color: toHexColor(colorValue),
        width: Number.isFinite(baseLine.width) ? baseLine.width : 2,
        dash: baseLine.dash || 'solid'
      },
      opacity: Number.isFinite(payload?.opacity) ? payload.opacity : 1,
      visible: payload?.visible !== false,
      meta: (() => {
        const meta = { ...(payload?.meta || {}) };
        if (!Array.isArray(meta[RAW_Y_KEY])) {
          meta[RAW_Y_KEY] = yValues.slice();
        }
        if (!meta[RAW_UNITS_KEY]) {
          const rawUnits = normalizeUnitsLabel(meta.DISPLAY_UNITS || meta.Y_UNITS);
          if (rawUnits) {
            meta[RAW_UNITS_KEY] = rawUnits;
          }
          if (rawUnits === 'transmittance' && !meta[RAW_SCALE_KEY]) {
            const scale = detectTransmittanceScale(meta.DISPLAY_UNITS || meta.Y_UNITS);
            if (scale) {
              meta[RAW_SCALE_KEY] = scale;
            }
          }
        }
        if (!providedColor && Number.isInteger(paletteSelection.index) && !Number.isInteger(meta.autoColorIndex)) {
          meta.autoColorIndex = paletteSelection.index;
        }
        return meta;
      })()
    };

    ensureTraceId(trace);
    return trace;
  };

  const computeAxisRange = (traces, axisKey = 'x') => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    let found = false;
    ensureArray(traces).forEach((trace) => {
      ensureArray(trace?.[axisKey]).forEach((value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        found = true;
        if (numeric < min) min = numeric;
        if (numeric > max) max = numeric;
      });
    });
    if (!found || !Number.isFinite(min) || !Number.isFinite(max) || min === max) return null;
    return [min, max];
  };

  const ingestPayloadAsPanel = (payload, {
    width = 720,
    height = 320,
    skipHistory = false,
    skipPersist = false,
    sectionId = defaultSectionId
  } = {}) => {
    if (typeof registerPanel !== 'function') {
      throw new Error('Panels facade requires registerPanel to ingest payloads');
    }

    const payloadList = Array.isArray(payload)
      ? payload.filter(Boolean)
      : (payload ? [payload] : []);
    if (!payloadList.length) return null;

    const traces = payloadList.map((entry) => createTraceFromPayload(entry));

    const primaryPayload = payloadList[0] || {};
    const layout = defaultLayout(primaryPayload);
    const xRange = computeAxisRange(traces, 'x');
    if (xRange) {
      const axis = layout?.xaxis && typeof layout.xaxis === 'object' ? layout.xaxis : {};
      const isReversed = axis.autorange === 'reversed';
      layout.xaxis = {
        ...axis,
        range: isReversed ? [xRange[1], xRange[0]] : xRange.slice(),
        autorange: false
      };
    }

    return registerPanel({
      type: 'plot',
      width,
      height,
      hidden: primaryPayload?.hidden === true,
      sectionId,
      figure: {
        data: traces,
        layout
      }
    }, { skipHistory, skipPersist });
  };

  const addTracesToPanel = (panelId, payloads = [], {
    pushToHistory = true
  } = {}) => {
    if (!panelId) return false;
    const record = getPanelRecord(panelId);
    if (!record) return false;
    const payloadList = Array.isArray(payloads)
      ? payloads.filter(Boolean)
      : (payloads ? [payloads] : []);
    if (!payloadList.length) return false;

    if (pushToHistory) {
      pushHistory();
    }

    payloadList.forEach((entry) => {
      const trace = createTraceFromPayload(entry);
      panelsModel.addTrace(panelId, trace);
    });

    normalizePanelTraces(panelId);
    renderPlot(panelId);
    renderBrowser();
    persist();
    updateHistoryButtons();
    showToast(`Added ${payloadList.length} trace${payloadList.length === 1 ? '' : 's'} to graph.`, 'success');
    return true;
  };

  const appendFilesToGraph = async (panelId, fileList) => {
    if (!panelId) return;
    if (!getPanelRecord(panelId)) return;
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    pushHistory();
    let added = 0;

    for (const file of files) {
      try {
        const payload = await uploadTraceFile(file, 'auto');
        const trace = createTraceFromPayload(payload, file);
        panelsModel.addTrace(panelId, trace);
        added += 1;
      } catch (err) {
        console.warn('Failed to add file to graph', file?.name, err);
      }
    }

    if (!added) {
      history?.rewind?.();
      updateHistoryButtons();
      showToast('No files were added to the graph.', 'warning');
      return;
    }

    normalizePanelTraces(panelId);
    renderPlot(panelId);
    renderBrowser();
    persist();
    updateHistoryButtons();
    showToast(`Added ${added} file${added === 1 ? '' : 's'} to graph.`, 'success');
  };

  const moveTrace = (source, target) => {
    const sourcePanelId = source?.panelId;
    const targetPanelId = target?.panelId;
    if (!sourcePanelId || !targetPanelId) return false;

    const sourceContext = createPanelContext({ panelId: sourcePanelId, runtimeState: state });
    const targetContext = sourcePanelId === targetPanelId
      ? sourceContext
      : createPanelContext({ panelId: targetPanelId, runtimeState: state });

    const moved = panelsModel.moveTrace(source, target);
    if (!moved) return false;

    normalizePanelTraces(sourcePanelId);
    if (sourcePanelId !== targetPanelId) {
      normalizePanelTraces(targetPanelId);
    }

    renderPlot(sourcePanelId);
    if (sourcePanelId !== targetPanelId) {
      renderPlot(targetPanelId);
    }

    const remaining = sourceContext.getTraces();
    if (!remaining.length) {
      removePanel(sourcePanelId, { pushToHistory: false });
    }

    renderBrowser();
    persist();
    updateHistoryButtons();
    return true;
  };

  const moveGraph = (panelId, { sectionId, beforePanelId } = {}) => {
    const record = getPanelRecord(panelId);
    if (!record) return false;

    const panelContext = createPanelContext({ panelId, runtimeState: state });

    const currentSectionId = panelContext.hasSection(record.sectionId) ? record.sectionId : panelContext.defaultSectionId;
    const targetSectionId = sectionId && panelContext.hasSection(sectionId) ? sectionId : currentSectionId;

    let normalizedBeforeId = beforePanelId && beforePanelId !== panelId ? beforePanelId : null;
    if (normalizedBeforeId) {
      const beforeRecord = getPanelRecord(normalizedBeforeId);
      const beforeContext = createPanelContext({ panelId: normalizedBeforeId, runtimeState: state });
      const beforeSectionId = beforeContext.hasSection(beforeRecord?.sectionId)
        ? beforeRecord.sectionId
        : beforeContext.defaultSectionId;
      if (!beforeRecord || beforeSectionId !== targetSectionId) {
        normalizedBeforeId = null;
      }
    }

    if (targetSectionId !== currentSectionId) {
      panelsModel.attachToSection(panelId, targetSectionId);
    }

    let orderedRecords = panelsModel.getPanelsInIndexOrder();
    let currentIdx = orderedRecords.findIndex((item) => item.id === panelId);
    if (currentIdx === -1) return false;

    const working = orderedRecords.slice();
    const [current] = working.splice(currentIdx, 1);

    let targetIdx = working.length;
    if (normalizedBeforeId) {
      targetIdx = working.findIndex((item) => item.id === normalizedBeforeId);
      if (targetIdx === -1) {
        normalizedBeforeId = null;
        targetIdx = working.length;
      }
    }

    if (!normalizedBeforeId) {
      const lastIdx = working.reduce(
        (acc, item, idx) => (item.sectionId === targetSectionId ? idx : acc),
        -1
      );
      targetIdx = lastIdx === -1 ? working.length : lastIdx + 1;
    }

    working.splice(targetIdx, 0, current);

    if (targetSectionId === currentSectionId && targetIdx === currentIdx) {
      return false;
    }

    working.forEach((panel, idx) => {
      panelsModel.setPanelIndex(panel.id, idx + 1);
    });

    renderBrowser();
    persist();
    updateHistoryButtons();
    return true;
  };

  const removePanel = (id, { pushToHistory = true } = {}) => {
    const record = getPanelRecord(id);
    if (!record) return;
    if (pushToHistory) {
      pushHistory();
    }
    const wasActive = getActivePanelId() === id;
    panelsModel.removePanel(id);
    const domHandles = getPanelDom(id);
    domHandles?.rootEl?.remove();
    detachPanelDom(id);
    if (wasActive) {
      const fallbackRecord = getPanelsOrdered().reduce((best, candidate) => {
        if (!candidate) return best;
        if (candidate.hidden === true) return best;
        if (!best || (candidate.zIndex || 0) > (best.zIndex || 0)) {
          return candidate;
        }
        return best;
      }, null);
      setActivePanel(fallbackRecord ? fallbackRecord.id : null);
    }
    renderBrowser();
    refreshPanelVisibility();
    updateCanvasState();
    persist();
    updateHistoryButtons();
  };

  return {
    normalizePanelTraces,
    createTraceFromPayload,
    ingestPayloadAsPanel,
    addTracesToPanel,
    appendFilesToGraph,
    moveTrace,
    moveGraph,
    removePanel
  };
}
