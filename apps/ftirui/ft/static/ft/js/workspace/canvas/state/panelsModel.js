const DEFAULT_SECTION_ID = 'section_all';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const randomPanelId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `panel_${crypto.randomUUID()}`;
  }
  return `panel_${Math.random().toString(36).slice(2, 9)}`;
};

const normalizeFigure = (figure) => {
  if (!figure || typeof figure !== 'object') {
    return { data: [], layout: {} };
  }
  return {
    data: ensureArray(figure.data).map((trace) => deepClone(trace)),
    layout: figure.layout ? deepClone(figure.layout) : {}
  };
};

const clonePanel = (panel) => {
  if (!panel) return null;
  return {
    id: panel.id,
    type: panel.type,
    index: panel.index,
    x: panel.x,
    y: panel.y,
    width: panel.width,
    height: panel.height,
    collapsed: !!panel.collapsed,
    hidden: panel.hidden === true,
    sectionId: panel.sectionId || DEFAULT_SECTION_ID,
    figure: normalizeFigure(panel.figure),
    zIndex: panel.zIndex
  };
};

export const createPanelsModel = (snapshot) => {
  const panels = new Map();
  let panelCounter = 0;
  let zIndexCursor = 0;

  const getPanelInternal = (panelId) => panels.get(panelId) || null;

  const resolveIndex = (incomingIndex, preserve) => {
    if (preserve && Number.isFinite(incomingIndex)) {
      panelCounter = Math.max(panelCounter, incomingIndex);
      return incomingIndex;
    }
    panelCounter += 1;
    return panelCounter;
  };

  const resolveZIndex = (incomingZIndex) => {
    const value = Number(incomingZIndex);
    if (Number.isFinite(value) && value > 0) {
      zIndexCursor = Math.max(zIndexCursor, value);
      return value;
    }
    zIndexCursor += 1;
    return zIndexCursor;
  };

  const snapshotState = () => ({
    counter: panelCounter,
    zIndexCursor,
    items: Array.from(panels.values()).map(clonePanel)
  });

  const load = (nextSnapshot) => {
    panels.clear();
    const source = nextSnapshot || {};
    const items = Array.isArray(source.items)
      ? source.items
      : Array.isArray(source.panels)
        ? source.panels
        : Array.isArray(source)
          ? source
          : [];
    panelCounter = Math.max(0, Number(source.counter) || 0);
    zIndexCursor = Math.max(0, Number(source.zIndexCursor || source.zIndex) || 0);
    items.forEach((item) => {
      const record = clonePanel(item);
      if (!record || !record.id) return;
      const final = {
        ...record,
        sectionId: record.sectionId || DEFAULT_SECTION_ID
      };
      panels.set(final.id, final);
      panelCounter = Math.max(panelCounter, Number(final.index) || 0);
      zIndexCursor = Math.max(zIndexCursor, Number(final.zIndex) || 0);
    });
  };

  const registerPanel = (incomingState = {}, { preserveIndex = false } = {}) => {
    const id = incomingState.id || randomPanelId();
    const index = resolveIndex(incomingState.index, preserveIndex);
    const x = Number.isFinite(incomingState.x) ? incomingState.x : 36 + panels.size * 24;
    const y = Number.isFinite(incomingState.y) ? incomingState.y : 36 + panels.size * 24;
    const width = Number.isFinite(incomingState.width) ? incomingState.width : 440;
    const height = Number.isFinite(incomingState.height) ? incomingState.height : 300;
    const collapsed = !!incomingState.collapsed;
    const hidden = incomingState.hidden === true;
    const sectionId = incomingState.sectionId || DEFAULT_SECTION_ID;
    const zIndex = resolveZIndex(incomingState.zIndex);

    const state = {
      id,
      type: incomingState.type || 'plot',
      index,
      x,
      y,
      width,
      height,
      collapsed,
      hidden,
      sectionId,
      figure: normalizeFigure(incomingState.figure),
      zIndex
    };

    panels.set(id, state);
    return clonePanel(state);
  };

  const removePanel = (panelId) => panels.delete(panelId);

  const setPanelGeometry = (panelId, { x, y, width, height } = {}) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    if (Number.isFinite(x)) panel.x = x;
    if (Number.isFinite(y)) panel.y = y;
    if (Number.isFinite(width)) panel.width = width;
    if (Number.isFinite(height)) panel.height = height;
    return clonePanel(panel);
  };

  const setPanelPosition = (panelId, { x, y } = {}) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    if (Number.isFinite(x)) panel.x = x;
    if (Number.isFinite(y)) panel.y = y;
    return clonePanel(panel);
  };

  const setPanelSize = (panelId, { width, height } = {}) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    if (Number.isFinite(width)) panel.width = width;
    if (Number.isFinite(height)) panel.height = height;
    return clonePanel(panel);
  };

  const setPanelCollapsed = (panelId, collapsed) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    panel.collapsed = !!collapsed;
    return clonePanel(panel);
  };

  const setPanelHidden = (panelId, hidden) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    panel.hidden = hidden === true;
    return clonePanel(panel);
  };

  const setPanelSection = (panelId, sectionId) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    panel.sectionId = sectionId || DEFAULT_SECTION_ID;
    return clonePanel(panel);
  };

  const setPanelIndex = (panelId, index) => {
    const panel = getPanelInternal(panelId);
    if (!panel || !Number.isFinite(index)) return null;
    panel.index = index;
    panelCounter = Math.max(panelCounter, index);
    return clonePanel(panel);
  };

  const setPanelZIndex = (panelId, zIndex) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    const value = resolveZIndex(zIndex);
    panel.zIndex = value;
    return clonePanel(panel);
  };

  const bringPanelToFront = (panelId) => setPanelZIndex(panelId, zIndexCursor + 1);

  const updatePanelFigure = (panelId, figure) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    panel.figure = normalizeFigure(figure);
    return clonePanel(panel);
  };

  const addTrace = (panelId, trace, { index } = {}) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    const traces = ensureArray(panel.figure?.data);
    const position = Number.isInteger(index) ? Math.max(0, Math.min(index, traces.length)) : traces.length;
    traces.splice(position, 0, deepClone(trace));
    panel.figure = {
      ...panel.figure,
      data: traces
    };
    return clonePanel(panel);
  };

  const removeTrace = (panelId, traceIndex) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return null;
    const traces = ensureArray(panel.figure?.data);
    if (!Number.isInteger(traceIndex) || traceIndex < 0 || traceIndex >= traces.length) {
      return clonePanel(panel);
    }
    traces.splice(traceIndex, 1);
    panel.figure = {
      ...panel.figure,
      data: traces
    };
    return clonePanel(panel);
  };

  const moveTrace = (source, target) => {
    const sourcePanel = getPanelInternal(source?.panelId);
    const targetPanel = getPanelInternal(target?.panelId);
    if (!sourcePanel || !targetPanel) return false;

    const sourceTraces = ensureArray(sourcePanel.figure?.data);
    if (!Number.isInteger(source.traceIndex) || source.traceIndex < 0 || source.traceIndex >= sourceTraces.length) {
      return false;
    }

    const [trace] = sourceTraces.splice(source.traceIndex, 1);
    const targetTraces = ensureArray(targetPanel.figure?.data);
    let insertAt = Number.isInteger(target.traceIndex) ? target.traceIndex : targetTraces.length;
    if (sourcePanel === targetPanel && source.traceIndex < insertAt) {
      insertAt -= 1;
    }
    insertAt = Math.max(0, Math.min(insertAt, targetTraces.length));
    targetTraces.splice(insertAt, 0, trace);

    sourcePanel.figure = {
      ...sourcePanel.figure,
      data: sourceTraces
    };
    targetPanel.figure = {
      ...targetPanel.figure,
      data: targetTraces
    };
    return true;
  };

  const listPanels = () => Array.from(panels.values()).map(clonePanel);

  const getPanels = () => listPanels();

  const getPanelsInIndexOrder = () => listPanels().sort((a, b) => (a.index || 0) - (b.index || 0));

  const getPanelsInSection = (sectionId) => {
    const target = sectionId || DEFAULT_SECTION_ID;
    return listPanels().filter((panel) => (panel.sectionId || DEFAULT_SECTION_ID) === target);
  };

  const getPanelFigure = (panelId) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return { data: [], layout: {} };
    return normalizeFigure(panel.figure);
  };

  const getPanelTraces = (panelId) => {
    const panel = getPanelInternal(panelId);
    if (!panel) return [];
    return ensureArray(panel.figure?.data).map((trace) => deepClone(trace));
  };

  if (snapshot) {
    load(snapshot);
  }

  return {
    snapshot: snapshotState,
    load,
    registerPanel,
    removePanel,
    setPanelGeometry,
    setPanelPosition,
    setPanelSize,
    setPanelCollapsed,
    setPanelHidden,
    setPanelSection,
    setPanelIndex,
    setPanelZIndex,
    bringPanelToFront,
    updatePanelFigure,
    addTrace,
    removeTrace,
    moveTrace,
    getPanel: (panelId) => clonePanel(getPanelInternal(panelId)),
    listPanels,
    getPanels,
    getPanelsInIndexOrder,
    getPanelsInSection,
    getPanelFigure,
    getPanelTraces
  };
};
