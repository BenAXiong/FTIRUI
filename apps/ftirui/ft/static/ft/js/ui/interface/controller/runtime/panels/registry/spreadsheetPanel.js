import { registerContentKind } from '../../../../../../workspace/canvas/state/contentStore.js';

const SHEET_KIND = 'spreadsheet';
const CURRENT_VERSION = 1;
const DEFAULT_COLUMN_COUNT = 3;
const DEFAULT_ROW_COUNT = 8;
const FOCUS_DELAY = 20;
const MAX_DECIMAL_PLACES = 5;
const HEADER_ROW_HEIGHT = 30;
const MIN_COLUMN_WIDTH = 60;
const CORNER_COL_WIDTH_REM = 2.2;

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
    const type = column?.type === 'text' || column?.type === 'date' || column?.type === 'number'
      ? column.type
      : (column?.type === 'text' ? 'text' : 'number');
    return {
      id: uniqueId,
      label: sanitizeString(column?.label, toColumnLabel(index)),
      units: sanitizeString(column?.units ?? '', ''),
      width: Number.isFinite(Number(column?.width))
        ? Math.max(MIN_COLUMN_WIDTH, Math.round(Number(column?.width)))
        : null,
      type,
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

const normalizePanelMeta = (meta) => {
  if (!meta || typeof meta !== 'object') return {};
  const workspacePanel = meta.workspacePanel && typeof meta.workspacePanel === 'object'
    ? meta.workspacePanel
    : {};
  const nextPanel = {};
  if (typeof workspacePanel.editLocked === 'boolean') {
    nextPanel.editLocked = workspacePanel.editLocked;
  }
  if (typeof workspacePanel.pinned === 'boolean') {
    nextPanel.pinned = workspacePanel.pinned;
  }
  if (!Object.keys(nextPanel).length) return {};
  return { workspacePanel: nextPanel };
};

const normalizePlotSelection = (plot, columns) => {
  const columnIds = columns.map((column) => column.id);
  const incomingX = Array.isArray(plot?.x) ? plot.x : [];
  const incomingY = Array.isArray(plot?.y) ? plot.y : [];
  const x = incomingX.filter((id) => columnIds.includes(id));
  const y = incomingY.filter((id) => columnIds.includes(id) && !x.includes(id));
  if (!x.length && columnIds.length) {
    x.push(columnIds[0]);
  }
  if (!y.length) {
    const fallback = columnIds.find((id) => !x.includes(id));
    if (fallback) {
      y.push(fallback);
    }
  }
  return { x, y };
};

const normalizeSpreadsheet = (value = {}) => {
  const columns = normalizeColumns(value?.columns);
  const rows = normalizeRows(value?.rows, columns);
  const formulas = normalizeFormulas(value?.formulas, columns);
  const plot = normalizePlotSelection(value?.plot, columns);
  const plotMode = value?.plotMode === 'custom' ? 'custom' : 'default';
  const plotTargets = Array.isArray(value?.plotTargets)
    ? value.plotTargets.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const plotPreviewHidden = value?.plotPreviewHidden === true;
  const meta = normalizePanelMeta(value?.meta);
  return {
    kind: SHEET_KIND,
    version: CURRENT_VERSION,
    columns,
    rows,
    formulas,
    plot,
    plotMode,
    plotTargets,
    plotPreviewHidden,
    meta
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
  mountContent({ panelId, panelState = {}, rootEl, hostEl, actions = {}, selectors = {} }) {
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
    let freezeEnabled = false;
    const setFreezeEnabled = (isEnabled) => {
      freezeEnabled = Boolean(isEnabled);
      wrapper.dataset.freeze = freezeEnabled ? 'true' : 'false';
    };
    setFreezeEnabled(false);

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
    plotControls.className = 'workspace-spreadsheet-plot-popover';
    const plotLayout = document.createElement('div');
    plotLayout.className = 'workspace-spreadsheet-plot-layout';
    const plotMain = document.createElement('div');
    plotMain.className = 'workspace-spreadsheet-plot-main';
    plotLayout.appendChild(plotMain);
    plotControls.appendChild(plotLayout);

    const plotPreviewToggle = document.createElement('label');
    plotPreviewToggle.className = 'workspace-spreadsheet-plot-preview-toggle';
    const plotPreviewToggleInput = document.createElement('input');
    plotPreviewToggleInput.type = 'checkbox';
    plotPreviewToggleInput.className = 'form-check-input';
    const plotPreviewToggleText = document.createElement('span');
    plotPreviewToggleText.textContent = 'Hide preview';
    plotPreviewToggle.appendChild(plotPreviewToggleInput);
    plotPreviewToggle.appendChild(plotPreviewToggleText);

    const plotPreview = document.createElement('div');
    plotPreview.className = 'workspace-spreadsheet-plot-preview';
    const plotPreviewHeader = document.createElement('div');
    plotPreviewHeader.className = 'workspace-spreadsheet-plot-preview-header';
    const plotPreviewLabel = document.createElement('div');
    plotPreviewLabel.className = 'workspace-spreadsheet-plot-label';
    plotPreviewLabel.textContent = 'Preview';
    plotPreviewHeader.appendChild(plotPreviewLabel);
    const plotPreviewBody = document.createElement('div');
    plotPreviewBody.className = 'workspace-spreadsheet-plot-preview-body';
    plotPreview.appendChild(plotPreviewHeader);
    plotPreview.appendChild(plotPreviewBody);

    const modeSection = document.createElement('div');
    modeSection.className = 'workspace-spreadsheet-plot-section';
    const modeLabel = document.createElement('div');
    modeLabel.className = 'workspace-spreadsheet-plot-label';
    modeLabel.textContent = 'Mode';
    const modeHeader = document.createElement('div');
    modeHeader.className = 'workspace-spreadsheet-plot-label-row';
    modeHeader.appendChild(modeLabel);
    modeHeader.appendChild(plotPreviewToggle);
    const modeToggle = document.createElement('div');
    modeToggle.className = 'workspace-spreadsheet-plot-toggle';
    const modeDefaultBtn = document.createElement('button');
    modeDefaultBtn.type = 'button';
    modeDefaultBtn.className = 'btn btn-outline-secondary workspace-spreadsheet-plot-toggle-btn is-active';
    modeDefaultBtn.textContent = 'Selection';
    const modeCustomBtn = document.createElement('button');
    modeCustomBtn.type = 'button';
    modeCustomBtn.className = 'btn btn-outline-secondary workspace-spreadsheet-plot-toggle-btn';
    modeCustomBtn.textContent = 'Custom';
    modeToggle.appendChild(modeDefaultBtn);
    modeToggle.appendChild(modeCustomBtn);
    modeSection.appendChild(modeHeader);
    modeSection.appendChild(modeToggle);

    const sourceSection = document.createElement('div');
    sourceSection.className = 'workspace-spreadsheet-plot-section';
    const sourceLabel = document.createElement('div');
    sourceLabel.className = 'workspace-spreadsheet-plot-label';
    sourceLabel.textContent = 'Source';
    const sourceBody = document.createElement('div');
    sourceBody.className = 'workspace-spreadsheet-plot-body';
    sourceSection.appendChild(sourceLabel);
    sourceSection.appendChild(sourceBody);

    const targetSection = document.createElement('div');
    targetSection.className = 'workspace-spreadsheet-plot-section';
    const targetLabel = document.createElement('div');
    targetLabel.className = 'workspace-spreadsheet-plot-label';
    targetLabel.textContent = 'Target';
    const targetBody = document.createElement('div');
    targetBody.className = 'workspace-spreadsheet-plot-body';
    const targetDropdown = document.createElement('details');
    targetDropdown.className = 'workspace-spreadsheet-target-dropdown';
    const targetSummary = document.createElement('summary');
    targetSummary.className = 'workspace-spreadsheet-target-summary';
    targetSummary.textContent = 'Select graph(s)';
    const graphTargets = document.createElement('div');
    graphTargets.className = 'workspace-spreadsheet-target-list';
    targetDropdown.appendChild(targetSummary);
    targetDropdown.appendChild(graphTargets);
    targetBody.appendChild(targetDropdown);
    targetSection.appendChild(targetLabel);
    targetSection.appendChild(targetBody);

    const actionsSection = document.createElement('div');
    actionsSection.className = 'workspace-spreadsheet-plot-section';
    const actionsLabel = document.createElement('div');
    actionsLabel.className = 'workspace-spreadsheet-plot-label';
    actionsLabel.textContent = 'Actions';
    const actionsBody = document.createElement('div');
    actionsBody.className = 'workspace-spreadsheet-plot-body';
    const actionsRow = document.createElement('div');
    actionsRow.className = 'workspace-spreadsheet-action-row';
    const plotExistingBtn = document.createElement('button');
    plotExistingBtn.type = 'button';
    plotExistingBtn.className = 'btn btn-primary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    plotExistingBtn.textContent = 'Plot';
    const copySelectionBtn = document.createElement('button');
    copySelectionBtn.type = 'button';
    copySelectionBtn.className = 'btn btn-outline-secondary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    copySelectionBtn.textContent = 'Copy all';
    const exportSelectionBtn = document.createElement('button');
    exportSelectionBtn.type = 'button';
    exportSelectionBtn.className = 'btn btn-outline-secondary btn-sm workspace-spreadsheet-plot-btn workspace-spreadsheet-plot-btn--wide';
    exportSelectionBtn.textContent = 'Export';
    actionsRow.appendChild(plotExistingBtn);
    actionsRow.appendChild(copySelectionBtn);
    actionsRow.appendChild(exportSelectionBtn);
    actionsBody.appendChild(actionsRow);
    actionsSection.appendChild(actionsLabel);
    actionsSection.appendChild(actionsBody);

    plotMain.appendChild(modeSection);
    plotMain.appendChild(sourceSection);
    plotMain.appendChild(targetSection);
    plotMain.appendChild(actionsSection);

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
    let draggedColumnIndex = null;
    let selectionAnchor = null;
    let selectionRange = null;
    let isSelecting = false;
    let isFilling = false;
    let pendingFillTarget = null;
    const initialPlotSelection = sheetState.plot || { x: [], y: [] };
    let selectedXColumnId = initialPlotSelection.x?.[0] || sheetState.columns[0]?.id || null;
    let selectedXColumnIds = new Set(initialPlotSelection.x || []);
    let selectedYColumnIds = new Set(initialPlotSelection.y || []);
        let plotMode = sheetState.plotMode === 'custom' ? 'custom' : 'default';
        let targetGraphSelections = new Set(sheetState.plotTargets || []);
    let formulaErrors = {};
    let evaluatedRows = sheetState.rows.map((row) => ({ ...row }));
    let plotPreviewHidden = sheetState.plotPreviewHidden === true;
    let selectionRanges = [];
    let selectedColumnIndices = new Set();
    let columnSelectionAnchor = null;
    let isEditLocked = false;
    let lockObserver = null;

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

    const updatePreviewVisibility = () => {
      plotPreview.classList.toggle('is-preview-hidden', plotPreviewHidden);
      plotPreviewToggleInput.checked = plotPreviewHidden;
    };

    plotPreviewToggleInput.addEventListener('change', () => {
      plotPreviewHidden = plotPreviewToggleInput.checked;
      updatePreviewVisibility();
      syncPlotSelectionState({ persist: true });
    });

    if (rootEl && typeof MutationObserver !== 'undefined') {
      lockObserver = new MutationObserver(syncEditLockState);
      lockObserver.observe(rootEl, { attributes: true, attributeFilter: ['class'] });
    }
    syncEditLockState();

    const syncPlotSelectionState = ({ persist = false } = {}) => {
      sheetState = {
        ...sheetState,
        plot: {
          x: [...selectedXColumnIds],
          y: [...selectedYColumnIds]
        },
        plotMode,
        plotTargets: Array.from(targetGraphSelections),
        plotPreviewHidden
      };
      if (persist) {
        schedulePersist();
      }
    };

    const markDirty = () => {
      syncPlotSelectionState();
      historyPending = true;
      schedulePersist();
    };

    const toggleLockDisabled = (node, locked) => {
      if (!node) return;
      if (locked) {
        if (!node.disabled) {
          node.dataset.lockDisabled = '1';
        }
        node.disabled = true;
      } else if (node.dataset.lockDisabled === '1') {
        node.disabled = false;
        delete node.dataset.lockDisabled;
      }
    };

    const toggleLockReadonly = (input, locked) => {
      if (!input) return;
      if (locked) {
        if (!input.readOnly) {
          input.dataset.lockReadonly = '1';
          input.readOnly = true;
        }
      } else if (input.dataset.lockReadonly === '1') {
        input.readOnly = false;
        delete input.dataset.lockReadonly;
      }
    };

    function applyEditLockState(locked) {
      isEditLocked = locked;
      wrapper.dataset.editLocked = locked ? 'true' : 'false';
      wrapper.querySelectorAll('.workspace-spreadsheet-cell').forEach((input) => {
        toggleLockReadonly(input, locked);
      });
      wrapper.querySelectorAll('.workspace-spreadsheet-header-input, .workspace-spreadsheet-formula-input')
        .forEach((input) => {
          toggleLockReadonly(input, locked);
        });
      wrapper.querySelectorAll('button').forEach((btn) => {
        toggleLockDisabled(btn, locked);
      });
      wrapper.querySelectorAll('.workspace-spreadsheet-col-handle').forEach((handle) => {
        handle.draggable = !locked;
      });
    }

    function syncEditLockState() {
      if (!rootEl) return;
      applyEditLockState(rootEl.classList.contains('is-edit-locked'));
    }

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

const createSparklineSvg = (xValues = [], yValues = []) => {
  const pairs = [];
  for (let i = 0; i < xValues.length; i += 1) {
    const x = xValues[i];
    const y = yValues[i];
    if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
      pairs.push({ x, y });
    }
  }
  if (pairs.length < 2) return null;

  const maxPoints = 60;
  if (pairs.length > maxPoints) {
    const step = Math.ceil(pairs.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < pairs.length; i += step) {
      sampled.push(pairs[i]);
    }
    pairs.length = 0;
    pairs.push(...sampled);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pairs.forEach(({ x, y }) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  });
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const width = 100;
  const height = 30;
  const padding = 2;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const points = pairs.map(({ x, y }) => {
    const px = padding + ((x - minX) / rangeX) * plotWidth;
    const py = height - padding - ((y - minY) / rangeY) * plotHeight;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(' ');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', 'currentColor');
  polyline.setAttribute('stroke-width', '1.3');
  polyline.setAttribute('stroke-linejoin', 'round');
  polyline.setAttribute('stroke-linecap', 'round');
  svg.appendChild(polyline);
  return svg;
};

    const ensureSelectionIntegrity = () => {
      const columnIds = sheetState.columns.map((column) => column.id);
      const numericColumnIds = new Set(
        sheetState.columns.filter((column) => column.type !== 'text' && column.type !== 'date')
          .map((column) => column.id)
      );
      if (!columnIds.length) {
        selectedXColumnId = null;
        selectedXColumnIds.clear();
        selectedYColumnIds.clear();
        return;
      }
      selectedXColumnIds = new Set(
        [...selectedXColumnIds].filter((columnId) => columnIds.includes(columnId) && numericColumnIds.has(columnId))
      );
      selectedYColumnIds = new Set(
        [...selectedYColumnIds].filter((columnId) => columnIds.includes(columnId) && numericColumnIds.has(columnId))
      );

      if (!selectedXColumnIds.size) {
        const fallback = sheetState.columns.find((column) => numericColumnIds.has(column.id));
        selectedXColumnId = fallback?.id || null;
        if (selectedXColumnId) {
          selectedXColumnIds.add(selectedXColumnId);
        }
      } else if (!selectedXColumnId || !selectedXColumnIds.has(selectedXColumnId)) {
        selectedXColumnId = [...selectedXColumnIds][0];
      }

      selectedYColumnIds = new Set(
        [...selectedYColumnIds].filter((columnId) => !selectedXColumnIds.has(columnId))
      );
      if (!selectedYColumnIds.size) {
        const fallback = sheetState.columns.find((column) => numericColumnIds.has(column.id)
          && !selectedXColumnIds.has(column.id));
        if (fallback) {
          selectedYColumnIds.add(fallback.id);
        }
      }
    };

    const getNearestXColumnIndex = (columnIndex) => {
      for (let idx = columnIndex - 1; idx >= 0; idx -= 1) {
        const column = sheetState.columns[idx];
        if (column && selectedXColumnIds.has(column.id)) {
          return idx;
        }
      }
      const fallbackIndex = sheetState.columns.findIndex((column) => selectedXColumnIds.has(column.id));
      return fallbackIndex >= 0 ? fallbackIndex : null;
    };

    const buildDefaultPlotMapping = () => {
      const mapping = new Map();
      sheetState.columns.forEach((column) => {
        if (column.type !== 'text' && column.type !== 'date' && selectedXColumnIds.has(column.id)) {
          mapping.set(column.id, []);
        }
      });
      sheetState.columns.forEach((column, columnIndex) => {
        if (column.type === 'text' || column.type === 'date') return;
        if (!selectedYColumnIds.has(column.id)) return;
        const xIndex = getNearestXColumnIndex(columnIndex);
        if (!Number.isInteger(xIndex)) return;
        const xColumn = sheetState.columns[xIndex];
        if (!xColumn) return;
        if (!mapping.has(xColumn.id)) {
          mapping.set(xColumn.id, []);
        }
        mapping.get(xColumn.id).push(column);
      });
      return mapping;
    };

    const canPlot = () => Boolean(selectedXColumnId && selectedYColumnIds.size && evaluatedRows.length);

    const buildFormulaTokens = () => sheetState.columns.map((column, index) => {
      const tokens = new Set();
      tokens.add(columnTokenForIndex(index));
      const shortLabel = toColumnShortLabel(index);
      tokens.add(shortLabel);
      tokens.add(shortLabel.toLowerCase());
      tokens.add(`Col${shortLabel}`);
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
          if (column.type === 'text' || column.type === 'date') return null;
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
      if (isEditLocked) return;
      const trimmed = typeof value === 'string' ? value.trim() : '';
      const formulas = { ...sheetState.formulas, [columnId]: trimmed };
      sheetState = { ...sheetState, formulas };
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    recalculateFormulas();

    const buildTracePayloads = () => {
      ensureSelectionIntegrity();
      const traces = [];
      if (plotMode === 'default') {
        const mapping = buildDefaultPlotMapping();
        mapping.forEach((yColumns, xColumnId) => {
          const xColumn = getColumnById(xColumnId);
          if (!xColumn) return;
          if (!yColumns.length) return;
          const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
          yColumns.forEach((column) => {
            const yValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]));
            const hasData = yValues.some((value) => value !== null && value !== '');
            if (!hasData) return;
            traces.push({
              name: column.label || column.id,
              x: xValues,
              y: yValues,
              meta: {
                sourcePanelId: panelId,
                columnId: column.id,
                columnLabel: column.label || '',
                xColumnId: xColumn.id,
                xLabel: xColumn.label || ''
              }
            });
          });
        });
        return traces;
      }

      const xColumns = sheetState.columns.filter((column) => selectedXColumnIds.has(column.id));
      if (!xColumns.length) return [];
      const yColumns = sheetState.columns.filter((column) => selectedYColumnIds.has(column.id));
      if (!yColumns.length) return [];
      xColumns.forEach((xColumn) => {
        const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
        yColumns.forEach((column) => {
          const yValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]));
          const hasData = yValues.some((value) => value !== null && value !== '');
          if (!hasData) return;
          traces.push({
            name: column.label || column.id,
            x: xValues,
            y: yValues,
            meta: {
              sourcePanelId: panelId,
              columnId: column.id,
              columnLabel: column.label || '',
              xColumnId: xColumn.id,
              xLabel: xColumn.label || ''
            }
          });
        });
      });
      return traces;
    };

    const getSelectedColumns = () => {
      const columns = [];
      sheetState.columns.forEach((column) => {
        if (selectedXColumnIds.has(column.id)) {
          columns.push(column);
        }
      });
      sheetState.columns.forEach((column) => {
        if (selectedYColumnIds.has(column.id)) {
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

    const buildSelectionRangeMatrix = () => {
      const ranges = getActiveSelectionRanges();
      if (!ranges.length) return null;
      const startRow = Math.max(0, Math.min(...ranges.map((range) => range.startRow)));
      const endRow = Math.min(
        evaluatedRows.length - 1,
        Math.max(...ranges.map((range) => range.endRow))
      );
      const startCol = Math.max(0, Math.min(...ranges.map((range) => range.startCol)));
      const endCol = Math.min(
        sheetState.columns.length - 1,
        Math.max(...ranges.map((range) => range.endCol))
      );
      if (endRow < startRow || endCol < startCol) return null;
      const columns = sheetState.columns.slice(startCol, endCol + 1);
      const header = columns.map((column) => column.label || column.id);
      const rows = evaluatedRows.slice(startRow, endRow + 1)
        .map((row) => columns.map((column) => serializeCellForExport(row?.[column.id])));
      const hasData = rows.some((row) => row.some((cell) => cell !== ''));
      return { columns, header, rows, hasData };
    };

    const copySelectionToClipboard = async () => {
      const matrix = getActiveSelectionRanges().length
        ? buildSelectionRangeMatrix()
        : buildSelectionMatrix();
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

    const triggerPlotFromHeader = () => {
      ensureSelectionIntegrity();
      if (plotMode === 'default') {
        const xCount = selectedXColumnIds.size;
        const yCount = selectedYColumnIds.size;
        if (!xCount || !yCount) {
          window.alert('Select at least one X and Y column before plotting.');
          return;
        }
        if (xCount > 1) {
          const proceed = window.confirm('Multiple X columns are selected. Create plots for each X?');
          if (!proceed) {
            return;
          }
        }
      }
      handlePlotRequest();
    };

    const updateActionButtons = () => {
      const ready = canPlot();
      const hasTarget = targetGraphSelections.size > 0;
      plotExistingBtn.disabled = !ready || !hasTarget;
      copySelectionBtn.disabled = !ready;
      exportSelectionBtn.disabled = !ready;
    };

    const setPlotMode = (nextMode) => {
      const resolved = nextMode === 'custom' ? 'custom' : 'default';
      if (plotMode === resolved) return;
      plotMode = resolved;
      renderPlotModeControls();
      renderPlotSourceControls();
      syncPlotSelectionState({ persist: true });
    };

    const renderPlotModeControls = () => {
      const isDefault = plotMode === 'default';
      modeDefaultBtn.classList.toggle('is-active', isDefault);
      modeCustomBtn.classList.toggle('is-active', !isDefault);
    };

    const buildPlotToggle = (label, title, active) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-outline-secondary workspace-spreadsheet-plot-chip${active ? ' is-active' : ''}`;
      btn.textContent = label;
      if (title) {
        btn.title = title;
      }
      return btn;
    };

    const renderPlotSourceControls = () => {
      sourceBody.innerHTML = '';
      ensureSelectionIntegrity();
      if (plotMode === 'default') {
        const list = document.createElement('div');
        list.className = 'workspace-spreadsheet-plot-source-list';
        const xColumns = sheetState.columns.filter((column) => selectedXColumnIds.has(column.id));
        if (!xColumns.length) {
          const empty = document.createElement('div');
          empty.className = 'workspace-spreadsheet-plot-empty';
          empty.textContent = 'Pick X and Y columns to plot.';
          list.appendChild(empty);
        } else {
          const mapping = buildDefaultPlotMapping();
          xColumns.forEach((xColumn) => {
            const xIndex = sheetState.columns.findIndex((col) => col.id === xColumn.id);
            const xLabel = toColumnShortLabel(xIndex);
            const mapped = mapping.get(xColumn.id) || [];
            const yLabel = mapped.map((col) => toColumnShortLabel(sheetState.columns.indexOf(col))).join(', ');
            const yName = mapped.map((col) => col.label || col.id).join(', ');
            const toggleLabel = yLabel ? `${xLabel} -> ${yLabel}` : `${xLabel} -> -`;
            const title = yName
              ? `${xLabel} (${xColumn.label || xColumn.id}) -> ${yName}`
              : `${xLabel} (${xColumn.label || xColumn.id})`;
            const active = selectedXColumnIds.has(xColumn.id);
            const btn = buildPlotToggle(toggleLabel, title, active);
            btn.addEventListener('click', () => {
              if (selectedXColumnIds.has(xColumn.id)) {
                if (selectedXColumnIds.size > 1) {
                  selectedXColumnIds.delete(xColumn.id);
                }
              } else {
                selectedXColumnIds.add(xColumn.id);
                selectedXColumnId = xColumn.id;
              }
              ensureSelectionIntegrity();
              syncPlotSelectionState({ persist: true });
              renderPlotSourceControls();
              updateActionButtons();
            });
            list.appendChild(btn);
          });
        }
        sourceBody.appendChild(list);
        return;
      }

      const xRow = document.createElement('div');
      xRow.className = 'workspace-spreadsheet-plot-row';
      const xLabel = document.createElement('div');
      xLabel.className = 'workspace-spreadsheet-plot-row-label';
      xLabel.textContent = 'X';
      const xButtons = document.createElement('div');
      xButtons.className = 'workspace-spreadsheet-plot-row-buttons';

      sheetState.columns.forEach((column, columnIndex) => {
        const label = toColumnShortLabel(columnIndex);
        const title = column.label || column.id;
        const active = selectedXColumnIds.has(column.id);
        const btn = buildPlotToggle(label, title, active);
        if (column.type === 'text' || column.type === 'date') {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        }
        btn.addEventListener('click', () => {
          if (column.type === 'text' || column.type === 'date') return;
          if (selectedXColumnIds.has(column.id)) {
            if (selectedXColumnIds.size > 1) {
              selectedXColumnIds.delete(column.id);
            }
          } else {
            selectedXColumnIds.add(column.id);
            selectedYColumnIds.delete(column.id);
            selectedXColumnId = column.id;
          }
          ensureSelectionIntegrity();
          syncPlotSelectionState({ persist: true });
          renderPlotSourceControls();
          updateActionButtons();
        });
        xButtons.appendChild(btn);
      });

      xRow.appendChild(xLabel);
      xRow.appendChild(xButtons);

      const yRow = document.createElement('div');
      yRow.className = 'workspace-spreadsheet-plot-row';
      const yLabel = document.createElement('div');
      yLabel.className = 'workspace-spreadsheet-plot-row-label';
      yLabel.textContent = 'Y';
      const yButtons = document.createElement('div');
      yButtons.className = 'workspace-spreadsheet-plot-row-buttons';

      sheetState.columns.forEach((column, columnIndex) => {
        const label = toColumnShortLabel(columnIndex);
        const title = column.label || column.id;
        const active = selectedYColumnIds.has(column.id);
        const btn = buildPlotToggle(label, title, active);
        if (column.type === 'text' || column.type === 'date') {
          btn.disabled = true;
          btn.classList.add('is-disabled');
        }
        btn.addEventListener('click', () => {
          if (column.type === 'text' || column.type === 'date') return;
          if (selectedYColumnIds.has(column.id)) {
            if (selectedYColumnIds.size > 1) {
              selectedYColumnIds.delete(column.id);
            }
          } else {
            selectedYColumnIds.add(column.id);
            selectedXColumnIds.delete(column.id);
          }
          ensureSelectionIntegrity();
          syncPlotSelectionState({ persist: true });
          renderPlotSourceControls();
          updateActionButtons();
        });
        yButtons.appendChild(btn);
      });

      yRow.appendChild(yLabel);
      yRow.appendChild(yButtons);
      sourceBody.appendChild(xRow);
      sourceBody.appendChild(yRow);
    };

    const renderPlotPreview = () => {
      plotPreviewBody.innerHTML = '';
      if (plotPreviewHidden) {
        return;
      }
      const previews = [];
      if (plotMode === 'default') {
        const mapping = buildDefaultPlotMapping();
        mapping.forEach((yColumns, xColumnId) => {
          const xColumn = getColumnById(xColumnId);
          if (!xColumn) return;
          const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
          yColumns.forEach((column) => {
            previews.push({
              label: `${xColumn.label || xColumn.id} \u2192 ${column.label || column.id}`,
              xValues,
              yValues: evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]))
            });
          });
        });
      } else {
        const xColumns = sheetState.columns.filter((column) => selectedXColumnIds.has(column.id)
          && column.type !== 'text'
          && column.type !== 'date');
        const yColumns = sheetState.columns.filter((column) => selectedYColumnIds.has(column.id)
          && column.type !== 'text'
          && column.type !== 'date');
        xColumns.forEach((xColumn) => {
          const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
          yColumns.forEach((column) => {
            previews.push({
              label: `${xColumn.label || xColumn.id} \u2192 ${column.label || column.id}`,
              xValues,
              yValues: evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]))
            });
          });
        });
      }

      if (!previews.length) {
        const empty = document.createElement('div');
        empty.className = 'workspace-spreadsheet-plot-empty';
        empty.textContent = 'No preview available.';
        plotPreviewBody.appendChild(empty);
        return;
      }

      previews.slice(0, 6).forEach((preview) => {
        const item = document.createElement('div');
        item.className = 'workspace-spreadsheet-plot-preview-item';
        const label = document.createElement('div');
        label.className = 'workspace-spreadsheet-plot-preview-label';
        label.textContent = preview.label;
        const spark = createSparklineSvg(preview.xValues, preview.yValues);
        if (spark) {
          item.appendChild(spark);
        }
        item.appendChild(label);
        plotPreviewBody.appendChild(item);
      });
    };

    const refreshPlotControls = () => {
      updatePreviewVisibility();
      renderPlotModeControls();
      renderPlotSourceControls();
      renderPlotPreview();
      updateActionButtons();
    };

    const updateTargetSummary = () => {
      const count = targetGraphSelections.size;
      targetSummary.textContent = count
        ? `${count} target${count === 1 ? '' : 's'}`
        : 'Select graph(s)';
    };

    modeDefaultBtn.addEventListener('click', () => setPlotMode('default'));
    modeCustomBtn.addEventListener('click', () => setPlotMode('custom'));
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
          updateTargetSummary();
          syncPlotSelectionState({ persist: true });
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
      updateTargetSummary();
      updateActionButtons();
    };

    const getPlotPopoverContent = () => {
      refreshGraphOptions();
      refreshPlotControls();
      return plotControls;
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

    const clearColumnSelection = () => {
      selectedColumnIndices.clear();
      columnSelectionAnchor = null;
    };

    const getActiveSelectionRanges = () => {
      if (selectionRanges.length) return selectionRanges;
      if (selectionRange) return [selectionRange];
      return [];
    };

    const setSelectionRanges = (ranges, { primary } = {}) => {
      selectionRanges = Array.isArray(ranges) ? ranges : [];
      selectionRange = primary || selectionRanges[0] || null;
      updateSelectionStyles();
    };

    const buildColumnSelectionRanges = (indices) => {
      const sorted = Array.from(indices).filter(Number.isInteger).sort((a, b) => a - b);
      if (!sorted.length) return [];
      const lastRowIndex = Math.max(0, sheetState.rows.length - 1);
      const ranges = [];
      let start = sorted[0];
      let prev = sorted[0];
      for (let i = 1; i < sorted.length; i += 1) {
        const current = sorted[i];
        if (current === prev + 1) {
          prev = current;
          continue;
        }
        ranges.push({ startRow: 0, endRow: lastRowIndex, startCol: start, endCol: prev });
        start = current;
        prev = current;
      }
      ranges.push({ startRow: 0, endRow: lastRowIndex, startCol: start, endCol: prev });
      return ranges;
    };

    const setColumnSelectionFromIndices = (indices, primaryIndex = null) => {
      const ranges = buildColumnSelectionRanges(indices);
      if (!ranges.length) {
        selectionRanges = [];
        selectionRange = null;
        updateSelectionStyles();
        return;
      }
      let primary = ranges[0];
      if (Number.isInteger(primaryIndex)) {
        const match = ranges.find((range) =>
          primaryIndex >= range.startCol && primaryIndex <= range.endCol
        );
        if (match) primary = match;
      }
      setSelectionRanges(ranges, { primary });
      activeColumnIndex = null;
      syncActiveHighlights();
    };

    const toggleColumnSelection = (columnIndex) => {
      const next = new Set(selectedColumnIndices);
      if (next.has(columnIndex)) {
        next.delete(columnIndex);
      } else {
        next.add(columnIndex);
      }
      selectedColumnIndices = next;
      setColumnSelectionFromIndices(next, columnIndex);
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

    const getHeaderColumnFromPoint = (clientX, clientY) => {
      if (typeof document === 'undefined') return null;
      const element = document.elementFromPoint(clientX, clientY);
      const header = element?.closest?.('.workspace-spreadsheet-column-header--col');
      if (!header) return null;
      const columnIndex = Number(header.dataset.columnIndex);
      if (!Number.isInteger(columnIndex)) return null;
      return columnIndex;
    };

    const updateSelectionStyles = () => {
      const ranges = getActiveSelectionRanges();
      const selectedColumns = new Set();
      ranges.forEach((range) => {
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          selectedColumns.add(col);
        }
      });
      table.querySelectorAll('.workspace-spreadsheet-cell').forEach((input) => {
        if (!ranges.length) {
          input.classList.remove('is-selected');
          return;
        }
        const rowIndex = Number(input.dataset.rowIndex);
        const columnIndex = Number(input.dataset.colIndex);
        const isSelected = ranges.some((range) =>
          rowIndex >= range.startRow
          && rowIndex <= range.endRow
          && columnIndex >= range.startCol
          && columnIndex <= range.endCol
        );
        input.classList.toggle('is-selected', isSelected);
      });
      table.querySelectorAll('.workspace-spreadsheet-column-header').forEach((header) => {
        const columnIndex = Number(header.dataset.columnIndex);
        header.classList.toggle('is-selected', selectedColumns.has(columnIndex));
      });
      table.querySelectorAll('.workspace-spreadsheet-fill-handle').forEach((handle) => handle.remove());
      if (!selectionRange) return;
      const handleHost = table.querySelector(
        `[data-row-index="${selectionRange.endRow}"][data-col-index="${selectionRange.endCol}"]`
      );
      if (!handleHost) return;
      const handle = document.createElement('div');
      handle.className = 'workspace-spreadsheet-fill-handle';
      handle.title = 'Drag to fill';
      handle.addEventListener('mousedown', (event) => startFillDrag(event, selectionRange));
      handleHost.parentElement?.appendChild(handle);
    };

    const setSelectionRange = (start, end, { clearColumnSelection: shouldClearColumnSelection = true } = {}) => {
      const normalized = normalizeSelectionRange(start, end);
      if (!normalized) return;
      selectionRange = normalized;
      selectionRanges = [normalized];
      if (shouldClearColumnSelection) {
        clearColumnSelection();
      }
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

    const setColumnSelectionRange = (startCol, endCol, { additive = false } = {}) => {
      const safeStart = Math.max(0, Math.min(startCol, endCol));
      const safeEnd = Math.max(startCol, endCol);
      const next = additive ? new Set(selectedColumnIndices) : new Set();
      for (let idx = safeStart; idx <= safeEnd; idx += 1) {
        next.add(idx);
      }
      selectedColumnIndices = next;
      setColumnSelectionFromIndices(next, safeEnd);
    };

    const handleHeaderSelectionMove = (event) => {
      const columnIndex = getHeaderColumnFromPoint(event.clientX, event.clientY);
      if (!Number.isInteger(columnIndex) || !Number.isInteger(columnSelectionAnchor)) return;
      setColumnSelectionRange(columnSelectionAnchor, columnIndex);
    };

    const handleHeaderSelectionEnd = () => {
      document.removeEventListener('mousemove', handleHeaderSelectionMove);
      document.removeEventListener('mouseup', handleHeaderSelectionEnd);
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

    const startColumnResize = (event, columnIndex, colEl, headerCell) => {
      if (!colEl) return;
      if (isEditLocked) return;
      event.preventDefault();
      event.stopPropagation();
      isSelecting = false;
      selectionAnchor = null;
      document.removeEventListener('mousemove', handleSelectionMove);
      document.removeEventListener('mouseup', handleSelectionEnd);
      document.removeEventListener('mousemove', handleHeaderSelectionMove);
      document.removeEventListener('mouseup', handleHeaderSelectionEnd);
      const startX = event.clientX;
      const startWidth = headerCell?.getBoundingClientRect?.().width
        || colEl.getBoundingClientRect().width
        || sheetState.columns[columnIndex]?.width
        || MIN_COLUMN_WIDTH;
      const minWidth = MIN_COLUMN_WIDTH;
      const columnEls = Array.from(table.querySelectorAll('colgroup col')).slice(1);
      const targetIndices = selectedColumnIndices.has(columnIndex)
        ? Array.from(selectedColumnIndices)
        : [columnIndex];
      const applyWidth = (nextWidth) => {
        targetIndices.forEach((idx) => {
          const target = columnEls[idx];
          if (target) {
            target.style.width = `${Math.round(nextWidth)}px`;
          }
        });
      };
      const handleMove = (moveEvent) => {
        const delta = moveEvent.clientX - startX;
        const nextWidth = Math.max(minWidth, startWidth + delta);
        applyWidth(nextWidth);
      };
      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        const finalWidth = Number.parseFloat(colEl.style.width) || startWidth;
        targetIndices.forEach((idx) => updateColumnWidth(idx, finalWidth));
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    };

    const handleCellInput = (event) => {
      if (isEditLocked) return;
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
      if (isEditLocked) return;
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
      if ((event.ctrlKey || event.metaKey) && event.key?.toLowerCase() === 'c') {
        const target = event.target;
        if (target instanceof HTMLInputElement) {
          if (Number.isInteger(target.selectionStart)
            && Number.isInteger(target.selectionEnd)
            && target.selectionStart !== target.selectionEnd) {
            return;
          }
        }
        if (getActiveSelectionRanges().length) {
          event.preventDefault();
          copySelectionToClipboard();
          return;
        }
      }
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
      ensureSelectionIntegrity();
      table.innerHTML = '';
      const thead = document.createElement('thead');
      const colgroup = document.createElement('colgroup');
      const cornerCol = document.createElement('col');
      cornerCol.style.width = `${CORNER_COL_WIDTH_REM}rem`;
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
          key: 'ghost',
          label: '',
          height: 28,
          className: 'workspace-spreadsheet-column-header--ghost',
          buildCell: (th, columnIndex) => {
            const actions = document.createElement('div');
            actions.className = 'workspace-spreadsheet-col-actions workspace-spreadsheet-col-actions--ghost';

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
            th.appendChild(actions);
          }
        },
        {
          key: 'col',
          label: '',
          className: 'workspace-spreadsheet-column-header--col',
          buildCell: (th, columnIndex, column) => {
            const header = document.createElement('div');
            header.className = 'workspace-spreadsheet-col-header';

            const handle = document.createElement('button');
            handle.type = 'button';
            handle.className = 'workspace-spreadsheet-col-handle';
            handle.title = 'Drag to reorder column';
            handle.innerHTML = '<i class="bi bi-grip-horizontal"></i>';
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

            const role = selectedXColumnIds.has(column.id)
              ? 'x'
              : (selectedYColumnIds.has(column.id) ? 'y' : 'z');
            const roleBtn = document.createElement('button');
            roleBtn.type = 'button';
            roleBtn.className = `workspace-spreadsheet-col-role-toggle is-${role}`;
            roleBtn.textContent = role.toUpperCase();
            roleBtn.title = role === 'x'
              ? 'X axis'
              : (role === 'y' ? 'Y series' : 'Z axis (coming soon)');
            roleBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              if (role === 'x') {
                selectedXColumnIds.delete(column.id);
                selectedYColumnIds.add(column.id);
                if (selectedXColumnId === column.id) {
                  selectedXColumnId = null;
                }
              } else if (role === 'y') {
                selectedYColumnIds.delete(column.id);
              } else {
                selectedXColumnIds.add(column.id);
                selectedYColumnIds.delete(column.id);
                selectedXColumnId = column.id;
              }
              ensureSelectionIntegrity();
              syncPlotSelectionState({ persist: true });
              refreshPlotControls();
              renderGrid();
            });

            const typeValue = column.type === 'text' || column.type === 'date' ? column.type : 'number';
            const typeBtn = document.createElement('button');
            typeBtn.type = 'button';
            typeBtn.className = `workspace-spreadsheet-col-type-toggle is-${typeValue}`;
            typeBtn.textContent = typeValue === 'text' ? 'T' : (typeValue === 'date' ? 'D' : 'N');
            typeBtn.title = typeValue === 'text'
              ? 'Text column'
              : (typeValue === 'date' ? 'Date column' : 'Number column');
            typeBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              const next = typeValue === 'number'
                ? 'text'
                : (typeValue === 'text' ? 'date' : 'number');
              updateColumnType(columnIndex, next);
            });

            actions.appendChild(duplicateBtn);
            actions.appendChild(clearBtn);
            actions.appendChild(deleteBtn);
            header.appendChild(handle);
            header.appendChild(roleBtn);
            header.appendChild(typeBtn);
            header.appendChild(token);
            header.appendChild(actions);
            const resizer = document.createElement('div');
            resizer.className = 'workspace-spreadsheet-col-resizer';
            resizer.addEventListener('mousedown', (event) => {
              startColumnResize(event, columnIndex, colEls[columnIndex], th);
            });
            resizer.addEventListener('dblclick', (event) => {
              event.stopPropagation();
              const nextWidth = getAutoFitWidth(columnIndex);
              updateColumnWidth(columnIndex, nextWidth);
              renderGrid();
            });
            header.appendChild(resizer);
            th.appendChild(header);
            th.addEventListener('click', () => handleHeaderClick(columnIndex));
            th.addEventListener('mousedown', (event) => {
              if (event.button !== 0) return;
              if (isEditLocked) return;
              if (event.target.closest('.workspace-spreadsheet-col-handle')) return;
              if (event.target.closest('.workspace-spreadsheet-col-actions')) return;
              if (event.target.closest('.workspace-spreadsheet-col-role-toggle')) return;
              if (event.target.closest('.workspace-spreadsheet-col-type-toggle')) return;
              if (event.target.closest('.workspace-spreadsheet-col-resizer')) return;
              event.preventDefault();
              const isCtrl = event.ctrlKey || event.metaKey;
              const isShift = event.shiftKey;
              if (isShift && Number.isInteger(columnSelectionAnchor)) {
                setColumnSelectionRange(columnSelectionAnchor, columnIndex, { additive: isCtrl });
              } else if (isCtrl) {
                toggleColumnSelection(columnIndex);
                columnSelectionAnchor = columnIndex;
              } else {
                columnSelectionAnchor = columnIndex;
                setColumnSelectionRange(columnIndex, columnIndex);
              }
              selectionAnchor = { rowIndex: 0, columnIndex };
              document.addEventListener('mousemove', handleHeaderSelectionMove);
              document.addEventListener('mouseup', handleHeaderSelectionEnd);
            });
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
          label: '',
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
          label: '',
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
          label: '',
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
        },
        {
          key: 'spark',
          label: '',
          className: 'workspace-spreadsheet-column-header--spark',
          buildCell: (th, columnIndex, column) => {
            const cell = document.createElement('div');
            cell.className = 'workspace-spreadsheet-sparkline-cell';
            if (!selectedXColumnIds.has(column.id)) {
              const xIndex = getNearestXColumnIndex(columnIndex);
              if (Number.isInteger(xIndex)) {
                const xColumn = sheetState.columns[xIndex];
                const xValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[xColumn.id]));
                const yValues = evaluatedRows.map((row) => sanitizeCellValue(row?.[column.id]));
                const spark = createSparklineSvg(xValues, yValues);
                if (spark) {
                  cell.appendChild(spark);
                } else {
                  cell.classList.add('is-empty');
                }
              } else {
                cell.classList.add('is-empty');
              }
            } else {
              cell.classList.add('is-empty');
            }
            th.appendChild(cell);
          }
        }
      ];

      let headerOffset = 0;
      headerRows.forEach((rowConfig, rowIndex) => {
        const rowHeight = Number.isFinite(rowConfig.height) ? rowConfig.height : HEADER_ROW_HEIGHT;
        const row = document.createElement('tr');
        row.className = `workspace-spreadsheet-head-row workspace-spreadsheet-head-row--${rowConfig.key}`;

        const corner = document.createElement('th');
        corner.className = 'workspace-spreadsheet-corner workspace-spreadsheet-header-corner';
        corner.textContent = rowConfig.label;
        corner.style.top = `${headerOffset}px`;
        corner.style.height = `${rowHeight}px`;
        row.appendChild(corner);

        sheetState.columns.forEach((column, columnIndex) => {
          const th = document.createElement('th');
          th.className = `workspace-spreadsheet-column-header ${rowConfig.className}`;
          th.dataset.columnIndex = String(columnIndex);
          th.style.top = `${headerOffset}px`;
          th.style.height = `${rowHeight}px`;
          rowConfig.buildCell(th, columnIndex, column);
          row.appendChild(th);
        });

        thead.appendChild(row);
        headerOffset += rowHeight;
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

      applyEditLockState(isEditLocked);
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
      if (isEditLocked) return;
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
      if (isEditLocked) return;
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const nextUnits = typeof value === 'string' ? value.trim() : '';
      if (nextUnits === (column.units || '')) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, units: nextUnits };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
    };

    const updateColumnType = (columnIndex, nextType) => {
      if (isEditLocked) return;
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const normalized = nextType === 'text' || nextType === 'date' || nextType === 'number'
        ? nextType
        : 'number';
      if (normalized === column.type) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, type: normalized };
      sheetState = { ...sheetState, columns: nextColumns };
      if (normalized !== 'number') {
        selectedXColumnIds.delete(column.id);
        selectedYColumnIds.delete(column.id);
        if (selectedXColumnId === column.id) {
          selectedXColumnId = null;
        }
      }
      ensureSelectionIntegrity();
      syncPlotSelectionState({ persist: true });
      recalculateFormulas();
      markDirty();
      renderGrid();
      refreshPlotControls();
    };

    const updateColumnWidth = (columnIndex, width) => {
      if (isEditLocked) return;
      const column = sheetState.columns[columnIndex];
      if (!column) return;
      const numeric = Number(width);
      const nextWidth = Number.isFinite(numeric) ? Math.max(MIN_COLUMN_WIDTH, Math.round(numeric)) : null;
      if ((column.width ?? null) === nextWidth) return;
      const nextColumns = sheetState.columns.slice();
      nextColumns[columnIndex] = { ...column, width: nextWidth };
      sheetState = { ...sheetState, columns: nextColumns };
      markDirty();
    };

    const measureTextWidth = (() => {
      if (typeof document === 'undefined') return () => 0;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return () => 0;
      return (text, element) => {
        if (!text || !element) return 0;
        const style = window.getComputedStyle(element);
        const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        ctx.font = font;
        return ctx.measureText(text).width;
      };
    })();

    const getAutoFitWidth = (columnIndex) => {
      let maxWidth = 80;
      const headerCells = table.querySelectorAll(`thead [data-column-index="${columnIndex}"]`);
      headerCells.forEach((cell) => {
        if (cell.classList.contains('workspace-spreadsheet-column-header--spark')) {
          return;
        }
        const input = cell.querySelector('input');
        if (input) {
          const textValue = input.value || '';
          if (textValue) {
            maxWidth = Math.max(maxWidth, Math.ceil(measureTextWidth(textValue, input)) + 24);
          }
        }
        const token = cell.querySelector('.workspace-spreadsheet-col-token');
        if (token?.textContent) {
          maxWidth = Math.max(maxWidth, Math.ceil(measureTextWidth(token.textContent, token)) + 24);
        }
      });
      const dataCells = table.querySelectorAll(`tbody .workspace-spreadsheet-cell[data-col-index="${columnIndex}"]`);
      dataCells.forEach((input) => {
        const textValue = input.value || '';
        if (textValue) {
          maxWidth = Math.max(maxWidth, Math.ceil(measureTextWidth(textValue, input)) + 18);
        }
      });
      return Math.min(Math.ceil(maxWidth), 420);
    };

    const removeColumnAt = (targetIndex) => {
      if (isEditLocked) return;
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
      ensureSelectionIntegrity();
      recalculateFormulas();
      markDirty();
      renderGrid();
    };

    const removeRowAt = (targetIndex) => {
      if (isEditLocked) return;
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
      if (isEditLocked) return;
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
      if (isEditLocked) return;
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
      if (isEditLocked) return;
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
      if (isEditLocked) return;
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
      getPlotPopoverContent,
      getPlotPreviewContent: () => plotPreview,
      triggerPlotFromHeader,
      getQuickTipsMarkup: () => tipsMarkup,
      refreshContent(nextContent) {
        if (!nextContent || typeof nextContent !== 'object') return;
        sheetState = buildContent(nextContent);
        const plotSelection = sheetState.plot || { x: [], y: [] };
        selectedXColumnIds = new Set(plotSelection.x || []);
        selectedYColumnIds = new Set(plotSelection.y || []);
        selectedXColumnId = plotSelection.x?.[0] || null;
        plotMode = sheetState.plotMode === 'custom' ? 'custom' : 'default';
        targetGraphSelections = new Set(sheetState.plotTargets || []);
        plotPreviewHidden = sheetState.plotPreviewHidden === true;
        ensureSelectionIntegrity();
        syncPlotSelectionState();
        historyPending = false;
        flushPendingChanges();
        recalculateFormulas();
        renderGrid();
        updatePreviewVisibility();
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
