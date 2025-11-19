import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const SHEET_KIND = 'spreadsheet';
const CURRENT_VERSION = 1;
const DEFAULT_COLUMN_COUNT = 3;
const DEFAULT_ROW_COUNT = 8;
const FOCUS_DELAY = 20;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toColumnLabel = (index = 0) => {
  if (index < LETTERS.length) {
    return `Col ${LETTERS[index]}`;
  }
  const first = Math.floor(index / LETTERS.length) - 1;
  const second = index % LETTERS.length;
  return `Col ${LETTERS[first]}${LETTERS[second]}`;
};

const sanitizeString = (value, fallback = '') => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
};

const sanitizeNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
};

const createDebounce = (fn, delay = 400) => {
  let handle = null;
  const wrapped = (...args) => {
    if (handle) clearTimeout(handle);
    handle = setTimeout(() => {
      handle = null;
      fn(...args);
    }, delay);
  };
  wrapped.flush = (...args) => {
    if (handle) {
      clearTimeout(handle);
      handle = null;
      fn(...args);
    }
  };
  return wrapped;
};

const generateId = (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const createColumnId = (index) => `col-${index + 1}`;
const createRowId = (index) => `row-${index + 1}`;

const normalizeColumns = (value) => {
  const incoming = Array.isArray(value) ? value : [];
  const next = incoming.length ? incoming : Array.from({ length: DEFAULT_COLUMN_COUNT }, (_, idx) => ({
    id: createColumnId(idx),
    label: toColumnLabel(idx)
  }));
  const seenIds = new Set();
  return next.map((column, index) => {
    const normalizedId = sanitizeString(column?.id, createColumnId(index));
    const uniqueId = seenIds.has(normalizedId)
      ? `${normalizedId}-${index + 1}`
      : normalizedId;
    seenIds.add(uniqueId);
    return {
      id: uniqueId,
      label: sanitizeString(column?.label, toColumnLabel(index)),
      type: column?.type === 'text' ? 'text' : 'number',
      formula: sanitizeString(column?.formula ?? '', '')
    };
  });
};

const normalizeRows = (rows, columns) => {
  const incoming = Array.isArray(rows) ? rows : [];
  const columnIds = columns.map((col) => col.id);
  const next = incoming.length
    ? incoming
    : Array.from({ length: DEFAULT_ROW_COUNT }, (_, idx) => ({ id: createRowId(idx) }));
  return next.map((row, index) => {
    const rowId = sanitizeString(row?.id, createRowId(index));
    const normalized = { id: rowId };
    columnIds.forEach((colId) => {
      const raw = row?.[colId];
      const numeric = sanitizeNumber(raw);
      normalized[colId] = numeric ?? (typeof raw === 'string' ? raw : '');
    });
    return normalized;
  });
};

const normalizeFormulas = (formulas, columns) => {
  const incoming = formulas && typeof formulas === 'object'
    ? formulas
    : {};
  const normalized = {};
  columns.forEach((column) => {
    const raw = incoming[column.id];
    normalized[column.id] = typeof raw === 'string' ? raw.trim() : '';
  });
  return normalized;
};

const normalizeSpreadsheet = (value = {}) => {
  const columns = normalizeColumns(value?.columns);
  const rows = normalizeRows(value?.rows, columns);
  const formulas = normalizeFormulas(value?.formulas, columns);
  return {
    kind: SHEET_KIND,
    version: CURRENT_VERSION,
    columns,
    rows,
    formulas
  };
};

const buildContent = (value = {}) => normalizeSpreadsheet(value);

registerContentKind(SHEET_KIND, {
  normalize(value) {
    return normalizeSpreadsheet(value);
  },
  serialize(value) {
    return normalizeSpreadsheet(value);
  }
});

export const spreadsheetPanelType = {
  id: 'spreadsheet',
  label: 'Spreadsheet',
  capabilities: {
    plot: false
  },
  panelClass: 'workspace-panel--spreadsheet',
  getDefaultTitle() {
    return 'Spreadsheet';
  },
  prepareInitialState(incomingState = {}) {
    const existing = incomingState.content;
    return {
      content: buildContent(existing)
    };
  },
  mountContent({ panelId, panelState = {}, hostEl, actions = {}, selectors = {} }) {
    if (!hostEl) return { plotEl: null };
    hostEl.classList.add('workspace-panel-plot--spreadsheet');
    hostEl.innerHTML = '';

    const safeGetContent = typeof selectors.getPanelContent === 'function'
      ? selectors.getPanelContent
      : () => null;
    const safeSetContent = typeof actions.setPanelContent === 'function'
      ? actions.setPanelContent
      : () => {};
    const safeHandleHeaderAction = typeof actions.handleHeaderAction === 'function'
      ? actions.handleHeaderAction
      : () => {};
    const safeListPlotPanels = typeof selectors.listPlotPanels === 'function'
      ? selectors.listPlotPanels
      : () => [];
    const notify = (message, variant = 'warning') => {
      if (typeof window?.showAppToast === 'function') {
        window.showAppToast({ message, variant });
      }
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'workspace-spreadsheet-panel';

    const toolbar = document.createElement('div');
    toolbar.className = 'workspace-spreadsheet-toolbar';

    const toolbarActions = document.createElement('div');
    toolbarActions.className = 'workspace-spreadsheet-toolbar-actions';

    const toolbarHint = document.createElement('div');
    toolbarHint.className = 'workspace-spreadsheet-toolbar-hint';
    toolbarHint.innerHTML = `
      <span class="fw-semibold d-block">Quick tips</span>
      <span>Paste from Excel/CSV with <kbd>Ctrl/Cmd + V</kbd>. Double-click headers to rename.</span>
    `;

    toolbar.appendChild(toolbarActions);
    toolbar.appendChild(toolbarHint);

    const gridScroll = document.createElement('div');
    gridScroll.className = 'workspace-spreadsheet-grid-scroll';

    const table = document.createElement('table');
    table.className = 'workspace-spreadsheet-grid';
    gridScroll.appendChild(table);

    const plotControls = document.createElement('div');
    plotControls.className = 'workspace-spreadsheet-plot-controls';

    const axisControls = document.createElement('div');
    axisControls.className = 'workspace-spreadsheet-axis-controls';

    const xGroup = document.createElement('div');
    xGroup.className = 'workspace-spreadsheet-axis-group';
    const xLabel = document.createElement('div');
    xLabel.className = 'workspace-spreadsheet-axis-label';
    xLabel.textContent = 'X axis';
    const xSelect = document.createElement('select');
    xSelect.className = 'form-select form-select-sm workspace-spreadsheet-axis-select';
    xGroup.appendChild(xLabel);
    xGroup.appendChild(xSelect);

    const yGroup = document.createElement('div');
    yGroup.className = 'workspace-spreadsheet-axis-group';
    const yLabel = document.createElement('div');
    yLabel.className = 'workspace-spreadsheet-axis-label';
    yLabel.textContent = 'Y series';
    const yList = document.createElement('div');
    yList.className = 'workspace-spreadsheet-y-list';
    yGroup.appendChild(yLabel);
    yGroup.appendChild(yList);

    axisControls.appendChild(xGroup);
    axisControls.appendChild(yGroup);

    const targetControls = document.createElement('div');
    targetControls.className = 'workspace-spreadsheet-target-controls';
    const targetLabel = document.createElement('div');
    targetLabel.className = 'workspace-spreadsheet-axis-label';
    targetLabel.textContent = 'Add data to';
    const graphTargets = document.createElement('div');
    graphTargets.className = 'workspace-spreadsheet-target-list';
    const plotExistingBtn = document.createElement('button');
    plotExistingBtn.type = 'button';
    plotExistingBtn.className = 'btn btn-primary btn-sm workspace-spreadsheet-plot-btn';
    plotExistingBtn.textContent = 'Add to graph(s)';
    targetControls.appendChild(targetLabel);
    targetControls.appendChild(graphTargets);
    targetControls.appendChild(plotExistingBtn);

    plotControls.appendChild(axisControls);
    plotControls.appendChild(targetControls);

    wrapper.appendChild(toolbar);
    wrapper.appendChild(gridScroll);
    wrapper.appendChild(plotControls);
    hostEl.appendChild(wrapper);

    const parseClipboardMatrix = (text = '') => {
      if (!text) return [];
      const cleaned = text.replace(/\r/g, '');
      const lines = cleaned.split('\n').filter((line, index, arr) => {
        if (line.trim() !== '') return true;
        return index !== arr.length - 1;
      });
      return lines.map((line) => line.split('\t'));
    };

    const createBlankRow = (columns) => {
      const row = { id: generateId('row') };
      columns.forEach((column) => {
        row[column.id] = '';
      });
      return row;
    };

    const initialContent = safeGetContent(panelId) ?? panelState.content;
    let sheetState = buildContent(initialContent);
    let historyPending = false;
    let activeRowIndex = null;
    let activeColumnIndex = null;
    let lastFocusedCell = null;
    let selectedXColumnId = sheetState.columns[0]?.id || null;
    let selectedYColumnIds = new Set(
      sheetState.columns
        .filter((column) => column.id !== selectedXColumnId)
        .slice(0, 1)
        .map((column) => column.id)
    );
    let targetGraphSelections = new Set();

    const schedulePersist = createDebounce(() => {
      const payload = buildContent(sheetState);
      const shouldPush = historyPending;
      historyPending = false;
      safeSetContent(panelId, payload, { pushHistory: shouldPush });
    }, 650);

    const markDirty = () => {
      historyPending = true;
      schedulePersist();
    };

    const getColumnById = (columnId) => sheetState.columns.find((column) => column.id === columnId) || null;
    const sanitizeCellValue = (value) => {
      if (value === null || typeof value === 'undefined') return null;
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : trimmed;
      }
      return value;
    };

    const ensureSelectionIntegrity = () => {
      const columnIds = sheetState.columns.map((column) => column.id);
      if (!columnIds.length) {
        selectedXColumnId = null;
        selectedYColumnIds.clear();
        return;
      }
      if (!selectedXColumnId || !columnIds.includes(selectedXColumnId)) {
        selectedXColumnId = columnIds[0];
      }
      const nextY = new Set(
        [...selectedYColumnIds]
          .filter((columnId) => columnId !== selectedXColumnId && columnIds.includes(columnId))
      );
      if (!nextY.size) {
        const fallback = sheetState.columns.find((column) => column.id !== selectedXColumnId);
        if (fallback) {
          nextY.add(fallback.id);
        }
      }
      selectedYColumnIds = nextY;
    };

    const canPlot = () => Boolean(selectedXColumnId && selectedYColumnIds.size && sheetState.rows.length);

    const buildTracePayloads = () => {
      const xColumn = getColumnById(selectedXColumnId);
      if (!xColumn) return [];
      const yColumns = sheetState.columns.filter((column) => selectedYColumnIds.has(column.id));
      if (!yColumns.length) return [];
      const xValues = sheetState.rows.map((row) => sanitizeCellValue(row[xColumn.id]));
      return yColumns.map((column) => {
        const yValues = sheetState.rows.map((row) => sanitizeCellValue(row[column.id]));
        const hasData = yValues.some((value) => value !== null && value !== '');
        if (!hasData) return null;
        return {
          name: column.label || column.id,
          x: xValues,
          y: yValues,
          meta: {
            sourcePanelId: panelId,
            columnId: column.id,
            columnLabel: column.label || '',
            xLabel: xColumn.label || ''
          }
        };
      }).filter(Boolean);
    };

    const handlePlotRequest = () => {
      const traces = buildTracePayloads();
      if (!traces.length) {
        notify?.('Select at least one populated column to plot.');
        return;
      }
      const targets = Array.from(targetGraphSelections);
      if (!targets.length) {
        notify?.('Select at least one graph destination.');
        return;
      }
      targets.forEach((targetId) => {
        safeHandleHeaderAction(panelId, 'spreadsheet-plot-columns', {
          traces,
          mode: targetId === '__new__' ? 'new' : 'existing',
          targetPanelId: targetId === '__new__' ? null : targetId
        });
      });
    };

    const updatePlotButtonsState = () => {
      const ready = canPlot();
      const hasTarget = targetGraphSelections.size > 0;
      plotExistingBtn.disabled = !ready || !hasTarget;
    };

    const renderYAxisOptions = () => {
      yList.innerHTML = '';
      let rendered = 0;
      sheetState.columns.forEach((column, columnIndex) => {
        if (column.id === selectedXColumnId) return;
        const option = document.createElement('label');
        option.className = 'workspace-spreadsheet-y-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.value = column.id;
        checkbox.checked = selectedYColumnIds.has(column.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectedYColumnIds.add(column.id);
          } else if (selectedYColumnIds.size > 1) {
            selectedYColumnIds.delete(column.id);
          } else {
            checkbox.checked = true;
            return;
          }
          renderYAxisOptions();
          updatePlotButtonsState();
        });
        const label = document.createElement('span');
        label.textContent = column.label || toColumnLabel(columnIndex);
        option.appendChild(checkbox);
        option.appendChild(label);
        yList.appendChild(option);
        rendered += 1;
      });
      if (!rendered) {
        const empty = document.createElement('div');
        empty.className = 'workspace-spreadsheet-y-empty';
        empty.textContent = 'Add another column to plot Y data.';
        yList.appendChild(empty);
      }
    };

    const renderAxisControls = () => {
      ensureSelectionIntegrity();
      xSelect.innerHTML = '';
      sheetState.columns.forEach((column, columnIndex) => {
        const option = document.createElement('option');
        option.value = column.id;
        option.textContent = column.label || toColumnLabel(columnIndex);
        xSelect.appendChild(option);
      });
      if (selectedXColumnId) {
        xSelect.value = selectedXColumnId;
      }
      renderYAxisOptions();
    };

    const refreshPlotControls = () => {
      renderAxisControls();
      updatePlotButtonsState();
    };

    const refreshGraphOptions = () => {
      const graphs = safeListPlotPanels()
        .filter((graph) => graph && graph.id && graph.id !== panelId);
      const previous = new Set(targetGraphSelections);
      targetGraphSelections.clear();
      graphTargets.innerHTML = '';

      const buildTargetOption = (label, value, checked) => {
        const option = document.createElement('label');
        option.className = 'workspace-spreadsheet-target-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.value = value;
        checkbox.checked = checked;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            targetGraphSelections.add(value);
          } else {
            targetGraphSelections.delete(value);
          }
          updatePlotButtonsState();
        });
        const text = document.createElement('span');
        text.textContent = label;
        option.appendChild(checkbox);
        option.appendChild(text);
        return option;
      };

      const autoSeedGraphs = [];
      if (graphs.length) {
        autoSeedGraphs.push(graphs[0].id);
      }
      autoSeedGraphs.push('__new__');

      const resolvedSet = previous.size ? previous : new Set(autoSeedGraphs);
      const nextValues = new Set();

      const newOption = buildTargetOption('New graph', '__new__', resolvedSet.has('__new__'));
      if (resolvedSet.has('__new__')) {
        nextValues.add('__new__');
      }
      graphTargets.appendChild(newOption);

      if (graphs.length) {
        graphs.forEach((graph) => {
          const checked = resolvedSet.has(graph.id);
          if (checked) {
            nextValues.add(graph.id);
          }
          graphTargets.appendChild(buildTargetOption(graph.title || `Graph ${graph.index || ''}`.trim(), graph.id, checked));
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'workspace-spreadsheet-y-empty';
        empty.textContent = 'No graphs on canvas yet.';
        graphTargets.appendChild(empty);
      }

      targetGraphSelections = nextValues;
      updatePlotButtonsState();
    };

    const updateToolbarState = () => {
      removeColumnBtn.disabled = sheetState.columns.length <= 1;
      removeRowBtn.disabled = sheetState.rows.length <= 1;
    };

    const focusCell = (rowIndex, columnIndex, { selectAll = false } = {}) => {
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
      const selector = `[data-row-index="${rowIndex}"][data-col-index="${columnIndex}"]`;
      const input = table.querySelector(selector);
      if (!input) return;
      setTimeout(() => {
        input.focus();
        if (selectAll) {
          input.select();
        }
      }, FOCUS_DELAY);
    };

    const syncActiveHighlights = () => {
      table.querySelectorAll('[data-column-index]').forEach((node) => {
        const index = Number(node.dataset.columnIndex);
        node.classList.toggle('is-active', index === activeColumnIndex);
      });
      table.querySelectorAll('[data-row-header-index]').forEach((node) => {
        const index = Number(node.dataset.rowHeaderIndex);
        node.classList.toggle('is-active', index === activeRowIndex);
      });
    };

    const renameColumn = (columnIndex) => {
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const nextLabel = window.prompt('Column name', column.label) ?? '';
      const trimmed = nextLabel.trim();
      if (!trimmed || trimmed === column.label) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, label: trimmed };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
      renderGrid();
    };

    const handleCellInput = (event) => {
      const input = event.currentTarget;
      const rowIndex = Number(input.dataset.rowIndex);
      const columnId = input.dataset.colId;
      if (!Number.isInteger(rowIndex) || !columnId) return;
      const rows = sheetState.rows.slice();
      const targetRow = rows[rowIndex];
      if (!targetRow) return;
      if (targetRow[columnId] === input.value) return;
      rows[rowIndex] = { ...targetRow, [columnId]: input.value };
      sheetState = { ...sheetState, rows };
      markDirty();
    };

    const ensureRowCapacity = (count) => {
      if (sheetState.rows.length >= count) return;
      const rows = sheetState.rows.slice();
      while (rows.length < count) {
        rows.push(createBlankRow(sheetState.columns));
      }
      sheetState = { ...sheetState, rows };
    };

    const handleCellPaste = (event, rowIndex, columnIndex) => {
      const clipboardText = event.clipboardData?.getData('text/plain');
      if (!clipboardText || (!clipboardText.includes('\t') && !clipboardText.includes('\n'))) {
        return;
      }
      event.preventDefault();
      const matrix = parseClipboardMatrix(clipboardText);
      if (!matrix.length) return;
      ensureRowCapacity(rowIndex + matrix.length);
      const rows = sheetState.rows.slice();
      matrix.forEach((rowValues, rowOffset) => {
        const targetRowIndex = rowIndex + rowOffset;
        if (!rows[targetRowIndex]) return;
        const nextRow = { ...rows[targetRowIndex] };
        rowValues.forEach((value, colOffset) => {
          const column = sheetState.columns[columnIndex + colOffset];
          if (!column) return;
          nextRow[column.id] = value;
        });
        rows[targetRowIndex] = nextRow;
      });
      sheetState = { ...sheetState, rows };
      markDirty();
      renderGrid();
      lastFocusedCell = { rowIndex, columnIndex };
      focusCell(rowIndex, columnIndex);
    };

    const moveFocus = (rowIndex, columnIndex) => {
      const clampedRow = Math.max(0, Math.min(sheetState.rows.length - 1, rowIndex));
      const clampedCol = Math.max(0, Math.min(sheetState.columns.length - 1, columnIndex));
      focusCell(clampedRow, clampedCol);
    };

    const handleCellKeydown = (event, rowIndex, columnIndex) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        moveFocus(rowIndex + (event.shiftKey ? -1 : 1), columnIndex);
      }
    };

    const handleHeaderClick = (index) => {
      activeColumnIndex = index;
      syncActiveHighlights();
    };

    const handleRowHeaderClick = (index) => {
      activeRowIndex = index;
      syncActiveHighlights();
    };

    const renderGrid = () => {
      table.innerHTML = '';
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');
      const corner = document.createElement('th');
      corner.className = 'workspace-spreadsheet-corner';
      corner.textContent = '#';
      headerRow.appendChild(corner);

      sheetState.columns.forEach((column, columnIndex) => {
        const th = document.createElement('th');
        th.className = 'workspace-spreadsheet-column-header';
        th.dataset.columnIndex = String(columnIndex);

        const nameBtn = document.createElement('button');
        nameBtn.type = 'button';
        nameBtn.className = 'workspace-spreadsheet-column-name';
        nameBtn.textContent = column.label || toColumnLabel(columnIndex);
        nameBtn.title = 'Double-click to rename column';
        nameBtn.addEventListener('click', () => handleHeaderClick(columnIndex));
        nameBtn.addEventListener('dblclick', (evt) => {
          evt.stopPropagation();
          renameColumn(columnIndex);
        });

        th.appendChild(nameBtn);
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);

      const tbody = document.createElement('tbody');
      sheetState.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');

        const rowHeader = document.createElement('th');
        rowHeader.className = 'workspace-spreadsheet-row-header';
        rowHeader.dataset.rowHeaderIndex = String(rowIndex);
        rowHeader.title = 'Select row';
        rowHeader.innerHTML = `<span>${rowIndex + 1}</span>`;
        rowHeader.addEventListener('click', () => handleRowHeaderClick(rowIndex));
        tr.appendChild(rowHeader);

        sheetState.columns.forEach((column, columnIndex) => {
          const td = document.createElement('td');
          td.className = 'workspace-spreadsheet-cell-wrapper';
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'workspace-spreadsheet-cell';
          input.value = row[column.id] ?? '';
          input.dataset.rowId = row.id;
          input.dataset.colId = column.id;
          input.dataset.rowIndex = String(rowIndex);
          input.dataset.colIndex = String(columnIndex);
          input.addEventListener('focus', () => {
            activeRowIndex = rowIndex;
            activeColumnIndex = columnIndex;
            lastFocusedCell = {
              rowIndex,
              columnIndex
            };
            syncActiveHighlights();
          });
          input.addEventListener('input', handleCellInput);
          input.addEventListener('paste', (event) => handleCellPaste(event, rowIndex, columnIndex));
          input.addEventListener('keydown', (event) => handleCellKeydown(event, rowIndex, columnIndex));
          td.appendChild(input);
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      table.appendChild(thead);
      table.appendChild(tbody);

      refreshPlotControls();
      updateToolbarState();
      requestAnimationFrame(() => {
        syncActiveHighlights();
        if (lastFocusedCell) {
          focusCell(lastFocusedCell.rowIndex, lastFocusedCell.columnIndex);
        }
      });
    };

    const handleAddColumn = () => {
      const insertIndex = Number.isInteger(activeColumnIndex)
        ? activeColumnIndex + 1
        : sheetState.columns.length;
      const label = toColumnLabel(sheetState.columns.length);
      const newColumn = {
        id: generateId('col'),
        label,
        type: 'number',
        formula: ''
      };
      const nextColumns = sheetState.columns.slice();
      nextColumns.splice(insertIndex, 0, newColumn);
      const nextRows = sheetState.rows.map((row) => ({
        ...row,
        [newColumn.id]: ''
      }));
      const nextFormulas = { ...sheetState.formulas, [newColumn.id]: '' };
      sheetState = { ...sheetState, columns: nextColumns, rows: nextRows, formulas: nextFormulas };
      activeColumnIndex = insertIndex;
      markDirty();
      renderGrid();
    };

    const handleRemoveColumn = () => {
      if (sheetState.columns.length <= 1) return;
      const targetIndex = Number.isInteger(activeColumnIndex)
        ? Math.max(0, Math.min(activeColumnIndex, sheetState.columns.length - 1))
        : sheetState.columns.length - 1;
      const column = sheetState.columns[targetIndex];
      if (!column) return;
      const nextColumns = sheetState.columns.filter((_, idx) => idx !== targetIndex);
      const nextRows = sheetState.rows.map((row) => {
        const { [column.id]: omit, ...rest } = row;
        return rest;
      });
      const nextFormulas = { ...sheetState.formulas };
      delete nextFormulas[column.id];
      sheetState = { ...sheetState, columns: nextColumns, rows: nextRows, formulas: nextFormulas };
      activeColumnIndex = Math.min(targetIndex, nextColumns.length - 1);
      markDirty();
      renderGrid();
    };

    const handleAddRow = () => {
      const insertIndex = Number.isInteger(activeRowIndex)
        ? activeRowIndex + 1
        : sheetState.rows.length;
      const nextRows = sheetState.rows.slice();
      nextRows.splice(insertIndex, 0, createBlankRow(sheetState.columns));
      sheetState = { ...sheetState, rows: nextRows };
      activeRowIndex = insertIndex;
      markDirty();
      renderGrid();
    };

    const handleRemoveRow = () => {
      if (sheetState.rows.length <= 1) return;
      const targetIndex = Number.isInteger(activeRowIndex)
        ? Math.max(0, Math.min(activeRowIndex, sheetState.rows.length - 1))
        : sheetState.rows.length - 1;
      const nextRows = sheetState.rows.filter((_, idx) => idx !== targetIndex);
      sheetState = { ...sheetState, rows: nextRows };
      activeRowIndex = Math.min(targetIndex, nextRows.length - 1);
      markDirty();
      renderGrid();
    };

    const createToolbarButton = ({ label, icon, title, onClick }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary btn-sm workspace-spreadsheet-toolbar-btn';
      btn.innerHTML = icon
        ? `<i class="bi ${icon}"></i><span>${label}</span>`
        : label;
      btn.title = title || label;
      btn.addEventListener('click', onClick);
      return btn;
    };

    const addColumnBtn = createToolbarButton({
      label: 'Add column',
      icon: 'bi-plus-lg',
      title: 'Insert a column after the current selection',
      onClick: handleAddColumn
    });
    const addRowBtn = createToolbarButton({
      label: 'Add row',
      icon: 'bi-plus-lg',
      title: 'Insert a row after the current selection',
      onClick: handleAddRow
    });
    const removeColumnBtn = createToolbarButton({
      label: 'Delete column',
      icon: 'bi-dash-lg',
      title: 'Remove the selected column',
      onClick: handleRemoveColumn
    });
    const removeRowBtn = createToolbarButton({
      label: 'Delete row',
      icon: 'bi-dash-lg',
      title: 'Remove the selected row',
      onClick: handleRemoveRow
    });

    toolbarActions.appendChild(addColumnBtn);
    toolbarActions.appendChild(addRowBtn);
    toolbarActions.appendChild(removeColumnBtn);
    toolbarActions.appendChild(removeRowBtn);

    xSelect.addEventListener('change', () => {
      selectedXColumnId = xSelect.value || null;
      if (selectedXColumnId && selectedYColumnIds.has(selectedXColumnId)) {
        selectedYColumnIds.delete(selectedXColumnId);
      }
      if (!selectedYColumnIds.size) {
        const fallback = sheetState.columns.find((column) => column.id !== selectedXColumnId);
        if (fallback) {
          selectedYColumnIds.add(fallback.id);
        }
      }
      refreshPlotControls();
    });
    plotExistingBtn.addEventListener('click', () => handlePlotRequest());

    renderGrid();
    refreshGraphOptions();
    updatePlotButtonsState();

    return {
      plotEl: null,
      refreshContent(nextContent) {
        if (!nextContent || typeof nextContent !== 'object') return;
        sheetState = buildContent(nextContent);
        historyPending = false;
        schedulePersist.flush();
        renderGrid();
        refreshGraphOptions();
        updatePlotButtonsState();
      }
    };
  }
};
