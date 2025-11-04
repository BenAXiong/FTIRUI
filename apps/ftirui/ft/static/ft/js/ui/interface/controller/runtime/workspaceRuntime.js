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

import * as Render from '../../../../workspace/canvas/plotting/render.js';
import * as Actions from '../../../../workspace/canvas/plotting/actionsController.js';
import { createBrowserFacade } from './browser/facade.js';
import { createPersistenceFacade } from './persistence/facade.js';
import { createPanelsFacade } from './panels/facade.js';
import { createPanelDomFacade } from './panels/panelDomFacade.js';
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
const HISTORY_GEOMETRY_TOLERANCE = 6;
const PANEL_COLLAPSE_KEY = 'ftir.workspace.panelCollapsed.v1';
const PANEL_PIN_KEY = 'ftir.workspace.panelPinned.v1';
const FALLBACK_COLOR = COLOR_PALETTE[0] || '#1f77b4';

const DEFAULT_SECTION_ID = 'section_all';
const TRACE_DRAG_MIME = 'application/x-ftir-workspace-trace';
let colorCursor = 0;

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
  const color = COLOR_PALETTE[colorCursor % COLOR_PALETTE.length];
  colorCursor += 1;
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
let ingestPayloadAsPanel = () => null;
let appendFilesToGraph = async () => {};
let moveTrace = () => false;
let moveGraph = () => false;
let removePanel = () => {};

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


export function initWorkspaceRuntime(context = {}) {
  colorCursor = 0;
  sectionManager.reset();
  chipPanelsInstance = null;
  dragState = null;
  currentDropTarget = null;
  pendingRenameSectionId = null;
  activePanelId = null;
  browserFacade?.teardown?.();
  browserFacade = null;
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

  function getPlotContainerEl(panelId) {
    const refs = getPanelDom(panelId);
    return refs?.plotEl;
  }

  function getFigureById(panelId) {
    return getPanelFigure(panelId);
  }

  function setFigureById(panelId, nextFigure) {
    panelsModel.updatePanelFigure(panelId, nextFigure);
  }

  // Plot facade: single entry point into the renderer.
  const Plot = {
    renderNow(panelId) {
      const el = getPlotContainerEl(panelId);
      if (!el) return;
      const fig = getFigureById(panelId);
      if (!Render.isRendered(el)) {
        return Render.renderInitial(panelId, el, fig);
      }
      return Render.renderUpdate(panelId, el, fig);
    },

    scheduleRender(panelId) {
      // If you already had throttling logic, call it here.
      // Default: just render immediately.
      return this.renderNow(panelId);
    },

    applyLayoutPatch(panelId, patch) {
      // Route generic patches through the actions controller
      Actions.applyLayout(panelId, patch);
    },

    exportFigure(panelId, opts) {
      const el = getPlotContainerEl(panelId);
      return Render.exportFigure(panelId, el, opts);
    },

    resize(panelId) {
      const el = getPlotContainerEl(panelId);
      return Render.resize(panelId, el);
    }
  };

  // This gives actionsController.js access to the model read/write
  // and render trigger, without importing your models directly.
  Actions.__wire({
    getFigureById,
    setFigureById,
    renderNow: (panelId) => Plot.renderNow(panelId)
  });

  const getPanelSnapshot = (panelId) => (panelId ? panelsModel.getPanel(panelId) : null);
  const getPanelRecord = getPanelSnapshot;

  const getPanelsOrdered = () => panelsModel.getPanelsInIndexOrder();

  const getPanelFigure = (panelId) => panelsModel.getPanelFigure(panelId) || { data: [], layout: {} };

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

let searchTerm = '';
const getSearchTerm = () => searchTerm;

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
    chipPanelsBridge.onPanelSelected(activePanelId);
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
    if (persist) {
      preferencesFacade?.setCollapsed(collapsed);
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
      preferencesFacade?.clearCollapsed();
    } else {
      panelDom.root?.classList.remove('peeking');
    }
    updatePanelPinUI();
    updateCanvasOffset();
    updatePanelToggleUI(!panelDom.root?.classList.contains('collapsed'));
    if (persist) {
      preferencesFacade?.setPinned(panelPinned);
    }
  };

  const restorePanelCollapsed = () => {
    const collapsed = preferencesFacade?.readCollapsed?.() ?? false;
    setPanelCollapsed(collapsed, { persist: false });
  };

  const restorePanelPinned = () => {
    panelPinned = preferencesFacade?.readPinned?.(panelPinned) ?? panelPinned;
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


  const hasOwn = Object.prototype.hasOwnProperty;
  const isPrimaryAxis = (axisKey) => axisKey === 'xaxis' || axisKey === 'yaxis';

  const getAxisState = (panelId, figure, axisKey) => {
    const layout = figure?.layout;
    const fromModel = layout && typeof layout === 'object' && typeof layout[axisKey] === 'object'
      ? layout[axisKey]
      : null;
    if (fromModel) return fromModel;
    const runtime = getPanelDom(panelId)?.plotEl?.layout?.[axisKey];
    return typeof runtime === 'object' ? runtime : null;
  };

  const axisExists = (panelId, figure, axisKey) => {
    if (isPrimaryAxis(axisKey)) return true;
    return !!getAxisState(panelId, figure, axisKey);
  };

  const forEachAxis = (panelId, figure, axes, cb) => {
    axes.forEach((axis) => {
      if (!axisExists(panelId, figure, axis)) return;
      const axisState = getAxisState(panelId, figure, axis) || {};
      cb(axis, axisState);
    });
  };

  const preserveAxisDecorations = (panelId, figure, axisKey, patch) => {
    const axisState = getAxisState(panelId, figure, axisKey);
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

    const runLayoutMutations = (...mutations) => {
      const tasks = mutations.filter((fn) => typeof fn === 'function');
      if (!tasks.length) return false;
      pushHistory();
      tasks.forEach((fn) => fn());
      persist();
      updateHistoryButtons();
      return true;
    };

    const commitLayoutPatch = (patch) => {
      if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) {
        return false;
      }
      return runLayoutMutations(() => Actions.applyLayout(panelId, patch));
    };

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
              'xaxis.showspikes': false,
              'yaxis.showspikes': false
            };

        runLayoutMutations(
          () => Actions.setHoverMode(panelId, on ? 'x' : 'closest'),
          () => Actions.applyLayout(panelId, patch)
        );
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

        // Only touch linewidth/gridwidth/linecolor using dotted keys ╬ô├ç├╢ do NOT send xaxis:{...}
        commitLayoutPatch({
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

        commitLayoutPatch({
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

        commitLayoutPatch(patch);
        break;
      }

      case 'legend': {
        runLayoutMutations(() => Actions.toggleLegend(panelId));
        break;
      }

      case 'yscale-log': {
        runLayoutMutations(() => Actions.setAxisType(panelId, 'yaxis', 'log'));
        break;
      }

      case 'yscale-linear': {
        runLayoutMutations(() => Actions.setAxisType(panelId, 'yaxis', 'linear'));
        break;
      }

      case 'xscale-log': {
        runLayoutMutations(() => Actions.setAxisType(panelId, 'xaxis', 'log'));
        break;
      }

      case 'xscale-linear': {
        runLayoutMutations(() => Actions.setAxisType(panelId, 'xaxis', 'linear'));
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
          commitLayoutPatch(patch);
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
          commitLayoutPatch(patch);
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
          commitLayoutPatch(patch);
        }
        break;
      }

      case 'ticklabels': {
        const on = !!payload.on;
        commitLayoutPatch({ 'xaxis.showticklabels': on, 'yaxis.showticklabels': on });
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

        preserveAxisDecorations(panelId, figure, 'xaxis', patch);
        preserveAxisDecorations(panelId, figure, 'yaxis', patch);
        if (hasX2) preserveAxisDecorations(panelId, figure, 'xaxis2', patch);
        if (hasY2) preserveAxisDecorations(panelId, figure, 'yaxis2', patch);

        commitLayoutPatch(patch);
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
        commitLayoutPatch(patch);
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
        commitLayoutPatch(patch);
        break;
      }

      case 'ticks-major-dtick': {
        // null ╬ô├Ñ├å auto; number ╬ô├Ñ├å fixed spacing
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
        commitLayoutPatch(patch);
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
        commitLayoutPatch(patch);
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
        preserveAxisDecorations(panelId, figure, 'xaxis', patch);
        preserveAxisDecorations(panelId, figure, 'yaxis', patch);
        if (hasX2) preserveAxisDecorations(panelId, figure, 'xaxis2', patch);
        if (hasY2) preserveAxisDecorations(panelId, figure, 'yaxis2', patch);

        commitLayoutPatch(patch);
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

        commitLayoutPatch(patch);
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
        Plot.exportFigure(panelId, { format: 'png', scale: 2 }).then((url) => {
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plot.png';
          a.click();
        });
        break;
      }

      default: {
        // Safe dev-time notice for unhandled actions
        console.warn('Unhandled header action:', act, payload);
        break;
      }
    }

    if (simpleIntent) {
      persist();
      updateHistoryButtons();
    }
  }

  const panelDomFacade = createPanelDomFacade({
    canvas,
    registerPanelDom,
    updatePanelRuntime,
    actions: {
      handleHeaderAction,
      removePanel: (panelId) => removePanel(panelId),
      bringPanelToFront,
      updateToolbarMetrics
    },
    selectors: {
      getPanelFigure
    }
  });

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
    sections: sectionsModel.snapshot(),
    panels: typeof panelsModel.snapshot === 'function'
      ? panelsModel.snapshot()
      : { counter: 0, items: [] },
    uiPrefs: {
      colorCursor
    }
  });

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

  const clearPanels = () => {
    Array.from(panelDomRegistry.entries()).forEach(([panelId, dom]) => {
      dom?.rootEl?.remove();
      detachPanelDom(panelId);
    });
    panelsModel.load({ counter: 0, items: [] });
    setActivePanel(null);
  };

  const restoreSnapshot = (snapshot, { skipHistory = false } = {}) => {
    clearPanels();
    const basePrefs = snapshot?.uiPrefs && typeof snapshot.uiPrefs === 'object'
      ? { ...snapshot.uiPrefs }
      : {};
    if (Object.prototype.hasOwnProperty.call(snapshot || {}, 'colorCursor') && !('colorCursor' in basePrefs)) {
      basePrefs.colorCursor = snapshot.colorCursor;
    }
    colorCursor = Number(basePrefs.colorCursor) || 0;
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
    renderBrowser();
    persist();

    if (!skipHistory) {
      updateHistoryButtons();
    }
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
      buildSnapshot: snapshotState,
      restoreSnapshot,
      closeMenu: closeWorkspaceMenu
    },
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
      clearSnapshot: clearWorkspaceSnapshot
    } = persistence);
    persistence.attachEvents();
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
    panelsModel.setHidden(panelId, nextHidden);
    persist();
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
      const labelIndex = record?.index || 0;
      const label = labelIndex ? `Graph ${labelIndex}` : 'Graph';
      showToast(`${label} added to group.`, 'success');
    }
  };

  const renderBrowser = () => {
    if (!browserFacade) return;
    browserFacade.render();
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
    renderBrowser();
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

    panelDomFacade.mountPanel({
      panelId,
      panelState: baseState,
      runtime
    });

    normalizePanelTraces(panelId);

    applyPanelGeometry(panelId, initialVisual, { persistNormalized: true });
    applyPanelZIndex(panelId);
    renderPlot(panelId);
    configureInteractivity(panelId);
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
    getNextPanelSequence
  });

  const panelsFacade = createPanelsFacade({
    models: { panelsModel },
    plot: { renderNow: (panelId) => Plot.renderNow(panelId) },
    history: { history, pushHistory, updateHistoryButtons },
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
        colorCursor = 0;
      }
    },
    utils: { decodeName }
  });
  ioFacade.attach();

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
      if (plotHost) {
        Plot.resize(panelId);;
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
            if (plotHost) {
              Plot.resize(panelId);;
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
      isPanelPinned: () => panelPinned
    }
  });

  if (panelDom.tree) {
    browserFacade.attachEvents();
    browserFacade.attachDragDrop();
  }

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






