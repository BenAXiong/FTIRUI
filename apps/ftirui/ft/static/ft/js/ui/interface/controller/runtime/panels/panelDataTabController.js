import { traceNameToPlainText } from '../../../../utils/traceName.js';
import { spreadsheetPanelType } from './registry/spreadsheetPanel.js';

const DEFAULT_MAX_ROWS = 300;
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

const ensureColumn = (columns, id, label, units = '') => {
  if (!id) return;
  if (columns.some((column) => column?.id === id)) return;
  columns.push({
    id,
    label: label || '',
    units,
    width: null,
    type: 'number',
    formula: ''
  });
};

const writeSeries = (rows, columnId, values = []) => {
  if (!columnId) return;
  const vector = toVector(values);
  for (let index = 0; index < rows.length; index += 1) {
    rows[index][columnId] = toCellValue(vector[index]);
  }
};

const getGraphTraces = (figure) => {
  const traces = Array.isArray(figure?.data) ? figure.data : [];
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

const buildSyntheticContentFromTraces = (traces, maxRows) => {
  const rowCount = Math.min(
    Math.max(0, ...traces.map((trace) => Math.max(toVector(trace?.x).length, toVector(trace?.y).length))),
    Math.max(1, maxRows)
  );
  const rows = ensureRows([], rowCount);
  const columns = [];
  const xSelections = [];
  const ySelections = [];
  const xColumnByKey = new Map();

  traces.forEach((trace, traceIndex) => {
    const xKey = trace?.meta?.xColumnId || `x-${traceIndex + 1}`;
    if (!xColumnByKey.has(xKey)) {
      const xColumnId = `live-x-${xColumnByKey.size + 1}`;
      const xLabel = trace?.meta?.xLabel || `X ${xColumnByKey.size + 1}`;
      xColumnByKey.set(xKey, xColumnId);
      ensureColumn(columns, xColumnId, xLabel, '');
      xSelections.push(xColumnId);
      writeSeries(rows, xColumnId, trace?.x);
    }

    const yColumnId = `live-y-${traceIndex + 1}`;
    const yLabel = getTraceLabel(trace, traceIndex);
    ensureColumn(columns, yColumnId, yLabel, '');
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
        units: true,
        formula: true,
        spark: true
      },
      headerRowHeights: {
        ghost: 30,
        col: 30,
        name: 30,
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

const buildLinkedContentFromTraces = (linkedContent, traces, maxRows) => {
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
  const rowCount = Math.min(Math.max(maxTraceRows, nextContent.rows.length), Math.max(1, maxRows));
  nextContent.rows = ensureRows(nextContent.rows, rowCount);

  const xSelections = new Set();
  const ySelections = new Set();

  traces.forEach((trace, traceIndex) => {
    const xColumnId = trace?.meta?.xColumnId || `live-x-${traceIndex + 1}`;
    const yColumnId = trace?.meta?.columnId || `live-y-${traceIndex + 1}`;
    const xLabel = trace?.meta?.xLabel || `X ${traceIndex + 1}`;
    const yLabel = trace?.meta?.columnLabel || getTraceLabel(trace, traceIndex);

    ensureColumn(nextContent.columns, xColumnId, xLabel, '');
    ensureColumn(nextContent.columns, yColumnId, yLabel, '');

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
  maxRows = DEFAULT_MAX_ROWS
} = {}) {
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

  menu.appendChild(header);
  menu.appendChild(body);
  menu.appendChild(empty);

  let activePanelId = null;
  let renderedKey = '';
  let liveSheetHandles = null;
  const contentCache = new Map();

  const ensureLiveSheetMounted = () => {
    if (liveSheetHandles) return liveSheetHandles;
    liveSheetHandles = spreadsheetPanelType.mountContent({
      panelId: LIVE_DATA_PANEL_ID,
      panelState: {
        content: buildSyntheticContentFromTraces([], maxRows)
      },
      rootEl: sheetRoot,
      hostEl: sheetContent,
      actions: {
        setPanelContent: () => {},
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
    sheetHost.hidden = true;
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
    const traces = getGraphTraces(figure);
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
      ? buildLinkedContentFromTraces(linkedContent, traces, maxRows)
      : buildSyntheticContentFromTraces(traces, maxRows);

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
    meta.textContent = state.linkedPanelId
      ? `${traces.length} trace${traces.length === 1 ? '' : 's'} - linked worksheet`
      : `${traces.length} trace${traces.length === 1 ? '' : 's'} - live view`;
    empty.hidden = true;
    empty.innerHTML = '';
    sheetHost.hidden = false;

    if (!traces.length) {
      renderEmpty('No traces available in this graph yet.');
      return;
    }

    const nextKey = `${panelId}:${state.fingerprint}`;
    if (renderedKey === nextKey) return;
    const handles = ensureLiveSheetMounted();
    handles?.refreshContent?.(state.content);
    renderedKey = nextKey;
  };

  return {
    getMenu() {
      return menu;
    },
    handleActivePanelChange(panelId) {
      activePanelId = panelId || null;
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
