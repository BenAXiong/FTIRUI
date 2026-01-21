import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const SHEET_KIND = 'spreadsheet';
const CURRENT_VERSION = 1;
const DEFAULT_COLUMN_COUNT = 3;
const DEFAULT_ROW_COUNT = 8;
const FOCUS_DELAY = 20;
const MAX_DECIMAL_PLACES = 5;
const HEADER_ROW_HEIGHT = 30;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const toColumnLabel = (index = 0) => {
  if (index < LETTERS.length) {
    return `Col ${LETTERS[index]}`;
  }
  const first = Math.floor(index / LETTERS.length) - 1;
  const second = index % LETTERS.length;
  return `Col ${LETTERS[first]}${LETTERS[second]}`;
};
const toColumnShortLabel = (index = 0) => toColumnLabel(index).replace(/^Col\s+/i, '');

const sanitizeString = (value, fallback = '') => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
};

const limitNumericPrecision = (value, places = MAX_DECIMAL_PLACES) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const safePlaces = Number.isInteger(places) && places >= 0 ? places : MAX_DECIMAL_PLACES;
  if (!safePlaces) return value;
  const factor = 10 ** safePlaces;
  return Math.round(value * factor) / factor;
};

const sanitizeNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return limitNumericPrecision(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return limitNumericPrecision(numeric);
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
const columnTokenForIndex = (index = 0) => {
  if (index < LETTERS.length) {
    return `col${LETTERS[index]}`;
  }
  const first = Math.floor(index / LETTERS.length) - 1;
  const second = index % LETTERS.length;
  return `col${LETTERS[first]}${LETTERS[second]}`;
};
const slugifyLabel = (label = '') => label
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .replace(/_{2,}/g, '_');

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
      units: sanitizeString(column?.units ?? '', ''),
      width: Number.isFinite(Number(column?.width)) ? Math.max(80, Math.round(Number(column?.width))) : null,
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
    let freezeEnabled = true;
    const setFreezeEnabled = (isEnabled) => {
      freezeEnabled = Boolean(isEnabled);
      wrapper.dataset.freeze = freezeEnabled ? 'true' : 'false';
    };
    setFreezeEnabled(true);

    const tipsMarkup = `
      <span class="fw-semibold d-block">Quick tips</span>
      <span>Paste from Excel/CSV with <kbd>Ctrl/Cmd + V</kbd>. Edit column names/units inline.</span>
    `;

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
    const actionsRow = document.createElement('div');
    actionsRow.className = 'workspace-spreadsheet-action-row';
    const plotExistingBtn = document.createElement('button');
    plotExistingBtn.type = 'button';
    plotExistingBtn.className = 'btn btn-primary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    plotExistingBtn.textContent = 'Add to graph(s)';
    const copySelectionBtn = document.createElement('button');
    copySelectionBtn.type = 'button';
    copySelectionBtn.className = 'btn btn-outline-secondary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    copySelectionBtn.textContent = 'Copy selection';
    const exportSelectionBtn = document.createElement('button');
    exportSelectionBtn.type = 'button';
    exportSelectionBtn.className = 'btn btn-outline-secondary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    exportSelectionBtn.textContent = 'Export CSV';
    actionsRow.appendChild(plotExistingBtn);
    actionsRow.appendChild(copySelectionBtn);
    actionsRow.appendChild(exportSelectionBtn);
    targetControls.appendChild(targetLabel);
    targetControls.appendChild(graphTargets);
    targetControls.appendChild(actionsRow);

    plotControls.appendChild(axisControls);
    plotControls.appendChild(targetControls);

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
    let draggedColumnIndex = null;
    let selectionAnchor = null;
    let selectionRange = null;
    let isSelecting = false;
    let isFilling = false;
    let pendingFillTarget = null;
    let selectedXColumnId = sheetState.columns[0]?.id || null;
    let selectedYColumnIds = new Set(
      sheetState.columns
        .filter((column) => column.id !== selectedXColumnId)
        .slice(0, 1)
        .map((column) => column.id)
    );
    let targetGraphSelections = new Set();
    let formulaErrors = {};
    let evaluatedRows = sheetState.rows.map((row) => ({ ...row }));

    const schedulePersist = createDebounce(() => {
      const payload = buildContent(sheetState);
      const shouldPush = historyPending;
      historyPending = false;
      safeSetContent(panelId, payload, { pushHistory: shouldPush });
    }, 650);
    const flushPendingChanges = () => schedulePersist.flush();
    const addBeforeUnloadListener = () => {
      if (typeof window === 'undefined') return;
      window.addEventListener('beforeunload', flushPendingChanges);
    };
    const removeBeforeUnloadListener = () => {
      if (typeof window === 'undefined') return;
      window.removeEventListener('beforeunload', flushPendingChanges);
    };

    const markDirty = () => {
      historyPending = true;
      schedulePersist();
    };

    const getColumnById = (columnId) => sheetState.columns.find((column) => column.id === columnId) || null;
const sanitizeCellValue = (value) => {
  if (value === null || typeof value === 'undefined') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? limitNumericPrecision(value) : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? limitNumericPrecision(numeric) : trimmed;
  }
  return value;
};

const formatDisplayValue = (value) => {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'number') {
    const limited = limitNumericPrecision(value);
    return Number.isFinite(limited) ? String(limited) : '';
  }
  if (typeof value === 'string') {
    const numeric = sanitizeNumber(value);
    if (numeric !== null) {
      return String(numeric);
    }
    return value;
  }
  return String(value);
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

    const canPlot = () => Boolean(selectedXColumnId && selectedYColumnIds.size && evaluatedRows.length);

    const buildFormulaTokens = () => sheetState.columns.map((column, index) => {
      const tokens = new Set();
      tokens.add(columnTokenForIndex(index));
      tokens.add(`Col${toColumnShortLabel(index)}`);
      tokens.add(`c${index + 1}`);
      tokens.add(column.id.replace(/[^a-zA-Z0-9]/g, ''));
      if (column.label) {
        const slug = slugifyLabel(column.label);
        if (slug) tokens.add(slug);
      }
      return { column, tokens };
    });

    const compileFormula = (source) => {
      const body = `"use strict"; return (${source});`;
      return new Function('ctx', `with(ctx){ ${body} }`);
    };

    const createFormulaContext = (row, columnTokens, rowIndex = 0) => {
      const safeRowIndex = Number.isInteger(rowIndex) ? rowIndex : 0;
      const rowNumber = safeRowIndex + 1;
      const ctx = {
        PI: Math.PI,
        E: Math.E,
        abs: Math.abs,
        min: Math.min,
        max: Math.max,
        pow: Math.pow,
        sqrt: Math.sqrt,
        exp: Math.exp,
        log: Math.log,
        log10: Math.log10 ?? ((value) => Math.log(value) / Math.LN10),
        log2: Math.log2 ?? ((value) => Math.log(value) / Math.LN2),
        round: Math.round,
        floor: Math.floor,
        ceil: Math.ceil,
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        atan2: Math.atan2,
        sinh: Math.sinh ?? ((value) => (Math.exp(value) - Math.exp(-value)) / 2),
        cosh: Math.cosh ?? ((value) => (Math.exp(value) + Math.exp(-value)) / 2),
        tanh: Math.tanh ?? ((value) => {
          const ePos = Math.exp(value);
          const eNeg = Math.exp(-value);
          return (ePos - eNeg) / (ePos + eNeg);
        }),
        square: (value) => (Number.isFinite(value) ? value * value : Math.pow(value, 2)),
        clamp: (value, minVal, maxVal) => Math.min(Math.max(value, minVal), maxVal ?? value),
        rowIndex: safeRowIndex,
        rowNumber,
        rowId: typeof row?.id === 'string' ? row.id : undefined,
        row: () => rowNumber,
        ROW: () => rowNumber
      };
      columnTokens.forEach(({ column, tokens }) => {
        const rawValue = sanitizeCellValue(row[column.id]);
        const resolved = rawValue === null ? undefined : rawValue;
        tokens.forEach((token) => {
          ctx[token] = resolved;
        });
      });
      return ctx;
    };

    const recalculateFormulas = () => {
      const definitions = sheetState.columns
        .map((column) => {
          const expr = sheetState.formulas[column.id]?.trim();
          if (!expr) return null;
          try {
            const evaluator = compileFormula(expr);
            return { column, evaluator, expr };
          } catch (error) {
            return { column, evaluator: null, error };
          }
        })
        .filter(Boolean);
      const baseRows = sheetState.rows.map((row) => ({ ...row }));
      if (!definitions.length) {
        formulaErrors = {};
        evaluatedRows = baseRows;
        return;
      }
      const nextErrors = {};
      const columnTokens = buildFormulaTokens();
      baseRows.forEach((row, rowIndex) => {
        const context = createFormulaContext(row, columnTokens, rowIndex);
        definitions.forEach(({ column, evaluator, error }) => {
          if (error || !evaluator) {
            nextErrors[column.id] = error?.message || 'Invalid formula';
            return;
          }
          try {
            const result = evaluator(context);
            const normalized = typeof result === 'number'
              ? (Number.isFinite(result) ? limitNumericPrecision(result) : '')
              : (result ?? '');
            row[column.id] = normalized;
            columnTokens.forEach(({ column: ctxColumn, tokens }) => {
              if (ctxColumn.id === column.id) {
                tokens.forEach((token) => {
                  const sanitized = sanitizeCellValue(normalized);
                  context[token] = sanitized === null ? undefined : sanitized;
                });
              }
            });
          } catch (evalError) {
            nextErrors[column.id] = evalError.message;
          }
        });
      });
      evaluatedRows = baseRows;
      formulaErrors = nextErrors;
    };

    const applyFormulaValue = (columnId, value) => {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      const formulas = { ...sheetState.formulas, [columnId]: trimmed };
      sheetState = { ...sheetState, formulas };
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    recalculateFormulas();

    const buildTracePayloads = () => {
      const xColumn = getColumnById(selectedXColumnId);
      if (!xColumn) return [];
      const yColumns = sheetState.columns.filter((column) => selectedYColumnIds.has(column.id));
      if (!yColumns.length) return [];
      const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
      return yColumns.map((column) => {
        const yValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]));
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

    const getSelectedColumns = () => {
      const columns = [];
      const xColumn = getColumnById(selectedXColumnId);
      if (xColumn) {
        columns.push(xColumn);
      }
      selectedYColumnIds.forEach((columnId) => {
        const column = getColumnById(columnId);
        if (column) {
          columns.push(column);
        }
      });
      return columns;
    };

    const serializeCellForExport = (value) => {
      const sanitized = sanitizeCellValue(value);
      if (sanitized === null || typeof sanitized === 'undefined') return '';
      if (typeof sanitized === 'number') {
        return Number.isFinite(sanitized) ? String(sanitized) : '';
      }
      if (typeof sanitized === 'string') {
        return sanitized;
      }
      return String(sanitized);
    };

    const buildSelectionMatrix = () => {
      const columns = getSelectedColumns();
      if (!columns.length) return null;
      const header = columns.map((column) => column.label || column.id);
      const rows = evaluatedRows.map((row) => columns.map((column) => serializeCellForExport(row?.[column.id])));
      const hasData = rows.some((row) => row.some((cell) => cell !== ''));
      return { columns, header, rows, hasData };
    };

    const copySelectionToClipboard = async () => {
      const matrix = buildSelectionMatrix();
      if (!matrix || !matrix.hasData) {
        notify?.('No selection data to copy.');
        return;
      }
      const lines = [matrix.header.join('\t'), ...matrix.rows.map((row) => row.join('\t'))];
      const content = lines.join('\n');
      const fallbackCopy = () => {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      };
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(content);
        } else {
          fallbackCopy();
        }
        notify?.('Selection copied to clipboard.', 'success');
      } catch {
        fallbackCopy();
        notify?.('Selection copied to clipboard.', 'success');
      }
    };

    const exportSelectionAsCsv = () => {
      const matrix = buildSelectionMatrix();
      if (!matrix || !matrix.hasData) {
        notify?.('No selection data to export.');
        return;
      }
      const escapeCell = (cell) => {
        if (cell === null || typeof cell === 'undefined') return '';
        const str = String(cell);
        if (/[",\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const csvLines = [
        matrix.header.map(escapeCell).join(','),
        ...matrix.rows.map((row) => row.map(escapeCell).join(','))
      ];
      const csvContent = csvLines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `spreadsheet-${panelId || 'data'}.csv`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 0);
      notify?.('CSV exported.', 'success');
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

    const updateActionButtons = () => {
      const ready = canPlot();
      const hasTarget = targetGraphSelections.size > 0;
      plotExistingBtn.disabled = !ready || !hasTarget;
      copySelectionBtn.disabled = !ready;
      exportSelectionBtn.disabled = !ready;
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
          updateActionButtons();
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
      updateActionButtons();
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
          updateActionButtons();
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
      updateActionButtons();
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

    const normalizeSelectionRange = (start, end) => {
      if (!start || !end) return null;
      const startRow = Math.min(start.rowIndex, end.rowIndex);
      const endRow = Math.max(start.rowIndex, end.rowIndex);
      const startCol = Math.min(start.columnIndex, end.columnIndex);
      const endCol = Math.max(start.columnIndex, end.columnIndex);
      return { startRow, endRow, startCol, endCol };
    };

    const getCellFromPoint = (clientX, clientY) => {
      if (typeof document === 'undefined') return null;
      const element = document.elementFromPoint(clientX, clientY);
      const input = element?.closest?.('.workspace-spreadsheet-cell');
      if (!input) return null;
      const rowIndex = Number(input.dataset.rowIndex);
      const columnIndex = Number(input.dataset.colIndex);
      if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return null;
      return { rowIndex, columnIndex };
    };

    const updateSelectionStyles = () => {
      const range = selectionRange;
      table.querySelectorAll('.workspace-spreadsheet-cell').forEach((input) => {
        if (!range) {
          input.classList.remove('is-selected');
          return;
        }
        const rowIndex = Number(input.dataset.rowIndex);
        const columnIndex = Number(input.dataset.colIndex);
        const isSelected = rowIndex >= range.startRow
          && rowIndex <= range.endRow
          && columnIndex >= range.startCol
          && columnIndex <= range.endCol;
        input.classList.toggle('is-selected', isSelected);
      });
      table.querySelectorAll('.workspace-spreadsheet-fill-handle').forEach((handle) => handle.remove());
      if (!range) return;
      const handleHost = table.querySelector(
        `[data-row-index="${range.endRow}"][data-col-index="${range.endCol}"]`
      );
      if (!handleHost) return;
      const handle = document.createElement('div');
      handle.className = 'workspace-spreadsheet-fill-handle';
      handle.title = 'Drag to fill';
      handle.addEventListener('mousedown', (event) => startFillDrag(event, range));
      handleHost.parentElement?.appendChild(handle);
    };

    const setSelectionRange = (start, end) => {
      const normalized = normalizeSelectionRange(start, end);
      if (!normalized) return;
      selectionRange = normalized;
      updateSelectionStyles();
    };

    const handleSelectionMove = (event) => {
      if (!isSelecting || isFilling) return;
      const cell = getCellFromPoint(event.clientX, event.clientY);
      if (!cell || !selectionAnchor) return;
      setSelectionRange(selectionAnchor, cell);
    };

    const handleSelectionEnd = () => {
      if (!isSelecting) return;
      isSelecting = false;
      document.removeEventListener('mousemove', handleSelectionMove);
      document.removeEventListener('mouseup', handleSelectionEnd);
    };

    const applyFillFromSelection = (range, target) => {
      if (!range || !target) return;
      const fillDown = target.rowIndex > range.endRow;
      const fillUp = target.rowIndex < range.startRow;
      const fillRight = target.columnIndex > range.endCol;
      const fillLeft = target.columnIndex < range.startCol;
      if (!fillDown && !fillUp && !fillRight && !fillLeft) return;

      const nextRows = sheetState.rows.slice();

      if (fillDown || fillUp) {
        if (target.columnIndex < range.startCol || target.columnIndex > range.endCol) return;
        const fillStart = fillDown ? range.endRow + 1 : target.rowIndex;
        const fillEnd = fillDown ? target.rowIndex : range.startRow - 1;
        if (fillStart > fillEnd) return;
        for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
          const column = sheetState.columns[colIndex];
          if (!column) continue;
          const values = [];
          for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
            const raw = nextRows[rowIndex]?.[column.id];
            values.push(sanitizeCellValue(raw));
          }
          const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
          const anchorValue = fillDown ? values[values.length - 1] : values[0];
          let step = 0;
          if (numericValues.length >= 2) {
            const last = fillDown ? numericValues[numericValues.length - 1] : numericValues[1];
            const prev = fillDown ? numericValues[numericValues.length - 2] : numericValues[0];
            step = last - prev;
          } else if (numericValues.length === 1) {
            step = 1;
          }
          for (let rowIndex = fillStart; rowIndex <= fillEnd; rowIndex += 1) {
            const offset = fillDown
              ? rowIndex - range.endRow
              : range.startRow - rowIndex;
            let nextValue = anchorValue ?? '';
            if (typeof anchorValue === 'number' && Number.isFinite(anchorValue)) {
              nextValue = limitNumericPrecision(anchorValue + (step * offset));
            } else if (numericValues.length === 1 && typeof numericValues[0] === 'number') {
              nextValue = limitNumericPrecision(numericValues[0] + (step * offset));
            }
            nextRows[rowIndex] = { ...nextRows[rowIndex], [column.id]: nextValue };
          }
        }
        selectionRange = fillDown
          ? { ...range, endRow: fillEnd }
          : { ...range, startRow: fillStart };
      } else {
        if (target.rowIndex < range.startRow || target.rowIndex > range.endRow) return;
        const fillStart = fillRight ? range.endCol + 1 : target.columnIndex;
        const fillEnd = fillRight ? target.columnIndex : range.startCol - 1;
        if (fillStart > fillEnd) return;
        for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
          const values = [];
          for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
            const column = sheetState.columns[colIndex];
            if (!column) continue;
            const raw = nextRows[rowIndex]?.[column.id];
            values.push(sanitizeCellValue(raw));
          }
          const numericValues = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
          const anchorValue = fillRight ? values[values.length - 1] : values[0];
          let step = 0;
          if (numericValues.length >= 2) {
            const last = fillRight ? numericValues[numericValues.length - 1] : numericValues[1];
            const prev = fillRight ? numericValues[numericValues.length - 2] : numericValues[0];
            step = last - prev;
          } else if (numericValues.length === 1) {
            step = 1;
          }
          for (let colIndex = fillStart; colIndex <= fillEnd; colIndex += 1) {
            const column = sheetState.columns[colIndex];
            if (!column) continue;
            const offset = fillRight
              ? colIndex - range.endCol
              : range.startCol - colIndex;
            let nextValue = anchorValue ?? '';
            if (typeof anchorValue === 'number' && Number.isFinite(anchorValue)) {
              nextValue = limitNumericPrecision(anchorValue + (step * offset));
            } else if (numericValues.length === 1 && typeof numericValues[0] === 'number') {
              nextValue = limitNumericPrecision(numericValues[0] + (step * offset));
            }
            nextRows[rowIndex] = { ...nextRows[rowIndex], [column.id]: nextValue };
          }
        }
        selectionRange = fillRight
          ? { ...range, endCol: fillEnd }
          : { ...range, startCol: fillStart };
      }

      sheetState = { ...sheetState, rows: nextRows };
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const startFillDrag = (event, baseRange) => {
      if (!baseRange) return;
      event.preventDefault();
      event.stopPropagation();
      isFilling = true;
      pendingFillTarget = null;
      const handleFillMove = (moveEvent) => {
        const cell = getCellFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (!cell) return;
        pendingFillTarget = cell;
      };
      const handleFillEnd = () => {
        document.removeEventListener('mousemove', handleFillMove);
        document.removeEventListener('mouseup', handleFillEnd);
        isFilling = false;
        if (pendingFillTarget) {
          applyFillFromSelection(baseRange, pendingFillTarget);
          pendingFillTarget = null;
        }
      };
      document.addEventListener('mousemove', handleFillMove);
      document.addEventListener('mouseup', handleFillEnd);
    };

    const startColumnResize = (event, columnIndex, colEl) => {
      if (!colEl) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = colEl.getBoundingClientRect().width;
      const minWidth = 90;
      const handleMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(minWidth, startWidth + delta);
        colEl.style.width = `${Math.round(nextWidth)}px`;
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        updateColumnWidth(columnIndex, Number.parseFloat(colEl.style.width) || startWidth);
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
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
      recalculateFormulas();
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
      recalculateFormulas();
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
      const colgroup = document.createElement('colgroup');
      const cornerCol = document.createElement('col');
      cornerCol.style.width = '3rem';
      colgroup.appendChild(cornerCol);
      const colEls = sheetState.columns.map((column) => {
        const col = document.createElement('col');
        if (Number.isFinite(column.width)) {
          col.style.width = `${column.width}px`;
        }
        colgroup.appendChild(col);
        return col;
      });
      table.appendChild(colgroup);
      const headerRows = [
        {
          key: 'col',
          label: 'Col',
          className: 'workspace-spreadsheet-column-header--col',
          buildCell: (th, columnIndex) => {
            const header = document.createElement('div');
            header.className = 'workspace-spreadsheet-col-header';

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'workspace-spreadsheet-col-handle';
            handle.title = 'Drag to reorder column';
            handle.innerHTML = '<i class="bi bi-grip-vertical"></i>';
            handle.draggable = true;
            handle.addEventListener('dragstart', (event) => {
              draggedColumnIndex = columnIndex;
              event.dataTransfer?.setData('text/plain', String(columnIndex));
              event.dataTransfer.effectAllowed = 'move';
            });
            handle.addEventListener('dragend', () => {
              draggedColumnIndex = null;
            });

            const token = document.createElement('span');
            token.className = 'workspace-spreadsheet-col-token';
            token.textContent = toColumnShortLabel(columnIndex);

            const actions = document.createElement('div');
            actions.className = 'workspace-spreadsheet-col-actions';

            const duplicateBtn = document.createElement('button');
            duplicateBtn.type = 'button';
            duplicateBtn.className = 'workspace-spreadsheet-col-action';
            duplicateBtn.title = 'Duplicate column';
            duplicateBtn.innerHTML = '<i class="bi bi-files"></i>';
            duplicateBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              duplicateColumnAt(columnIndex);
            });

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'workspace-spreadsheet-col-action';
            clearBtn.title = 'Clear column';
            clearBtn.innerHTML = '<i class="bi bi-eraser"></i>';
            clearBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              clearColumnAt(columnIndex);
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'workspace-spreadsheet-col-action workspace-spreadsheet-col-action--danger';
            deleteBtn.title = 'Delete column';
            deleteBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            deleteBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              removeColumnAt(columnIndex);
            });

            actions.appendChild(duplicateBtn);
            actions.appendChild(clearBtn);
            actions.appendChild(deleteBtn);
            header.appendChild(handle);
            header.appendChild(token);
            header.appendChild(actions);
            const resizer = document.createElement('div');
            resizer.className = 'workspace-spreadsheet-col-resizer';
            resizer.addEventListener('mousedown', (event) => {
              startColumnResize(event, columnIndex, colEls[columnIndex]);
            });
            header.appendChild(resizer);
            th.appendChild(header);
            th.addEventListener('click', () => handleHeaderClick(columnIndex));
            th.addEventListener('dragover', (event) => {
              if (!Number.isInteger(draggedColumnIndex)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            });
            th.addEventListener('drop', (event) => {
              event.preventDefault();
              const from = Number.isInteger(draggedColumnIndex)
                ? draggedColumnIndex
                : Number(event.dataTransfer?.getData('text/plain'));
              if (!Number.isInteger(from)) return;
              moveColumn(from, columnIndex);
              draggedColumnIndex = null;
            });
          }
        },
        {
          key: 'name',
          label: 'Name',
          className: 'workspace-spreadsheet-column-header--name',
          buildCell: (th, columnIndex, column) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm workspace-spreadsheet-header-input workspace-spreadsheet-name-input';
            input.value = column.label || toColumnLabel(columnIndex);
            input.placeholder = 'Name';
            input.addEventListener('focus', () => {
              activeColumnIndex = columnIndex;
              syncActiveHighlights();
            });
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                input.value = column.label || toColumnLabel(columnIndex);
                input.blur();
              }
            });
            input.addEventListener('blur', () => {
              updateColumnLabel(columnIndex, input.value);
              input.value = sheetState.columns[columnIndex]?.label || toColumnLabel(columnIndex);
            });
            th.appendChild(input);
          }
        },
        {
          key: 'units',
          label: 'Units',
          className: 'workspace-spreadsheet-column-header--units',
          buildCell: (th, columnIndex, column) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm workspace-spreadsheet-header-input workspace-spreadsheet-units-input';
            input.value = column.units || '';
            input.placeholder = 'Units';
            input.addEventListener('focus', () => {
              activeColumnIndex = columnIndex;
              syncActiveHighlights();
            });
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                input.blur();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                input.value = column.units || '';
                input.blur();
              }
            });
            input.addEventListener('blur', () => {
              updateColumnUnits(columnIndex, input.value);
              input.value = sheetState.columns[columnIndex]?.units || '';
            });
            th.appendChild(input);
          }
        },
        {
          key: 'formula',
          label: 'f',
          className: 'workspace-spreadsheet-column-header--formula',
          buildCell: (th, columnIndex, column) => {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-control form-control-sm workspace-spreadsheet-formula-input';
            input.placeholder = 'e.g., colA*2';
            const currentFormula = sheetState.formulas[column.id] || '';
            input.value = currentFormula;
            const errorMessage = formulaErrors[column.id];
            if (errorMessage) {
              input.classList.add('is-invalid');
            }
            input.addEventListener('focus', () => {
              activeColumnIndex = columnIndex;
            });
            input.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                applyFormulaValue(column.id, input.value);
              }
            });
            input.addEventListener('blur', () => {
              const trimmed = input.value.trim();
              if (trimmed !== currentFormula) {
                applyFormulaValue(column.id, input.value);
              }
            });
            th.appendChild(input);
            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'workspace-spreadsheet-formula-clear';
            clearBtn.title = 'Clear formula';
            clearBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            clearBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              if (!input.value.trim()) return;
              input.value = '';
              applyFormulaValue(column.id, '');
            });
            th.appendChild(clearBtn);
            if (errorMessage) {
              const hint = document.createElement('div');
              hint.className = 'workspace-spreadsheet-formula-error';
              hint.textContent = errorMessage;
              th.appendChild(hint);
            }
          }
        }
      ];

      headerRows.forEach((rowConfig, rowIndex) => {
        const row = document.createElement('tr');
        row.className = `workspace-spreadsheet-head-row workspace-spreadsheet-head-row--${rowConfig.key}`;

        const corner = document.createElement('th');
        corner.className = 'workspace-spreadsheet-corner workspace-spreadsheet-header-corner';
        corner.textContent = rowConfig.label;
        corner.style.top = `${rowIndex * HEADER_ROW_HEIGHT}px`;
        corner.style.height = `${HEADER_ROW_HEIGHT}px`;
        row.appendChild(corner);

        sheetState.columns.forEach((column, columnIndex) => {
          const th = document.createElement('th');
          th.className = `workspace-spreadsheet-column-header ${rowConfig.className}`;
          th.dataset.columnIndex = String(columnIndex);
          th.style.top = `${rowIndex * HEADER_ROW_HEIGHT}px`;
          th.style.height = `${HEADER_ROW_HEIGHT}px`;
          rowConfig.buildCell(th, columnIndex, column);
          row.appendChild(th);
        });

        thead.appendChild(row);
      });

      const tbody = document.createElement('tbody');
      sheetState.rows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');

        const rowHeader = document.createElement('th');
        rowHeader.className = 'workspace-spreadsheet-row-header';
        rowHeader.dataset.rowHeaderIndex = String(rowIndex);
        rowHeader.title = 'Select row';

        const rowHeaderContent = document.createElement('div');
        rowHeaderContent.className = 'workspace-spreadsheet-row-header-content';
        const rowLabel = document.createElement('span');
        rowLabel.textContent = String(rowIndex + 1);
        const rowDelete = document.createElement('button');
        rowDelete.type = 'button';
        rowDelete.className = 'workspace-spreadsheet-row-delete';
        rowDelete.title = 'Delete row';
        rowDelete.innerHTML = '<i class="bi bi-x-lg"></i>';
        rowDelete.addEventListener('click', (event) => {
          event.stopPropagation();
          removeRowAt(rowIndex);
        });
        rowHeaderContent.appendChild(rowLabel);
        rowHeaderContent.appendChild(rowDelete);
        rowHeader.appendChild(rowHeaderContent);
        rowHeader.addEventListener('click', () => handleRowHeaderClick(rowIndex));
        tr.appendChild(rowHeader);

        sheetState.columns.forEach((column, columnIndex) => {
          const td = document.createElement('td');
          td.className = 'workspace-spreadsheet-cell-wrapper';
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'workspace-spreadsheet-cell';
          const renderRow = evaluatedRows[rowIndex] || row;
          input.value = formatDisplayValue(renderRow?.[column.id]);
          input.dataset.rowId = row.id;
          input.dataset.colId = column.id;
          input.dataset.rowIndex = String(rowIndex);
          input.dataset.colIndex = String(columnIndex);
          const isFormulaColumn = !!(sheetState.formulas[column.id]?.trim());
          if (isFormulaColumn) {
            input.readOnly = true;
            input.classList.add('is-derived');
          }
          input.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.shiftKey && selectionAnchor) {
              setSelectionRange(selectionAnchor, { rowIndex, columnIndex });
            } else {
              selectionAnchor = { rowIndex, columnIndex };
              setSelectionRange(selectionAnchor, selectionAnchor);
            }
            if (!isSelecting) {
              isSelecting = true;
              document.addEventListener('mousemove', handleSelectionMove);
              document.addEventListener('mouseup', handleSelectionEnd);
            }
          });
          input.addEventListener('focus', () => {
            activeRowIndex = rowIndex;
            activeColumnIndex = columnIndex;
            lastFocusedCell = {
              rowIndex,
              columnIndex
            };
            selectionAnchor = { rowIndex, columnIndex };
            setSelectionRange(selectionAnchor, selectionAnchor);
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
      requestAnimationFrame(() => {
        syncActiveHighlights();
        updateSelectionStyles();
        if (lastFocusedCell) {
          focusCell(lastFocusedCell.rowIndex, lastFocusedCell.columnIndex);
        }
      });
    };

    const buildCopyLabel = (label, fallback = 'Column Copy') => {
      const base = sanitizeString(label, '');
      if (!base) return fallback;
      return `${base} Copy`;
    };

    const updateColumnLabel = (columnIndex, value) => {
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const nextLabel = sanitizeString(value, column.label || toColumnLabel(columnIndex));
      if (nextLabel === column.label) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, label: nextLabel };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
      refreshPlotControls();
    };

    const updateColumnUnits = (columnIndex, value) => {
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const nextUnits = typeof value === 'string' ? value.trim() : '';
      if (nextUnits === (column.units || '')) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, units: nextUnits };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
    };

    const updateColumnWidth = (columnIndex, width) => {
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const numeric = Number(width);
      const nextWidth = Number.isFinite(numeric) ? Math.max(80, Math.round(numeric)) : null;
      if ((column.width ?? null) === nextWidth) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, width: nextWidth };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
    };

    const removeColumnAt = (targetIndex) => {
      if (sheetState.columns.length <= 1) return;
      if (!Number.isInteger(targetIndex)) return;
      const safeIndex = Math.max(0, Math.min(targetIndex, sheetState.columns.length - 1));
      const column = sheetState.columns[safeIndex];
      if (!column) return;
      const nextColumns = sheetState.columns.filter((_, idx) => idx !== safeIndex);
      const nextRows = sheetState.rows.map((row) => {
        const { [column.id]: omit, ...rest } = row;
        return rest;
      });
      const nextFormulas = { ...sheetState.formulas };
      delete nextFormulas[column.id];
      sheetState = { ...sheetState, columns: nextColumns, rows: nextRows, formulas: nextFormulas };
      activeColumnIndex = Math.min(safeIndex, nextColumns.length - 1);
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const removeRowAt = (targetIndex) => {
      if (sheetState.rows.length <= 1) return;
      if (!Number.isInteger(targetIndex)) return;
      const safeIndex = Math.max(0, Math.min(targetIndex, sheetState.rows.length - 1));
      const nextRows = sheetState.rows.filter((_, idx) => idx !== safeIndex);
      sheetState = { ...sheetState, rows: nextRows };
      activeRowIndex = Math.min(safeIndex, nextRows.length - 1);
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const handleAddColumn = () => {
      const insertIndex = Number.isInteger(activeColumnIndex)
        ? activeColumnIndex + 1
        : sheetState.columns.length;
      const label = toColumnLabel(sheetState.columns.length);
      const newColumn = {
        id: generateId('col'),
        label,
        units: '',
        width: null,
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
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const duplicateColumnAt = (index) => {
      const column = sheetState.columns[index];
      if (!column) return;
      const insertIndex = Math.min(index + 1, sheetState.columns.length);
      const nextColumn = {
        id: generateId('col'),
        label: buildCopyLabel(column.label, toColumnLabel(insertIndex)),
        units: column.units || '',
        width: Number.isFinite(column.width) ? column.width : null,
        type: column.type === 'text' ? 'text' : 'number',
        formula: column.formula || ''
      };
      const nextColumns = sheetState.columns.slice();
      nextColumns.splice(insertIndex, 0, nextColumn);
      const nextRows = sheetState.rows.map((row) => ({
        ...row,
        [nextColumn.id]: row[column.id]
      }));
      const nextFormulas = { ...sheetState.formulas, [nextColumn.id]: nextColumn.formula || '' };
      sheetState = { ...sheetState, columns: nextColumns, rows: nextRows, formulas: nextFormulas };
      activeColumnIndex = insertIndex;
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const clearColumnAt = (index) => {
      const column = sheetState.columns[index];
      if (!column) return;
      const nextRows = sheetState.rows.map((row) => ({
        ...row,
        [column.id]: ''
      }));
      sheetState = { ...sheetState, rows: nextRows };
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const moveColumn = (fromIndex, toIndex) => {
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) return;
      if (fromIndex === toIndex) return;
      const nextColumns = sheetState.columns.slice();
      const [moved] = nextColumns.splice(fromIndex, 1);
      if (!moved) return;
      const resolvedIndex = Math.max(0, Math.min(toIndex, nextColumns.length));
      nextColumns.splice(resolvedIndex, 0, moved);
      sheetState = { ...sheetState, columns: nextColumns };
      activeColumnIndex = resolvedIndex;
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

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
    copySelectionBtn.addEventListener('click', () => copySelectionToClipboard());
    exportSelectionBtn.addEventListener('click', () => exportSelectionAsCsv());

    addBeforeUnloadListener();
    renderGrid();
    refreshGraphOptions();
    updateActionButtons();

    return {
      plotEl: null,
      addColumn: handleAddColumn,
      setFreeze: setFreezeEnabled,
      getQuickTipsMarkup: () => tipsMarkup,
      refreshContent(nextContent) {
        if (!nextContent || typeof nextContent !== 'object') return;
        sheetState = buildContent(nextContent);
        historyPending = false;
        flushPendingChanges();
        recalculateFormulas();
        renderGrid();
        refreshGraphOptions();
        updateActionButtons();
      },
      persistContent: flushPendingChanges,
      getContentSnapshot: () => buildContent(sheetState),
      dispose() {
        flushPendingChanges();
        removeBeforeUnloadListener();
      }
    };
  }
};
