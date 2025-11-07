/**
 * Responsibility: Orchestrate workspace canvas behaviour by coordinating models, plotting, browser UI, storage, and history.
 * Inputs: expects DOM root handles, optional debug flags, and imported facades (models, storage, history, browser bridges).
 * Outputs: mutates DOM and models as side effects and returns a runtime API for the controller (render, focus, lifecycle handlers).
 * Never: never invoke Plotly directly (delegate to Render facade), never mutate panel data outside the PanelsModel API, never attach global listeners that are not exposed through the returned handlers.
 */
import { fetchDemoFiles } from '../../../../services/demos.js';
import { uploadTraceFile } from '../../../../services/uploads.js';
import { createChipPanels } from '../../chipPanels.js';
import { createPanelsModel } from '../../../../workspace/canvas/state/panelsModel.js';
import { applyLineChip } from '../../../utils/styling_linechip.js';
import { toHexColor } from '../../../utils/styling.js';
import * as storage from '../../../../core/storage.js';
import { createHistory } from '../../../../core/history.js';
import * as chipPanelsBridge from '../../../workspace/browser/chipPanelsBridge.js';

import * as Actions from '../../../../workspace/canvas/plotting/actionsController.js';
import { createBrowserFacade } from './browser/facade.js';
import { createPersistenceFacade } from './persistence/facade.js';
import { createPanelsFacade } from './panels/facade.js';
import { createPanelDomFacade } from './panels/panelDomFacade.js';
import { createHeaderActions } from './panels/headerActions.js';
import { createPlotFacade } from './panels/plotFacade.js';
import { createSnapshotManager } from './state/snapshotManager.js';
import { createHistoryHelpers } from './state/historyHelpers.js';
import { createColorCursorManager } from './state/colorCursorManager.js';
import { createPanelPreferencesManager } from './state/panelPreferencesManager.js';
import { createPanelInteractions } from './panels/panelInteractions.js';
import { createIoFacade } from './io/facade.js';
import { createRuntimeState } from './context/runtimeState.js';
import { createUiPreferencesFacade } from './preferences/facade.js';
import { createSectionManager } from './sections/manager.js';

const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;
const COLOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
  '#bcbd22', '#17becf'
];
const HISTORY_LIMIT = 25;
const HISTORY_GEOMETRY_TOLERANCE = 2;
const PANEL_COLLAPSE_KEY = 'ftir.workspace.panelCollapsed.v1';
const PANEL_PIN_KEY = 'ftir.workspace.panelPinned.v1';
const FALLBACK_COLOR = COLOR_PALETTE[0] || '#1f77b4';

const DEFAULT_SECTION_ID = 'section_all';
const TRACE_DRAG_MIME = 'application/x-ftir-workspace-trace';
const OPERATIONS_LOG_LIMIT = 100;
const operationsLog = [];
let operationsPanelHandles = null;
let operationsToggleButton = null;
let operationsVisible = true;
let operationsRenderQueued = false;
let operationSequence = 0;
const colorCursorManager = createColorCursorManager();
let panelPreferences = null;

const sectionManager = createSectionManager({ defaultSectionId: DEFAULT_SECTION_ID });
const sections = sectionManager.getMap();
let chipPanelsInstance = null;
let dragState = null;
let currentDropTarget = null;
let pendingRenameSectionId = null;
let activePanelId = null;
let browserFacade = null;
let persistence = null;
let history = null;
let persist = () => {};
let pushHistory = () => {};
let undo = () => {};
let redo = () => {};
let updateHistoryButtons = () => {};
let updateStorageButtons = () => {};
let saveWorkspaceSnapshot = () => {};
let loadWorkspaceSnapshot = () => {};
let clearWorkspaceSnapshot = () => {};
let preferencesFacade = null;

const setDropTarget = (element) => {
  if (currentDropTarget === element) return;
  if (currentDropTarget) {
    currentDropTarget.classList.remove('is-drop-target');
  }
  currentDropTarget = element || null;
  if (currentDropTarget) {
    currentDropTarget.classList.add('is-drop-target');
  }
};

const getDragState = () => dragState;
const setDragState = (next) => {
  dragState = next;
};
const getActivePanelId = () => activePanelId;

const pickColor = () => {
  const current = colorCursorManager.get();
  const color = COLOR_PALETTE[current % COLOR_PALETTE.length];
  colorCursorManager.increment();
  return color;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const showToast = (message, variant = 'info', delay = 2400) => {
  if (typeof window?.showAppToast === 'function') {
    window.showAppToast({ message, variant, delay });
  }
};

let normalizePanelTraces = () => null;
let createTraceFromPayload = () => null;
let ingestPayloadAsPanel = () => null;
let appendFilesToGraph = async () => {};
let moveTrace = () => false;
let moveGraph = () => false;
let removePanel = () => {};
let clearPanels = () => {};
let restoreSnapshot = () => {};

const randomPanelId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `canvas_${crypto.randomUUID()}`;
  }
  return `canvas_${Math.random().toString(36).slice(2, 9)}`;
};

const decodeName = (value) => {
  if (typeof value !== 'string' || !value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const ensureTraceId = (trace) => {
  if (!trace) return null;
  if (!trace._canvasId) {
    trace._canvasId = randomPanelId();
  }
  return trace._canvasId;
};

const ensureDefaultSection = () => {
  sectionManager.ensureDefaultSection();
};

const createSection = (name, options = {}) => sectionManager.createSection(name, options);

const deleteSection = (sectionId) => {
  sectionManager.deleteSection(sectionId);
};

const renameSection = (sectionId, name) => {
  sectionManager.renameSection(sectionId, name);
};

const setSectionCollapsed = (sectionId, collapsed) => {
  sectionManager.setSectionCollapsed(sectionId, collapsed);
};

const moveSection = (sectionId, options = {}) => sectionManager.moveSection(sectionId, options);

const collectSectionDescendants = (sectionId) => sectionManager.collectDescendants(sectionId);

const sectionsModel = {
  snapshot: () => sectionManager.snapshot(),
  load: (snapshot) => {
    sectionManager.load(snapshot);
  }
};

const defaultPanelTitle = (index) => {
  const numeric = Number(index);
  return Number.isFinite(numeric) && numeric > 0 ? `Graph ${numeric}` : 'Graph';
};

const resolvePanelTitle = (record) => {
  const raw = typeof record?.title === 'string' ? record.title.trim() : '';
  const index = Number(record?.index);
  return raw || defaultPanelTitle(index);
};


export function initWorkspaceRuntime(context = {}) {
  colorCursorManager.reset();
  sectionManager.reset();
  chipPanelsInstance = null;
  dragState = null;
  currentDropTarget = null;
  pendingRenameSectionId = null;
  activePanelId = null;
  browserFacade?.teardown?.();
  browserFacade = null;
  operationsLog.length = 0;
  operationsRenderQueued = false;
  operationSequence = 0;
  if (operationsPanelHandles?.root?.parentNode) {
    operationsPanelHandles.root.parentNode.removeChild(operationsPanelHandles.root);
  }
  operationsPanelHandles = null;
  operationsVisible = true;
  if (operationsToggleButton?.parentNode) {
    operationsToggleButton.parentNode.removeChild(operationsToggleButton);
  }
  operationsToggleButton = null;
  const { roots = {} } = context;
  const canvas = roots.canvas ?? document.getElementById('c_canvas_root');
  const addPlotBtn = roots.addPlotButton ?? document.getElementById('c_canvas_add_plot');
  const resetBtn = roots.resetButton ?? document.getElementById('c_canvas_reset_layout');
  const browseBtn = roots.browseButton ?? document.getElementById('c_canvas_browse_btn');
  const demoBtn = roots.demoButton ?? document.getElementById('c_canvas_demo_btn');
  const fileInput = roots.fileInput ?? document.getElementById('c_canvas_file_input');
  const emptyOverlay = roots.emptyOverlay ?? document.getElementById('c_canvas_empty');
  const canvasWrapper = roots.canvasWrapper ?? canvas?.closest('.workspace-canvas-wrapper');
  const topToolbar = roots.topToolbar ?? canvasWrapper?.querySelector('.workspace-toolbar');
  const verticalToolbar = roots.verticalToolbar ?? canvasWrapper?.querySelector('.workspace-toolbar-vertical');

  const updateToolbarMetrics = () => {
    if (!canvasWrapper) return;
    const toolbarHeight = topToolbar ? Math.round(topToolbar.getBoundingClientRect().height) : 0;
    const toolbarWidth = verticalToolbar ? Math.round(verticalToolbar.getBoundingClientRect().width) : 0;
    canvasWrapper.style.setProperty('--workspace-toolbar-height', `${toolbarHeight}px`);
    canvasWrapper.style.setProperty('--workspace-toolbar-vertical-width', `${toolbarWidth}px`);
  };

  function updateOperationsToggleState() {
    if (!operationsToggleButton) return;
    const labelText = operationsVisible ? 'Hide operations log' : 'Show operations log';
    operationsToggleButton.textContent = operationsVisible ? '×' : 'Ops';
    operationsToggleButton.setAttribute('aria-pressed', String(operationsVisible));
    operationsToggleButton.setAttribute('aria-label', labelText);
    operationsToggleButton.setAttribute('title', labelText);
    operationsToggleButton.classList.toggle('is-active', operationsVisible);
  }

  function syncOperationsVisibility() {
    if (operationsPanelHandles?.root) {
      operationsPanelHandles.root.hidden = !operationsVisible;
      operationsPanelHandles.root.setAttribute('aria-hidden', String(!operationsVisible));
    }
    updateOperationsToggleState();
  }

  function toggleOperationsVisibility(force = null) {
    const next = typeof force === 'boolean' ? force : !operationsVisible;
    operationsVisible = next;
    ensureOperationsPanel();
    syncOperationsVisibility();
  }

  function ensureOperationsToggle() {
    if (!canvasWrapper) return null;
    if (operationsToggleButton?.isConnected) {
      updateOperationsToggleState();
      return operationsToggleButton;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'workspace-operations-toggle';
    btn.addEventListener('click', () => toggleOperationsVisibility());
    canvasWrapper.appendChild(btn);
    operationsToggleButton = btn;
    updateOperationsToggleState();
    return operationsToggleButton;
  }

  function ensureOperationsPanel() {
    if (!canvasWrapper) return null;
    if (operationsPanelHandles?.root?.isConnected) {
      ensureOperationsToggle();
      if (operationsToggleButton && operationsPanelHandles.root.id) {
        operationsToggleButton.setAttribute('aria-controls', operationsPanelHandles.root.id);
      }
      syncOperationsVisibility();
      return operationsPanelHandles;
    }
    const panel = document.createElement('aside');
    panel.className = 'workspace-operations-panel';
    panel.id = 'c_workspace_operations';
    const header = document.createElement('div');
    header.className = 'workspace-operations-panel__header';
    header.textContent = 'Operations';
    const list = document.createElement('div');
    list.className = 'workspace-operations-panel__list';
    panel.append(header, list);
    canvasWrapper.appendChild(panel);
    operationsPanelHandles = { root: panel, header, list };
    ensureOperationsToggle();
    if (operationsToggleButton) {
      operationsToggleButton.setAttribute('aria-controls', panel.id);
    }
    syncOperationsVisibility();
    return operationsPanelHandles;
  }

const shortenSource = (value) => {
  if (!value) return '';
  let text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  const parenIndex = text.indexOf('(');
  if (parenIndex >= 0) {
    const inner = text.slice(parenIndex + 1);
    const closing = inner.lastIndexOf(')');
    text = closing >= 0 ? inner.slice(0, closing) : inner;
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      text = text.replace(window.location.origin, '');
    }
  } catch {
    /* ignore */
  }
  text = text.replace(/\s+at\s+/gi, '').trim();
  if (text.length > 120) {
    return `${text.slice(0, 117)}…`;
  }
  return text;
};

const describeHistoryStatus = (delta) => {
  if (delta == null) return '—';
  if (delta === 0) return 'Merged';
  if (delta > 0) return 'Added';
  if (delta < 0) return 'Rewind';
  return '—';
};

const STATUS_LABELS = new Set(['added', 'merged', 'rewind', 'state change']);

const extractInlineStatus = (value) => {
  const fallback = typeof value === 'string' ? value.trim() : '';
  if (!fallback) {
    return { text: '', inlineStatus: null };
  }
  const match = fallback.match(/\(([^)]+)\)\s*$/);
  if (!match) {
    return { text: fallback, inlineStatus: null };
  }
  const candidate = match[1]?.trim() ?? '';
  if (!candidate || !STATUS_LABELS.has(candidate.toLowerCase())) {
    return { text: fallback, inlineStatus: null };
  }
  const trimmedText = fallback.slice(0, match.index).trim();
  return {
    text: trimmedText || fallback,
    inlineStatus: candidate
  };
};

const formatDelta = (value) => {
  if (!Number.isFinite(value) || value === 0) return '0';
  return value > 0 ? `+${value}` : String(value);
};

const buildOperationDetail = (meta = {}) => {
  if (!meta) return '';
  if (typeof meta.detail === 'string' && meta.detail.trim()) {
    return meta.detail.trim();
  }
  if (meta.action === 'panel-resize' && meta.deltas) {
    return `ΔW ${formatDelta(meta.deltas.width)}px, ΔH ${formatDelta(meta.deltas.height)}px`;
  }
  if (meta.action === 'panel-drag' && meta.deltas) {
    return `ΔX ${formatDelta(meta.deltas.x)}px, ΔY ${formatDelta(meta.deltas.y)}px`;
  }
  if (meta.action && meta.value !== undefined) {
    return `${meta.action}: ${meta.value}`;
  }
  return '';
};

const annotateOperationMeta = (operationId, nextMeta = {}) => {
  if (!operationId || !operationsLog.length) return;
  const target = operationsLog.find((entry) => entry.meta?.operationId === operationId);
  if (!target) return;
  target.meta = {
    ...(target.meta || {}),
    ...(nextMeta || {})
  };
  scheduleOperationsRender();
};

const normalizeHistoryInfo = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const result = {
      label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : null,
      meta: value.meta && typeof value.meta === 'object' ? { ...value.meta } : null
    };
    return result;
  }
  return {
    label: typeof value === 'string' && value.trim() ? value.trim() : null,
    meta: null
  };
};

const renderOperationsLog = () => {
  operationsRenderQueued = false;
  const handles = ensureOperationsPanel();
  if (!handles) return;
  const listEl = handles.list;
  listEl.innerHTML = '';
  if (!operationsLog.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-operations-panel__empty';
    empty.textContent = 'No operations yet.';
    listEl.appendChild(empty);
    syncOperationsVisibility();
    return;
  }
  const table = document.createElement('table');
  table.className = 'workspace-operations-panel__table';

  const headRow = document.createElement('tr');
  ['Time', 'Operation', 'Status', 'Details', 'Location'].forEach((label) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headRow.appendChild(th);
  });
  const thead = document.createElement('thead');
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  operationsLog.forEach((entry) => {
    const row = document.createElement('tr');

    const timeCell = document.createElement('td');
    const timeText = Number.isFinite(entry.timestamp)
      ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '';
    timeCell.textContent = timeText || '—';
    timeCell.title = timeText || '—';

    const opCell = document.createElement('td');
    const { text: cleanLabel, inlineStatus } = extractInlineStatus(entry.label || 'Operation');
    const operationLabel = cleanLabel || 'Operation';
    opCell.textContent = operationLabel;
    const historyDelta = typeof entry?.meta?.historyDelta === 'number' ? entry.meta.historyDelta : null;
    const titleParts = [operationLabel];
    if (historyDelta != null) {
      const signedDelta = historyDelta > 0 ? `+${historyDelta}` : `${historyDelta}`;
      titleParts.push(`Δhistory ${signedDelta}`);
    }
    if (typeof entry?.meta?.historySize === 'number') {
      titleParts.push(`history size ${entry.meta.historySize}`);
    }
    if (typeof entry?.meta?.futureSize === 'number') {
      titleParts.push(`future size ${entry.meta.futureSize}`);
    }
    opCell.title = titleParts.join(' • ');

    const statusCell = document.createElement('td');
    const metaStatus = typeof entry?.meta?.status === 'string' ? entry.meta.status.trim() : null;
    const statusCandidates = [
      describeHistoryStatus(historyDelta),
      metaStatus,
      inlineStatus
    ].filter(Boolean);
    const statusText = statusCandidates.find((value) => value && value !== '—') || '—';
    if (statusText && statusText !== '—') {
      titleParts.push(`status ${statusText}`);
    }
    statusCell.textContent = statusText;
    statusCell.title = statusText;

    const detailCell = document.createElement('td');
    const detailText = buildOperationDetail(entry.meta);
    detailCell.textContent = detailText || '—';
    detailCell.title = detailText || '—';

    const locationCell = document.createElement('td');
    const locationText = entry.source ? shortenSource(entry.source) : '—';
    locationCell.textContent = locationText;
    locationCell.title = entry.source || locationText || '—';

    row.append(timeCell, opCell, statusCell, detailCell, locationCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  listEl.appendChild(table);
  syncOperationsVisibility();
};

  const scheduleOperationsRender = () => {
    if (operationsRenderQueued) return;
    operationsRenderQueued = true;
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(renderOperationsLog);
    } else {
      setTimeout(renderOperationsLog, 0);
    }
  };

  const deriveLabelFromSource = (source) => {
    if (!source) return null;
    let head = source.trim();
    if (!head) return null;
    const parenIdx = head.indexOf('(');
    if (parenIdx > 0) {
      head = head.slice(0, parenIdx).trim();
    }
    if (!head) return null;
    if (head.includes('/')) {
      // stack frame without explicit function name (just path)
      const parts = head.split('/');
      head = parts[parts.length - 1];
    }
    if (head.includes('.')) {
      const segments = head.split('.');
      head = segments[segments.length - 1];
    }
    head = head.replace(/^Object\./, '').replace(/^Module\./, '');
    if (!head) return null;
    if (head === '<anonymous>' || head === 'anonymous') return null;
    return head;
  };

const recordOperation = (entry) => {
  const payload = typeof entry === 'string' ? { label: entry } : (entry || {});
  const source = typeof payload.source === 'string' ? payload.source : null;
  let label = typeof payload.label === 'string' && payload.label.trim()
    ? payload.label.trim()
    : null;
  if (!label) {
    label = deriveLabelFromSource(source);
  }
  if (!label) {
    label = 'Operation';
  }
  const timestamp = Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now();
  const meta = payload.meta && typeof payload.meta === 'object' ? { ...payload.meta } : {};
  if (!meta.operationId) {
    operationSequence += 1;
    meta.operationId = `op_${Date.now()}_${operationSequence}`;
  }
  operationsLog.unshift({ label, source, timestamp, meta });
  while (operationsLog.length > OPERATIONS_LOG_LIMIT) {
    operationsLog.pop();
  }
  ensureOperationsPanel();
  scheduleOperationsRender();
  return meta.operationId;
};

  const captureOperationSource = () => {
    try {
      const err = new Error();
      if (!err.stack) return null;
      const lines = err.stack.split('\n');
      for (let i = 2; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (!line) continue;
        if (line.includes('workspaceRuntime.js')) continue;
        if (line.includes('historyHelpers.js')) continue;
        return line.replace(/^at\s+/, '');
      }
    } catch {
      /* ignore stack parsing issues */
    }
    return null;
  };

  if (!canvas || canvas.dataset.initialized === '1') return;
  canvas.dataset.initialized = '1';
  ensureOperationsPanel();

  const panelsModel = createPanelsModel();
  const panelDomRegistry = new Map();

  const registerPanelDom = (panelId, handles = {}) => {
    if (!panelId) return null;
    const existing = panelDomRegistry.get(panelId) || {};
    const runtime = handles.runtime ?? existing.runtime ?? { dragSnapshot: null, visual: null };
    const next = {
      ...existing,
      rootEl: handles.rootEl ?? existing.rootEl ?? null,
      headerEl: handles.headerEl ?? existing.headerEl ?? null,
      titleEl: handles.titleEl ?? existing.titleEl ?? null,
      plotEl: handles.plotEl ?? existing.plotEl ?? null,
      runtime
    };
    panelDomRegistry.set(panelId, next);
    return next;
  };

  const getPanelDom = (panelId) => {
    if (!panelId) return null;
    return panelDomRegistry.get(panelId) || null;
  };

  const detachPanelDom = (panelId) => {
    if (!panelId) return;
    panelDomRegistry.delete(panelId);
  };

  const getPanelFigure = (panelId) => panelsModel.getPanelFigure(panelId) || { data: [], layout: {} };

  const Plot = createPlotFacade({
    getPanelDom,
    getPanelFigure,
    setPanelFigure: (panelId, figure) => panelsModel.updatePanelFigure(panelId, figure),
    actionsController: Actions
  });

  const getPanelSnapshot = (panelId) => (panelId ? panelsModel.getPanel(panelId) : null);
  const getPanelRecord = getPanelSnapshot;

  const getPanelsOrdered = () => panelsModel.getPanelsInIndexOrder();

  const allocatePanelIndex = (preferredIndex) => {
    if (Number.isInteger(preferredIndex) && preferredIndex > 0) {
      return preferredIndex;
    }
    const used = new Set();
    getPanelsOrdered().forEach((record) => {
      const idx = Number(record?.index);
      if (Number.isInteger(idx) && idx > 0) {
        used.add(idx);
      }
    });
    let cursor = 1;
    while (used.has(cursor)) {
      cursor += 1;
    }
    return cursor;
  };

  const getPanelTraces = (panelId) => panelsModel.getPanelTraces(panelId) || [];

  const ensurePanelRuntime = (panelId) => {
    if (!panelId) return null;
    const dom = getPanelDom(panelId);
    if (!dom) return null;
    if (!dom.runtime) {
      dom.runtime = { dragSnapshot: null, visual: null };
    }
    return dom.runtime;
  };

  const getNextPanelSequence = () => allocatePanelIndex();

  const updatePanelRuntime = (panelId, patch = {}) => {
    const runtime = ensurePanelRuntime(panelId);
    if (!runtime) return null;
    Object.assign(runtime, patch);
    return runtime;
  };

let searchTerm = '';
const getSearchTerm = () => searchTerm;

let registerPanel = () => null;
let panelDomFacade = null;
let renderBrowser = () => {};
let setActivePanel = () => {};
let updateCanvasState = () => {};

  const historyHelpers = createHistoryHelpers({
    pushHistory: (...args) => pushHistory(...args),
    updateHistoryButtons: (...args) => updateHistoryButtons(...args),
    persist: (...args) => persist(...args)
  });
  const registerPanelProxy = (...args) => registerPanel(...args);

  const snapshotManager = createSnapshotManager({
    panelsModel,
    sectionManager,
    historyHelpers,
    persistence: { persist },
    dom: {
      panelDomRegistry,
      detachPanelDom
    },
    registerPanel: registerPanelProxy,
    updateCanvasState,
    renderBrowser,
    setActivePanel,
    colorCursor: colorCursorManager
  });
  const interact = typeof window !== 'undefined' ? window.interact : null;
  ensureDefaultSection();
  if (!chipPanelsInstance && typeof document !== 'undefined') {
    chipPanelsInstance = createChipPanels(document.body);
  }

  const panelDom = {
    root: document.getElementById('c_panel'),
    pin: document.getElementById('c_panel_pin'),
    toggle: document.getElementById('c_panel_toggle'),
    dropzone: document.getElementById('c_panel_dropzone'),
    empty: document.querySelector('#c_panel_dropzone .panel-empty'),
    newSection: document.getElementById('c_new_section'),
    searchBtn: document.getElementById('c_panel_search'),
    searchInput: document.getElementById('c_panel_search_input'),
    tree: document.getElementById('c_folder_tree'),
    undo: document.getElementById('c_history_undo'),
    redo: document.getElementById('c_history_redo')
  };

  ensureOperationsPanel();
  renderOperationsLog();

  preferencesFacade = createUiPreferencesFacade({
    collapseKey: PANEL_COLLAPSE_KEY,
    pinKey: PANEL_PIN_KEY
  });

  const workspaceMenu = (() => {
    const toggle = document.getElementById('c_canvas_more_btn');
    const menu = toggle?.parentElement?.querySelector('.dropdown-menu') || null;
    if (!menu) {
      return { root: null, toggle: null, save: null, load: null, clear: null };
    }

    if (!menu.dataset.workspaceActions) {
      const preserved = Array.from(menu.children);
      menu.innerHTML = `
        <li><button id="c_workspace_save" class="dropdown-item" type="button"><i class="bi bi-download me-2"></i>Save workspace snapshot</button></li>
        <li><button id="c_workspace_load" class="dropdown-item" type="button"><i class="bi bi-upload me-2"></i>Load saved workspace</button></li>
        <li><button id="c_workspace_clear" class="dropdown-item text-danger" type="button"><i class="bi bi-trash3 me-2"></i>Clear saved snapshot</button></li>
        <li><hr class="dropdown-divider"></li>
      `;
      preserved
        .filter((node) => node.querySelector('button'))
        .forEach((node) => menu.appendChild(node));
      menu.dataset.workspaceActions = '1';
    }

    const save = menu.querySelector('#c_workspace_save');
    const load = menu.querySelector('#c_workspace_load');
    const clear = menu.querySelector('#c_workspace_clear');

    return {
      root: menu,
      toggle,
      save,
      load,
      clear
    };
  })();

  const closeWorkspaceMenu = () => {
    if (typeof window === 'undefined' || !workspaceMenu.toggle) return;
    const dropdownApi = window.bootstrap?.Dropdown;
    try {
      if (dropdownApi?.getOrCreateInstance) {
        dropdownApi.getOrCreateInstance(workspaceMenu.toggle).hide();
      } else if (dropdownApi?.getInstance) {
        const instance = dropdownApi.getInstance(workspaceMenu.toggle);
        instance?.hide();
      } else if (typeof workspaceMenu.toggle.dispatchEvent === 'function') {
        workspaceMenu.toggle.setAttribute('aria-expanded', 'false');
        workspaceMenu.root?.classList.remove('show');
      }
    } catch {
      workspaceMenu.toggle.setAttribute('aria-expanded', 'false');
      workspaceMenu.root?.classList.remove('show');
    }
  };

  const getBrowserRootEl = () => panelDom.tree || null;

  const browserHotspot = (() => {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('c_browser_hotspot');
    if (!el) {
      el = document.createElement('div');
      el.id = 'c_browser_hotspot';
      el.className = 'workspace-browser-hotspot';
      document.body.appendChild(el);
    }
    el.style.width = el.style.width || '0px';
    el.style.height = el.style.height || '0px';
    return el;
  })();

  const workspacePane = roots.workspacePane ?? document.getElementById('pane-plotC');
  const appFrame = roots.appFrame ?? document.querySelector('.app-frame-main');
  const appFooter = roots.appFooter ?? document.querySelector('.app-footer');
  let layoutFrame = null;

  const syncWorkspaceViewport = () => {
    if (!workspacePane || !workspacePane.classList.contains('show')) return;

    const paneRect = workspacePane.getBoundingClientRect();
    const frameStyles = appFrame ? window.getComputedStyle(appFrame) : null;
    const rawPaddingBottom = frameStyles ? parseFloat(frameStyles.paddingBottom || '0') : 0;
    const paddingBottom = Number.isFinite(rawPaddingBottom) ? Math.max(rawPaddingBottom, 0) : 0;
    const footerRect = appFooter?.getBoundingClientRect();
    const rawFooterHeight = footerRect?.height ?? 0;
    const footerHeight = Number.isFinite(rawFooterHeight) ? Math.max(rawFooterHeight, 0) : 0;
    const safetyGap = 16;

    let availableHeight = window.innerHeight - paneRect.top - footerHeight - paddingBottom - safetyGap;
    if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
      availableHeight = window.innerHeight - Math.max(paneRect.top, safetyGap) - safetyGap;
    }

    const paneHeight = Math.max(availableHeight, 520);
    workspacePane.style.setProperty('--workspace-pane-height', `${Math.floor(paneHeight)}px`);

    const wrapperRect = canvasWrapper?.getBoundingClientRect();
    const frameRect = appFrame?.getBoundingClientRect();
    const viewportLeft = wrapperRect?.left ?? frameRect?.left ?? paneRect.left ?? 0;
    const viewportTop = wrapperRect?.top ?? paneRect.top ?? 0;
    const left = Math.max(0, Math.round(viewportLeft));
    const top = Math.max(16, Math.round(viewportTop));

    if (panelDom.root) {
      panelDom.root.style.setProperty('--workspace-browser-left', `${left}px`);
      panelDom.root.style.setProperty('--workspace-browser-top', `${top}px`);
    }

    if (browserHotspot) {
      const pinned = panelPreferences?.isPanelPinned?.() ?? false;
      const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root?.classList.contains('collapsed');
      const showHotspot = (!pinned || collapsed) && left > 0;
      if (showHotspot) {
        browserHotspot.style.top = `${top}px`;
        browserHotspot.style.height = `${paneHeight}px`;
        browserHotspot.style.width = `${left}px`;
      } else {
        browserHotspot.style.width = '0px';
        browserHotspot.style.height = '0px';
      }
      browserHotspot.classList.toggle('is-active', showHotspot);
    }
  };

  const requestLayoutSync = () => {
    if (layoutFrame) return;
    layoutFrame = window.requestAnimationFrame(() => {
      layoutFrame = null;
      syncWorkspaceViewport();
    });
  };

  const chipContext = { lastRowId: null };
  
  const isPanelCollapsed = () => panelPreferences?.isPanelCollapsed?.() ?? !!panelDom.root?.classList.contains('collapsed');

  const handlePanelHoverEnter = () => {
    if (!panelDom.root) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root.classList.contains('collapsed');
    if (!pinned) {
      panelDom.root.classList.add('peeking');
      panelDom.root.classList.add('is-active');
      panelPreferences?.setCollapsed?.(true, { persist: false, silent: true });
    } else if (collapsed) {
      panelPreferences?.setCollapsed?.(false, { persist: false });
    }
  };

  const handlePanelHoverLeave = () => {
    if (!panelDom.root) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root.classList.contains('collapsed');
    if (!pinned) {
      panelPreferences?.setCollapsed?.(true, { persist: false });
      panelDom.root.classList.remove('is-active');
      panelDom.root.classList.remove('peeking');
    } else if (collapsed) {
      panelDom.root.classList.remove('peeking');
    }
  };

  const handlePanelMouseLeave = () => {
    if (browserHotspot?.matches(':hover')) return;
    handlePanelHoverLeave();
  };

  const handleHotspotLeave = () => {
    window.requestAnimationFrame(() => {
      if (panelDom.root?.matches(':hover')) return;
      handlePanelHoverLeave();
    });
  };

  const updateCanvasOffset = () => {
    if (!canvasWrapper) return;
    const pinned = panelPreferences?.isPanelPinned?.() ?? false;
    const collapsed = panelPreferences?.isPanelCollapsed?.() ?? panelDom.root?.classList.contains('collapsed');
    canvasWrapper.classList.toggle('browser-pinned', pinned);
    canvasWrapper.classList.toggle('browser-floating', !pinned);
    canvasWrapper.classList.toggle('browser-collapsed', !!collapsed);
    requestLayoutSync();
  };

  panelPreferences = createPanelPreferencesManager({
    panelDom,
    preferences: preferencesFacade,
    updateCanvasOffset,
    requestLayoutSync
  });
  panelPreferences.restorePinned();
  panelPreferences.restoreCollapsed();

  const collectSectionAncestors = (sectionId) => {
    const result = [];
    let current = sectionId;
    const guard = new Set();
    while (current && sections.has(current) && !guard.has(current)) {
      result.push(current);
      guard.add(current);
      const next = sections.get(current)?.parentId || null;
      current = next;
    }
    return result;
  };

  const markActiveSections = (sectionId) => {
    if (!panelDom.tree) return;
    const activeIds = new Set(sectionId ? collectSectionAncestors(sectionId) : []);
    panelDom.tree.querySelectorAll('.section-node').forEach((node) => {
      const id = node.dataset.sectionId;
      node.classList.toggle('has-active-graph', activeIds.has(id));
    });
  };

  const applyActivePanelState = ({ scrollBrowser = false } = {}) => {
    if (!panelDom.tree) return;
    panelDom.tree.querySelectorAll('.graph-node.is-active').forEach((node) => {
      node.classList.remove('is-active');
    });
    panelDom.tree.querySelectorAll('.section-node.has-active-graph').forEach((node) => {
      node.classList.remove('has-active-graph');
    });
    if (!activePanelId) {
      markActiveSections(null);
      return;
    }
    const node = panelDom.tree.querySelector(`.graph-node[data-panel-id="${activePanelId}"]`);
    if (!node) {
      markActiveSections(null);
      return;
    }
    node.classList.add('is-active');
    if (scrollBrowser) {
      try {
        node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch {
        /* ignore scroll errors */
      }
    }
    const sectionId = node.dataset.sectionId;
    if (sectionId) {
      markActiveSections(sectionId);
    }
  };

  setActivePanel = (panelId, options = {}) => {
    activePanelId = panelId || null;
    chipPanelsBridge.onPanelSelected(activePanelId);
    applyActivePanelState(options);
  };


  const findTraceByRowId = (rowId) => {
    if (!rowId || typeof rowId !== 'string') return null;
    const [panelId, traceKey] = rowId.split(':');
    if (!panelId || !traceKey) return null;
    let traces = getPanelTraces(panelId);
    let traceIndex = traces.findIndex((trace) => trace?._canvasId === traceKey);
    if (traceIndex === -1) {
      normalizePanelTraces(panelId);
      traces = getPanelTraces(panelId);
      traceIndex = traces.findIndex((trace) => trace?._canvasId === traceKey);
    }
    if (traceIndex === -1) return null;
    return { panelId, trace: traces[traceIndex], traceIndex };
  };

  const rerenderTracePanel = (rowId) => {
    const handle = findTraceByRowId(rowId);
    if (!handle) return;
    normalizePanelTraces(handle.panelId);
    const traces = getPanelTraces(handle.panelId);
    const nextTrace = traces[handle.traceIndex] || traces.find((trace) => trace?._canvasId === handle.trace?._canvasId) || handle.trace;
    renderPlot(handle.panelId);
    updateTraceChip(
      panelDom.tree?.querySelector(`.folder-trace[data-id="${rowId}"]`),
      nextTrace
    );
    persist();
  };

  const ensureChipPanelsMount = () => {
    if (!chipPanelsInstance || !panelDom.tree || panelDom.tree.dataset.chipPanelsMounted === '1') return;
    chipPanelsInstance.mount({
      tree: panelDom.tree,
      getTraceById: (rowId) => {
        chipContext.lastRowId = rowId;
        const handle = findTraceByRowId(rowId);
        if (!handle?.trace) return null;
        syncTraceAppearance(handle.trace);
        return new Proxy(handle.trace, {
          get(target, prop) {
            return target[prop];
          },
          set(target, prop, value) {
            if (prop === 'width') {
              const widthPx = Number(value);
              if (!Number.isFinite(widthPx)) {
                return true;
              }
              const currentTraces = getPanelTraces(handle.panelId);
              const current = currentTraces[handle.traceIndex];
              const prevWidth = Number(
                (current?.line && current.line.width) ?? current?.width ?? NaN
              );
              if (!Number.isFinite(prevWidth) || Math.abs(prevWidth - widthPx) > 1e-6) {
                pushHistory();
                Actions.setTraceLineWidth(handle.panelId, handle.traceIndex, widthPx);
                persist();
              }
              target.width = widthPx;
              target.line = target.line || {};
              target.line.width = widthPx;
              return true;
            }
            target[prop] = value;
            return true;
          }
        });
      },
      repaintChip: (rowEl) => {
        const rowId = rowEl?.dataset.id;
        const handle = findTraceByRowId(rowId);
        if (!handle || !rowEl) return;
        updateTraceChip(rowEl, handle.trace);
      },
      renderPlot: () => {
        rerenderTracePanel(chipContext.lastRowId);
      },
      openRawData: (rowId) => {
        const handle = findTraceByRowId(rowId);
        if (!handle) return;
        console.info('Trace info', {
          id: rowId,
          name: handle.trace.name,
          meta: handle.trace.meta
        });
      }
    });
    panelDom.tree.dataset.chipPanelsMounted = '1';
  };


  const updatePanelEmpty = () => {
    if (!panelDom.empty) return;
    if (panelDom.empty.dataset.mode === 'search-empty') {
      panelDom.empty.style.display = '';
      return;
    }
    panelDom.empty.style.display = panelDomRegistry.size ? 'none' : '';
  };

  updateCanvasState = () => {
    canvas.classList.toggle('has-panels', panelDomRegistry.size > 0);
    updatePanelEmpty();
    if (emptyOverlay) {
      emptyOverlay.style.display = panelDomRegistry.size ? 'none' : '';
    }
  };

  const coerceNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const getPanelGeometry = (panelId) => {
    if (!panelId) return null;
    const record = getPanelSnapshot(panelId);
    if (!record) return null;
    return {
      x: coerceNumber(record.x, 0),
      y: coerceNumber(record.y, 0),
      width: Math.max(MIN_WIDTH, coerceNumber(record.width, MIN_WIDTH)),
      height: Math.max(MIN_HEIGHT, coerceNumber(record.height, MIN_HEIGHT))
    };
  };

  const clampGeometryToCanvas = (geometry = {}) => {
    const requestedWidth = Math.max(MIN_WIDTH, coerceNumber(geometry.width, MIN_WIDTH));
    const requestedHeight = Math.max(MIN_HEIGHT, coerceNumber(geometry.height, MIN_HEIGHT));
    const measuredWidth = canvas?.clientWidth;
    const measuredHeight = canvas?.clientHeight;
    const canvasWidth = (Number.isFinite(measuredWidth) && measuredWidth > 0)
      ? measuredWidth
      : requestedWidth;
    const canvasHeight = (Number.isFinite(measuredHeight) && measuredHeight > 0)
      ? measuredHeight
      : requestedHeight;

    const width = Math.max(
      MIN_WIDTH,
      Math.min(requestedWidth, canvasWidth)
    );
    const height = Math.max(
      MIN_HEIGHT,
      Math.min(requestedHeight, canvasHeight)
    );
    const maxX = Math.max(0, canvasWidth - width);
    const maxY = Math.max(0, canvasHeight - height);

    const x = Math.max(0, Math.min(coerceNumber(geometry.x, 0), maxX));
    const y = Math.max(0, Math.min(coerceNumber(geometry.y, 0), maxY));

    return { x, y, width, height };
  };

  const applyPanelGeometry = (panelId, geometryOverride = null, { persistNormalized = false } = {}) => {
    if (!panelId) return null;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    if (!rootEl) return null;

    const baseGeometry = geometryOverride
      ? { ...geometryOverride }
      : getPanelGeometry(panelId);
    if (!baseGeometry) return null;

    const normalized = clampGeometryToCanvas(baseGeometry);

    if (rootEl.classList.contains('is-fullscreen')) {
      updatePanelRuntime(panelId, { visual: normalized });
      return normalized;
    }

    rootEl.style.width = `${normalized.width}px`;
    rootEl.style.height = `${normalized.height}px`;
    rootEl.style.transform = `translate(${normalized.x}px, ${normalized.y}px)`;

    updatePanelRuntime(panelId, { visual: normalized });

    if (persistNormalized && geometryOverride) {
      const changed = ['x', 'y', 'width', 'height'].some(
        (key) => normalized[key] !== geometryOverride[key]
      );
      if (changed) {
        panelsModel.setPanelGeometry(panelId, normalized);
      }
    }

    return normalized;
  };

  const applyPanelZIndex = (panelId) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    if (!rootEl) return;
    const panelRecord = getPanelSnapshot(panelId);
    const value = Number(panelRecord?.zIndex);
    const resolved = Number.isFinite(value) && value > 0 ? value : 1;
    rootEl.style.zIndex = String(resolved);
  };

  const defaultLayout = (payload = {}) => {
    const yLabel = payload.meta?.DISPLAY_UNITS
      || payload.meta?.Y_UNITS
      || 'Intensity';
    const xLabel = payload.meta?.X_UNITS || 'Wavenumber';
  const axisDefaults = {
    showgrid: false,
    showline: true,
    mirror: true,
    ticks: 'outside',
    linewidth: 1,
    zeroline: false
  };

    return {
      hovermode: 'x',
      margin: { l: 50, r: 15, t: 30, b: 40 },
      xaxis: {
        ...axisDefaults,
        minor: {
          ticks: 'outside',
          showgrid: false
        },
        autorange: true,
        title: { text: xLabel }
      },
      yaxis: {
        ...axisDefaults,
        minor: {
          ticks: 'outside',
          showgrid: false
        },
        title: { text: yLabel }
      },
      legend: { orientation: 'h' }
    };
  };

  const bringPanelToFront = (panelId, { persistChange = true, scrollBrowser = false } = {}) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.rootEl) return;
    const updated = panelsModel.bringPanelToFront(panelId);
    if (updated) {
      applyPanelZIndex(panelId);
      if (persistChange) {
        historyHelpers.persist();
      }
    }
    setActivePanel(panelId, { scrollBrowser });
  };

  const panelInteractions = createPanelInteractions({
    interact,
    canvas,
    registry: {
      getPanelDom,
      ensurePanelRuntime,
      updatePanelRuntime
    },
    geometry: {
      getPanelGeometry,
      clampGeometryToCanvas,
      applyPanelGeometry,
      coerceNumber
    },
    models: { panelsModel },
    history: historyHelpers,
    persistence: { persist },
    plot: { resize: (panelId) => Plot.resize(panelId) },
    utils: { bringPanelToFront },
    dimensions: {
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT
    },
    operations: {
      annotateOperation: annotateOperationMeta
    }
  });

  const focusPanelById = (panelId, { scrollBrowser = true } = {}) => {
    if (!panelId) return;
    bringPanelToFront(panelId, { scrollBrowser });
  };

  persistence = createPersistenceFacade({
    dom: {
      undo: panelDom.undo,
      redo: panelDom.redo
    },
    menu: workspaceMenu,
    historyFactory: createHistory,
    historyConfig: {
      limit: HISTORY_LIMIT,
      tolerance: HISTORY_GEOMETRY_TOLERANCE
    },
    models: {
      panelsModel
    },
    storage,
    hooks: {
      closeMenu: closeWorkspaceMenu
    },
    snapshot: snapshotManager,
    helpers: {
      deepClone
    },
    notifications: {
      showToast
    }
  }) || null;

  if (persistence) {
    ({
      history,
      persist,
      pushHistory,
      undo,
      redo,
      updateHistoryButtons,
      updateStorageButtons,
      saveSnapshot: saveWorkspaceSnapshot,
      loadSnapshot: loadWorkspaceSnapshot,
      clearSnapshot: clearWorkspaceSnapshot,
      restoreSnapshot
    } = persistence);
    persistence.attachEvents();
    const rawPushHistory = pushHistory || (() => false);
    pushHistory = (info = null) => {
      const normalized = normalizeHistoryInfo(info);
      const beforeInspect = history?.inspect?.();
      const beforePast = beforeInspect?.past?.length ?? null;
      const result = rawPushHistory(normalized.label);
      if (result === false) {
        return null;
      }
      const afterInspect = history?.inspect?.();
      const afterPast = afterInspect?.past?.length ?? beforePast;
      const delta = beforePast != null && afterPast != null ? afterPast - beforePast : null;
      return recordOperation({
        label: normalized.label,
        source: captureOperationSource(),
        timestamp: Date.now(),
        meta: {
          ...(normalized.meta || {}),
          historyDelta: delta,
          historySize: afterPast,
          futureSize: afterInspect?.future?.length ?? null
        }
      });
    };
    const rawUndo = undo || (() => false);
    undo = (...args) => {
      const result = rawUndo(...args);
      if (result) {
        const snapshot = history?.inspect?.();
        recordOperation({
          label: 'Undo',
          source: captureOperationSource(),
          timestamp: Date.now(),
          meta: {
            historyDelta: -1,
            historySize: snapshot?.past?.length ?? null,
            futureSize: snapshot?.future?.length ?? null
          }
        });
      }
      return result;
    };
    const rawRedo = redo || (() => false);
    redo = (...args) => {
      const result = rawRedo(...args);
      if (result) {
        const snapshot = history?.inspect?.();
        recordOperation({
          label: 'Redo',
          source: captureOperationSource(),
          timestamp: Date.now(),
          meta: {
            historyDelta: 1,
            historySize: snapshot?.past?.length ?? null,
            futureSize: snapshot?.future?.length ?? null
          }
        });
      }
      return result;
    };
  }
  const renderPlot = (panelId) => {
    if (!panelId) return;
    Plot.renderNow(panelId);
  };

  const updateTraceChip = (rowEl, trace) => {
    const chip = rowEl.querySelector('.line-chip');
    if (!chip) return;
  applyLineChip(chip, {
    color: toHexColor(trace.line?.color || '#1f77b4'),
    width: trace.line?.width || 2,
    opacity: trace.opacity ?? 1,
    dash: trace.line?.dash || 'solid'
  });
};

  const syncTraceAppearance = (trace) => {
    if (!trace) return trace;
    trace.line = trace.line || {};
    const resolvedColor = toHexColor(
      trace.color
      || trace.line.color
      || FALLBACK_COLOR
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

  const isSectionVisible = (sectionId) => sectionManager.isSectionVisible(sectionId);

  const refreshPanelVisibility = () => {
    panelDomRegistry.forEach((dom, panelId) => {
      const record = getPanelRecord(panelId) || {};
      const sectionId = sections.has(record.sectionId) ? record.sectionId : DEFAULT_SECTION_ID;
      const sectionVisible = isSectionVisible(sectionId);
      const graphVisible = record.hidden !== true;
      const shouldShow = sectionVisible && graphVisible;
      const rootEl = dom?.rootEl;
      if (rootEl) {
        rootEl.style.display = shouldShow ? '' : 'none';
        rootEl.classList.toggle('is-hidden-by-group', !sectionVisible);
        rootEl.classList.toggle('is-hidden-by-graph', !graphVisible);
        rootEl.classList.toggle('is-collapsed', record.collapsed === true);
      }
      const plotHost = dom?.plotEl;
      if (shouldShow) {
        Plot.resize(panelId);
      }
    });
  };

  const applyAllPanelZIndices = () => {
    if (!panelsModel?.getPanels) return;
    const panels = panelsModel.getPanels();
    if (!Array.isArray(panels)) return;
    panels.forEach((panel) => {
      if (!panel || !panel.id) return;
      applyPanelZIndex(panel.id);
    });
  };

  const reorderPanelsByZIndex = () => {
    if (!panelsModel?.getPanels || !canvas) return;
    const panels = panelsModel.getPanels();
    if (!Array.isArray(panels) || !panels.length) return;
    const sorted = panels
      .map((panel) => ({
        id: panel?.id,
        z: Number(panel?.zIndex) || 0,
        dom: getPanelDom(panel?.id)
      }))
      .filter((entry) => entry.id && entry.dom?.rootEl)
      .sort((a, b) => (a.z - b.z));
    sorted.forEach(({ dom }) => {
      canvas.appendChild(dom.rootEl);
    });
  };

  const updatePanelTitleDom = (panelId, title) => {
    const dom = getPanelDom(panelId);
    if (!dom) return;
    if (dom.titleEl) {
      dom.titleEl.textContent = title;
    }
    if (dom.rootEl) {
      dom.rootEl.dataset.graphTitle = title;
    }
  };

  const queueSectionRename = (sectionId) => {
    pendingRenameSectionId = sectionId;
  };

  const startSectionRename = (sectionId, nameEl, { selectAll = false } = {}) => {
    const section = sections.get(sectionId);
    const isDefaultSection = sectionId === DEFAULT_SECTION_ID;
    if (!section || (section.locked && !isDefaultSection) || !nameEl) return;
    if (nameEl.dataset.editing === '1') return;
    nameEl.dataset.editing = '1';
    const original = section.name || '';
    const finish = (commit, value) => {
      nameEl.dataset.editing = '0';
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('is-editing');
      nameEl.removeEventListener('blur', onBlur);
      nameEl.removeEventListener('keydown', onKey);
      if (!commit) {
        nameEl.textContent = original;
        return;
      }
      const nextValueRaw = value ?? nameEl.textContent;
      const nextValue = ((nextValueRaw ?? '')).trim();
      if (!nextValue || nextValue === original) {
        nameEl.textContent = original;
        return;
      }
      pushHistory();
      renameSection(sectionId, nextValue);
      persist();
      renderBrowser();
      updateHistoryButtons();
    };
    const onBlur = () => finish(true);
    const onKey = (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        finish(false, original);
      }
    };
    nameEl.contentEditable = 'true';
    nameEl.spellcheck = false;
    nameEl.classList.add('is-editing');
    nameEl.addEventListener('blur', onBlur);
    nameEl.addEventListener('keydown', onKey);
    nameEl.focus();
    if (selectAll && typeof window !== 'undefined') {
      try {
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
  } catch {}
  }
  };

  const startPanelRename = (panelId, nameEl, { selectAll = false } = {}) => {
    const record = getPanelRecord(panelId);
    if (!record || !nameEl) return;
    if (nameEl.dataset.editing === '1') return;
    const original = resolvePanelTitle(record);
    nameEl.dataset.editing = '1';
    const finish = (commit, value) => {
      nameEl.dataset.editing = '0';
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('is-editing');
      nameEl.removeEventListener('blur', onBlur);
      nameEl.removeEventListener('keydown', onKey);
      if (!commit) {
        nameEl.textContent = original;
        return;
      }
      const nextRaw = value ?? nameEl.textContent;
      const nextCandidate = (nextRaw ?? '').trim();
      const nextTitle = nextCandidate || defaultPanelTitle(record.index);
      if (nextTitle === original) {
        nameEl.textContent = original;
        return;
      }
      const appliedTitle = nextTitle;
      nameEl.textContent = appliedTitle;
      pushHistory();
      panelsModel.setPanelTitle(panelId, appliedTitle);
      updatePanelTitleDom(panelId, appliedTitle);
      persist();
      renderBrowser();
      updateHistoryButtons();
    };
    const onBlur = () => finish(true);
    const onKey = (evt) => {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        finish(true);
      } else if (evt.key === 'Escape') {
        evt.preventDefault();
        finish(false, original);
      }
    };
    nameEl.contentEditable = 'true';
    nameEl.spellcheck = false;
    nameEl.classList.add('is-editing');
    nameEl.textContent = original;
    nameEl.addEventListener('blur', onBlur);
    nameEl.addEventListener('keydown', onKey);
    nameEl.focus();
    if (selectAll && typeof window !== 'undefined') {
      try {
        const range = document.createRange();
        range.selectNodeContents(nameEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {}
    }
  };

  const toggleSectionVisibility = (sectionId) => {
    if (!sectionManager.has(sectionId)) return;
    pushHistory();
    sectionManager.toggleSectionVisibility(sectionId);
    persist();
    refreshPanelVisibility();
    renderBrowser();
    updateHistoryButtons();
  };

  const toggleGraphVisibility = (panelId) => {
    if (!panelId) return;
    const record = getPanelRecord(panelId);
    if (!record) return;
    pushHistory();
    const nextHidden = record.hidden !== true;
    panelsModel.setPanelHidden(panelId, nextHidden);
    persist();
    refreshPanelVisibility();
    renderBrowser();
    updateHistoryButtons();
  };

  const toggleSectionCollapsedState = (sectionId) => {
    const section = sections.get(sectionId);
    if (!section) return false;
    const next = !section.collapsed;
    setSectionCollapsed(sectionId, next);
    renderBrowser();
    persist();
    return true;
  };

  const togglePanelCollapsedState = (panelId) => {
    if (!panelId) return false;
    const record = getPanelRecord(panelId);
    if (!record) return false;
    const current = record.collapsed === true;
    panelsModel.setCollapsed(panelId, !current);
    renderBrowser();
    persist();
    return true;
  };

  const addGraphToSection = (sectionId) => {
    if (!sectionManager.has(sectionId)) return;
    const panelId = ingestPayloadAsPanel({
      name: `Sample ${getNextPanelSequence()}`
    }, { sectionId });
    if (panelId) {
      const record = getPanelRecord(panelId);
      const label = resolvePanelTitle(record);
      showToast(`${label} added to group.`, 'success');
    }
  };

  renderBrowser = () => {
    if (!browserFacade) return;
    browserFacade.render();
    panelDomRegistry.forEach((_, panelId) => {
      const record = getPanelRecord(panelId);
      if (record) {
        updatePanelTitleDom(panelId, resolvePanelTitle(record));
      }
    });
    applyAllPanelZIndices();
    reorderPanelsByZIndex();
  };

  const focusSectionById = (sectionId, { scrollBrowser = true } = {}) => {
    if (!sectionId) return;
    const descendantIds = new Set(collectSectionDescendants(sectionId));
    let targetPanelId = null;
    if (activePanelId) {
      const activeRecord = getPanelRecord(activePanelId);
      if (activeRecord && descendantIds.has(activeRecord.sectionId || DEFAULT_SECTION_ID)) {
        targetPanelId = activePanelId;
      }
    }
    if (!targetPanelId) {
      getPanelsOrdered().forEach((record) => {
        const panelId = record?.id;
        if (!panelId) return;
        if (record.hidden === true) return;
        const recordSectionId = record.sectionId || DEFAULT_SECTION_ID;
        if (!descendantIds.has(recordSectionId)) return;
        const currentTargetRecord = targetPanelId ? getPanelRecord(targetPanelId) : null;
        const activeZIndex = currentTargetRecord ? coerceNumber(currentTargetRecord.zIndex, 0) : 0;
        const candidateZ = coerceNumber(record.zIndex, 0);
        if (!targetPanelId || candidateZ > activeZIndex) {
          targetPanelId = panelId;
        }
      });
    }
    if (targetPanelId) {
      bringPanelToFront(targetPanelId, { scrollBrowser });
    }
  };

  const deleteSectionInteractive = (sectionId) => {
    const section = sections.get(sectionId);
    if (!section || section.locked) return;
    pushHistory();
    const descendants = collectSectionDescendants(sectionId);
    getPanelsOrdered().forEach((record) => {
      const panelId = record?.id;
      if (!panelId) return;
      if (descendants.includes(record.sectionId)) {
        removePanel(panelId, { pushToHistory: false });
      }
    });
    deleteSection(sectionId);
    ensureDefaultSection();
    renderBrowser();
    persist();
    updateHistoryButtons();
  };

  const deleteGraphInteractive = (panelId) => {
    const record = getPanelRecord(panelId);
    if (!record) return;
    removePanel(panelId);
  };


  registerPanel = (incomingState, {
    skipHistory = false,
    skipPersist = false,
    preserveIndex = false,
    useModelState = false
  } = {}) => {
    if (!skipHistory) {
      pushHistory();
    }

    const candidateId = incomingState.id || randomPanelId();
    const incomingIndex = Number.isFinite(incomingState.index) ? incomingState.index : undefined;
    const resolvedIndex = (useModelState && Number.isInteger(incomingIndex) && incomingIndex > 0)
      ? incomingIndex
      : allocatePanelIndex(incomingIndex);
    const defaultTitle = defaultPanelTitle(resolvedIndex);
    const incomingTitleCandidate = typeof incomingState.title === 'string'
      ? incomingState.title
      : '';
    const normalizedTitleBase = incomingTitleCandidate.trim();
    const normalizedTitle = normalizedTitleBase || defaultTitle;
    const sequenceOffset = panelDomRegistry.size * 24;
    const gutter = 36;
    const defaultWidth = Number.isFinite(incomingState.width) ? incomingState.width : 1000;
    const defaultHeight = Number.isFinite(incomingState.height) ? incomingState.height : 300;
    const resolveAutoX = () => {
      if (useModelState && Number.isFinite(incomingState.x)) {
        return incomingState.x;
      }
      const rect = typeof canvas?.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : null;
      const canvasWidth = Math.round(rect?.width || canvas?.clientWidth || 0);
      if (canvasWidth > 0) {
        const rightAligned = canvasWidth - defaultWidth - gutter;
        if (rightAligned >= 0) {
          return rightAligned;
        }
        return Math.max(0, canvasWidth - defaultWidth);
      }
      return gutter + sequenceOffset;
    };
    const resolveAutoY = () => {
      if (useModelState && Number.isFinite(incomingState.y)) {
        return incomingState.y;
      }
      return gutter + sequenceOffset;
    };
    const candidateState = {
      id: candidateId,
      type: incomingState.type || 'plot',
      index: resolvedIndex,
      title: normalizedTitle,
      x: resolveAutoX(),
      y: resolveAutoY(),
      width: defaultWidth,
      height: defaultHeight,
      collapsed: !!incomingState.collapsed,
      hidden: incomingState.hidden === true,
      sectionId: sections.has(incomingState.sectionId) ? incomingState.sectionId : DEFAULT_SECTION_ID,
      figure: incomingState.figure ? deepClone(incomingState.figure) : {
        data: [],
        layout: defaultLayout()
      },
      zIndex: incomingState.zIndex
    };

    let baseState = null;
    if (useModelState) {
      baseState = panelsModel.getPanel(candidateId)
        || panelsModel.registerPanel(candidateState, { preserveIndex: true });
    } else {
      baseState = panelsModel.registerPanel(candidateState, { preserveIndex: true });
    }

    if (!baseState) return null;

    const {
      x: baseX,
      y: baseY,
      width: baseWidth,
      height: baseHeight,
      figure: _initialFigure,
      collapsed: _initialCollapsed,
      hidden: _initialHidden,
      sectionId: _initialSectionId,
      ...stateWithoutGeometry
    } = baseState;

    const panelId = baseState.id;
    const initialVisual = clampGeometryToCanvas({
      x: baseX,
      y: baseY,
      width: baseWidth,
      height: baseHeight
    });
    const runtime = {
      dragSnapshot: null,
      visual: initialVisual,
      refreshActionOverflow: null
    };

    panelDomFacade?.mountPanel({
      panelId,
      panelState: baseState,
      runtime
    });

    updatePanelTitleDom(panelId, resolvePanelTitle(baseState));

    normalizePanelTraces(panelId);

    applyPanelGeometry(panelId, initialVisual, { persistNormalized: true });
    applyPanelZIndex(panelId);
    renderPlot(panelId);
    panelInteractions.attach(panelId);
    updateCanvasState();
    updateToolbarMetrics();
    renderBrowser();
    setActivePanel(panelId);
    refreshPanelVisibility();

    if (!skipPersist) {
      persist();
    }

    updateHistoryButtons();
    return panelId;
  };

  const runtimeState = createRuntimeState({
    panelsModel,
    sections,
    sectionManager,
    defaultSectionId: DEFAULT_SECTION_ID,
    panelDomRegistry,
    getPanelDom,
    getActivePanelId,
    setActivePanel,
    getNextPanelSequence,
    managers: {
      panelPreferences,
      colorCursor: colorCursorManager,
      snapshot: snapshotManager
    },
    services: {
      history: historyHelpers
    },
    helpers: {
      colorCursor: colorCursorManager
    }
  });

  runtimeState.services = runtimeState.services || {};
  runtimeState.services.history = historyHelpers;
  runtimeState.services.persistence = persistence;
  runtimeState.services.snapshot = snapshotManager;
  runtimeState.managers = runtimeState.managers || {};
  runtimeState.managers.snapshot = snapshotManager;

  const panelsFacade = createPanelsFacade({
    models: { panelsModel },
    plot: { renderNow: Plot.renderNow },
    history: historyHelpers,
    persistence: { persist },
    browser: { renderBrowser, refreshPanelVisibility, updateCanvasState },
    dom: {
      detachPanelDom
    },
    state: runtimeState,
    utils: {
      ensureArray,
      deepClone,
      decodeName,
      ensureTraceId,
      toHexColor,
      defaultLayout,
      pickColor,
      showToast,
      clampGeometryToCanvas,
      fallbackColor: FALLBACK_COLOR
    },
    services: { uploadTraceFile },
    registry: { registerPanel }
  });

  ({
    normalizePanelTraces,
    createTraceFromPayload,
    ingestPayloadAsPanel,
    appendFilesToGraph,
    moveTrace,
    moveGraph,
    removePanel
  } = panelsFacade);

  clearPanels = ({ skipHistory = false } = {}) => {
    const hasAnyPanels = panelDomRegistry.size > 0 || panelsModel.getPanelsInIndexOrder().length > 0;
    if (!hasAnyPanels) {
      if (!skipHistory) {
        updateHistoryButtons();
      }
      return;
    }

    if (!skipHistory) {
      pushHistory();
    }

    panelDomRegistry.forEach((handles) => {
      handles?.rootEl?.remove();
    });
    panelDomRegistry.clear();
    panelsModel.load({ counter: 0, items: [] });
    sectionManager.reset();
    ensureDefaultSection();
    pendingRenameSectionId = null;

    setActivePanel(null);
    colorCursorManager.reset();
    refreshPanelVisibility();
    updateToolbarMetrics();
    updateCanvasState();
    renderBrowser();
    persist();
    updateHistoryButtons();
  };

  const { handleHeaderAction } = createHeaderActions({
    actionsController: Actions,
    history: historyHelpers,
    historyApi: {
      undo: (...args) => undo(...args),
      redo: (...args) => redo(...args)
    },
    selectors: {
      getPanelDom,
      getPanelFigure
    },
    traces: {
      normalizePanelTraces,
      renderPlot
    },
    plot: {
      exportFigure: (panelId, opts) => Plot.exportFigure(panelId, opts),
      resize: (panelId) => Plot.resize(panelId)
    }
  });

  panelDomFacade = createPanelDomFacade({
    canvas,
    registerPanelDom,
    updatePanelRuntime,
    actions: {
      handleHeaderAction,
      removePanel: (panelId) => removePanel(panelId),
      bringPanelToFront,
      updateToolbarMetrics,
      startPanelRename
    },
    selectors: {
      getPanelFigure
    }
  });

  const ioFacade = createIoFacade({
    dom: {
      canvas,
      emptyOverlay,
      browseBtn,
      fileInput,
      demoBtn,
      addPlotBtn,
      resetBtn
    },
    services: {
      uploadTraceFile,
      fetchDemoFiles
    },
    actions: {
      ingestPanel: ingestPayloadAsPanel,
      appendFilesToGraph,
      clearPanels,
      renderBrowser,
      updateCanvasState
    },
    history: {
      history,
      pushHistory,
      updateHistoryButtons
    },
    persistence: { persist },
    notifications: { showToast },
    state: runtimeState,
    helpers: {
      resetColorCursor: () => {
        colorCursorManager.reset();
      }
    },
    utils: { decodeName }
  });
  ioFacade.attach();
  runtimeState.services.io = ioFacade;
  runtimeState.helpers = runtimeState.helpers || {};
  runtimeState.helpers.resetColorCursor = () => colorCursorManager.reset();

  // --- UI event bindings ---

  panelDom.pin?.addEventListener('click', () => {
    const nextPinned = !(panelPreferences?.isPanelPinned?.() ?? false);
    panelPreferences?.setPinned?.(nextPinned);
  });

  panelDom.toggle?.addEventListener('click', () => {
    const nextPinned = !(panelPreferences?.isPanelPinned?.() ?? false);
    panelPreferences?.setPinned?.(nextPinned);
  });

  panelDom.root?.addEventListener('mouseenter', handlePanelHoverEnter);
  panelDom.root?.addEventListener('mouseleave', handlePanelMouseLeave);
  browserHotspot?.addEventListener('pointerenter', handlePanelHoverEnter);
  browserHotspot?.addEventListener('pointerleave', handleHotspotLeave);
  browserHotspot?.addEventListener('click', () => {
    if (!panelDom.root) return;
    if (panelPreferences?.isPanelPinned?.() && isPanelCollapsed()) {
      panelPreferences?.setCollapsed?.(false);
    }
  });

  panelDom.searchBtn?.addEventListener('click', () => {
    if (!panelDom.searchInput) return;
    const hidden = panelDom.searchInput.style.display === 'none';
    if (hidden) {
      panelDom.searchInput.style.display = '';
      panelDom.searchInput.focus();
    } else {
      panelDom.searchInput.value = '';
      panelDom.searchInput.style.display = 'none';
      searchTerm = '';
      renderBrowser();
    }
  });

  panelDom.searchInput?.addEventListener('input', (evt) => {
    searchTerm = evt.target.value || '';
    renderBrowser();
  });

  panelDom.searchInput?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      panelDom.searchInput.value = '';
      searchTerm = '';
      panelDom.searchInput.blur();
      panelDom.searchInput.style.display = 'none';
      renderBrowser();
    }
  });

  browserFacade = createBrowserFacade({
    dom: { panelDom },
    state: {
      sections,
      getSectionOrder: () => sectionManager.getOrder(),
      defaultSectionId: DEFAULT_SECTION_ID,
      getSearchTerm,
      getPanelsOrdered,
      coerceNumber,
      getActivePanelId
    },
    selectors: {
      ensureArray,
      getPanelTraces,
      normalizePanelTraces,
      getPanelFigure,
      isSectionVisible,
      getPanelRecord
    },
    actions: {
      renderPlot: (panelId) => Plot.renderNow(panelId),
      updateTraceChip,
      pushHistory,
      history,
      persist,
      updateHistoryButtons,
      addGraphToSection,
      toggleGraphVisibility,
      togglePanelCollapsedState,
      toggleSectionCollapsedState,
      toggleSectionVisibility,
      moveTrace,
      moveGraph,
      moveSection,
      removePanel,
      deleteSectionInteractive,
      deleteGraphInteractive,
      requestGraphFileBrowse: ioFacade.requestGraphFileBrowse,
      showToast,
      queueSectionRename,
      startSectionRename,
      startPanelRename,
      getPendingRenameSectionId: () => pendingRenameSectionId,
      clearPendingRenameSectionId: () => {
        pendingRenameSectionId = null;
      },
      createSection,
      renameSection,
      setSectionCollapsed,
      setActivePanel,
      focusSectionById,
      focusPanelById,
      bringPanelToFront,
      ensureChipPanelsMount,
      refreshPanelVisibility,
      applyActivePanelState
    },
    drag: {
      setDropTarget,
      getDragState,
      setDragState,
      traceDragMime: TRACE_DRAG_MIME
    },
    services: {
      panelsModel,
      chipPanelsBridge
    },
    flags: {
      isPanelPinned: () => panelPreferences?.isPanelPinned?.() ?? false
    }
  });

  if (panelDom.tree) {
    browserFacade.attachEvents();
    browserFacade.attachDragDrop();
  }

  renderBrowser();

  if (panelDom.newSection) {
    panelDom.newSection.disabled = false;
    panelDom.newSection.addEventListener('click', () => {
      pushHistory();
      const section = createSection();
      queueSectionRename(section.id);
      renderBrowser();
      persist();
      updateHistoryButtons();
    });
  }

  const hadSnapshotOnBoot = storage.hasSnapshot?.() ?? false;
  const saved = storage.load?.();

  if (saved) {
    restoreSnapshot(saved, { skipHistory: true });
    history?.clear?.();
  } else {
    updateCanvasState();
    renderBrowser();
    history?.clear?.();
    if (hadSnapshotOnBoot) {
      showToast('Saved workspace snapshot could not be restored. Starting with defaults.', 'warning');
    }
  }

  updateHistoryButtons();
  updateStorageButtons();
  updateToolbarMetrics();

  const handleWindowResize = () => {
    panelDomRegistry.forEach((dom, panelId) => {
      applyPanelGeometry(panelId);
      if (dom?.plotEl) {
        Plot.resize(panelId);
      }
      dom?.runtime?.refreshActionOverflow?.();
    });
    updateToolbarMetrics();
    requestLayoutSync();
  };

  const handleWindowScroll = () => {
    requestLayoutSync();
  };

  let workspaceObserver = null;
  if (workspacePane) {
    workspaceObserver = new MutationObserver(requestLayoutSync);
    workspaceObserver.observe(workspacePane, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  requestLayoutSync();

  const renderAll = () => {
    updateCanvasState();
    renderBrowser();
    panelDomRegistry.forEach((dom, panelId) => {
      if (dom?.plotEl) {
        Plot.renderNow(panelId);
      }
    });
  };

  const onModelChanged = () => {
    updateCanvasState();
    renderBrowser();
    persist();
  };

  const onWindowResize = () => {
    handleWindowResize();
  };

  const teardown = () => {
    if (workspaceObserver) {
      workspaceObserver.disconnect();
      workspaceObserver = null;
    }
    browserFacade?.teardown?.();
    browserFacade = null;
    ioFacade?.detach?.();
    preferencesFacade?.teardown?.();
    persistence?.teardown?.();
    operationsLog.length = 0;
    operationsRenderQueued = false;
    if (operationsPanelHandles?.root?.parentNode) {
      operationsPanelHandles.root.parentNode.removeChild(operationsPanelHandles.root);
    }
    operationsPanelHandles = null;
    if (operationsToggleButton?.parentNode) {
      operationsToggleButton.parentNode.removeChild(operationsToggleButton);
    }
    operationsToggleButton = null;
    operationsVisible = true;
  };

  return {
    renderAll,
    renderBrowser,
    focusPanel: focusPanelById,
    selectPanel: setActivePanel,
    onModelChanged,
    onWindowResize,
    onWindowScroll: () => {
      handleWindowScroll();
    },
    onBeforeUnload: () => {
      persistence?.handleBeforeUnload?.();
    },
    onVisibilityChange: () => {
      persistence?.handleVisibilityChange?.();
    },
    teardown,
    getModels: () => ({ panelsModel, sectionsModel }),
    getPanelDomRegistry: () => panelDomRegistry
  };
}
