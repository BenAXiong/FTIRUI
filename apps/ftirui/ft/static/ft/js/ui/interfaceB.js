import { newId, nextColor } from '../core/state.js';
import { render } from '../core/plot.js';
import { uploadTraceFile } from '../services/uploads.js';
import {
  ensureHistoryStacks,
  recordHistory,
  updateHistoryButtons,
  bindHistoryControls
} from './interface/history.js';
import { bindSessionUI, signalAutosaveActivity } from './interface/sessions.js';
import {
  normalizeGlobalInputState,
  isInputAuto,
  uploadInputUnits,
  applyResolvedInputMode,
  syncInputControls
} from './interface/inputMode.js';
import { bindDropzone } from './interface/dropzone.js';
import { bindPanel, restorePanelCollapsed, updatePanelEmptyState } from './interface/panel.js';
import { renderFolderTree, bindFolderTree } from './interface/folderTree.js';
import { bindGlobalControls } from './interface/controls.js';
import { preloadDemoFiles, hideDemoButton, syncDemoButton } from './interface/demos.js';
import { getDisplayConfig } from './config/display.js';
import { normalizeTraceMeta } from './utils/traceMeta.js';
import { ensureFolderStructure, resolveFolderId, addTraceToFolder } from './interface/state.js';

function refreshFolderTree(instance) {
  const hasTraces = renderFolderTree(instance);
  updatePanelEmptyState(instance);
  return hasTraces;
}

function updateWorkspaceCard(instance, updates = {}) {
  if (!instance) return;
  instance.workspaceState = { ...(instance.workspaceState || {}), ...updates };
  const state = instance.workspaceState;
  const ws = instance.dom.workspace || {};
  if (!ws.card) return;

  const status = state.status || null;
  const hasAuth = !!(status && status.authenticated);
  const blocked =
    typeof state.sessionAuthBlocked === 'boolean' ? state.sessionAuthBlocked : !hasAuth;
  const cloudCountRaw =
    typeof state.cloudCount === 'number'
      ? state.cloudCount
      : typeof status?.session_count === 'number'
        ? status.session_count
        : null;
  const cloudCount = Number.isFinite(cloudCountRaw) ? cloudCountRaw : 0;

  if (ws.badge) {
    ws.badge.textContent = hasAuth ? 'Signed in' : 'Guest';
    ws.badge.className = hasAuth ? 'badge text-bg-success' : 'badge text-bg-secondary';
  }
  if (ws.name) {
    ws.name.textContent = hasAuth ? status.username || 'Account' : 'Guest';
  }
  if (ws.desc) {
    if (hasAuth) {
      const parts = [`Cloud sessions: ${cloudCount}`];
      if (status.email) parts.push(status.email);
      ws.desc.textContent = parts.join(' • ');
    } else {
      ws.desc.textContent = 'Sign in to sync sessions across devices.';
    }
  }
  if (ws.count) {
    ws.count.textContent = hasAuth ? cloudCount : '—';
  }
  if (ws.openCloud) {
    ws.openCloud.disabled = blocked;
    ws.openCloud.classList.toggle('btn-outline-secondary', !blocked);
    ws.openCloud.classList.toggle('btn-outline-primary', blocked);
    ws.openCloud.setAttribute('title', blocked ? 'Sign in to manage cloud sessions' : 'Open cloud sessions');
  }
  if (ws.card) {
    ws.card.classList.toggle('requires-auth', blocked);
  }
}

export function initUI_IntB(instance) {
  instance.dom = instance.dom || {};
  const dom = instance.dom;

  dom.plot = document.getElementById('b_plot_el');
  dom.dz = document.getElementById('b_dropzone');
  dom.inp = document.getElementById('b_file_input');
  dom.demoBtn = document.getElementById('b_demo_btn');
  dom.browseBtn = document.getElementById('b_browse_btn');
  dom.unitAuto = document.getElementById('b_units_auto');
  dom.unitAbs = document.getElementById('b_units_abs');
  dom.unitTr = document.getElementById('b_units_tr');
  dom.unitAutoLabel = document.querySelector('label[for="b_units_auto"]');
  dom.unitAbsLabel = document.querySelector('label[for="b_units_abs"]');
  dom.unitTrLabel = document.querySelector('label[for="b_units_tr"]');

  dom.panel = {
    root: document.getElementById('b_panel'),
    toggle: document.getElementById('b_panel_toggle'),
    dropzone: document.getElementById('b_panel_dropzone'),
    empty: document.querySelector('#b_panel_dropzone .panel-empty'),
    tree: document.getElementById('b_folder_tree'),
    newFolder: document.getElementById('b_new_folder'),
    undo: document.getElementById('b_history_undo'),
    redo: document.getElementById('b_history_redo'),
    search: document.getElementById('b_panel_search'),
    searchInput: document.getElementById('b_panel_search_input'),
    sort: document.getElementById('b_panel_sort')
  };

  dom.workspace = {
    card: document.getElementById('workspace_summary'),
    badge: document.getElementById('workspace_status_badge'),
    name: document.getElementById('workspace_user_name'),
    desc: document.getElementById('workspace_user_desc'),
    count: document.getElementById('workspace_session_count'),
    openCloud: document.getElementById('workspace_btn_open_cloud'),
    saveLocal: document.getElementById('workspace_btn_save_local')
  };

  dom.workspace?.openCloud?.addEventListener('click', () => {
    if (dom.workspace.openCloud.disabled) return;
    document.getElementById('b_load')?.click();
  });
  dom.workspace?.saveLocal?.addEventListener('click', () => {
    document.getElementById('b_session_export')?.click();
  });

  instance.demoFilesCache = Array.isArray(instance.demoFilesCache) ? instance.demoFilesCache : null;

  normalizeGlobalInputState(instance.state);
  ensureFolderStructure(instance.state);
  ensureHistoryStacks(instance.state);
  restorePanelCollapsed(dom.panel);

  bindPanel(instance, {
    renderTree: () => refreshFolderTree(instance),
    onFiles: (files) => handleFiles(instance, files),
    recordHistory: () => recordHistory(instance),
    updateHistoryButtons: () => updateHistoryButtons(instance)
  });

  bindDropzone(instance, {
    onFiles: (files) => handleFiles(instance, files)
  });

  bindFolderTree(instance, {
    renderTree: () => refreshFolderTree(instance),
    renderPlot: () => render(instance),
    recordHistory: () => recordHistory(instance),
    updateHistoryButtons: () => updateHistoryButtons(instance),
    syncDemoButton: () => syncDemoButton(instance),
    handleFiles: (files, options) => handleFiles(instance, files, options)
  });

  bindGlobalControls(instance, {
    renderPlot: () => render(instance),
    applyDisplayUnits: () => applyDisplayUnits(instance)
  });

  bindHistoryControls(instance, {
    renderFolderTree: (inst) => refreshFolderTree(inst),
    renderPlot: (inst) => render(inst),
    syncDemoButton: (inst) => syncDemoButton(inst),
    ensureFolderStructure
  });

  bindSessionUI(instance, {
    ensureFolderStructure,
    normalizeGlobalInputState,
    getDisplayConfig,
    renderFolderTree: (inst) => refreshFolderTree(inst),
    syncInputControls,
    applyDisplayUnits: (inst) => applyDisplayUnits(inst),
    renderPlot: (inst) => render(inst),
    updateHistoryButtons: (inst) => updateHistoryButtons(inst),
    syncDemoButton: (inst) => syncDemoButton(inst),
    updateWorkspaceSummary: (payload) => updateWorkspaceCard(instance, payload)
  });

  refreshFolderTree(instance);
  updateHistoryButtons(instance);
  syncDemoButton(instance);

  preloadDemoFiles(instance, { limit: 12 }).catch(() => {});

  updateWorkspaceCard(instance, { sessionAuthBlocked: true });
  document.addEventListener('ftir:user-status', (evt) => {
    updateWorkspaceCard(instance, { status: evt.detail?.data || null });
  });
  if (typeof window.refreshUserStatus === 'function') {
    window.refreshUserStatus().then((data) => {
      if (data) updateWorkspaceCard(instance, { status: data });
    });
  }
}
async function handleFiles(instance, filesLike, { folderId } = {}) {
  const files = Array.from(filesLike || []).filter(Boolean);
  if (!files.length) return;

  recordHistory(instance);
  hideDemoButton(instance);

  ensureFolderStructure(instance.state);
  const targetFolder = resolveFolderId(instance.state, folderId);

  const startIdx = instance.state.order.length;
  let colorIdx = startIdx;

  for (const file of files) {
    try {
      await createTraceFromFile(instance, file, colorIdx++, { folderId: targetFolder });
    } catch (err) {
      console.warn('Failed to import', file?.name || file, err);
    }
  }

  applyDisplayUnits(instance);
  refreshFolderTree(instance);
  render(instance);
  updateHistoryButtons(instance);
  syncDemoButton(instance);
}

async function createTraceFromFile(instance, file, colorIndex, { folderId } = {}) {
  ensureFolderStructure(instance.state);

  const uploadMode = uploadInputUnits(instance.state);
  const payload = await uploadTraceFile(file, uploadMode);
  const { x, y, name, meta, ingest_mode: ingestModeRaw } = payload;
  const resolvedMode = ingestModeRaw === 'abs' ? 'abs' : 'tr';
  if (isInputAuto(instance.state)) {
    applyResolvedInputMode(instance.state, resolvedMode);
  }
  syncInputControls(instance);
  const metaInfo = normalizeTraceMeta(meta);
  const xValues = Array.isArray(x) ? x.map(Number) : [];
  const baseY = Array.isArray(y) ? y.map(Number) : [];

  const traceId = newId();
  const folder = resolveFolderId(instance.state, folderId);
  const traceColor = nextColor(colorIndex);

    instance.state.traces[traceId] = {
      id: traceId,
      folderId: folder,
      name: name || file.name,
      filename: file.name,
      size: file.size,
      color: traceColor,
      visible: true,
      opacity: 1,
      dash: 'solid',
      ingestMode: resolvedMode,
      data: { x: xValues, y: baseY.slice() },
      source: { y: baseY },
      meta: metaInfo
    };
  instance.state.order.push(traceId);
  addTraceToFolder(instance.state, traceId, folder);
  signalAutosaveActivity(instance);
}

function applyDisplayUnits(instance) {
  if (!instance || !instance.state) return;
  const { state } = instance;
  const desired = state.global.units || state.global.inputMode || 'tr';
  const config = getDisplayConfig(desired);
  state.global.units = config.key;
  Object.values(state.traces || {}).forEach((trace) => {
    if (!trace) return;
    if (!trace.source || !Array.isArray(trace.source.y)) {
      const fallback = Array.isArray(trace.data?.y) ? trace.data.y.slice() : [];
      trace.source = { ...(trace.source || {}), y: fallback };
    }
    const base = Array.isArray(trace.source?.y) ? trace.source.y : [];
    trace.data.y = config.apply(base);
    if (trace.meta && typeof trace.meta === 'object') {
      trace.meta.DISPLAY_UNITS = config.metaValue;
    }
  });
}

