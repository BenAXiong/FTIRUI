import { fetchDemoFiles } from '../../services/demos.js';
import { uploadTraceFile } from '../../services/uploads.js';
import { createChipPanels } from './chipPanels.js';
import { createPanelsModel } from '../../workspace/canvas/state/panelsModel.js';
import { applyLineChip } from '../utils/styling_linechip.js';
import { toHexColor } from '../utils/styling.js';
import { escapeHtml } from '../utils/dom.js';

const STORAGE_KEY = 'ftir.workspace.canvas.v1';
const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;
const COLOR_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f',
  '#bcbd22', '#17becf'
];
const HISTORY_LIMIT = 25;
const PANEL_COLLAPSE_KEY = 'ftir.workspace.panelCollapsed.v1';
const PANEL_PIN_KEY = 'ftir.workspace.panelPinned.v1';
const FALLBACK_COLOR = COLOR_PALETTE[0] || '#1f77b4';

const DEFAULT_SECTION_ID = 'section_all';
const TRACE_DRAG_MIME = 'application/x-ftir-workspace-trace';
const GRAPH_DRAG_MIME = 'application/x-ftir-workspace-graph';
let colorCursor = 0;
let sectionCounter = 0;

const sections = new Map();
let sectionOrder = [];
let chipPanelsInstance = null;
let dragState = null;
let currentDropTarget = null;
let pendingRenameSectionId = null;
let activePanelId = null;

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

const pickColor = () => {
  const color = COLOR_PALETTE[colorCursor % COLOR_PALETTE.length];
  colorCursor += 1;
  return color;
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const deepClone = (value) => JSON.parse(JSON.stringify(value));

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
  if (!sections.has(DEFAULT_SECTION_ID)) {
    sections.set(DEFAULT_SECTION_ID, {
      id: DEFAULT_SECTION_ID,
      name: 'Group 1',
      collapsed: false,
      locked: true,
      parentId: null,
      children: [],
      visible: true
    });
  } else {
    const base = sections.get(DEFAULT_SECTION_ID);
    if (base) {
      base.name = base.name && base.name !== 'All' ? base.name : 'Group 1';
      base.parentId = null;
      base.children = Array.isArray(base.children) ? base.children : [];
      base.visible = base.visible !== false;
    }
  }
  if (!sectionOrder.includes(DEFAULT_SECTION_ID)) {
    sectionOrder.unshift(DEFAULT_SECTION_ID);
  }
};

const createSection = (name, { parentId = null } = {}) => {
  ensureDefaultSection();
  sectionCounter += 1;
  const id = `section_${Math.random().toString(36).slice(2, 8)}${sectionCounter}`;
  const parent = parentId ? sections.get(parentId) : null;
  const isSubgroup = !!parent;
  if (isSubgroup && parent && !Array.isArray(parent.children)) {
    parent.children = [];
  }
  const defaultName = name?.trim()
    || (isSubgroup
      ? `Subgroup ${(parent?.children?.length || 0) + 1}`
      : `Group ${sectionOrder.length + 1}`);
  const section = {
    id,
    name: defaultName,
    collapsed: false,
    locked: false,
    parentId: parentId && sections.has(parentId) ? parentId : null,
    children: [],
    visible: true
  };
  sections.set(id, section);
  if (section.parentId) {
    const host = sections.get(section.parentId);
    if (host) {
      if (!Array.isArray(host.children)) host.children = [];
      host.children.push(id);
    }
  } else {
    sectionOrder.push(id);
  }
  return section;
};

const deleteSection = (sectionId) => {
  if (!sectionId || sectionId === DEFAULT_SECTION_ID) return;
  const section = sections.get(sectionId);
  if (!section) return;
  const children = Array.isArray(section.children) ? section.children.slice() : [];
  children.forEach((childId) => deleteSection(childId));
  if (section.parentId) {
    const parent = sections.get(section.parentId);
    if (parent && Array.isArray(parent.children)) {
      parent.children = parent.children.filter((id) => id !== sectionId);
    }
  } else {
    sectionOrder = sectionOrder.filter((id) => id !== sectionId);
  }
  sections.delete(sectionId);
};

const renameSection = (sectionId, name) => {
  const section = sections.get(sectionId);
  if (!section) return;
  const trimmed = name?.trim();
  if (!trimmed) return;
  section.name = trimmed;
};

const setSectionCollapsed = (sectionId, collapsed) => {
  const section = sections.get(sectionId);
  if (!section) return;
  section.collapsed = !!collapsed;
};

const serializeSections = () => ({
  counter: sectionCounter,
  order: sectionOrder.slice(),
  items: Array.from(sections.values()).map((section) => ({
    id: section.id,
    name: section.name,
    collapsed: !!section.collapsed,
    locked: !!section.locked,
    parentId: section.parentId || null,
    children: Array.isArray(section.children) ? section.children.slice() : [],
    visible: section.visible !== false
  }))
});

const restoreSections = (snapshot) => {
  sections.clear();
  sectionOrder = [];
  sectionCounter = Math.max(0, Number(snapshot?.counter) || 0);
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  items.forEach((item) => {
    sections.set(item.id, {
      id: item.id,
      name: item.name || 'Group',
      collapsed: !!item.collapsed,
      locked: !!item.locked,
      parentId: item.parentId || null,
      children: Array.isArray(item.children) ? item.children.slice() : [],
      visible: item.visible !== false
    });
  });
  sectionOrder = Array.isArray(snapshot?.order)
    ? snapshot.order.slice().filter((id) => sections.has(id))
    : Array.from(sections.values())
        .filter((section) => !section.parentId)
        .map((section) => section.id);
  sections.forEach((section) => {
    if (section.parentId && !sections.has(section.parentId)) {
      section.parentId = null;
      section.children = Array.isArray(section.children) ? section.children.slice() : [];
      if (!sectionOrder.includes(section.id)) sectionOrder.push(section.id);
    }
    if (Array.isArray(section.children)) {
      section.children = section.children.filter((childId) => sections.has(childId));
    } else {
      section.children = [];
    }
  });
  ensureDefaultSection();
};

const sectionsModel = {
  snapshot: () => serializeSections(),
  load: (snapshot) => {
    restoreSections(snapshot);
  }
};

export function initWorkspaceCanvas() {
  const canvas = document.getElementById('c_canvas_root');
  const addPlotBtn = document.getElementById('c_canvas_add_plot');
  const resetBtn = document.getElementById('c_canvas_reset_layout');
  const browseBtn = document.getElementById('c_canvas_browse_btn');
  const demoBtn = document.getElementById('c_canvas_demo_btn');
  const fileInput = document.getElementById('c_canvas_file_input');
  const emptyOverlay = document.getElementById('c_canvas_empty');
  const canvasWrapper = canvas?.closest('.workspace-canvas-wrapper');
  const topToolbar = canvasWrapper?.querySelector('.workspace-toolbar');
  const verticalToolbar = canvasWrapper?.querySelector('.workspace-toolbar-vertical');

  const updateToolbarMetrics = () => {
    if (!canvasWrapper) return;
    const toolbarHeight = topToolbar ? Math.round(topToolbar.getBoundingClientRect().height) : 0;
    const toolbarWidth = verticalToolbar ? Math.round(verticalToolbar.getBoundingClientRect().width) : 0;
    canvasWrapper.style.setProperty('--workspace-toolbar-height', `${toolbarHeight}px`);
    canvasWrapper.style.setProperty('--workspace-toolbar-vertical-width', `${toolbarWidth}px`);
  };

  if (!canvas || canvas.dataset.initialized === '1') return;
  canvas.dataset.initialized = '1';

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

  const getPanelSnapshot = (panelId) => (panelId ? panelsModel.getPanel(panelId) : null);
  const getPanelRecord = getPanelSnapshot;

  const getPanelsOrdered = () => panelsModel.getPanelsInIndexOrder();

  const getPanelFigure = (panelId) => panelsModel.getPanelFigure(panelId) || { data: [], layout: {} };

  const getPanelTraces = (panelId) => panelsModel.getPanelTraces(panelId) || [];

  const getPanelSectionId = (panelId) => {
    const record = getPanelSnapshot(panelId);
    const candidate = record?.sectionId;
    return candidate && sections.has(candidate) ? candidate : DEFAULT_SECTION_ID;
  };

  const getPanelSection = (panelId) => {
    const sectionId = getPanelSectionId(panelId);
    return sections.get(sectionId) || null;
  };

  const ensurePanelRuntime = (panelId) => {
    if (!panelId) return null;
    const dom = getPanelDom(panelId);
    if (!dom) return null;
    if (!dom.runtime) {
      dom.runtime = { dragSnapshot: null, visual: null };
    }
    return dom.runtime;
  };

  const getNextPanelSequence = () => {
    const snapshot = typeof panelsModel.snapshot === 'function' ? panelsModel.snapshot() : null;
    const counter = Number(snapshot?.counter) || 0;
    return counter + 1;
  };

  const updatePanelRuntime = (panelId, patch = {}) => {
    const runtime = ensurePanelRuntime(panelId);
    if (!runtime) return null;
    Object.assign(runtime, patch);
    return runtime;
  };

  const history = [];
  const future = [];
  let searchTerm = '';
  let pendingGraphFileTarget = null;

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

  const workspacePane = document.getElementById('pane-plotC');
  const appFrame = document.querySelector('.app-frame-main');
  const appFooter = document.querySelector('.app-footer');
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
      const showHotspot = (!panelPinned || panelDom.root?.classList.contains('collapsed')) && left > 0;
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
  let panelPinned = false;

  const isPanelCollapsed = () => !!panelDom.root?.classList.contains('collapsed');

  const handlePanelHoverEnter = () => {
    if (!panelDom.root) return;
    if (!panelPinned) {
      panelDom.root.classList.add('peeking');
      panelDom.root.classList.add('is-active');
    } else if (isPanelCollapsed()) {
      panelDom.root.classList.add('peeking');
    }
  };

  const handlePanelHoverLeave = () => {
    if (!panelDom.root) return;
    if (!panelPinned) {
      panelDom.root.classList.remove('peeking');
      panelDom.root.classList.remove('is-active');
    } else if (isPanelCollapsed()) {
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
    const collapsed = panelDom.root?.classList.contains('collapsed');
    canvasWrapper.classList.toggle('browser-pinned', panelPinned);
    canvasWrapper.classList.toggle('browser-floating', !panelPinned);
    canvasWrapper.classList.toggle('browser-collapsed', !!collapsed);
    requestLayoutSync();
  };

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

  const setActivePanel = (panelId, options = {}) => {
    activePanelId = panelId || null;
    applyActivePanelState(options);
  };

  const updatePanelToggleUI = (expanded) => {
    if (!panelDom.toggle) return;
    const title = expanded ? 'Collapse browser' : 'Expand browser';
    panelDom.toggle.setAttribute('aria-expanded', String(expanded));
    panelDom.toggle.title = title;
    const icon = panelDom.toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('bi-chevron-double-left', expanded);
      icon.classList.toggle('bi-chevron-double-right', !expanded);
    } else {
      panelDom.toggle.innerHTML = expanded
        ? '<i class="bi bi-chevron-double-left"></i>'
        : '<i class="bi bi-chevron-double-right"></i>';
    }
  };

  const setPanelCollapsed = (collapsed, { persist = true, silent = false } = {}) => {
    if (!panelDom.root) return;
    panelDom.root.classList.toggle('collapsed', collapsed);
    if (!collapsed) {
      panelDom.root.classList.remove('peeking');
    }
    updatePanelToggleUI(!collapsed);
    if (persist && typeof sessionStorage !== 'undefined') {
      try {
        if (collapsed) {
          sessionStorage.setItem(PANEL_COLLAPSE_KEY, '1');
        } else {
          sessionStorage.removeItem(PANEL_COLLAPSE_KEY);
        }
      } catch {
        /* ignore storage failures */
      }
    }
    if (!silent) {
      updateCanvasOffset();
    }
    requestLayoutSync();
  };

  const updatePanelPinUI = () => {
    if (panelDom.pin) {
      panelDom.pin.classList.toggle('is-active', panelPinned);
      panelDom.pin.setAttribute('aria-pressed', String(panelPinned));
      panelDom.pin.setAttribute('title', panelPinned ? 'Unpin browser' : 'Pin browser');
      panelDom.pin.innerHTML = panelPinned
        ? '<i class="bi bi-pin-angle-fill"></i>'
        : '<i class="bi bi-pin-angle"></i>';
    }
    if (panelDom.root) {
      panelDom.root.classList.toggle('is-floating', !panelPinned);
      panelDom.root.classList.toggle('is-pinned', panelPinned);
      if (panelPinned) {
        panelDom.root.classList.remove('is-active');
      }
    }
    requestLayoutSync();
  };

  const setPanelPinned = (value, { persist = true } = {}) => {
    const next = !!value;
    if (panelPinned === next) {
      updatePanelPinUI();
      updateCanvasOffset();
      return;
    }
    panelPinned = next;
    if (!panelPinned) {
      panelDom.root?.classList.add('peeking');
      setPanelCollapsed(false, { persist: false, silent: true });
      if (typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.removeItem(PANEL_COLLAPSE_KEY);
        } catch {
          /* ignore storage failures */
        }
      }
    } else {
      panelDom.root?.classList.remove('peeking');
    }
    updatePanelPinUI();
    updateCanvasOffset();
    updatePanelToggleUI(!panelDom.root?.classList.contains('collapsed'));
    if (persist && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(PANEL_PIN_KEY, panelPinned ? '1' : '0');
      } catch {
        /* ignore storage failures */
      }
    }
  };

  const restorePanelCollapsed = () => {
    let collapsed = false;
    if (typeof sessionStorage !== 'undefined') {
      try {
        collapsed = sessionStorage.getItem(PANEL_COLLAPSE_KEY) === '1';
      } catch {
        collapsed = false;
      }
    }
    setPanelCollapsed(collapsed, { persist: false });
  };

  const restorePanelPinned = () => {
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(PANEL_PIN_KEY);
        if (stored !== null) {
          panelPinned = stored === '1';
        }
      } catch {
        panelPinned = false;
      }
    }
    setPanelPinned(panelPinned, { persist: false });
  };

  restorePanelPinned();
  restorePanelCollapsed();

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
        return handle.trace;
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

  const updateHistoryButtons = () => {
    if (panelDom.undo) panelDom.undo.disabled = history.length === 0;
    if (panelDom.redo) panelDom.redo.disabled = future.length === 0;
  };

  const applyDottedLayoutKey = (layout, dottedKey, value) => {
    if (!layout || typeof layout !== 'object' || typeof dottedKey !== 'string') return;
    const segments = dottedKey
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (!segments.length) return;

    let node = layout;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      const existing = node[key];
      if (!existing || typeof existing !== 'object') {
        node[key] = {};
      }
      node = node[key];
    }

    node[segments[segments.length - 1]] = value;
  };

  // === Plot layout patch helper (used by header icons) =========================
  function patchLayout(panelId, patchObj) {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.plotEl) return;

    pushHistory();

    const figure = getPanelFigure(panelId);
    const layout = figure.layout && typeof figure.layout === 'object' ? { ...figure.layout } : {};

    for (const [key, val] of Object.entries(patchObj || {})) {
      if (key.includes('.')) {
        applyDottedLayoutKey(layout, key, val);
        continue;
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        layout[key] = { ...(layout[key] || {}), ...val };
      } else {
        layout[key] = val;
      }
    }

    const nextFigure = {
      ...figure,
      layout
    };
    panelsModel.updatePanelFigure(panelId, nextFigure);

    Plotly.relayout(dom.plotEl, patchObj);
    persist();
    updateHistoryButtons();
  }

  const hasOwn = Object.prototype.hasOwnProperty;
  const isPrimaryAxis = (axisKey) => axisKey === 'xaxis' || axisKey === 'yaxis';

  const ensureAxisState = (layout, axisKey) => {
    if (!layout || typeof layout !== 'object') return null;
    const existing = layout[axisKey];
    if (existing && typeof existing === 'object') return existing;
    layout[axisKey] = {};
    return layout[axisKey];
  };

  const axisExists = (panelId, figure, axisKey) => {
    if (isPrimaryAxis(axisKey)) return true;
    if (!figure) return false;
    const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : (figure.layout = {});
    if (typeof layout[axisKey] === 'object') {
      return true;
    }
    const dom = getPanelDom(panelId);
    const runtimeAxis = dom?.plotEl?.layout?.[axisKey];
    if (runtimeAxis && typeof runtimeAxis === 'object') {
      const copied = deepClone(runtimeAxis);
      layout[axisKey] = { ...(layout[axisKey] || {}), ...copied };
      return true;
    }
    return false;
  };

  const forEachAxis = (panelId, figure, axes, cb) => {
    const layout = figure?.layout || {};
    axes.forEach((axis) => {
      if (!axisExists(panelId, figure, axis)) return;
      const axisState = ensureAxisState(layout, axis) || {};
      cb(axis, axisState);
    });
  };

  const preserveAxisDecorations = (layout, axisKey, patch) => {
    const axisState = layout?.[axisKey];
    if (!axisState) return;
    if (hasOwn.call(axisState, 'showgrid')) {
      patch[`${axisKey}.showgrid`] = axisState.showgrid;
    }
    if (hasOwn.call(axisState, 'showline')) {
      patch[`${axisKey}.showline`] = axisState.showline;
    }
  };

  // === Header actions dispatcher (used by header buttons & popovers) ===========
  function handleHeaderAction(panelId, act, payload = {}) {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    switch (act) {
      // 1) MVP #1: Crosshair / cursor toggle
      case 'cursor': {
        const on = !!payload.on;

        // Crosshair-like behavior with Plotly:
        // - hovermode 'x' gives a vertical guide synced across traces
        // - spikes add visible crosshair lines along axes
        const patch = on
          ? {
              hovermode: 'x',
              'xaxis.showspikes': true,
              'yaxis.showspikes': true,
              'xaxis.spikemode': 'across',
              'yaxis.spikemode': 'across',
              'xaxis.spikesnap': 'cursor',
              'yaxis.spikesnap': 'cursor',
              'xaxis.spikethickness': 1,
              'yaxis.spikethickness': 1
            }
          : {
              hovermode: 'closest',
              'xaxis.showspikes': false,
              'yaxis.showspikes': false
            };

        patchLayout(panelId, patch);
        break;
      }

      // 2) MVP #2a: Axes "thickness" (maps to axis line + grid widths)
      case 'axes-thickness': {
        const level = payload.level || 'medium';
        const map = { thin: 1, medium: 2, thick: 3 };
        const w = Number.isFinite(payload.value) ? payload.value : (map[level] ?? 2);

        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const xColor = layout?.xaxis?.linecolor || '#444';
        const yColor = layout?.yaxis?.linecolor || '#444';

        // Only touch linewidth/gridwidth/linecolor using dotted keys ΓÇö do NOT send xaxis:{...}
        patchLayout(panelId, {
          'xaxis.linewidth': w,
          'yaxis.linewidth': w,
          'xaxis.gridwidth': Math.max(0, Math.round(w * 0.75)),
          'yaxis.gridwidth': Math.max(0, Math.round(w * 0.75)),
          'xaxis.linecolor': xColor,
          'yaxis.linecolor': yColor
        });
        break;
      }

      case 'axes-thickness-custom': {
        const w = Math.max(1, Math.round(Number(payload.value) || 2));
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const xColor = layout?.xaxis?.linecolor || '#444';
        const yColor = layout?.yaxis?.linecolor || '#444';

        patchLayout(panelId, {
          'xaxis.linewidth': w,
          'yaxis.linewidth': w,
          'xaxis.linecolor': xColor,
          'yaxis.linecolor': yColor
        });
        break;
      }

      // 3) MVP #2b: Axes visible sides (top/bottom/left/right)
      //    Logic:
      //    - Both x sides ON  -> mirror both top & bottom
      //    - Only top ON      -> side='top', no mirror
      //    - Only bottom ON   -> side='bottom', no mirror
      //    - None ON          -> xaxis.visible=false
      //    (Same pattern for y: left/right)
      case 'axes-side': {
        const s = payload || {};
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const wx = Math.max(1, Number(layout?.xaxis?.linewidth) || 2);
        const wy = Math.max(1, Number(layout?.yaxis?.linewidth) || 2);
        const cx = layout?.xaxis?.linecolor || '#444';
        const cy = layout?.yaxis?.linecolor || '#444';

        const xTop = !!s.top, xBottom = !!s.bottom;
        const yLeft = !!s.left, yRight = !!s.right;

        const patch = {};

        // X axis
        if (!xTop && !xBottom) {
          patch['xaxis.visible']  = false;
          patch['xaxis.showline'] = false;
        } else {
          patch['xaxis.visible']   = true;
          patch['xaxis.showline']  = true;
          patch['xaxis.side']      = xTop && !xBottom ? 'top' : 'bottom';
          patch['xaxis.mirror']    = xTop && xBottom ? true : false;
          // Preserve thickness & color
          patch['xaxis.linewidth'] = wx;
          patch['xaxis.linecolor'] = cx;
        }

        // Y axis
        if (!yLeft && !yRight) {
          patch['yaxis.visible']        = false;
          patch['yaxis.showline']       = false;
        } else {
          patch['yaxis.visible']        = true;
          patch['yaxis.showline']       = true;

          if (yLeft && yRight) {
            patch['yaxis.mirror']       = true;          // draw line on both sides
            patch['yaxis.side']         = 'left';        // keep labels on the LEFT
            patch['yaxis.ticklabelposition'] = 'outside left';
          } else if (yLeft) {
            patch['yaxis.mirror']       = false;
            patch['yaxis.side']         = 'left';
            patch['yaxis.ticklabelposition'] = 'outside left';
          } else { // right only
            patch['yaxis.mirror']       = false;
            patch['yaxis.side']         = 'right';
            patch['yaxis.ticklabelposition'] = 'outside right';
          }

          // preserve thickness & color
          patch['yaxis.linewidth']      = wy;
          patch['yaxis.linecolor']      = cy;
        }


        patchLayout(panelId, patch);
        break;
      }


      
      case 'legend': {
        patchLayout(panelId, { showlegend: !!payload.on });
        break;
      }

      case 'yscale-log': {
        patchLayout(panelId, { 'yaxis.type': payload.on ? 'log' : 'linear' });
        break;
      }

      case 'grid-major': {
        const on = !!payload.on;
        const patch = {};
        const axes = ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'];
        const figure = getPanelFigure(panelId);
        const layoutState = figure.layout || {};
        const liveLayout = dom?.plotEl?.layout || {};
        axes.forEach((axis, index) => {
          const isPrimary = index < 2;
          const axisExistsInState = layoutState[axis] && typeof layoutState[axis] === 'object';
          const axisExistsLive = liveLayout[axis] && typeof liveLayout[axis] === 'object';
          if (!isPrimary && !axisExistsInState && !axisExistsLive) return;
          patch[`${axis}.showgrid`] = on;
        });
        if (Object.keys(patch).length) {
          patchLayout(panelId, patch);
        }
        break;
      }

      case 'grid-minor': {
        const on = !!payload.on;
        // Use lighter lines for minor grid; only touch minor.*
        const figure = getPanelFigure(panelId);
        const patch = {};
        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], (axis, axisState) => {
          const baseColor = axisState.gridcolor || '#e0e0e0';
          patch[`${axis}.minor.showgrid`] = on;
          patch[`${axis}.minor.gridcolor`] = baseColor;
          patch[`${axis}.minor.gridwidth`] = 1;
        });
        if (Object.keys(patch).length) {
          patchLayout(panelId, patch);
        }
        break;
      }

      case 'grid-minor-subdiv': {
        // Set minor dtick as (major dtick) / (subdiv+1), if we can infer major dtick
        const N = Math.max(1, Math.min(10, Math.round(Number(payload.subdiv) || 2)));
        const figure = getPanelFigure(panelId);
        const patch = {};

        // helper to compute dtick for an axis (x or y)
        const setMinorDtick = (axis, axisState) => {
          const a = axisState || {};
          let major = Number(a.dtick);

          // If dtick isn't numeric, estimate from range/nticks (fallback)
          if (!Number.isFinite(major)) {
            const rng = Array.isArray(a.range) && a.range.length === 2 ? a.range : null;
            const span = rng ? Math.abs(rng[1] - rng[0]) : NaN;
            const nt = Number(a.nticks) || 6;
            if (Number.isFinite(span) && span > 0) {
              major = span / nt;
            }
          }

          if (Number.isFinite(major) && major > 0) {
            patch[`${axis}.minor.dtick`] = major / (N + 1);
            patch[`${axis}.minor.show`] = true;      // ensure minor system on
          }
        };

        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], setMinorDtick);

        // Apply only if we have something to set; otherwise no-op
        if (Object.keys(patch).length) {
          patchLayout(panelId, patch);
        }
        break;
      }


      case 'ticklabels': {
        const on = !!payload.on;
        patchLayout(panelId, { 'xaxis.showticklabels': on, 'yaxis.showticklabels': on });
        break;
      }

      case 'ticks-placement': {
        const p = (payload.placement ?? 'outside'); // 'outside'|'inside'|''
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {
          'xaxis.ticks': p,
          'yaxis.ticks': p
        };
        if (hasX2) patch['xaxis2.ticks'] = p;
        if (hasY2) patch['yaxis2.ticks'] = p;

        preserveAxisDecorations(layout, 'xaxis', patch);
        preserveAxisDecorations(layout, 'yaxis', patch);
        if (hasX2) preserveAxisDecorations(layout, 'xaxis2', patch);
        if (hasY2) preserveAxisDecorations(layout, 'yaxis2', patch);

        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-labels': {
        const on = !!payload.on;
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const patch = {
          'xaxis.showticklabels': on,
          'yaxis.showticklabels': on
        };
        if (axisExists(panelId, figure, 'xaxis2')) patch['xaxis2.showticklabels'] = on;
        if (axisExists(panelId, figure, 'yaxis2')) patch['yaxis2.showticklabels'] = on;
        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-major-offset': {
        // null clears; number sets starting tick
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        if (payload.x0 === null || Number.isFinite(payload.x0)) {
          patch['xaxis.tick0'] = payload.x0;
          if (hasX2) patch['xaxis2.tick0'] = payload.x0;
        }
        if (payload.y0 === null || Number.isFinite(payload.y0)) {
          patch['yaxis.tick0'] = payload.y0;
          if (hasY2) patch['yaxis2.tick0'] = payload.y0;
        }
        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-major-dtick': {
        // null ΓåÆ auto; number ΓåÆ fixed spacing
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        if (payload.dx === null || Number.isFinite(payload.dx)) {
          patch['xaxis.dtick'] = payload.dx;
          if (hasX2) patch['xaxis2.dtick'] = payload.dx;
        }
        if (payload.dy === null || Number.isFinite(payload.dy)) {
          patch['yaxis.dtick'] = payload.dy;
          if (hasY2) patch['yaxis2.dtick'] = payload.dy;
        }
        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-minor': {
        const on = !!payload.on;
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {
          'xaxis.minor.show': on,
          'yaxis.minor.show': on
        };
        if (hasX2) patch['xaxis2.minor.show'] = on;
        if (hasY2) patch['yaxis2.minor.show'] = on;
        if (!on) {
          // fully disable: no ticks or spacing
          patch['xaxis.minor.ticks'] = '';
          patch['yaxis.minor.ticks'] = '';
          patch['xaxis.minor.dtick'] = null;
          patch['yaxis.minor.dtick'] = null;
          if (hasX2) {
            patch['xaxis2.minor.ticks'] = '';
            patch['xaxis2.minor.dtick'] = null;
          }
          if (hasY2) {
            patch['yaxis2.minor.ticks'] = '';
            patch['yaxis2.minor.dtick'] = null;
          }
        }
        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-minor-placement': {
        const p = (payload.placement ?? ''); // ''|'outside'|'inside'
        const on = p !== '';

        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');

        const patch = {
          'xaxis.minor.ticks': p,
          'yaxis.minor.ticks': p,
          'xaxis.minor.show': on,
          'yaxis.minor.show': on
        };
        if (hasX2) {
          patch['xaxis2.minor.ticks'] = p;
          patch['xaxis2.minor.show'] = on;
        }
        if (hasY2) {
          patch['yaxis2.minor.ticks'] = p;
          patch['yaxis2.minor.show'] = on;
        }

        // keep existing grid/line state only if explicitly configured
        preserveAxisDecorations(layout, 'xaxis', patch);
        preserveAxisDecorations(layout, 'yaxis', patch);
        if (hasX2) preserveAxisDecorations(layout, 'xaxis2', patch);
        if (hasY2) preserveAxisDecorations(layout, 'yaxis2', patch);

        patchLayout(panelId, patch);
        break;
      }

      case 'ticks-minor-subdiv': {
        const N = Math.max(1, Math.min(10, Math.round(Number(payload.subdiv) || 2)));
        const patch = {};

        const figure = getPanelFigure(panelId);

        const setMinor = (axis, axisState) => {
          const a = axisState || {};
          let major = Number(a.dtick);
          if (!Number.isFinite(major)) {
            const rng = Array.isArray(a.range) && a.range.length === 2 ? a.range : null;
            const span = rng ? Math.abs(rng[1] - rng[0]) : NaN;
            const nt = Number(a.nticks) || 6;
            if (Number.isFinite(span) && span > 0) major = span / nt;
          }

          if (Number.isFinite(major) && major > 0) {
            patch[`${axis}.minor.dtick`] = major / (N + 1);
            patch[`${axis}.minor.show`]  = true;          // enable minor ticks
            // do NOT touch `${axis}.minor.showgrid` here
          }
        };

        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], setMinor);

        if (Object.keys(patch).length) patchLayout(panelId, patch);
        break;
      }

      case 'smooth': {
        const figure = getPanelFigure(panelId);
        const data = Array.isArray(figure.data) ? figure.data.slice() : [];
        const on = !!payload.on;
        pushHistory();
        const updatedData = data.map((trace) => {
          const next = { ...trace };
          next.line = { ...(trace?.line || {}) };
          next.line.shape = on ? 'spline' : 'linear';
          if (on) {
            next.line.smoothing = 1.15;
          } else {
            delete next.line.smoothing;
          }
          return next;
        });
        figure.data = updatedData;
        normalizePanelTraces(panelId, figure);
        renderPlot(panelId);
        persist();
        updateHistoryButtons();
        break;
      }

      case 'export': {
        const dom = getPanelDom(panelId);
        if (!dom?.plotEl) return;
        Plotly.toImage(dom.plotEl, { format: 'png', scale: 2 })
          .then((url) => { const a=document.createElement('a'); a.href=url; a.download='plot.png'; a.click(); });
        break;
      }

      default: {
        // Safe dev-time notice for unhandled actions
        console.warn('Unhandled header action:', act, payload);
        break;
      }
    }
  }


  const updatePanelEmpty = () => {
    if (!panelDom.empty) return;
    if (panelDom.empty.dataset.mode === 'search-empty') {
      panelDom.empty.style.display = '';
      return;
    }
    panelDom.empty.style.display = panelDomRegistry.size ? 'none' : '';
  };

  const updateCanvasState = () => {
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
    const canvasWidth = canvas?.clientWidth || MIN_WIDTH;
    const canvasHeight = canvas?.clientHeight || MIN_HEIGHT;

    const width = Math.max(
      MIN_WIDTH,
      Math.min(coerceNumber(geometry.width, MIN_WIDTH), canvasWidth)
    );
    const height = Math.max(
      MIN_HEIGHT,
      Math.min(coerceNumber(geometry.height, MIN_HEIGHT), canvasHeight)
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

    return {
      hovermode: 'x',
      margin: { l: 50, r: 15, t: 30, b: 40 },
      xaxis: { title: { text: xLabel } },
      yaxis: { title: { text: yLabel } },
      legend: { orientation: 'h' }
    };
  };

  const snapshotState = () => ({
    colorCursor,
    sections: sectionsModel.snapshot(),
    panels: typeof panelsModel.snapshot === 'function'
      ? panelsModel.snapshot()
      : { counter: 0, items: [] }
  });

  const persist = () => {
    const payload = {
      version: 1,
      ...snapshotState()
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist workspace layout', err);
    }
  };

  const bringPanelToFront = (panelId, { persistChange = true, scrollBrowser = false } = {}) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.rootEl) return;
    const updated = panelsModel.bringPanelToFront(panelId);
    if (updated) {
      applyPanelZIndex(panelId);
      if (persistChange) {
        persist();
      }
    }
    setActivePanel(panelId, { scrollBrowser });
  };

  const focusPanelById = (panelId, { scrollBrowser = true } = {}) => {
    if (!panelId) return;
    bringPanelToFront(panelId, { scrollBrowser });
  };

  const pushHistory = () => {
    history.push(snapshotState());
    if (history.length > HISTORY_LIMIT) {
      history.shift();
    }
    future.length = 0;
    updateHistoryButtons();
  };

  const clearPanels = () => {
    panelDomRegistry.forEach((dom, panelId) => {
      dom?.rootEl?.remove();
      detachPanelDom(panelId);
    });
    panelsModel.load({ counter: 0, items: [] });
    setActivePanel(null);
  };

  const restoreSnapshot = (snapshot, { skipHistory = false } = {}) => {
    clearPanels();
    colorCursor = snapshot?.colorCursor || 0;
    sectionsModel.load(snapshot?.sections);

    const panelSnapshot = snapshot?.panels || { counter: 0, items: [] };
    panelsModel.load(panelSnapshot);

    panelsModel
      .getPanelsInIndexOrder()
      .forEach((state) => {
        registerPanel(state, {
          skipHistory: true,
          skipPersist: true,
          preserveIndex: true,
          useModelState: true
        });
      });

    updateCanvasState();
    renderGraphBrowser();
    persist();

    if (!skipHistory) {
      updateHistoryButtons();
    }
  };

  const undo = () => {
    if (!history.length) return;
    future.push(snapshotState());
    const snapshot = history.pop();
    restoreSnapshot(snapshot, { skipHistory: true });
    updateHistoryButtons();
  };

  const redo = () => {
    if (!future.length) return;
    history.push(snapshotState());
    const snapshot = future.pop();
    restoreSnapshot(snapshot, { skipHistory: true });
    updateHistoryButtons();
  };

  const renderPlot = (panelId) => {
    if (typeof Plotly === 'undefined') return;
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    if (!dom?.plotEl) return;
    const figure = getPanelFigure(panelId);
    const data = ensureArray(figure.data);
    const layout = figure.layout && typeof figure.layout === 'object'
      ? figure.layout
      : defaultLayout();
    Plotly.react(
      dom.plotEl,
      data,
      layout || defaultLayout(),
      { displaylogo: false, responsive: true }
    );
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
      trace.line.color = toHexColor(trace.line.color || FALLBACK_COLOR);
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

  const isSectionVisible = (sectionId) => {
    let current = sections.get(sectionId);
    while (current) {
      if (current.visible === false) return false;
      current = current.parentId ? sections.get(current.parentId) : null;
    }
    return true;
  };

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
      if (shouldShow && plotHost && typeof Plotly?.Plots?.resize === 'function') {
        Plotly.Plots.resize(plotHost);
      }
    });
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
      renderGraphBrowser();
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

  const toggleSectionVisibility = (sectionId) => {
    const section = sections.get(sectionId);
    if (!section) return;
    pushHistory();
    section.visible = section.visible === false ? true : false;
    persist();
    refreshPanelVisibility();
    renderGraphBrowser();
    updateHistoryButtons();
  };

  const toggleGraphVisibility = (panelId) => {
    if (!panelId) return;
    const record = getPanelRecord(panelId);
    if (!record) return;
    pushHistory();
    const nextHidden = record.hidden !== true;
    panelsModel.setHidden(panelId, nextHidden);
    persist();
    renderGraphBrowser();
    updateHistoryButtons();
  };

  const addGraphToSection = (sectionId) => {
    if (!sections.has(sectionId)) return;
    const panelId = ingestPayloadAsPanel({
      name: `Sample ${getNextPanelSequence()}`
    }, { sectionId });
    if (panelId) {
      const record = getPanelRecord(panelId);
      const labelIndex = record?.index || 0;
      const label = labelIndex ? `Graph ${labelIndex}` : 'Graph';
      showToast(`${label} added to group.`, 'success');
    }
  };

  const renderGraphBrowser = () => {
    const tree = panelDom.tree;
    if (!tree) return;
    tree.innerHTML = '';
    ensureDefaultSection();

    const term = searchTerm.trim().toLowerCase();
    const orderedRecords = getPanelsOrdered();
    const sortedPanels = orderedRecords
      .map((record, position) => {
        const panelId = record?.id;
        if (!panelId) return null;
        const sectionId = sections.has(record.sectionId) ? record.sectionId : DEFAULT_SECTION_ID;
        const rawIndex = coerceNumber(record.index, position + 1);
        const index = Number.isFinite(rawIndex) && rawIndex > 0 ? rawIndex : 0;
        return {
          panelId,
          record,
          position,
          meta: {
            id: panelId,
            sectionId,
            hidden: record.hidden === true,
            collapsed: record.collapsed === true,
            index
          }
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const aIndex = a.meta.index || (a.position + 1);
        const bIndex = b.meta.index || (b.position + 1);
        return aIndex - bIndex;
      });

    sortedPanels.forEach((item, idx) => {
      if (!item.meta.index || item.meta.index <= 0) {
        item.meta.index = idx + 1;
      }
    });

    if (!sortedPanels.length) {
      if (panelDom.empty) {
        panelDom.empty.dataset.mode = 'search-empty';
        panelDom.empty.style.display = '';
        panelDom.empty.textContent = term
          ? 'No graphs match your search.'
          : 'Drop files or use the toolbar to add graphs.';
      }
      ensureChipPanelsMount();
      refreshPanelVisibility();
      return;
    }

    const panelsBySection = new Map();
    sections.forEach((section, id) => {
      panelsBySection.set(id, []);
    });

    sortedPanels.forEach((item) => {
      const sectionId = sections.has(item.meta.sectionId) ? item.meta.sectionId : DEFAULT_SECTION_ID;
      item.meta.sectionId = sectionId;
      if (!panelsBySection.has(sectionId)) panelsBySection.set(sectionId, []);
      panelsBySection.get(sectionId).push(item);
    });

    let renderedSomething = false;

    const makeTraceRows = (panelItem) => {
      const { meta, panelId, record } = panelItem;
      const resolvedPanelId = meta.id || panelId;
      const traces = getPanelTraces(resolvedPanelId);
      const labelIndex = meta.index || record?.index || 0;
      const label = labelIndex ? `Graph ${labelIndex}` : 'Graph';
      const graphMatches = !term || label.toLowerCase().includes(term);
      const rows = traces.map((trace, idx) => {
        const name = trace?.name || `Trace ${idx + 1}`;
        const matchesTrace = !term || name.toLowerCase().includes(term);
        return { trace, idx, name, matchesTrace };
      });
      const visibleRows = term ? rows.filter((row) => row.matchesTrace || graphMatches) : rows;
      return {
        rows: visibleRows,
        graphMatches,
        hasVisible: visibleRows.length > 0,
        panelId: resolvedPanelId
      };
    };

    const buildTraceRow = (panelItem, rowInfo) => {
      const panelMeta = panelItem.meta;
      const panelId = panelMeta.id || panelItem.panelId;
      let trace = rowInfo.trace;
      const row = document.createElement('div');
      row.className = 'folder-trace';
      row.dataset.panelId = panelId;
      row.dataset.traceIndex = String(rowInfo.idx);
      let traceId = trace?._canvasId || null;
      if (!traceId) {
        const normalized = normalizePanelTraces(panelId);
        const refreshedTraces = ensureArray(normalized?.data);
        traceId = refreshedTraces[rowInfo.idx]?._canvasId;
        trace = refreshedTraces[rowInfo.idx] || trace;
      }
      row.dataset.id = `${panelId}:${traceId || rowInfo.idx}`;
      if (term && !rowInfo.matchesTrace) {
        row.classList.add('is-muted');
      }

      const safeName = escapeHtml(rowInfo.name || `Trace ${rowInfo.idx + 1}`);
      row.innerHTML = `
        <span class="drag-handle bi bi-grip-vertical" title="Drag trace"></span>
        <input class="form-check-input vis" type="checkbox" ${trace.visible !== false ? 'checked' : ''} title="Toggle visibility">
        <button class="line-chip" type="button" aria-label="Edit line style"></button>
        <button class="color-dot" type="button" style="--c:${toHexColor(trace.line?.color || '#1f77b4')}" title="Pick colour" hidden></button>
        <input class="color form-control form-control-color form-control-sm" type="color" value="${toHexColor(trace.line?.color || '#1f77b4')}" title="Colour picker" hidden>
        <input class="form-control form-control-sm rename" type="text" value="${safeName}" title="Double-click to rename" readonly>
        <button class="trace-info-icon" type="button" title="Trace info"><i class="bi bi-info-circle"></i></button>
        <select class="dash form-select form-select-sm" title="Line style" hidden>
          <option value="solid" ${trace.line?.dash === 'solid' ? 'selected' : ''}>Solid</option>
          <option value="dot" ${trace.line?.dash === 'dot' ? 'selected' : ''}>Dots</option>
          <option value="dash" ${trace.line?.dash === 'dash' ? 'selected' : ''}>Dash</option>
          <option value="longdash" ${trace.line?.dash === 'longdash' ? 'selected' : ''}>Long dash</option>
          <option value="dashdot" ${trace.line?.dash === 'dashdot' ? 'selected' : ''}>Dash + dot</option>
          <option value="longdashdot" ${trace.line?.dash === 'longdashdot' ? 'selected' : ''}>Long dash + dot</option>
        </select>
        <input class="opacity form-range" type="range" min="0.1" max="1" step="0.05" value="${trace.opacity ?? 1}" title="Opacity" hidden>
        <button class="trace-remove" type="button" title="Remove trace"><i class="bi bi-x-circle"></i></button>
      `;

      row.draggable = false;
      let dragFromHandle = false;
      const setDragFromHandle = (enabled) => {
        dragFromHandle = !!enabled;
        row.draggable = dragFromHandle;
      };
      const dragHandle = row.querySelector('.drag-handle');
      if (dragHandle) {
        dragHandle.addEventListener('pointerdown', (evt) => {
          if (typeof evt.button === 'number' && evt.button !== 0) return;
          setDragFromHandle(true);
        });
        dragHandle.addEventListener('pointerup', () => setDragFromHandle(false));
        dragHandle.addEventListener('pointercancel', () => setDragFromHandle(false));
      }

      updateTraceChip(row, trace);

      const visToggle = row.querySelector('.vis');
      visToggle?.addEventListener('change', () => {
        pushHistory();
        const figure = getPanelFigure(panelId);
        const tracesData = ensureArray(figure.data);
        const current = tracesData[rowInfo.idx];
        if (!current) {
          history.pop();
          return;
        }
        tracesData[rowInfo.idx] = {
          ...current,
          visible: visToggle.checked
        };
        figure.data = tracesData;
        normalizePanelTraces(panelId, figure);
        renderPlot(panelId);
        persist();
        renderGraphBrowser();
        updateHistoryButtons();
      });

      const renameInput = row.querySelector('.rename');
      renameInput?.addEventListener('dblclick', (evt) => {
        renameInput.readOnly = false;
        renameInput.focus();
        renameInput.select();
        evt.stopPropagation();
      });
      renameInput?.addEventListener('blur', () => {
        renameInput.readOnly = true;
        const value = renameInput.value.trim();
        if (!value) {
          renderGraphBrowser();
          return;
        }
        const figure = getPanelFigure(panelId);
        const tracesData = ensureArray(figure.data);
        const current = tracesData[rowInfo.idx];
        if (!current) {
          return;
        }
        if ((current.name || '').trim() === value) {
          return;
        }
        pushHistory();
        current.name = value;
        figure.data = tracesData;
        normalizePanelTraces(panelId, figure);
        renderPlot(panelId);
        renderGraphBrowser();
        persist();
        updateHistoryButtons();
      });
      renameInput?.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter') {
          renameInput.blur();
        } else if (evt.key === 'Escape') {
          const tracesData = getPanelTraces(panelId);
          const current = tracesData[rowInfo.idx];
          renameInput.value = current?.name || `Trace ${rowInfo.idx + 1}`;
          renameInput.blur();
        }
      });

      const removeBtn = row.querySelector('.trace-remove');
      removeBtn?.addEventListener('click', () => {
        pushHistory();
        const result = panelsModel.removeTrace(panelId, rowInfo.idx);
        if (!result) {
          history.pop();
          return;
        }
        const remaining = ensureArray(result.figure?.data);
        if (!remaining.length) {
          removePanel(panelId, { pushToHistory: false });
        } else {
          normalizePanelTraces(panelId, result.figure);
          renderPlot(panelId);
        }
        renderGraphBrowser();
        persist();
        updateHistoryButtons();
      });

      row.addEventListener('dragstart', (event) => {
        if (!dragFromHandle) {
          event.preventDefault();
          setDragFromHandle(false);
          return;
        }
        dragState = { type: 'trace', panelId, traceIndex: rowInfo.idx };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(TRACE_DRAG_MIME, JSON.stringify(dragState));
        event.dataTransfer.setData('text/plain', `${panelId}:${rowInfo.idx}`);
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        dragState = null;
        setDropTarget(null);
        setDragFromHandle(false);
      });

      return row;
    };

    const renderGraphNode = (panelItem, sectionId, depth) => {
      const { meta, panelId, record } = panelItem;
      const resolvedPanelId = meta.id || panelId;
      const traceInfo = makeTraceRows(panelItem);
      if (!traceInfo.hasVisible) return null;
      const graphIndex = meta.index || record?.index || 0;
      const graphLabel = graphIndex ? `Graph ${graphIndex}` : 'Graph';
      const collapsed = meta.collapsed === true;
      const hidden = meta.hidden === true;
      const sectionVisible = isSectionVisible(sectionId);
      const graphVisible = !hidden;
      const node = document.createElement('div');
      node.className = 'folder-node graph-node';
      node.dataset.type = 'graph';
      node.dataset.id = resolvedPanelId;
      node.dataset.panelId = resolvedPanelId;
      node.dataset.sectionId = sectionId;
      node.dataset.depth = String(depth + 1);
      const fullyVisible = sectionVisible && graphVisible;
      node.dataset.visible = fullyVisible ? 'true' : 'false';
      node.dataset.sectionVisible = sectionVisible ? 'true' : 'false';
      node.dataset.graphVisible = graphVisible ? 'true' : 'false';
      node.classList.toggle('graph-hidden', !graphVisible);

      const header = document.createElement('div');
      header.className = 'folder-header graph-header';
      header.dataset.panelId = resolvedPanelId;
      header.dataset.sectionId = sectionId;
      header.dataset.depth = String(depth + 1);
      header.setAttribute('draggable', 'true');
      if (!graphVisible) {
        header.classList.add('is-hidden');
      }

      header.addEventListener('dragstart', (event) => {
        if (event.target.closest('button')) {
          event.preventDefault();
          return;
        }
        dragState = { type: 'graph', panelId: resolvedPanelId, sectionId };
        node.classList.add('is-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(GRAPH_DRAG_MIME, resolvedPanelId);
          event.dataTransfer.setData('text/plain', resolvedPanelId);
        }
      });
      header.addEventListener('dragend', () => {
        node.classList.remove('is-dragging');
        dragState = null;
        setDropTarget(null);
      });

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.innerHTML = `<i class="bi ${collapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>`;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('draggable', 'false');
      toggle.addEventListener('click', () => {
        const current = getPanelRecord(resolvedPanelId)?.collapsed === true;
        panelsModel.setCollapsed(resolvedPanelId, !current);
        renderGraphBrowser();
        persist();
      });
      header.appendChild(toggle);

      const name = document.createElement('span');
      name.className = 'folder-name graph-name';
      name.textContent = graphLabel;
      if (!graphVisible) {
        name.classList.add('is-muted');
      }
      if (term && !traceInfo.graphMatches) {
        name.classList.add('is-muted');
      }
      header.appendChild(name);

      const actions = document.createElement('div');
      actions.className = 'folder-actions graph-actions';

      const graphVisibilityBtn = document.createElement('button');
      graphVisibilityBtn.className = 'btn-icon graph-visibility';
      graphVisibilityBtn.type = 'button';
      graphVisibilityBtn.dataset.panelId = resolvedPanelId;
      graphVisibilityBtn.title = graphVisible ? 'Hide graph' : 'Show graph';
      graphVisibilityBtn.setAttribute('draggable', 'false');
      graphVisibilityBtn.innerHTML = `<i class="bi ${graphVisible ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
      actions.appendChild(graphVisibilityBtn);

      const graphBrowseBtn = document.createElement('button');
      graphBrowseBtn.className = 'btn-icon graph-browse';
      graphBrowseBtn.type = 'button';
      graphBrowseBtn.dataset.panelId = resolvedPanelId;
      graphBrowseBtn.title = 'Add traces from file';
      graphBrowseBtn.setAttribute('draggable', 'false');
      graphBrowseBtn.innerHTML = '<i class="bi bi-file-earmark-plus"></i>';
      actions.appendChild(graphBrowseBtn);

      const graphDeleteBtn = document.createElement('button');
      graphDeleteBtn.className = 'btn-icon graph-delete';
      graphDeleteBtn.type = 'button';
      graphDeleteBtn.dataset.panelId = resolvedPanelId;
      graphDeleteBtn.title = 'Delete graph';
      graphDeleteBtn.setAttribute('draggable', 'false');
      graphDeleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      actions.appendChild(graphDeleteBtn);

      header.appendChild(actions);

      node.appendChild(header);

      const children = document.createElement('div');
      children.className = 'folder-children';
      children.style.display = collapsed ? 'none' : '';

      const tracesWrap = document.createElement('div');
      tracesWrap.className = 'folder-traces';
      if (traceInfo.rows.length) {
        traceInfo.rows.forEach((rowInfo) => {
          const row = buildTraceRow(panelItem, rowInfo);
          tracesWrap.appendChild(row);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'text-muted small px-2 py-1';
        empty.textContent = term ? 'No traces match search.' : 'No traces in this graph yet.';
        tracesWrap.appendChild(empty);
      }

      children.appendChild(tracesWrap);
      node.appendChild(children);
      return node;
    };

    const renderSectionNode = (sectionId, depth = 0) => {
      const section = sections.get(sectionId);
      if (!section) return null;

      const childIds = Array.isArray(section.children) ? section.children : [];
      const sectionMatches = !term || (section.name || '').toLowerCase().includes(term);

      const childNodes = [];
      childIds.forEach((childId) => {
        const childNode = renderSectionNode(childId, depth + 1);
        if (childNode) childNodes.push(childNode);
      });

      const graphNodes = [];
      (panelsBySection.get(sectionId) || []).forEach((panelItem) => {
        const graphNode = renderGraphNode(panelItem, sectionId, depth);
        if (graphNode) graphNodes.push(graphNode);
      });

      const hasChildContent = childNodes.length > 0;
      const hasGraphContent = graphNodes.length > 0;
      const hasSearchContent = sectionMatches || hasChildContent || hasGraphContent;

      if (term && !hasSearchContent) {
        return null;
      }

      const node = document.createElement('div');
      node.className = 'folder-node section-node';
      node.dataset.type = 'section';
      node.dataset.sectionId = sectionId;
      node.dataset.depth = String(depth);
      node.dataset.visible = section.visible === false ? 'false' : 'true';
      if (!section.locked) {
        node.setAttribute('draggable', 'true');
      }

      const header = document.createElement('div');
      header.className = 'folder-header section-header';
      header.dataset.sectionId = sectionId;
      header.dataset.depth = String(depth);
      if (section.visible === false) {
        header.classList.add('is-hidden');
      }

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'toggle';
      toggle.innerHTML = `<i class="bi ${section.collapsed ? 'bi-chevron-right' : 'bi-chevron-down'}"></i>`;
      toggle.setAttribute('aria-expanded', String(!section.collapsed));
      toggle.addEventListener('click', () => {
        setSectionCollapsed(sectionId, !section.collapsed);
        renderGraphBrowser();
        persist();
      });
      header.appendChild(toggle);

      const name = document.createElement('span');
      name.className = 'folder-name section-name';
      name.dataset.sectionId = sectionId;
      name.dataset.depth = String(depth);
      name.textContent = section.name || (depth === 0 ? 'Group' : 'Subgroup');
      header.appendChild(name);

      const actions = document.createElement('div');
      actions.className = 'folder-actions';

      const visible = section.visible !== false;
      const visibilityBtn = document.createElement('button');
      visibilityBtn.className = 'btn-icon section-visibility';
      visibilityBtn.type = 'button';
      visibilityBtn.dataset.sectionId = sectionId;
      visibilityBtn.title = visible ? 'Hide group' : 'Show group';
      visibilityBtn.innerHTML = `<i class="bi ${visible ? 'bi-eye' : 'bi-eye-slash'}"></i>`;
      actions.appendChild(visibilityBtn);

      const addGraphBtn = document.createElement('button');
      addGraphBtn.className = 'btn-icon section-add-graph';
      addGraphBtn.type = 'button';
      addGraphBtn.dataset.sectionId = sectionId;
      addGraphBtn.title = 'Add graph to this group';
      addGraphBtn.innerHTML = '<i class="bi bi-plus-square"></i>';
      actions.appendChild(addGraphBtn);

      if (depth === 0) {
        const addSubBtn = document.createElement('button');
        addSubBtn.className = 'btn-icon section-add-sub';
        addSubBtn.type = 'button';
        addSubBtn.dataset.sectionId = sectionId;
        addSubBtn.title = 'Add subgroup';
        addSubBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
        actions.appendChild(addSubBtn);
      }

      if (!section.locked) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-icon section-delete';
        deleteBtn.type = 'button';
        deleteBtn.dataset.sectionId = sectionId;
        deleteBtn.title = 'Delete group';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        actions.appendChild(deleteBtn);
      }

      header.appendChild(actions);
      node.appendChild(header);

      const container = document.createElement('div');
      container.className = 'folder-children';
      container.dataset.sectionId = sectionId;
      container.style.display = section.collapsed ? 'none' : '';

      childNodes.forEach((childNode) => container.appendChild(childNode));
      graphNodes.forEach((graphNode) => container.appendChild(graphNode));

      if (!childNodes.length && !graphNodes.length && !term) {
        const empty = document.createElement('div');
        empty.className = 'text-muted small px-2 py-1';
        empty.textContent = depth === 0 ? 'No graphs in this group yet.' : 'No graphs in this subgroup yet.';
        container.appendChild(empty);
      }

      node.appendChild(container);
      renderedSomething = true;
      return node;
    };

    const topLevelIds = sectionOrder.filter((id) => sections.has(id));
    topLevelIds.forEach((id) => {
      const node = renderSectionNode(id, 0);
      if (node) {
        tree.appendChild(node);
      }
    });

    sections.forEach((section) => {
      if (!section.parentId && !topLevelIds.includes(section.id)) {
        const node = renderSectionNode(section.id, 0);
        if (node) {
          tree.appendChild(node);
        }
      }
    });

    if (!renderedSomething) {
      if (panelDom.empty) {
        panelDom.empty.dataset.mode = 'search-empty';
        panelDom.empty.style.display = '';
        panelDom.empty.textContent = term
          ? 'No graphs match your search.'
          : 'Drop files or use the toolbar to add graphs.';
      }
    } else if (panelDom.empty) {
      delete panelDom.empty.dataset.mode;
      panelDom.empty.style.display = 'none';
    }

    applyActivePanelState();
    ensureChipPanelsMount();
    refreshPanelVisibility();

    if (pendingRenameSectionId) {
      const targetId = pendingRenameSectionId;
      const nameEl = panelDom.tree?.querySelector(`.section-name[data-section-id="${targetId}"]`);
      pendingRenameSectionId = null;
      if (nameEl) {
        startSectionRename(targetId, nameEl, { selectAll: true });
      }
    }
  };

  const collectSectionDescendants = (sectionId) => {
    const result = [];
    const visit = (id) => {
      if (!sections.has(id)) return;
      result.push(id);
      const node = sections.get(id);
      ensureArray(node.children).forEach(visit);
    };
    visit(sectionId);
    return result;
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
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete group "${section.name || 'Group'}"? Graphs will move to Group 1.`);
      if (!confirmed) return;
    }
    pushHistory();
    const descendants = collectSectionDescendants(sectionId);
    getPanelsOrdered().forEach((record) => {
      const panelId = record?.id;
      if (!panelId) return;
      if (descendants.includes(record.sectionId)) {
        panelsModel.attachToSection(panelId, DEFAULT_SECTION_ID);
      }
    });
    deleteSection(sectionId);
    ensureDefaultSection();
    renderGraphBrowser();
    persist();
    updateHistoryButtons();
  };

  const deleteGraphInteractive = (panelId) => {
    const record = getPanelRecord(panelId);
    if (!record) return;
    const labelIndex = record?.index || 0;
    const label = labelIndex ? `Graph ${labelIndex}` : 'this graph';
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(`Delete ${label}?`);
      if (!confirmed) return;
    }
    removePanel(panelId);
  };

  const moveTrace = (source, target) => {
    const sourcePanelId = source?.panelId;
    const targetPanelId = target?.panelId;
    if (!sourcePanelId || !targetPanelId) return false;

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

    const remaining = getPanelTraces(sourcePanelId);
    if (!remaining.length) {
      removePanel(sourcePanelId, { pushToHistory: false });
    }

    renderGraphBrowser();
    persist();
    updateHistoryButtons();
    return true;
  };

  const moveGraph = (panelId, { sectionId, beforePanelId } = {}) => {
    const record = getPanelRecord(panelId);
    if (!record) return false;

    const initialSectionId = sections.has(record.sectionId) ? record.sectionId : DEFAULT_SECTION_ID;
    const targetSectionId = sectionId && sections.has(sectionId)
      ? sectionId
      : initialSectionId;

    if (targetSectionId && targetSectionId !== record.sectionId) {
      panelsModel.attachToSection(panelId, targetSectionId);
    }

    const orderedRecords = panelsModel.getPanelsInIndexOrder();
    const currentIdx = orderedRecords.findIndex((item) => item.id === panelId);
    if (currentIdx === -1) return false;
    const [current] = orderedRecords.splice(currentIdx, 1);

    let targetIdx = orderedRecords.length;
    if (beforePanelId && beforePanelId !== panelId) {
      targetIdx = orderedRecords.findIndex((item) => item.id === beforePanelId);
      if (targetIdx === -1) targetIdx = orderedRecords.length;
    } else if (targetSectionId && sections.has(targetSectionId)) {
      const lastIdx = orderedRecords.reduce(
        (acc, item, idx) => (item.sectionId === targetSectionId ? idx : acc),
        -1
      );
      targetIdx = lastIdx >= 0 ? lastIdx + 1 : orderedRecords.length;
    }

    orderedRecords.splice(targetIdx, 0, current);

    orderedRecords.forEach((panel, idx) => {
      panelsModel.setPanelIndex(panel.id, idx + 1);
    });

    renderGraphBrowser();
    persist();
    updateHistoryButtons();
    return true;
  };

  const resolveTraceTarget = (event) => {
    const traceRow = event.target.closest('.folder-trace');
    if (traceRow) {
      return {
        element: traceRow,
        panelId: traceRow.dataset.panelId,
        traceIndex: Number(traceRow.dataset.traceIndex) || 0
      };
    }
    const tracesContainer = event.target.closest('.folder-traces');
    if (tracesContainer) {
      const graphNode = tracesContainer.closest('.graph-node');
      const panelId = graphNode?.dataset?.panelId;
      if (!panelId) return null;
      const traces = getPanelTraces(panelId);
      return {
        element: tracesContainer,
        panelId,
        traceIndex: traces.length
      };
    }
    const graphNode = event.target.closest('.graph-node');
    if (graphNode) {
      const panelId = graphNode.dataset.panelId;
      const traces = getPanelTraces(panelId);
      return {
        element: graphNode,
        panelId,
        traceIndex: traces.length
      };
    }
    return null;
  };

  const handleTreeDragOver = (event) => {
    if (!dragState) return;
    if (dragState.type === 'trace') {
      const target = resolveTraceTarget(event);
      if (!target || !target.panelId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(target.element);
    } else if (dragState.type === 'graph') {
      const targetGraph = event.target.closest('.graph-node');
      const targetSection = event.target.closest('.section-node');
      if (!targetGraph && !targetSection) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(targetGraph || targetSection);
    }
  };

  const handleTreeDrop = (event) => {
    if (!dragState) return;
    if (dragState.type === 'trace') {
      const target = resolveTraceTarget(event);
      if (!target || !target.panelId) {
        setDropTarget(null);
        return;
      }
      event.preventDefault();
      if (target.panelId === dragState.panelId && target.traceIndex === dragState.traceIndex) {
        setDropTarget(null);
        dragState = null;
        return;
      }
      pushHistory();
      if (!moveTrace(dragState, { panelId: target.panelId, traceIndex: target.traceIndex })) {
        history.pop();
      }
    } else if (dragState.type === 'graph') {
      const targetGraph = event.target.closest('.graph-node');
      const targetSection = event.target.closest('.section-node');
      if (!targetGraph && !targetSection) {
        setDropTarget(null);
        return;
      }
      event.preventDefault();
      const sectionId = (targetGraph || targetSection)?.dataset?.sectionId;
      let beforePanelId = null;
      if (targetGraph) {
        beforePanelId = targetGraph.dataset.panelId;
        if (beforePanelId === dragState.panelId) {
          setDropTarget(null);
          dragState = null;
          return;
        }
      }
      pushHistory();
      if (!moveGraph(dragState.panelId, { sectionId, beforePanelId })) {
        history.pop();
      }
    }
    setDropTarget(null);
    dragState = null;
  };

  const removePanel = (id, { pushToHistory = true } = {}) => {
    const record = getPanelRecord(id);
    if (!record) return;
    if (pushToHistory) {
      pushHistory();
    }
    const wasActive = activePanelId === id;
    panelsModel.removePanel(id);
    const dom = getPanelDom(id);
    dom?.rootEl?.remove();
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
    renderGraphBrowser();
    refreshPanelVisibility();
    updateCanvasState();
    persist();
    updateHistoryButtons();
  };

  const registerPanel = (incomingState, {
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
    const candidateState = {
      id: candidateId,
      type: incomingState.type || 'plot',
      index: incomingIndex,
      x: Number.isFinite(incomingState.x) ? incomingState.x : 36 + panelDomRegistry.size * 24,
      y: Number.isFinite(incomingState.y) ? incomingState.y : 36 + panelDomRegistry.size * 24,
      width: Number.isFinite(incomingState.width) ? incomingState.width : 440,
      height: Number.isFinite(incomingState.height) ? incomingState.height : 300,
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

    const panelEl = document.createElement('div');
    panelEl.className = 'workspace-panel';
    panelEl.dataset.panelId = panelId;
    panelEl.dataset.graphIndex = String(baseState.index);

    const header = document.createElement('div');
    header.className = 'workspace-panel-header';

    const title = document.createElement('div');
    title.className = 'workspace-panel-title';
    title.textContent = `Graph ${baseState.index}`;

    const actions = document.createElement('div');
    actions.className = 'workspace-panel-actions';

    const popoverClosers = [];
    const registerPopoverCloser = (fn) => {
      if (typeof fn !== 'function') return;
      if (!popoverClosers.includes(fn)) {
        popoverClosers.push(fn);
      }
    };

    const closeAllPopovers = (ignore) => {
      popoverClosers.forEach((closeFn) => {
        if (closeFn && closeFn !== ignore) {
          closeFn();
        }
      });
    };

    const createToggleButton = ({
      icon,
      title,
      pressed = false,
      onClick = null
    }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
      btn.innerHTML = `<i class="bi ${icon}"></i>`;
      btn.title = title;
      btn.setAttribute('aria-pressed', String(pressed));
      btn.classList.toggle('is-active', pressed);
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(next));
        btn.classList.toggle('is-active', next);
        if (typeof onClick === 'function') {
          onClick(next, btn);
        }
      });
      return btn;
    };

    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'workspace-panel-actions-collection';
    controlsWrapper.setAttribute('aria-hidden', 'false');

    const appendPopoverControl = (buttonEl, popoverEl) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'workspace-panel-action-wrapper';
      wrapper.appendChild(buttonEl);
      wrapper.appendChild(popoverEl);
      controlsWrapper.appendChild(wrapper);

      // generic portal wiring for all popovers
      registerPopoverButton(buttonEl, popoverEl);
    };


    const cursorBtn = createToggleButton({
      icon: 'bi-crosshair',
      title: 'Toggle crosshair cursor',
      onClick: (isOn) => handleHeaderAction(panelId, 'cursor', { on: isOn })
    });
    controlsWrapper.appendChild(cursorBtn);

    const axesBtn = document.createElement('button');
    axesBtn.type = 'button';
    axesBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
    axesBtn.innerHTML = '<i class="bi bi-diagram-3"></i>';
    axesBtn.title = 'Axes options';
    axesBtn.setAttribute('aria-expanded', 'false');

    const axesPopover = document.createElement('div');
    axesPopover.className = 'workspace-panel-popover';
    axesPopover.innerHTML = `
      <div class="workspace-panel-popover-section">
        <div class="workspace-panel-popover-label">Thickness</div>
        <div class="workspace-panel-popover-items" data-role="axes-thickness">
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thin">Thin</button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-thickness="medium">Medium</button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thick">Thick</button>
          <div class="ms-2 d-flex align-items-center gap-2" data-role="axes-thickness-custom">
            <input type="range" min="1" max="6" step="1"
                  class="form-range" style="width:140px" />
            <span class="small text-muted" data-readout>2px</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-apply>Apply</button>
          </div>
        </div>
      </div>
      <div class="workspace-panel-popover-section">
        <div class="workspace-panel-popover-label">Visible sides</div>
        <div class="workspace-panel-popover-items workspace-panel-popover-axes-visibility">
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Top axis" data-side="top" aria-pressed="true"><i class="bi bi-arrow-up"></i></button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Bottom axis" data-side="bottom" aria-pressed="true"><i class="bi bi-arrow-down"></i></button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Left axis" data-side="left" aria-pressed="true"><i class="bi bi-arrow-left"></i></button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Right axis" data-side="right" aria-pressed="true"><i class="bi bi-arrow-right"></i></button>
        </div>
      </div>
      <div class="workspace-panel-popover-section">
        <div class="workspace-panel-popover-label">Presets</div>
        <div class="workspace-panel-popover-items" data-role="axes-presets">
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="all">All</button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="none">None</button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="xy">X + Y</button>
          <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="upright">Up + Right</button>
        </div>
      </div>
    `;
    
    axesPopover.onOpen = () => {
      const figure = getPanelFigure(panelId);
      const L = figure.layout || {};
      const X = L.xaxis || {};
      const Y = L.yaxis || {};

      // Resolve which sides are ON from Plotly state
      const xOn = { top:false, bottom:false };
      const yOn = { left:false, right:false };
      if (X.visible === false) {
        // none
      } else if (X.mirror) {
        xOn.top = xOn.bottom = true;
      } else {
        xOn[(X.side || 'bottom')] = true; // 'top'|'bottom'
      }
      if (Y.visible === false) {
        // none
      } else if (Y.mirror) {
        yOn.left = yOn.right = true;
      } else {
        yOn[(Y.side || 'left')] = true; // 'left'|'right'
      }

      const cont = axesPopover.querySelector('.workspace-panel-popover-axes-visibility');
      const set = (side, on) => {
        const b = cont.querySelector(`[data-side="${side}"]`);
        if (!b) return;
        b.setAttribute('aria-pressed', String(on));
        b.classList.toggle('is-active', on);
      };
      ['top','bottom','left','right'].forEach(s => set(s, false));
      set('top', xOn.top);
      set('bottom', xOn.bottom);
      set('left', yOn.left);
      set('right', yOn.right);

      // Thickness pills ΓÇö infer from linewidth
      const w = Number(X.linewidth ?? Y.linewidth ?? 1);
      const level = w >= 1.75 ? 'thick' : w <= 0.75 ? 'thin' : 'medium';
      axesPopover
        .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn')
        .forEach((b) => b.classList.toggle('is-active', b.dataset.thickness === level));

      const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
      if (sliderWrap) {
        const slider = sliderWrap.querySelector('input[type="range"]');
        const readout = sliderWrap.querySelector('[data-readout]');
        const px = Math.max(1, Math.round(Number(X.linewidth ?? Y.linewidth ?? 2)));
        slider.value = String(px);
        if (readout) readout.textContent = `${px}px`;
      }
    };

    axesPopover.addEventListener('input', (e) => {
      const slider = e.target.closest('[data-role="axes-thickness-custom"] input[type="range"]');
      if (!slider) return;
      const wrap = slider.closest('[data-role="axes-thickness-custom"]');
      const r = wrap.querySelector('[data-readout]');
      if (r) r.textContent = `${slider.value}px`;
    });




    let axesOutsideActive = false;
    const closeAxesPopover = () => {
      if (!axesPopover.classList.contains('is-open')) return;
      axesPopover.classList.remove('is-open');
      axesBtn.setAttribute('aria-expanded', 'false');
      controlsWrapper.classList.remove('allow-popover');
      if (axesOutsideActive) {
        document.removeEventListener('click', handleAxesOutsideClick);
        axesOutsideActive = false;
      }
    };
    registerPopoverCloser(closeAxesPopover);
    const handleAxesOutsideClick = (event) => {
      if (axesPopover.contains(event.target) || axesBtn.contains(event.target)) return;
      closeAxesPopover();
    };




      axesPopover.addEventListener('click', (event) => event.stopPropagation());

      axesPopover.addEventListener('click', (e) => {
        const t = e.target.closest('[data-thickness],[data-side],[data-preset],[data-apply]');
        if (!t) return;

        // Helper to read/write individual side buttons
        const cont = axesPopover.querySelector('.workspace-panel-popover-axes-visibility');
        const setSide = (side, on) => {
          const b = cont.querySelector(`[data-side="${side}"]`);
          if (!b) return;
          b.setAttribute('aria-pressed', String(on));
          b.classList.toggle('is-active', on);
        };
        const isOn = (side) =>
          cont.querySelector(`[data-side="${side}"]`).getAttribute('aria-pressed') === 'true';

        // 1) Thickness pills
        if (t.dataset.thickness) {
          axesPopover
            .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn[data-thickness]')
            .forEach((b) => b.classList.toggle('is-active', b === t));

          // Map to visible widths 1/2/3
          const level = t.dataset.thickness;
          const map = { thin: 1, medium: 2, thick: 3 };
          handleHeaderAction(panelId, 'axes-thickness', { level, value: map[level] });

          // keep slider readout in sync
          const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
          if (sliderWrap) {
            const slider = sliderWrap.querySelector('input[type="range"]');
            const readout = sliderWrap.querySelector('[data-readout]');
            slider.value = String(map[level]);
            if (readout) readout.textContent = `${map[level]}px`;
          }

          e.stopPropagation();
          return;
        }

        // 2) Presets (apply sides)
        if (t.dataset.preset) {
          const preset = t.dataset.preset;
          if (preset === 'all') {
            setSide('top', true); setSide('bottom', true);
            setSide('left', true); setSide('right', true);
          } else if (preset === 'xy') {
            setSide('top', false); setSide('bottom', true);
            setSide('left', true); setSide('right', false);
          } else if (preset === 'none') {
            ['top','bottom','left','right'].forEach((s) => setSide(s, false));
          } else if (preset === 'upright') {
            setSide('top', true);  setSide('bottom', false);
            setSide('left', false); setSide('right', true);
          }

          handleHeaderAction(panelId, 'axes-side', {
            top: isOn('top'),
            bottom: isOn('bottom'),
            left: isOn('left'),
            right: isOn('right')
          });
          e.stopPropagation();
          return;
        }

        // 3) Independent side toggle
        if (t.dataset.side) {
          const pressed = t.getAttribute('aria-pressed') !== 'true';
          t.setAttribute('aria-pressed', String(pressed));
          t.classList.toggle('is-active', pressed);

          handleHeaderAction(panelId, 'axes-side', {
            top: isOn('top'),
            bottom: isOn('bottom'),
            left: isOn('left'),
            right: isOn('right')
          });
          e.stopPropagation();
          return;
        }

        // 4) Custom slider "Apply"
        if (t.hasAttribute('data-apply')) {
          const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
          const slider = sliderWrap?.querySelector('input[type="range"]');
          const readout = sliderWrap?.querySelector('[data-readout]');
          const px = Math.max(1, Math.round(Number(slider?.value || 2)));
          if (readout) readout.textContent = `${px}px`;

          // deselect pills; this is a custom value
          axesPopover
            .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn[data-thickness]')
            .forEach((b) => b.classList.remove('is-active'));

          handleHeaderAction(panelId, 'axes-thickness-custom', { value: px });
          e.stopPropagation();
          return;
        }
      });




      axesPopover.__close = closeAxesPopover;
      appendPopoverControl(axesBtn, axesPopover);


      // === Major Grid (header toggle) ==============================================
      const figureForLayout = getPanelFigure(panelId);
      const currentLayout = figureForLayout.layout || {};
      const isMajorGridOn = Boolean(currentLayout?.xaxis?.showgrid || currentLayout?.yaxis?.showgrid);

      const gridMajorBtn = createToggleButton({
        icon: 'bi-grid-3x3-gap',
        title: 'Toggle major grid',
        pressed: isMajorGridOn,
        onClick: (on) => handleHeaderAction(panelId, 'grid-major', { on })
      });
      controlsWrapper.appendChild(gridMajorBtn);

      // === Grid (popover) : minor grid controls ===================================
      const gridBtn = document.createElement('button');
      gridBtn.type = 'button';
      gridBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
      gridBtn.innerHTML = '<i class="bi bi-grid"></i>';
      gridBtn.title = 'Minor grid options';
      gridBtn.setAttribute('aria-expanded', 'false');

      const gridPopover = document.createElement('div');
      gridPopover.className = 'workspace-panel-popover';
      gridPopover.innerHTML = `
        <div class="workspace-panel-popover-section">
          <div class="workspace-panel-popover-label">Minor grid</div>
          <div class="workspace-panel-popover-items" data-role="minor-toggle">
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor="on">On</button>
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-minor="off">Off</button>
          </div>
        </div>
        <div class="workspace-panel-popover-section">
          <div class="workspace-panel-popover-label">Subdivisions per major</div>
          <div class="workspace-panel-popover-items" data-role="minor-subdiv">
            <input type="range" min="1" max="10" step="1" class="form-range" style="width:160px" />
            <span class="small text-muted ms-2" data-readout>2</span>
            <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-apply>Apply</button>
          </div>
          <div class="form-text">Sets minor grid at 1/(N+1) of the major tick spacing.</div>
        </div>
      `;

      // Sync UI to current layout on open
      gridPopover.onOpen = () => {
        const figure = getPanelFigure(panelId);
        const L = figure.layout || {};
        const isMinorOn = !!(L?.xaxis?.minor?.showgrid || L?.yaxis?.minor?.showgrid);
        const minorToggle = gridPopover.querySelector('[data-role="minor-toggle"]');
        minorToggle.querySelectorAll('.workspace-panel-popover-btn').forEach(b => {
          const on = (b.dataset.minor === 'on');
          b.classList.toggle('is-active', on === isMinorOn);
        });

        // Try to infer current subdivisions from dtick ratio (if numeric)
        const xn = Number(L?.xaxis?.minor?.dtick);
        const xd = Number(L?.xaxis?.dtick);
        let sub = 2; // default
        if (Number.isFinite(xn) && Number.isFinite(xd) && xn > 0) {
          const est = Math.round(xd / xn - 1);
          if (est >= 1 && est <= 10) sub = est;
        }
        const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
        wrap.querySelector('input[type="range"]').value = String(sub);
        wrap.querySelector('[data-readout]').textContent = String(sub);
      };

      // Local click handlers ΓåÆ central dispatcher
      gridPopover.addEventListener('click', (e) => {
        const t = e.target.closest('[data-minor],[data-apply]');
        if (!t) return;

        if (t.dataset.minor) {
          const on = t.dataset.minor === 'on';
          // toggle buttons UI
          const group = gridPopover.querySelector('[data-role="minor-toggle"]');
          group.querySelectorAll('.workspace-panel-popover-btn').forEach(b =>
            b.classList.toggle('is-active', b === t)
          );
          handleHeaderAction(panelId, 'grid-minor', { on });
          e.stopPropagation();
          return;
        }

        if (t.hasAttribute('data-apply')) {
          const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
          const val = Number(wrap.querySelector('input[type="range"]').value || 2);
          wrap.querySelector('[data-readout]').textContent = String(val);
          handleHeaderAction(panelId, 'grid-minor-subdiv', { subdiv: Math.max(1, Math.min(10, Math.round(val))) });
          e.stopPropagation();
          return;
        }
      });

      // Live readout while sliding (optional)
      gridPopover.addEventListener('input', (e) => {
        const r = e.target.closest('[data-role="minor-subdiv"] input[type="range"]');
        if (!r) return;
        const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
        wrap.querySelector('[data-readout]').textContent = String(r.value);
      });

      // Add to header and auto-portal like other popovers
      appendPopoverControl(gridBtn, gridPopover);



    const ticksBtn = document.createElement('button');
    ticksBtn.type = 'button';
    ticksBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
    ticksBtn.innerHTML = '<i class="bi bi-distribute-vertical"></i>';
    ticksBtn.title = 'Tick options';
    ticksBtn.setAttribute('aria-expanded', 'false');

    const ticksPopoverIds = {
      between: `${baseState.id}_ticks_between`,
      first: `${baseState.id}_ticks_first`,
      last: `${baseState.id}_ticks_last`
    };

    const ticksPopover = document.createElement('div');
    ticksPopover.className = 'workspace-panel-popover workspace-panel-popover-ticks';
    ticksPopover.innerHTML = `
      <div class="workspace-panel-popover-section">
        <div class="workspace-panel-popover-label">Major</div>
        <div class="workspace-panel-popover-items" data-role="ticks-major">
          <div class="btn-group" role="group" aria-label="Major placement">
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-placement="outside">Outside</button>
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="inside">Inside</button>
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="none">None</button>
          </div>
          <button type="button" class="btn btn-outline-secondary ms-2 workspace-panel-popover-btn" data-labels="toggle">Labels</button>
          <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-offset">
            <span class="small text-muted">Tick start</span>
            <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="XΓéÇ">
            <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="YΓéÇ">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-apply-offset>Apply</button>
          </div>
          <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-dtick">
            <span class="small text-muted">Spacing</span>
            <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="╬öX">
            <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="╬öY">
            <button type="button" class="btn btn-sm btn-outline-secondary" data-apply-dtick>Apply</button>
          </div>
        </div>
      </div>

      <div class="workspace-panel-popover-section">
        <div class="workspace-panel-popover-label">Minor</div>
        <div class="workspace-panel-popover-items" data-role="ticks-minor">
          <div class="btn-group" role="group" aria-label="Minor placement">
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="outside">Outside</button>
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="inside">Inside</button>
            <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-minor-placement="none">None</button>
          </div>
          <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-subdiv">
            <span class="small text-muted">Subdivisions</span>
            <input type="range" min="1" max="10" step="1" class="form-range" style="width:120px" />
            <span class="small text-muted" data-readout>2</span>
          </div>
        </div>
        <div class="form-text">Minor ticks between majors (N per interval).</div>
      </div>
    `;

    ticksPopover.onOpen = () => {
      const figure = getPanelFigure(panelId);
      const L = figure.layout || {};
      const X = L.xaxis || {};
      const Y = L.yaxis || {};

      // Major placement (assume both axes share the same, pick XΓÇÖs as source of truth)
      const majorPlacement = (X.ticks ?? 'outside');
      ticksPopover.querySelectorAll('[data-role="ticks-major"] [data-placement]')
        .forEach(b => b.classList.toggle('is-active', b.dataset.placement === majorPlacement || (majorPlacement === '' && b.dataset.placement === 'none')));

      // Labels on/off (true if both axes show labels)
      const labelsOn = (X.showticklabels !== false) && (Y.showticklabels !== false);
      const labelsBtn = ticksPopover.querySelector('[data-role="ticks-major"] [data-labels="toggle"]');
      labelsBtn.setAttribute('aria-pressed', String(labelsOn));
      labelsBtn.classList.toggle('is-active', labelsOn);

      const offWrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
      if (offWrap) {
        const xInput = offWrap.querySelector('input[placeholder="XΓéÇ"]');
        const yInput = offWrap.querySelector('input[placeholder="YΓéÇ"]');
        xInput.value = (X.tick0 != null && X.tick0 !== '') ? String(X.tick0) : '';
        yInput.value = (Y.tick0 != null && Y.tick0 !== '') ? String(Y.tick0) : '';
      }

      // Subdivisions: infer from dtick ratio if numeric, else default 2
      const xn = Number(X.minor?.dtick);
      const xd = Number(X.dtick);
      let sub = 2;
      if (Number.isFinite(xn) && Number.isFinite(xd) && xn > 0) {
        const est = Math.round(xd / xn - 1);
        if (est >= 1 && est <= 10) sub = est;
      }
      const wrap = ticksPopover.querySelector('[data-role="ticks-subdiv"]');
      wrap.querySelector('input[type="range"]').value = String(sub);
      wrap.querySelector('[data-readout]').textContent = String(sub);

      // major ticks spacing
      const dtWrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
      if (dtWrap) {
        const dx = Number(X.dtick);
        const dy = Number(Y.dtick);
        dtWrap.querySelector('input[placeholder="╬öX"]').value = Number.isFinite(dx) ? String(dx) : '';
        dtWrap.querySelector('input[placeholder="╬öY"]').value = Number.isFinite(dy) ? String(dy) : '';
      }

      const mplace = (X.minor?.ticks ?? '');
      ticksPopover.querySelectorAll('[data-role="ticks-minor"] [data-minor-placement]')
        .forEach(b => {
          const val = b.dataset.minorPlacement;   // Γ£à correct
          const active = (mplace === '' && val === 'none') || (mplace === val);
          b.classList.toggle('is-active', active);
        });
    };

    ticksPopover.addEventListener('click', (e) => {
      const t = e.target.closest('[data-placement],[data-labels],[data-minor],[data-minor-placement]');
      // const t = e.target.closest('[data-placement],[data-labels],[data-minor],[data-minor-placement],[data-apply],[data-apply-offset],[data-apply-dtick]');
      if (!t) return;
      // Major placement
      if (t.dataset.placement) {
        const val = t.dataset.placement; // 'outside'|'inside'|'none'
        // toggle UI in the button group
        const group = ticksPopover.querySelector('[data-role="ticks-major"]');
        group.querySelectorAll('[data-placement]').forEach(b => b.classList.toggle('is-active', b === t));
        handleHeaderAction(panelId, 'ticks-placement', { placement: (val === 'none' ? '' : val) });
        e.stopPropagation();
        return;
      }

      // Labels toggle
      if (t.dataset.labels === 'toggle') {
        const next = t.getAttribute('aria-pressed') !== 'true';
        t.setAttribute('aria-pressed', String(next));
        t.classList.toggle('is-active', next);
        handleHeaderAction(panelId, 'ticks-labels', { on: next });
        e.stopPropagation();
        return;
      }

      // // Apply major offsets
      // if (t.hasAttribute('data-apply-offset')) {
      //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
      //   const x0raw = wrap.querySelector('input[placeholder="XΓéÇ"]').value;
      //   const y0raw = wrap.querySelector('input[placeholder="YΓéÇ"]').value;
      //   const x0 = x0raw === '' ? null : Number(x0raw);
      //   const y0 = y0raw === '' ? null : Number(y0raw);
      //   handleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
      //   e.stopPropagation();
      //   return;
      // }

      // // Major ticks spacing
      // if (t.hasAttribute('data-apply-dtick')) {
      //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
      //   const dxRaw = wrap.querySelector('input[placeholder="╬öX"]').value;
      //   const dyRaw = wrap.querySelector('input[placeholder="╬öY"]').value;
      //   const dx = dxRaw === '' ? null : Number(dxRaw);
      //   const dy = dyRaw === '' ? null : Number(dyRaw);
      //   handleHeaderAction(panelId, 'ticks-major-dtick', { dx, dy });
      //   e.stopPropagation();
      //   return;
      // }

      // Minor on/off
      if (t.dataset.minor) {
        const on = t.dataset.minor === 'on';
        const group = ticksPopover.querySelector('[data-role="ticks-minor"]');
        group.querySelectorAll('[data-minor]').forEach(b => b.classList.toggle('is-active', b === t));
        handleHeaderAction(panelId, 'ticks-minor', { on });
        e.stopPropagation();
        return;
      }

      // Minor placement
      if (t.dataset.minorPlacement) {
        const val = t.dataset.minorPlacement; // 'outside'|'inside'|'none'
        const group = ticksPopover.querySelector('[data-role="ticks-minor"]');
        group.querySelectorAll('[data-minor-placement]').forEach(b => b.classList.toggle('is-active', b === t));

        handleHeaderAction(panelId, 'ticks-minor-placement', { placement: (val === 'none' ? '' : val) });
        e.stopPropagation();
        return;
      }
    });

    // Live readout / auto-apply while sliding
    ticksPopover.addEventListener('input', (e) => {
      const slider = e.target.closest('[data-role="ticks-subdiv"] input[type="range"]');
      if (slider) {
        const wrap = ticksPopover.querySelector('[data-role="ticks-subdiv"]');
        const val = Math.max(1, Math.min(10, Math.round(Number(slider.value) || 2)));
        slider.value = String(val);
        wrap.querySelector('[data-readout]').textContent = String(val);
        autoApplyMinorSubdiv(val);
      }

      // auto-apply tick start / spacing
      if (e.target.closest('[data-role="ticks-major-offset"] input')) {
        autoApplyOffset();
      }
      if (e.target.closest('[data-role="ticks-major-dtick"] input')) {
        autoApplyDtick();
      }
    });

    // --- Debounced helpers for auto-apply ---
    const debounce = (fn, ms=160) => {
      let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
    };

    const autoApplyOffset = debounce(() => {
      const wrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
      if (!wrap) return;
      const x0raw = wrap.querySelector('input[placeholder="XΓéÇ"]').value;
      const y0raw = wrap.querySelector('input[placeholder="YΓéÇ"]').value;
      const x0 = x0raw === '' ? null : Number(x0raw);
      const y0 = y0raw === '' ? null : Number(y0raw);
      handleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
    });

    const autoApplyDtick = debounce(() => {
      const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
      if (!wrap) return;
      const dxRaw = wrap.querySelector('input[placeholder="╬öX"]').value;
      const dyRaw = wrap.querySelector('input[placeholder="╬öY"]').value;
      const dx = dxRaw === '' ? null : Number(dxRaw);
      const dy = dyRaw === '' ? null : Number(dyRaw);
      handleHeaderAction(panelId, 'ticks-major-dtick', { dx, dy });
    });

    const autoApplyMinorSubdiv = debounce((val) => {
      handleHeaderAction(panelId, 'ticks-minor-subdiv', { subdiv: val });
    });

    appendPopoverControl(ticksBtn, ticksPopover);

    function getUIPortal(){
      let n = document.querySelector('.ui-portal');
      if(!n){ n = document.createElement('div'); n.className='ui-portal'; document.body.appendChild(n); }
      return n;
    }
    function placePopoverAbove(btn, pop){
      const r = btn.getBoundingClientRect();
      pop.style.left = `${r.left + r.width/2}px`;
      pop.style.top  = `${r.top}px`;        // top edge of button; CSS translate lifts it above
    }
    function openPortaledPopover(btn, pop){
      const portal = getUIPortal();
      pop.__origParent = pop.parentElement;
      portal.appendChild(pop);
      placePopoverAbove(btn, pop);
      pop.classList.add('is-open');
      btn.setAttribute('aria-expanded','true');

      pop.__reflow = () => placePopoverAbove(btn, pop);
      window.addEventListener('scroll', pop.__reflow, true);
      window.addEventListener('resize', pop.__reflow, true);
    }
    function closePortaledPopover(btn, pop){
      pop.classList.remove('is-open');
      btn.setAttribute('aria-expanded','false');
      if(pop.__origParent) pop.__origParent.appendChild(pop);
      window.removeEventListener('scroll', pop.__reflow, true);
      window.removeEventListener('resize', pop.__reflow, true);
      delete pop.__reflow; delete pop.__origParent;
    }

    function readPopoverOpts(btn){
      return {
        side:  btn.dataset.popSide  || 'up',     // 'up' | 'down'
        align: btn.dataset.popAlign || 'center', // 'center' | 'left' | 'right'
        dx:    Number(btn.dataset.popDx || 0),
        dy:    Number(btn.dataset.popDy || 10)
      };
    }

    function registerPopoverButton(btn, pop){
      // ensure aria state
      btn.setAttribute('aria-expanded','false');

      const open = () => {
        if (typeof pop.onOpen === 'function') pop.onOpen();
        openPortaledPopover(btn, pop);
      };
      const close = () => closePortaledPopover(btn, pop);

      const onBtnClick = (e) => {
        e.stopPropagation();
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        isOpen ? close() : open();
      };
      btn.addEventListener('click', onBtnClick);

      // outside-click close
      const onDocClick = (e) => {
        const isOpen = btn.getAttribute('aria-expanded') === 'true';
        if (!isOpen) return;
        if (!pop.contains(e.target) && !btn.contains(e.target)) close();
      };
      document.addEventListener('click', onDocClick, { capture:true });

      pop.__btn = btn;
      pop.__close = close;
    }







    const labelsAxisBtn = createToggleButton({
      icon: 'bi-type',
      title: 'Toggle axis labels',
      pressed: true,
      onClick: (on) => handleHeaderAction(panelId, 'ticklabels', { on })
    });
    controlsWrapper.appendChild(labelsAxisBtn);

    const labelsDataBtn = createToggleButton({
      icon: 'bi-card-text',
      title: 'Toggle data labels'
    });
    controlsWrapper.appendChild(labelsDataBtn);

    const scaleBtn = document.createElement('button');
    scaleBtn.type = 'button';
    scaleBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
    scaleBtn.dataset.scaleMode = 'linear';
    scaleBtn.setAttribute('aria-pressed', 'false');
    scaleBtn.innerHTML = '<i class="bi bi-graph-up"></i>';
    scaleBtn.title = 'Scale: Linear';
    scaleBtn.addEventListener('click', () => {
      const nextMode = scaleBtn.dataset.scaleMode === 'linear' ? 'log' : 'linear';
      scaleBtn.dataset.scaleMode = nextMode;
      const isLog = nextMode === 'log';
      scaleBtn.classList.toggle('is-active', isLog);
      scaleBtn.setAttribute('aria-pressed', String(isLog));
      scaleBtn.innerHTML = isLog ? '<i class="bi bi-graph-down"></i>' : '<i class="bi bi-graph-up"></i>';
      scaleBtn.title = isLog ? 'Scale: Log' : 'Scale: Linear';
      handleHeaderAction(panelId, 'yscale-log', { on: isLog });
    });
    controlsWrapper.appendChild(scaleBtn);

    const legendBtn = createToggleButton({
      icon: 'bi-list-ul',
      title: 'Toggle legend',
      pressed: true,
      onClick: (on) => handleHeaderAction(panelId, 'legend', { on })
    });
    controlsWrapper.appendChild(legendBtn);

    const annotationsBtn = createToggleButton({
      icon: 'bi-chat-square-text',
      title: 'Toggle annotations'
    });
    controlsWrapper.appendChild(annotationsBtn);

    const smoothingBtn = createToggleButton({
      icon: 'bi-graph-up-arrow',
      title: 'Toggle smoothing presets',
      onClick: (on) => handleHeaderAction(panelId, 'smooth', { on })
    });
    controlsWrapper.appendChild(smoothingBtn);

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
    exportBtn.innerHTML = '<i class="bi bi-camera"></i>';
    exportBtn.title = 'Export image';
    exportBtn.addEventListener('click', () => handleHeaderAction(panelId, 'export', {}));
    controlsWrapper.appendChild(exportBtn);

    const overflowBtn = document.createElement('button');
    overflowBtn.type = 'button';
    overflowBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-overflow';
    overflowBtn.innerHTML = '<i class="bi bi-three-dots"></i>';
    overflowBtn.title = 'More tools';
    overflowBtn.setAttribute('aria-expanded', 'false');
    overflowBtn.hidden = true;

    let overflowOutsideActive = false;
    let handleOverflowOutside = () => {};
    const closeOverflowMenu = () => {
      if (controlsWrapper.classList.contains('is-expanded')) {
        controlsWrapper.classList.remove('is-expanded');
      }
      overflowBtn.classList.remove('is-active');
      overflowBtn.setAttribute('aria-expanded', 'false');
      if (overflowOutsideActive) {
        document.removeEventListener('click', handleOverflowOutside);
        overflowOutsideActive = false;
      }
    };
    registerPopoverCloser(closeOverflowMenu);
    controlsWrapper.__close = closeOverflowMenu;
    handleOverflowOutside = (event) => {
      if (controlsWrapper.contains(event.target) || overflowBtn.contains(event.target)) return;
      closeOverflowMenu();
    };

    overflowBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = !controlsWrapper.classList.contains('is-expanded');
      closeAllPopovers(willOpen ? closeOverflowMenu : null);
      if (willOpen) {
        controlsWrapper.classList.add('is-expanded');
        overflowBtn.classList.add('is-active');
        overflowBtn.setAttribute('aria-expanded', 'true');
        document.addEventListener('click', handleOverflowOutside);
        overflowOutsideActive = true;
      } else {
        closeOverflowMenu();
      }
    });

    const refreshActionOverflow = () => {
      const collapsed = controlsWrapper.classList.contains('is-collapsed');
      const expanded = controlsWrapper.classList.contains('is-expanded');
      if (expanded) {
        controlsWrapper.classList.remove('is-expanded');
      }
      let isOverflowing = false;
      if (!collapsed) {
        isOverflowing = controlsWrapper.scrollWidth - controlsWrapper.clientWidth > 1;
      }
      if (!isOverflowing) {
        closeOverflowMenu();
      } else if (expanded) {
        controlsWrapper.classList.add('is-expanded');
        overflowBtn.classList.add('is-active');
        overflowBtn.setAttribute('aria-expanded', 'true');
        if (!overflowOutsideActive) {
          document.addEventListener('click', handleOverflowOutside);
          overflowOutsideActive = true;
        }
      }
      overflowBtn.hidden = !isOverflowing;
      actions.classList.toggle('has-overflow', isOverflowing);
    };

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-outline-secondary';
    closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    closeBtn.title = 'Close graph';
    closeBtn.addEventListener('click', () => {
      closeAllPopovers();
      removePanel(baseState.id);
    });

    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-toggle';
    settingsBtn.innerHTML = '<i class="bi bi-gear-wide"></i>';
    settingsBtn.title = 'Hide graph tools';
    settingsBtn.setAttribute('aria-pressed', 'false');

    const updateSettingsToggle = (collapsed) => {
      settingsBtn.setAttribute('aria-pressed', String(collapsed));
      settingsBtn.innerHTML = collapsed ? '<i class="bi bi-gear-fill"></i>' : '<i class="bi bi-gear-wide"></i>';
      settingsBtn.title = collapsed ? 'Show graph tools' : 'Hide graph tools';
    };

    let toolsCollapsed = false;
    updateSettingsToggle(toolsCollapsed);
    settingsBtn.addEventListener('click', () => {
      toolsCollapsed = !toolsCollapsed;
      controlsWrapper.classList.toggle('is-collapsed', toolsCollapsed);
      controlsWrapper.setAttribute('aria-hidden', String(toolsCollapsed));
      updateSettingsToggle(toolsCollapsed);
      closeAllPopovers();
      refreshActionOverflow();
      updateToolbarMetrics();
    });

    actions.appendChild(controlsWrapper);
    actions.appendChild(overflowBtn);
    actions.appendChild(settingsBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);
    refreshActionOverflow();
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(refreshActionOverflow);
    } else {
      Promise.resolve().then(refreshActionOverflow);
    }

    const body = document.createElement('div');
    body.className = 'workspace-panel-body';

    const plotHost = document.createElement('div');
    plotHost.className = 'workspace-panel-plot';
    body.appendChild(plotHost);

    panelEl.appendChild(header);
    panelEl.appendChild(body);
    canvas.appendChild(panelEl);

    registerPanelDom(panelId, {
      rootEl: panelEl,
      headerEl: header,
      plotEl: plotHost,
      runtime
    });
    updatePanelRuntime(panelId, { refreshActionOverflow });
    panelEl.addEventListener('pointerdown', (evt) => {
      if (typeof evt.button === 'number' && evt.button !== 0) return;
      bringPanelToFront(panelId);
    });
    panelEl.addEventListener('focusin', () => bringPanelToFront(panelId));
    normalizePanelTraces(panelId);

    applyPanelGeometry(panelId, initialVisual, { persistNormalized: true });
    applyPanelZIndex(panelId);
    renderPlot(panelId);
    configureInteractivity(panelId);
    updateCanvasState();
    updateToolbarMetrics();
    renderGraphBrowser();
    setActivePanel(panelId);
    refreshPanelVisibility();

    if (!skipPersist) {
      persist();
    }

    updateHistoryButtons();
    return panelId;
  };

  const createTraceFromPayload = (payload = {}, file = null) => {
    const xValues = ensureArray(payload?.x).map(Number);
    const yValues = ensureArray(payload?.y).map(Number);
    const resolvedName = decodeName(payload?.name)
      || decodeName(payload?.filename)
      || (file ? decodeName(file.name) : '')
      || 'Trace';
    const baseLine = payload?.line || {};
    const colorValue = baseLine.color || pickColor();

    return {
      type: payload?.type || 'scatter',
      mode: payload?.mode || 'lines',
      name: resolvedName,
      x: xValues,
      y: yValues,
      line: {
        color: toHexColor(colorValue),
        width: Number.isFinite(baseLine.width) ? baseLine.width : 2,
        dash: baseLine.dash || 'solid'
      },
      opacity: Number.isFinite(payload?.opacity) ? payload.opacity : 1,
      visible: payload?.visible !== false,
      meta: payload?.meta || {},
      filename: decodeName(payload?.filename || payload?.name || (file ? file.name : ''))
    };
  };

  const ingestPayloadAsPanel = (payload, {
    width = 520,
    height = 320,
    skipHistory = false,
    skipPersist = false,
    sectionId = DEFAULT_SECTION_ID
  } = {}) => {
    const trace = createTraceFromPayload(payload);

    return registerPanel({
      type: 'plot',
      width,
      height,
      hidden: payload?.hidden === true,
      sectionId,
      figure: {
        data: [trace],
        layout: defaultLayout(payload)
      }
    }, { skipHistory, skipPersist });
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
      history.pop();
      updateHistoryButtons();
      showToast('No files were added to the graph.', 'warning');
      return;
    }

    normalizePanelTraces(panelId);
    renderPlot(panelId);
    renderGraphBrowser();
    persist();
    updateHistoryButtons();
    showToast(`Added ${added} file${added === 1 ? '' : 's'} to graph.`, 'success');
  };

  const requestGraphFileBrowse = (panelId) => {
    if (!fileInput || !getPanelRecord(panelId)) return;
    pendingGraphFileTarget = panelId;
    fileInput.value = '';
    fileInput.click();
  };

  const handleFilesPayload = async (files, { origin } = {}) => {
    if (!files.length) return;
    pushHistory();

    for (const file of files) {
      try {
        const payload = await uploadTraceFile(file, 'auto');
        ingestPayloadAsPanel({
          ...payload,
          name: decodeName(payload?.name) || decodeName(file?.name) || 'Trace',
          filename: decodeName(payload?.filename || file?.name || '')
        }, { skipHistory: true, skipPersist: true });
      } catch (err) {
        console.warn('Failed to ingest file', file?.name, err);
      }
    }

    persist();
    updateHistoryButtons();
    const message =
      origin === 'drop'
        ? 'Files added from drop.'
        : origin === 'demo'
          ? 'Demo files added to workspace.'
          : 'Files added to workspace.';
    showToast(message, 'success');
  };

  const handleImportedFiles = async (fileList, { origin } = {}) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    await handleFilesPayload(files, { origin });
  };

  const loadDemoGraphs = async () => {
    if (!demoBtn) return;
    demoBtn.disabled = true;
    demoBtn.classList.add('disabled');
    try {
      const files = await fetchDemoFiles(12);
      if (!files.length) {
        showToast('No demo files available right now.', 'warning');
        return;
      }
      await handleFilesPayload(files, { origin: 'demo' });
    } catch (err) {
      console.warn('Failed to load demo files', err);
      showToast('Unable to load demo files.', 'danger');
    } finally {
      demoBtn.disabled = false;
      demoBtn.classList.remove('disabled');
    }
  };

  const showToast = (message, variant = 'info', delay = 2400) => {
    if (typeof window?.showAppToast === 'function') {
      window.showAppToast({ message, variant, delay });
    }
  };

  const configureInteractivity = (panelId) => {
    if (!interact) return;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    const plotHost = dom?.plotEl;
    if (!rootEl) return;
    const runtime = ensurePanelRuntime(panelId);

    const beginInteraction = (mode) => {
      bringPanelToFront(panelId, { persistChange: false });
      if (!runtime?.dragSnapshot) {
        pushHistory();
      }
      const modelGeometry = getPanelGeometry(panelId);
      const sourceGeometry = modelGeometry
        || runtime?.visual
        || { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT };
      const baseGeometry = clampGeometryToCanvas(sourceGeometry);
      updatePanelRuntime(panelId, {
        dragSnapshot: {
          mode,
          initial: { ...baseGeometry },
          current: { ...baseGeometry }
        }
      });
      rootEl.classList.add('is-active');
      canvas.classList.add('is-active');
    };

    const finalizeInteraction = (mode) => {
      const snapshot = runtime?.dragSnapshot;
      const fallback = runtime?.visual
        || getPanelGeometry(panelId)
        || { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT };
      const base = snapshot?.current || snapshot?.initial || fallback;
      const normalized = clampGeometryToCanvas(base);

      if (mode === 'resize') {
        panelsModel.setPanelSize(panelId, {
          width: normalized.width,
          height: normalized.height
        });
        panelsModel.setPanelPosition(panelId, {
          x: normalized.x,
          y: normalized.y
        });
      } else {
        panelsModel.setPanelPosition(panelId, {
          x: normalized.x,
          y: normalized.y
        });
      }

      const latest = panelsModel.getPanel(panelId);
      applyPanelGeometry(panelId, latest || normalized);
      dom?.runtime?.refreshActionOverflow?.();
      if (plotHost && typeof Plotly?.Plots?.resize === 'function') {
        Plotly.Plots.resize(plotHost);
      }

      updatePanelRuntime(panelId, { dragSnapshot: null });
      rootEl.classList.remove('is-active');
      canvas.classList.remove('is-active');
      persist();
      updateHistoryButtons();
    };

    interact(rootEl)
      .draggable({
        inertia: false,
        allowFrom: '.workspace-panel-header',
        ignoreFrom: '.workspace-panel-body',
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: canvas,
            endOnly: false
          })
        ],
        listeners: {
          start: () => {
            beginInteraction('drag');
          },
          move: (event) => {
            if (!runtime?.dragSnapshot) return;
            const snapshot = runtime.dragSnapshot;
            const previous = snapshot.current || snapshot.initial;
            const next = clampGeometryToCanvas({
              ...previous,
              x: previous.x + coerceNumber(event.dx, 0),
              y: previous.y + coerceNumber(event.dy, 0)
            });
            snapshot.current = next;
            applyPanelGeometry(panelId, next);
            dom?.runtime?.refreshActionOverflow?.();
          },
          end: () => {
            finalizeInteraction('drag');
          }
        }
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        inertia: false,
        margin: 6,
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: canvas,
            endOnly: true
          }),
          interact.modifiers.restrictSize({
            min: { width: MIN_WIDTH, height: MIN_HEIGHT }
          })
        ],
        listeners: {
          start: () => {
            beginInteraction('resize');
          },
          move: (event) => {
            if (!runtime?.dragSnapshot) return;
            const snapshot = runtime.dragSnapshot;
            const previous = snapshot.current || snapshot.initial;
            const next = clampGeometryToCanvas({
              x: previous.x + coerceNumber(event.deltaRect?.left, 0),
              y: previous.y + coerceNumber(event.deltaRect?.top, 0),
              width: coerceNumber(event.rect?.width, previous.width),
              height: coerceNumber(event.rect?.height, previous.height)
            });
            snapshot.current = next;
            applyPanelGeometry(panelId, next);
            dom?.runtime?.refreshActionOverflow?.();
            if (plotHost && typeof Plotly?.Plots?.resize === 'function') {
              Plotly.Plots.resize(plotHost);
            }
          },
          end: () => {
            finalizeInteraction('resize');
          }
        }
      });
  };

  // --- UI event bindings ---

  panelDom.pin?.addEventListener('click', () => {
    setPanelPinned(!panelPinned);
  });

  panelDom.toggle?.addEventListener('click', () => {
    if (!panelDom.root) return;
    const nextCollapsed = !panelDom.root.classList.contains('collapsed');
    setPanelCollapsed(nextCollapsed);
  });

  panelDom.root?.addEventListener('mouseenter', handlePanelHoverEnter);
  panelDom.root?.addEventListener('mouseleave', handlePanelMouseLeave);
  browserHotspot?.addEventListener('pointerenter', handlePanelHoverEnter);
  browserHotspot?.addEventListener('pointerleave', handleHotspotLeave);
  browserHotspot?.addEventListener('click', () => {
    if (!panelDom.root) return;
    if (panelPinned && isPanelCollapsed()) {
      setPanelCollapsed(false);
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
      renderGraphBrowser();
    }
  });

  panelDom.searchInput?.addEventListener('input', (evt) => {
    searchTerm = evt.target.value || '';
    renderGraphBrowser();
  });

  panelDom.searchInput?.addEventListener('keydown', (evt) => {
    if (evt.key === 'Escape') {
      panelDom.searchInput.value = '';
      searchTerm = '';
      panelDom.searchInput.blur();
      panelDom.searchInput.style.display = 'none';
      renderGraphBrowser();
    }
  });

  panelDom.undo?.addEventListener('click', undo);
  panelDom.redo?.addEventListener('click', redo);

  if (panelDom.tree) {
    panelDom.tree.addEventListener('dragover', handleTreeDragOver);
    panelDom.tree.addEventListener('drop', handleTreeDrop);
    panelDom.tree.addEventListener('dragleave', (event) => {
      if (!panelDom.tree.contains(event.relatedTarget)) {
        setDropTarget(null);
      }
    });
    panelDom.tree.addEventListener('dragend', () => setDropTarget(null));
    panelDom.tree.addEventListener('click', (evt) => {
      const visibilityBtn = evt.target.closest('.section-visibility');
      if (visibilityBtn?.dataset?.sectionId) {
        toggleSectionVisibility(visibilityBtn.dataset.sectionId);
        return;
      }
      const addGraphBtn = evt.target.closest('.section-add-graph');
      if (addGraphBtn?.dataset?.sectionId) {
        addGraphToSection(addGraphBtn.dataset.sectionId);
        return;
      }
      const addSubBtn = evt.target.closest('.section-add-sub');
      if (addSubBtn?.dataset?.sectionId) {
        pushHistory();
        const section = createSection(null, { parentId: addSubBtn.dataset.sectionId });
        queueSectionRename(section.id);
        renderGraphBrowser();
        persist();
        updateHistoryButtons();
        return;
      }
      const graphVisibilityBtn = evt.target.closest('.graph-visibility');
      if (graphVisibilityBtn?.dataset?.panelId) {
        toggleGraphVisibility(graphVisibilityBtn.dataset.panelId);
        return;
      }
      const graphBrowseBtn = evt.target.closest('.graph-browse');
      if (graphBrowseBtn?.dataset?.panelId) {
        requestGraphFileBrowse(graphBrowseBtn.dataset.panelId);
        return;
      }
      const graphDeleteBtn = evt.target.closest('.graph-delete');
      if (graphDeleteBtn?.dataset?.panelId) {
        deleteGraphInteractive(graphDeleteBtn.dataset.panelId);
        return;
      }
      const graphHeader = evt.target.closest('.graph-header');
      if (graphHeader?.dataset?.panelId && !evt.target.closest('button')) {
        focusPanelById(graphHeader.dataset.panelId, { scrollBrowser: false });
        return;
      }
      const sectionHeader = evt.target.closest('.section-header');
      if (sectionHeader?.dataset?.sectionId && !evt.target.closest('button')) {
        focusSectionById(sectionHeader.dataset.sectionId, { scrollBrowser: false });
        return;
      }
      const deleteBtn = evt.target.closest('.section-delete');
      if (deleteBtn?.dataset?.sectionId) {
        deleteSectionInteractive(deleteBtn.dataset.sectionId);
      }
    });
    panelDom.tree.addEventListener('focusin', () => {
      if (!panelPinned) {
        panelDom.root?.classList.add('peeking');
        panelDom.root?.classList.add('is-active');
      }
    });
    panelDom.tree.addEventListener('focusout', (evt) => {
      if (!panelPinned && panelDom.root && !panelDom.root.contains(evt.relatedTarget)) {
        panelDom.root.classList.remove('is-active');
        panelDom.root.classList.remove('peeking');
      }
    });
    panelDom.tree.addEventListener('dblclick', (evt) => {
      const nameEl = evt.target.closest('.section-name');
      if (!nameEl?.dataset?.sectionId) return;
      startSectionRename(nameEl.dataset.sectionId, nameEl, { selectAll: true });
    });
  }

  if (panelDom.newSection) {
    panelDom.newSection.disabled = false;
    panelDom.newSection.addEventListener('click', () => {
      pushHistory();
      const section = createSection();
      queueSectionRename(section.id);
      renderGraphBrowser();
      persist();
      updateHistoryButtons();
    });
  }

  addPlotBtn?.addEventListener('click', () => {
    ingestPayloadAsPanel({
      name: `Sample ${getNextPanelSequence()}`
    });
    showToast('Sample graph added to workspace.', 'success');
    updateHistoryButtons();
  });

  resetBtn?.addEventListener('click', () => {
    if (!panelDomRegistry.size) return;
    pushHistory();
    clearPanels();
    colorCursor = 0;
    persist();
    updateCanvasState();
    renderGraphBrowser();
    showToast('Workspace canvas cleared.', 'warning');
    updateHistoryButtons();
  });

  browseBtn?.addEventListener('click', () => {
    pendingGraphFileTarget = null;
    fileInput?.click();
  });

  fileInput?.addEventListener('change', async () => {
    const targetGraphId = pendingGraphFileTarget;
    const files = fileInput.files;
    pendingGraphFileTarget = null;
    if (targetGraphId) {
      await appendFilesToGraph(targetGraphId, files);
    } else {
      await handleImportedFiles(files, { origin: 'browse' });
    }
    if (fileInput) fileInput.value = '';
  });

  demoBtn?.addEventListener('click', () => {
    loadDemoGraphs();
  });

  if (canvas) {
    const deactivate = () => canvas.classList.remove('is-active');
    const onDrag = (event) => {
      event.preventDefault();
      canvas.classList.add('is-active');
    };
    const onDrop = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      deactivate();
      const files = event.dataTransfer?.files;
      if (files?.length) {
        await handleImportedFiles(files, { origin: 'drop' });
      }
    };
    ['dragover', 'dragenter'].forEach((evt) => canvas.addEventListener(evt, onDrag));
    ['dragleave', 'dragend'].forEach((evt) => canvas.addEventListener(evt, deactivate));
    canvas.addEventListener('drop', onDrop);
    if (emptyOverlay) {
      ['dragover', 'dragenter'].forEach((evt) => emptyOverlay.addEventListener(evt, onDrag));
      ['dragleave', 'dragend'].forEach((evt) => emptyOverlay.addEventListener(evt, deactivate));
      emptyOverlay.addEventListener('drop', onDrop);
    }
  }

  const saved = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  })();

  if (saved) {
    restoreSnapshot(saved, { skipHistory: true });
  } else {
    updateCanvasState();
    renderGraphBrowser();
  }

  updateHistoryButtons();
  updateToolbarMetrics();

  window.addEventListener('resize', () => {
    panelDomRegistry.forEach((dom, panelId) => {
      applyPanelGeometry(panelId);
      if (dom?.plotEl && typeof Plotly?.Plots?.resize === 'function') {
        Plotly.Plots.resize(dom.plotEl);
      }
      dom?.runtime?.refreshActionOverflow?.();
    });
    updateToolbarMetrics();
    requestLayoutSync();
  });

  window.addEventListener('scroll', requestLayoutSync, { passive: true });

  if (workspacePane) {
    new MutationObserver(requestLayoutSync).observe(workspacePane, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  requestLayoutSync();
}



