import { traceNameToPlainText } from '../../../../utils/traceName.js';

const DEFAULT_MAX_ROWS = 300;

const toVector = (value) => {
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value) && typeof value.length === 'number') {
    return Array.from(value);
  }
  return [];
};

const formatValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    if (Object.is(value, -0)) return '0';
    if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
      return value.toExponential(4);
    }
    return Number.parseFloat(value.toFixed(6)).toString();
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
};

const getTraceLabel = (trace, index) => {
  const raw = trace?.name || trace?.filename || trace?.id || `Trace ${index + 1}`;
  return traceNameToPlainText(raw, { lineBreak: ' / ' }) || `Trace ${index + 1}`;
};

const getRowCount = (xValues, yValues) => Math.max(xValues.length, yValues.length);

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

  const empty = documentRoot.createElement('div');
  empty.className = 'workspace-tech-panel-live-empty';

  menu.appendChild(header);
  menu.appendChild(body);
  menu.appendChild(empty);

  let activePanelId = null;

  const renderEmpty = (message, detail = '') => {
    title.textContent = 'Data';
    meta.textContent = '';
    body.innerHTML = '';
    empty.hidden = false;
    empty.textContent = message;
    if (detail) {
      const sub = documentRoot.createElement('div');
      sub.className = 'workspace-tech-panel-live-empty-sub';
      sub.textContent = detail;
      empty.appendChild(sub);
    }
  };

  const renderTraceTable = (trace, traceIndex) => {
    const section = documentRoot.createElement('section');
    section.className = 'workspace-tech-panel-live-trace';

    const sectionHeader = documentRoot.createElement('div');
    sectionHeader.className = 'workspace-tech-panel-live-trace-header';
    const traceTitle = documentRoot.createElement('div');
    traceTitle.className = 'workspace-tech-panel-live-trace-title';
    traceTitle.textContent = getTraceLabel(trace, traceIndex);
    const traceMeta = documentRoot.createElement('div');
    traceMeta.className = 'workspace-tech-panel-live-trace-meta';

    const xValues = toVector(trace?.x);
    const yValues = toVector(trace?.y);
    const rowCount = getRowCount(xValues, yValues);
    const displayedRows = Math.min(rowCount, Math.max(1, maxRows));
    traceMeta.textContent = `${rowCount} row${rowCount === 1 ? '' : 's'}`;

    sectionHeader.appendChild(traceTitle);
    sectionHeader.appendChild(traceMeta);
    section.appendChild(sectionHeader);

    if (!rowCount) {
      const noData = documentRoot.createElement('div');
      noData.className = 'workspace-tech-panel-live-trace-empty';
      noData.textContent = 'No numeric x/y data for this trace.';
      section.appendChild(noData);
      return section;
    }

    const tableWrap = documentRoot.createElement('div');
    tableWrap.className = 'workspace-tech-panel-live-table-wrap';
    const table = documentRoot.createElement('table');
    table.className = 'workspace-tech-panel-live-table';

    const thead = documentRoot.createElement('thead');
    const headRow = documentRoot.createElement('tr');
    ['#', 'X', 'Y'].forEach((label) => {
      const th = documentRoot.createElement('th');
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = documentRoot.createElement('tbody');
    for (let i = 0; i < displayedRows; i += 1) {
      const tr = documentRoot.createElement('tr');
      const idxCell = documentRoot.createElement('td');
      idxCell.textContent = String(i + 1);
      const xCell = documentRoot.createElement('td');
      const yCell = documentRoot.createElement('td');
      const xRaw = xValues.length ? xValues[i] : i;
      const yRaw = yValues.length ? yValues[i] : '';
      xCell.textContent = formatValue(xRaw);
      yCell.textContent = formatValue(yRaw);
      tr.appendChild(idxCell);
      tr.appendChild(xCell);
      tr.appendChild(yCell);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);

    if (displayedRows < rowCount) {
      const truncation = documentRoot.createElement('div');
      truncation.className = 'workspace-tech-panel-live-trace-truncated';
      truncation.textContent = `Showing first ${displayedRows} rows.`;
      section.appendChild(truncation);
    }

    return section;
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
    const figure = getPanelFigure(panelId) || { data: [] };
    const traces = Array.isArray(figure.data) ? figure.data : [];
    const graphLabel = panelRecord?.title || `Graph ${panelRecord?.index || ''}`.trim() || 'Graph';

    title.textContent = graphLabel;
    meta.textContent = `${traces.length} trace${traces.length === 1 ? '' : 's'}`;
    body.innerHTML = '';
    empty.hidden = true;
    empty.textContent = '';

    if (!traces.length) {
      renderEmpty('No traces available in this graph yet.');
      return;
    }

    traces.forEach((trace, index) => {
      body.appendChild(renderTraceTable(trace, index));
    });
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
      menu.remove();
      activePanelId = null;
    }
  };
}

