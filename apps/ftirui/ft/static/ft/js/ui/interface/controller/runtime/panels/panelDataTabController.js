import { traceNameToPlainText } from '../../../../utils/traceName.js';
import { spreadsheetPanelType } from './registry/spreadsheetPanel.js';

const DEFAULT_MAX_ROWS = 0;
const MAX_CACHE_ENTRIES = 6;
const LIVE_DATA_PANEL_ID = '__workspace_data_tab_live__';

const toVector = (value) => {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value) && typeof value.length === 'number') {
    return Array.from(value);
  }
  return [];
};

const getTraceLabel = (trace, index) => {
  const raw = trace?.name || trace?.filename || trace?.id || `Trace ${index + 1}`;
  return traceNameToPlainText(raw, { lineBreak: ' / ' }) || `Trace ${index + 1}`;
};

const cloneDeep = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value));
    }
  }
  return JSON.parse(JSON.stringify(value));
};

const toCellValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return '';
};

const ensureRows = (rows, rowCount) => {
  const next = Array.isArray(rows)
    ? rows.map((row, index) => ({ id: row?.id || `row-${index + 1}`, ...(row || {}) }))
    : [];
  for (let index = next.length; index < rowCount; index += 1) {
    next.push({ id: `row-${index + 1}` });
  }
  if (next.length > rowCount) {
    next.length = rowCount;
  }
  return next;
};

const ensureColumn = (columns, id, label, units = '', axis = '') => {
  if (!id) return;
  if (columns.some((column) => column?.id === id)) return;
  columns.push({
    id,
    label: label || '',
    axis: axis || '',
    units,
    width: null,
    type: 'number',
    formula: ''
  });
};

const sanitizeAxisToken = (value) => (typeof value === 'string' ? value.trim() : '');
const resolveColumnAxisLabel = (column) => {
  const explicit = sanitizeAxisToken(column?.axis);
  if (explicit) return explicit;
  return sanitizeAxisToken(column?.label) || sanitizeAxisToken(column?.id) || '';
};
const composeAxisTitle = (label = '', units = '') => {
  const cleanLabel = sanitizeAxisToken(label);
  const cleanUnits = sanitizeAxisToken(units);
  if (cleanLabel && cleanUnits) return `${cleanLabel} (${cleanUnits})`;
  return cleanLabel || cleanUnits || '';
};
const readFigureAxisTitle = (figure, axisKey) => {
  const axis = figure?.layout?.[axisKey];
  if (!axis || typeof axis !== 'object') return '';
  const title = axis.title;
  if (typeof title === 'string') return sanitizeAxisToken(title);
  if (title && typeof title === 'object') return sanitizeAxisToken(title.text);
  return '';
};

const writeSeries = (rows, columnId, values = []) => {
  if (!columnId) return;
  const vector = toVector(values);
  for (let index = 0; index < rows.length; index += 1) {
    rows[index][columnId] = toCellValue(vector[index]);
  }
};

const getGraphTraces = (figure, { includeOverlays = false } = {}) => {
  const traces = Array.isArray(figure?.data) ? figure.data : [];
  if (includeOverlays) return traces;
  return traces.filter((trace) => trace?.meta?.peakOverlay !== true);
};

const resolveLinkedSpreadsheetId = (traces, getPanelRecord) => {
  const sourceIds = new Set();
  traces.forEach((trace) => {
    const sourcePanelId = trace?.meta?.sourcePanelId;
    if (!sourcePanelId || typeof sourcePanelId !== 'string') return;
    const record = getPanelRecord(sourcePanelId);
    if (record?.type === 'spreadsheet') {
      sourceIds.add(sourcePanelId);
    }
  });
  if (sourceIds.size !== 1) return null;
  return Array.from(sourceIds)[0] || null;
};

const normalizeSeriesValue = (value) => {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return null;
};

const valuesEqual = (a = [], b = []) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
};

const resolveTraceColumnIds = (trace, traceIndex) => ({
  xColumnId: trace?.meta?.xColumnId || `live-x-${traceIndex + 1}`,
  yColumnId: trace?.meta?.columnId || `live-y-${traceIndex + 1}`
});

const findFallbackXColumnId = (content) => {
  const plotX = Array.isArray(content?.plot?.x) ? content.plot.x : [];
  if (plotX.length && typeof plotX[0] === 'string') return plotX[0];
  const columns = Array.isArray(content?.columns) ? content.columns : [];
  return columns[0]?.id || null;
};

const buildSeriesFromRows = (rows, xColumnId, yColumnId) => {
  const x = [];
  const y = [];
  rows.forEach((row) => {
    const xValue = normalizeSeriesValue(row?.[xColumnId]);
    const yValue = normalizeSeriesValue(row?.[yColumnId]);
    if (xValue == null || yValue == null) return;
    x.push(xValue);
    y.push(yValue);
  });
  return { x, y };
};

const scalarPreview = (value) => {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'string') return value.slice(0, 24);
  return '';
};

const vectorChecksum = (vectorLike) => {
  const vector = toVector(vectorLike);
  if (!vector.length) return '0';
  const step = Math.max(1, Math.floor(vector.length / 64));
  let hash = 2166136261;
  for (let index = 0; index < vector.length; index += step) {
    const value = vector[index];
    const token = scalarPreview(value);
    for (let charIndex = 0; charIndex < token.length; charIndex += 1) {
      hash ^= token.charCodeAt(charIndex);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
  }
  return String(hash >>> 0);
};

const buildFingerprint = ({ panelId, traces, linkedPanelId, linkedContent }) => {
  const linkedColumns = Array.isArray(linkedContent?.columns) ? linkedContent.columns.length : 0;
  const linkedRows = Array.isArray(linkedContent?.rows) ? linkedContent.rows.length : 0;
  const linkedColumnSignature = Array.isArray(linkedContent?.columns)
    ? linkedContent.columns
      .map((column) => [
        column?.id || '',
        column?.label || '',
        column?.axis || '',
        column?.units || '',
        column?.type || ''
      ].join(':'))
      .join('|')
    : '';
  const linkedFormulaCount = linkedContent?.formulas && typeof linkedContent.formulas === 'object'
    ? Object.keys(linkedContent.formulas).length
    : 0;
  const entries = traces.map((trace, index) => {
    const x = toVector(trace?.x);
    const y = toVector(trace?.y);
    return [
      trace?.uid || trace?.id || `t${index + 1}`,
      trace?.name || '',
      trace?.meta?.sourcePanelId || '',
      trace?.meta?.xColumnId || '',
      trace?.meta?.columnId || '',
      x.length,
      y.length,
      vectorChecksum(x),
      vectorChecksum(y)
    ].join('|');
  });
  return `${panelId || ''}::${linkedPanelId || ''}::${linkedColumns}:${linkedRows}:${linkedFormulaCount}:${linkedColumnSignature}::${entries.join('||')}`;
};

const buildSyntheticContentFromTraces = (traces, figure = null) => {
  const rowCount = Math.max(
    1,
    ...traces.map((trace) => Math.max(toVector(trace?.x).length, toVector(trace?.y).length))
  );
  const rows = ensureRows([], rowCount);
  const columns = [];
  const xSelections = [];
  const ySelections = [];
  const xColumnByKey = new Map();
  const figureXAxisTitle = readFigureAxisTitle(figure, 'xaxis');
  const figureYAxisTitle = readFigureAxisTitle(figure, 'yaxis');

  traces.forEach((trace, traceIndex) => {
    const xKey = trace?.meta?.xColumnId || `x-${traceIndex + 1}`;
    if (!xColumnByKey.has(xKey)) {
      const xColumnId = `live-x-${xColumnByKey.size + 1}`;
      const xLabel = trace?.meta?.xLabel || figureXAxisTitle || `X ${xColumnByKey.size + 1}`;
      const xUnits = trace?.meta?.xAxisUnits || '';
      xColumnByKey.set(xKey, xColumnId);
      ensureColumn(
        columns,
        xColumnId,
        xLabel,
        xUnits,
        trace?.meta?.xAxisLabel || figureXAxisTitle || xLabel
      );
      xSelections.push(xColumnId);
      writeSeries(rows, xColumnId, trace?.x);
    }

    const yColumnId = `live-y-${traceIndex + 1}`;
    const yLabel = trace?.meta?.columnLabel || getTraceLabel(trace, traceIndex);
    const yUnits = trace?.meta?.yAxisUnits || '';
    ensureColumn(
      columns,
      yColumnId,
      yLabel,
      yUnits,
      trace?.meta?.yAxisLabel || figureYAxisTitle || yLabel
    );
    ySelections.push(yColumnId);
    writeSeries(rows, yColumnId, trace?.y);
  });

  return {
    kind: 'spreadsheet',
    version: 1,
    columns,
    rows,
    formulas: {},
    plot: {
      x: xSelections,
      y: ySelections
    },
    plotMode: 'default',
    plotTargets: ['__new__'],
    plotPreviewHidden: true,
    ui: {
      headerVisibility: {
        ghost: true,
        col: true,
        name: true,
        axis: true,
        units: true,
        formula: true,
        spark: true
      },
      headerRowHeights: {
        ghost: 30,
        col: 30,
        name: 30,
        axis: 30,
        units: 30,
        formula: 30,
        spark: 30
      },
      rowHeight: 20,
      defaultColWidth: 90,
      dataFontSize: 10,
      copyMode: { includeHeaders: true, formatted: false },
      buttonDisplay: 'hover',
      previewMode: 'light'
    },
    meta: {
      workspacePanel: {
        editLocked: false,
        pinned: false
      }
    }
  };
};

const buildLinkedContentFromTraces = (linkedContent, traces, figure = null) => {
  const nextContent = cloneDeep(linkedContent || {});
  nextContent.kind = 'spreadsheet';
  nextContent.version = 1;
  nextContent.columns = Array.isArray(nextContent.columns) ? nextContent.columns : [];
  nextContent.rows = Array.isArray(nextContent.rows) ? nextContent.rows : [];
  nextContent.formulas = nextContent.formulas && typeof nextContent.formulas === 'object'
    ? nextContent.formulas
    : {};

  const maxTraceRows = Math.max(
    0,
    ...traces.map((trace) => Math.max(toVector(trace?.x).length, toVector(trace?.y).length))
  );
  const rowCount = Math.max(1, maxTraceRows, nextContent.rows.length);
  nextContent.rows = ensureRows(nextContent.rows, rowCount);

  const xSelections = new Set();
  const ySelections = new Set();
  const figureXAxisTitle = readFigureAxisTitle(figure, 'xaxis');
  const figureYAxisTitle = readFigureAxisTitle(figure, 'yaxis');

  traces.forEach((trace, traceIndex) => {
    const xColumnId = trace?.meta?.xColumnId || `live-x-${traceIndex + 1}`;
    const yColumnId = trace?.meta?.columnId || `live-y-${traceIndex + 1}`;
    const xLabel = trace?.meta?.xLabel || figureXAxisTitle || `X ${traceIndex + 1}`;
    const yLabel = trace?.meta?.columnLabel || getTraceLabel(trace, traceIndex);
    const xUnits = trace?.meta?.xAxisUnits || '';
    const yUnits = trace?.meta?.yAxisUnits || '';
    const xAxis = trace?.meta?.xAxisLabel || figureXAxisTitle || '';
    const yAxis = trace?.meta?.yAxisLabel || figureYAxisTitle || '';

    ensureColumn(nextContent.columns, xColumnId, xLabel, xUnits, xAxis);
    ensureColumn(nextContent.columns, yColumnId, yLabel, yUnits, yAxis);

    const xColumn = nextContent.columns.find((column) => column?.id === xColumnId);
    if (xColumn) {
      if (xLabel) xColumn.label = xLabel;
      if (xUnits) xColumn.units = xUnits;
      if (xAxis) xColumn.axis = xAxis;
    }
    const yColumn = nextContent.columns.find((column) => column?.id === yColumnId);
    if (yColumn) {
      if (yLabel) yColumn.label = yLabel;
      if (yUnits) yColumn.units = yUnits;
      if (yAxis) yColumn.axis = yAxis;
    }

    writeSeries(nextContent.rows, xColumnId, trace?.x);
    writeSeries(nextContent.rows, yColumnId, trace?.y);

    xSelections.add(xColumnId);
    if (!xSelections.has(yColumnId)) {
      ySelections.add(yColumnId);
    }
  });

  nextContent.plot = {
    x: Array.from(xSelections),
    y: Array.from(ySelections).filter((columnId) => !xSelections.has(columnId))
  };
  nextContent.plotMode = nextContent.plotMode === 'custom' ? 'custom' : 'default';
  nextContent.plotTargets = Array.isArray(nextContent.plotTargets) && nextContent.plotTargets.length
    ? nextContent.plotTargets
    : ['__new__'];
  nextContent.plotPreviewHidden = nextContent.plotPreviewHidden !== false;

  return nextContent;
};

export function createPanelDataTabController({
  dom = {},
  selectors = {},
  actions = {},
  maxRows = DEFAULT_MAX_ROWS
} = {}) {
  void maxRows;
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  if (!documentRoot) return null;

  const getPanelRecord = typeof selectors.getPanelRecord === 'function'
    ? selectors.getPanelRecord
    : () => null;
  const getPanelFigure = typeof selectors.getPanelFigure === 'function'
    ? selectors.getPanelFigure
    : () => ({ data: [], layout: {} });
  const panelSupportsPlot = typeof selectors.panelSupportsPlot === 'function'
    ? selectors.panelSupportsPlot
    : () => true;
  const getPanelContent = typeof selectors.getPanelContent === 'function'
    ? selectors.getPanelContent
    : () => null;
  const setPanelContent = typeof actions.setPanelContent === 'function'
    ? actions.setPanelContent
    : () => {};
  const updatePanelFigure = typeof actions.updatePanelFigure === 'function'
    ? actions.updatePanelFigure
    : () => null;
  const renderPanel = typeof actions.renderPanel === 'function'
    ? actions.renderPanel
    : () => {};
  const persist = typeof actions.persist === 'function'
    ? actions.persist
    : () => {};
  const pushHistory = typeof actions.pushHistory === 'function'
    ? actions.pushHistory
    : () => {};

  const menu = documentRoot.createElement('div');
  menu.className = 'workspace-tech-panel-data-menu workspace-tech-panel-live-menu';

  const header = documentRoot.createElement('div');
  header.className = 'workspace-tech-panel-live-header';
  const title = documentRoot.createElement('div');
  title.className = 'workspace-tech-panel-live-title';
  const meta = documentRoot.createElement('div');
  meta.className = 'workspace-tech-panel-live-meta';
  header.appendChild(title);
  header.appendChild(meta);

  const body = documentRoot.createElement('div');
  body.className = 'workspace-tech-panel-live-body';
  const sheetHost = documentRoot.createElement('div');
  sheetHost.className = 'workspace-tech-panel-data-host';
  const sheetRoot = documentRoot.createElement('div');
  sheetRoot.className = 'workspace-tech-panel-data-root';
  const sheetContent = documentRoot.createElement('div');
  sheetContent.className = 'workspace-tech-panel-data-content';
  sheetRoot.appendChild(sheetContent);
  sheetHost.appendChild(sheetRoot);
  body.appendChild(sheetHost);

  const empty = documentRoot.createElement('div');
  empty.className = 'workspace-tech-panel-live-empty';

  menu.appendChild(body);
  menu.appendChild(empty);

  let activePanelId = null;
  let showOverlays = false;
  let summaryState = { title: 'Data', meta: '' };
  let renderedKey = '';
  let liveSheetHandles = null;
  const contentCache = new Map();

  const syncActiveFigureFromContent = (panelId, content) => {
    if (!panelId || !content || typeof content !== 'object') return false;
    const figure = cloneDeep(getPanelFigure(panelId) || { data: [], layout: {} });
    const traces = Array.isArray(figure?.data) ? figure.data : [];
    if (!traces.length) return false;
    const rows = Array.isArray(content.rows) ? content.rows : [];
    const columns = Array.isArray(content.columns) ? content.columns : [];
    const columnById = new Map(columns.map((column) => [column?.id, column]));
    const fallbackXColumnId = findFallbackXColumnId(content);
    let changed = false;
    const groupedByX = new Map();

    traces.forEach((trace, traceIndex) => {
      if (!trace || typeof trace !== 'object') return;
      const { xColumnId, yColumnId } = resolveTraceColumnIds(trace, traceIndex);
      if (!columnById.has(yColumnId)) return;
      const resolvedXColumnId = columnById.has(xColumnId) ? xColumnId : fallbackXColumnId;
      if (!resolvedXColumnId || !columnById.has(resolvedXColumnId)) return;
      if (!groupedByX.has(resolvedXColumnId)) {
        groupedByX.set(resolvedXColumnId, []);
      }
      const yGroup = groupedByX.get(resolvedXColumnId);
      if (!yGroup.includes(yColumnId)) {
        yGroup.push(yColumnId);
      }

      const series = buildSeriesFromRows(rows, resolvedXColumnId, yColumnId);
      const currentX = toVector(trace.x);
      const currentY = toVector(trace.y);
      if (!valuesEqual(currentX, series.x) || !valuesEqual(currentY, series.y)) {
        trace.x = series.x;
        trace.y = series.y;
        changed = true;
      }

      const yColumn = columnById.get(yColumnId);
      const xColumn = columnById.get(resolvedXColumnId);
      if (yColumn && typeof yColumn.label === 'string') {
        const nextName = yColumn.label.trim() || yColumn.id || trace.name;
        if (nextName && trace.name !== nextName) {
          trace.name = nextName;
          changed = true;
        }
      }
      if (trace.meta && typeof trace.meta === 'object') {
        const xAxisLabel = resolveColumnAxisLabel(xColumn);
        const yAxisLabel = resolveColumnAxisLabel(yColumn);
        const xAxisUnits = sanitizeAxisToken(xColumn?.units);
        const yAxisUnits = sanitizeAxisToken(yColumn?.units);
        const nextMeta = {
          ...trace.meta,
          columnLabel: yColumn?.label || trace.meta.columnLabel || '',
          xLabel: xColumn?.label || trace.meta.xLabel || '',
          xAxisLabel: xAxisLabel || trace.meta.xAxisLabel || '',
          yAxisLabel: yAxisLabel || trace.meta.yAxisLabel || '',
          xAxisUnits: xAxisUnits || trace.meta.xAxisUnits || '',
          yAxisUnits: yAxisUnits || trace.meta.yAxisUnits || '',
          xAxisTitle: composeAxisTitle(xAxisLabel, xAxisUnits),
          yAxisTitle: composeAxisTitle(yAxisLabel, yAxisUnits)
        };
        if (nextMeta.columnLabel !== trace.meta.columnLabel
          || nextMeta.xLabel !== trace.meta.xLabel
          || nextMeta.xAxisLabel !== trace.meta.xAxisLabel
          || nextMeta.yAxisLabel !== trace.meta.yAxisLabel
          || nextMeta.xAxisUnits !== trace.meta.xAxisUnits
          || nextMeta.yAxisUnits !== trace.meta.yAxisUnits
          || nextMeta.xAxisTitle !== trace.meta.xAxisTitle
          || nextMeta.yAxisTitle !== trace.meta.yAxisTitle) {
          trace.meta = nextMeta;
          changed = true;
        }
      }
    });

    const firstGroup = groupedByX.entries().next().value;
    if (firstGroup) {
      const [firstXColumnId, yColumnIds] = firstGroup;
      const xColumn = columnById.get(firstXColumnId) || null;
      const yOwnerColumn = columnById.get(yColumnIds?.[0]) || null;
      const nextXTitle = composeAxisTitle(resolveColumnAxisLabel(xColumn), sanitizeAxisToken(xColumn?.units));
      const nextYTitle = composeAxisTitle(resolveColumnAxisLabel(yOwnerColumn), sanitizeAxisToken(yOwnerColumn?.units));
      const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : {};
      const xAxis = layout.xaxis && typeof layout.xaxis === 'object' ? layout.xaxis : {};
      const yAxis = layout.yaxis && typeof layout.yaxis === 'object' ? layout.yaxis : {};
      const currentXTitle = sanitizeAxisToken(xAxis?.title?.text);
      const currentYTitle = sanitizeAxisToken(yAxis?.title?.text);
      if (nextXTitle !== currentXTitle || nextYTitle !== currentYTitle) {
        figure.layout = {
          ...layout,
          xaxis: {
            ...xAxis,
            title: {
              ...(xAxis.title || {}),
              text: nextXTitle
            }
          },
          yaxis: {
            ...yAxis,
            title: {
              ...(yAxis.title || {}),
              text: nextYTitle
            }
          }
        };
        changed = true;
      }
    }

    if (!changed) return false;
    updatePanelFigure(panelId, figure);
    renderPanel(panelId);
    return true;
  };

  const handleLiveSheetContentChange = (nextContent, options = {}) => {
    const panelId = activePanelId;
    if (!panelId || !nextContent || typeof nextContent !== 'object') return;
    const traces = getGraphTraces(getPanelFigure(panelId) || { data: [] }, { includeOverlays: showOverlays });
    const linkedPanelId = resolveLinkedSpreadsheetId(traces, getPanelRecord);
    const pushToHistory = options.pushHistory !== false;
    const persistChange = options.persistChange !== false;

    if (linkedPanelId) {
      setPanelContent(linkedPanelId, nextContent, {
        pushHistory: pushToHistory,
        persistChange: false
      });
    } else if (pushToHistory) {
      pushHistory({ label: 'Edit Data tab worksheet' });
    }

    const didSync = syncActiveFigureFromContent(panelId, nextContent);
    contentCache.delete(panelId);
    renderedKey = '';

    if (persistChange && (linkedPanelId || didSync)) {
      persist();
    }
  };

  const ensureLiveSheetMounted = () => {
    if (liveSheetHandles) return liveSheetHandles;
    liveSheetHandles = spreadsheetPanelType.mountContent({
      panelId: LIVE_DATA_PANEL_ID,
      panelState: {
        content: buildSyntheticContentFromTraces([])
      },
      rootEl: sheetRoot,
      hostEl: sheetContent,
      actions: {
        setPanelContent: (_panelId, nextContent, options) => {
          handleLiveSheetContentChange(nextContent, options || {});
        },
        handleHeaderAction: () => {}
      },
      selectors: {
        listPlotPanels: () => [],
        getPanelContent: () => null
      }
    });
    return liveSheetHandles;
  };

  const pruneCache = () => {
    while (contentCache.size > MAX_CACHE_ENTRIES) {
      const firstKey = contentCache.keys().next().value;
      if (!firstKey) break;
      contentCache.delete(firstKey);
    }
  };

  const renderEmpty = (message, detail = '') => {
    title.textContent = 'Data';
    meta.textContent = '';
    summaryState = { title: 'Data', meta: '' };
    sheetHost.hidden = true;
    sheetRoot.classList.remove('is-edit-locked');
    empty.hidden = false;
    empty.innerHTML = '';
    const line = documentRoot.createElement('div');
    line.textContent = message;
    empty.appendChild(line);
    if (detail) {
      const sub = documentRoot.createElement('div');
      sub.className = 'workspace-tech-panel-live-empty-sub';
      sub.textContent = detail;
      empty.appendChild(sub);
    }
  };

  const resolveDataState = (panelId) => {
    const figure = getPanelFigure(panelId) || { data: [] };
    const traces = getGraphTraces(figure, { includeOverlays: showOverlays });
    const linkedPanelId = resolveLinkedSpreadsheetId(traces, getPanelRecord);
    const linkedContent = linkedPanelId ? (getPanelContent(linkedPanelId) || getPanelRecord(linkedPanelId)?.content || null) : null;
    const fingerprint = buildFingerprint({ panelId, traces, linkedPanelId, linkedContent });

    const cached = contentCache.get(panelId);
    if (cached && cached.fingerprint === fingerprint) {
      return {
        traces,
        linkedPanelId,
        fingerprint,
        content: cached.content
      };
    }

    const content = linkedPanelId
      ? buildLinkedContentFromTraces(linkedContent, traces, figure)
      : buildSyntheticContentFromTraces(traces, figure);

    contentCache.set(panelId, { fingerprint, content });
    pruneCache();

    return {
      traces,
      linkedPanelId,
      fingerprint,
      content
    };
  };

  const renderActivePanel = () => {
    const panelId = activePanelId;
    if (!panelId) {
      renderEmpty('Select a graph to inspect its data.');
      return;
    }
    if (!panelSupportsPlot(panelId)) {
      renderEmpty('Data tab is available for graph panels only.');
      return;
    }
    const panelRecord = getPanelRecord(panelId);
    const state = resolveDataState(panelId);
    const traces = state.traces;
    const graphLabel = panelRecord?.title || `Graph ${panelRecord?.index || ''}`.trim() || 'Graph';

    title.textContent = graphLabel;
    const linkedRecord = state.linkedPanelId ? getPanelRecord(state.linkedPanelId) : null;
    const linkedName = typeof linkedRecord?.title === 'string' && linkedRecord.title.trim()
      ? linkedRecord.title.trim()
      : 'Worksheet';
    meta.textContent = state.linkedPanelId
      ? `graphed from ${linkedName}*`
      : `${traces.length} trace${traces.length === 1 ? '' : 's'}`;
    summaryState = {
      title: title.textContent || 'Data',
      meta: meta.textContent || ''
    };
    empty.hidden = true;
    empty.innerHTML = '';
    sheetHost.hidden = false;
    sheetRoot.classList.toggle('is-edit-locked', !!state.linkedPanelId);

    if (!traces.length) {
      sheetRoot.classList.remove('is-edit-locked');
      renderEmpty('No traces available in this graph yet.');
      return;
    }

    const nextKey = `${panelId}:${showOverlays ? 'ov:1' : 'ov:0'}:${state.fingerprint}`;
    if (renderedKey === nextKey) return;
    const handles = ensureLiveSheetMounted();
    handles?.refreshContent?.(state.content);
    renderedKey = nextKey;
  };

  return {
    getMenu() {
      return menu;
    },
    getActivePanelId() {
      return activePanelId;
    },
    isShowingOverlays() {
      return showOverlays;
    },
    getHeaderSummary() {
      return { ...summaryState };
    },
    setShowOverlays(next) {
      const active = documentRoot?.activeElement || null;
      if (active && sheetRoot.contains(active) && typeof active.blur === 'function') {
        active.blur();
      }
      showOverlays = next === true;
      renderedKey = '';
      renderActivePanel();
      const nextActive = documentRoot?.activeElement || null;
      if (nextActive && sheetRoot.contains(nextActive) && typeof nextActive.blur === 'function') {
        nextActive.blur();
      }
    },
    handleActivePanelChange(panelId) {
      activePanelId = panelId || null;
      renderedKey = '';
      renderActivePanel();
    },
    handlePanelUpdated(panelId) {
      if (!panelId || panelId !== activePanelId) return;
      renderActivePanel();
    },
    teardown() {
      liveSheetHandles?.dispose?.();
      liveSheetHandles = null;
      contentCache.clear();
      renderedKey = '';
      menu.remove();
      activePanelId = null;
    }
  };
}
