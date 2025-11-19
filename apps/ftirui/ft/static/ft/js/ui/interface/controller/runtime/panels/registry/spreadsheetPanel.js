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

    wrapper.appendChild(toolbar);
    wrapper.appendChild(gridScroll);
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

    renderGrid();

    return {
      plotEl: null,
      refreshContent(nextContent) {
        if (!nextContent || typeof nextContent !== 'object') return;
        sheetState = buildContent(nextContent);
        historyPending = false;
        schedulePersist.flush();
        renderGrid();
      }
    };
  }
};
