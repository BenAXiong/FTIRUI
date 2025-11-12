import { rootFolderId } from '../../core/state.js';
import {
  saveSessionRequest,
  listSessionsRequest,
  getSessionRequest,
  deleteSessionRequest
} from '../../services/sessions.js';
import { fetchCanvasState, saveCanvasState } from '../../services/dashboard.js';
import { escapeHtml } from '../utils/dom.js';
import { initCanvasSnapshots } from './canvasSnapshots.js';

const SESSION_SCHEMA_VERSION = 2;

const AUTOSAVE_DB_NAME = 'sciben';
const AUTOSAVE_DB_VERSION = 1;
const AUTOSAVE_STORE = 'autosave';
const AUTOSAVE_KEY = 'plot-session-v2';
const AUTOSAVE_INTERVAL_MS = 8000;
const AUTOSAVE_IDLE_THRESHOLD_MS = AUTOSAVE_INTERVAL_MS;
const CANVAS_QUERY_PARAM = 'canvas';

function formatBytes(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / Math.pow(1024, index);
  const precision = index === 0 || scaled >= 10 ? 0 : 1;
  return `${scaled.toFixed(precision)} ${units[index]}`;
}

function formatTimestamp(isoString) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleString();
}

function describeSession(item) {
  const parts = [];
  if (Number.isFinite(Number(item?.size))) {
    parts.push(formatBytes(item.size));
  }
  if (item?.updated) {
    parts.push(formatTimestamp(item.updated));
  }
  if (item?.storage && item.storage !== 'db') {
    parts.push(String(item.storage).toUpperCase());
  }
  return parts.join(' • ') || 'Stored in database';
}

function cloneNumericArray(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }
  return arr.map((value) => (Number.isFinite(Number(value)) ? Number(value) : value));
}

function safeSlug(text, fallback = 'session') {
  const slug = String(text || '')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function buildSessionState(instance) {
  const { state } = instance;
  const traces = {};

  state.order.forEach((id) => {
    const trace = state.traces[id];
    if (!trace) return;
    const clonedSource = trace.source && typeof trace.source === 'object' ? { ...trace.source } : {};
    if (Array.isArray(clonedSource.x)) {
      clonedSource.x = cloneNumericArray(clonedSource.x);
    } else {
      delete clonedSource.x;
    }
    clonedSource.y = cloneNumericArray(trace.source?.y || trace.data?.y);

    const clone = {
      ...trace,
      data: {
        x: cloneNumericArray(trace.data?.x),
        y: cloneNumericArray(trace.data?.y)
      },
      source: clonedSource,
      meta: trace.meta && typeof trace.meta === 'object' ? { ...trace.meta } : trace.meta
    };
    traces[id] = clone;
  });

  const folders = {};
  Object.entries(state.folders).forEach(([id, folder]) => {
    if (!folder) return;
    folders[id] = {
      id: folder.id,
      name: folder.name,
      parent: folder.parent,
      folders: (folder.folders || []).slice(),
      traces: (folder.traces || []).filter((traceId) => !!traces[traceId]),
      collapsed: !!folder.collapsed
    };
  });

  return {
    version: SESSION_SCHEMA_VERSION,
    global: state.global,
    order: state.order.filter((id) => traces[id]),
    traces,
    folders,
    folderOrder: Array.isArray(state.folderOrder) ? state.folderOrder.slice() : [rootFolderId()],
    ui: { activeFolder: state.ui.activeFolder }
  };
}

function supportsIndexedDB() {
  try {
    return typeof window !== 'undefined' && !!window.indexedDB;
  } catch {
    return false;
  }
}

function getActiveCanvasId() {
  if (typeof window === 'undefined') return null;
  if (window.__ACTIVE_CANVAS_ID) return window.__ACTIVE_CANVAS_ID;
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get(CANVAS_QUERY_PARAM);
    if (id) {
      window.__ACTIVE_CANVAS_ID = id;
      return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function openAutosaveDB() {
  return new Promise((resolve, reject) => {
    if (!supportsIndexedDB()) {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }
    let didResolve = false;
    const request = window.indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
    request.onerror = () => {
      if (!didResolve) reject(request.error || new Error('Failed to open autosave database'));
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUTOSAVE_STORE)) {
        db.createObjectStore(AUTOSAVE_STORE);
      }
    };
    request.onsuccess = () => {
      didResolve = true;
      const db = request.result;
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
  });
}

function withStore(db, mode, fn) {
  return new Promise((resolve, reject) => {
    let transaction;
    try {
      transaction = db.transaction(AUTOSAVE_STORE, mode);
    } catch (err) {
      reject(err);
      return;
    }
    const store = transaction.objectStore(AUTOSAVE_STORE);
    let request;
    try {
      request = fn(store);
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error || new Error('Autosave transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('Autosave transaction aborted'));
  });
}

async function readAutosaveEntry(db) {
  return withStore(db, 'readonly', (store) => store.get(AUTOSAVE_KEY));
}

async function writeAutosaveEntry(db, value) {
  return withStore(db, 'readwrite', (store) => store.put(value, AUTOSAVE_KEY));
}

async function deleteAutosaveEntry(db) {
  return withStore(db, 'readwrite', (store) => store.delete(AUTOSAVE_KEY));
}

function getAutosaveContext(instance) {
  return instance && instance.__autosaveCtx;
}

export function signalAutosaveActivity(instance) {
  const ctx = getAutosaveContext(instance);
  if (!ctx) return;
  ctx.lastChange = Date.now();
}

function ensureAutosaveContext(instance, uiRefs = {}, options = {}) {
  if (!instance) return null;
  const isNew = !instance.__autosaveCtx;
  if (isNew) {
    instance.__autosaveCtx = {
      instance,
      db: null,
      lastSerialized: '',
      timerId: null,
      saving: false,
      lastWrite: 0,
      cancelled: false,
      lastChange: 0,
      uiHideTimer: null,
      ui: {
        container: null,
        icon: null,
        text: null
      },
      canvasId: null,
      remoteSave: null
    };
  }
  const ctx = instance.__autosaveCtx;
  if (!ctx.ui) {
    ctx.ui = { container: null, icon: null, text: null };
  }
  if (uiRefs && typeof uiRefs === 'object') {
    ctx.ui = {
      container: uiRefs.container || ctx.ui.container || null,
      icon: uiRefs.icon || ctx.ui.icon || null,
      text: uiRefs.text || ctx.ui.text || null
    };
  }
  if (isNew && ctx.ui.container) {
    ctx.ui.container.classList.remove('is-visible', 'is-saving', 'is-error');
  }
  if (options && typeof options === 'object') {
    if (options.canvasId) {
      ctx.canvasId = options.canvasId;
    }
    if (typeof options.remoteSave === 'function') {
      ctx.remoteSave = options.remoteSave;
    }
  }
  return ctx;
}

function updateAutosaveUI(ctx, status, message) {
  if (!ctx || !ctx.ui || !ctx.ui.container) return;
  const { container, icon, text } = ctx.ui;
  if (ctx.uiHideTimer) {
    clearTimeout(ctx.uiHideTimer);
    ctx.uiHideTimer = null;
  }

  const defaultText =
    status === 'saving'
      ? 'Autosaving...'
      : status === 'saved'
      ? 'Autosaved'
      : status === 'error'
      ? 'Autosave failed'
      : '';

  if (text) {
    text.textContent = message || defaultText;
  }

  if (icon) {
    const base = ['autosave-icon', 'bi'];
    let iconName = '';
    let spinning = false;
    if (status === 'saving') {
      iconName = 'bi-cloud-arrow-up';
      spinning = true;
    } else if (status === 'saved') {
      iconName = 'bi-cloud-check';
    } else if (status === 'error') {
      iconName = 'bi-exclamation-triangle';
    }
    if (iconName) base.push(iconName);
    if (spinning) base.push('spin');
    icon.className = base.join(' ');
  }

  container.classList.remove('is-saving', 'is-error');

  if (status === 'saving' || status === 'saved' || status === 'error') {
    container.classList.add('is-visible');
    if (status === 'saving') {
      container.classList.add('is-saving');
    } else if (status === 'error') {
      container.classList.add('is-error');
    }
  } else {
    container.classList.remove('is-visible');
  }

  let hideDelay = null;
  if (status === 'saved') {
    hideDelay = 2400;
  } else if (status === 'error') {
    hideDelay = 4000;
  }

  if (hideDelay !== null) {
    ctx.uiHideTimer = setTimeout(() => {
      container.classList.remove('is-visible', 'is-saving', 'is-error');
      if (icon) {
        icon.className = 'autosave-icon bi';
      }
      if (text && status === 'error') {
        text.textContent = '';
      }
    }, hideDelay);
  }
}

async function runAutosave(ctx, { force = false } = {}) {
  if (!ctx || ctx.cancelled) return;
  if (ctx.saving) return;
  const now = Date.now();
  if (!force && ctx.lastChange && now - ctx.lastChange < AUTOSAVE_IDLE_THRESHOLD_MS) {
    return;
  }
  try {
    if (!ctx.db) {
      ctx.db = await openAutosaveDB();
    }
  } catch (err) {
    console.warn('Autosave unavailable', err);
    ctx.cancelled = true;
    return;
  }
  if (!ctx.db) return;

  let snapshot;
  try {
    snapshot = buildSessionState(ctx.instance);
  } catch (err) {
    console.warn('Autosave snapshot failed', err);
    return;
  }
  const serialized = JSON.stringify(snapshot);

  if (!force && serialized === ctx.lastSerialized) {
    return;
  }

  ctx.saving = true;
  updateAutosaveUI(ctx, 'saving');
  try {
    if (!Array.isArray(snapshot.order) || snapshot.order.length === 0) {
      await deleteAutosaveEntry(ctx.db);
      ctx.lastSerialized = '';
    } else {
      await writeAutosaveEntry(ctx.db, {
        version: SESSION_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        state: snapshot
      });
      ctx.lastSerialized = serialized;
    }
    ctx.lastWrite = Date.now();
    ctx.lastChange = Date.now();
    updateAutosaveUI(ctx, 'saved');
    if (ctx.canvasId && typeof ctx.remoteSave === 'function') {
      try {
        await ctx.remoteSave(snapshot);
      } catch (remoteErr) {
        console.warn('Canvas sync failed', remoteErr);
        const message = remoteErr?.message ? `Canvas sync failed: ${remoteErr.message}` : undefined;
        updateAutosaveUI(ctx, 'error', message);
      }
    }
  } catch (err) {
    console.warn('Autosave write failed', err);
    const message = err?.message ? `Autosave failed: ${err.message}` : undefined;
    updateAutosaveUI(ctx, 'error', message);
    if (err && err.name === 'InvalidStateError') {
      try {
        ctx.db?.close();
      } catch {
        /* ignore */
      }
      ctx.db = null;
    }
  } finally {
    ctx.saving = false;
  }
}

async function initAutosave(instance, deps, uiRefs = {}, options = {}) {
  const ctx = ensureAutosaveContext(instance, uiRefs, options);
  if (!ctx) return;
  if (!supportsIndexedDB()) return;

  let db;
  try {
    db = await openAutosaveDB();
  } catch (err) {
    console.warn('Autosave disabled: cannot open IndexedDB', err);
    updateAutosaveUI(ctx, 'error', 'Autosave unavailable');
    ctx.cancelled = true;
    return;
  }
  ctx.db = db;

  try {
    const existing = await readAutosaveEntry(db);
    let restored = false;
    if (
      existing &&
      existing.state &&
      Number(existing.version) === SESSION_SCHEMA_VERSION &&
      Array.isArray(instance.state?.order) &&
      instance.state.order.length === 0
    ) {
      try {
        applySessionState(instance, existing.state, deps);
        restored = true;
      } catch (err) {
        console.warn('Failed to restore autosave snapshot', err);
      }
    }
    ctx.lastSerialized = existing?.state ? JSON.stringify(existing.state) : '';
    if (restored) {
      updateAutosaveUI(ctx, 'saved', 'Autosave restored');
    }
  } catch (err) {
    console.warn('Autosave read failed', err);
  }

  const intervalId = window.setInterval(() => {
    void runAutosave(ctx);
  }, AUTOSAVE_INTERVAL_MS);
  ctx.timerId = intervalId;

  const handleVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void runAutosave(ctx, { force: true });
    }
  };
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', handleVisibility);
  }

  const handleBeforeUnload = () => {
    void runAutosave(ctx, { force: true });
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('beforeunload', handleBeforeUnload);
  }

  ctx.cleanup = () => {
    ctx.cancelled = true;
    if (ctx.timerId) window.clearInterval(ctx.timerId);
    if (typeof document !== 'undefined' && document.removeEventListener) {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (typeof window !== 'undefined' && window.removeEventListener) {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    }
    try {
      ctx.db?.close();
    } catch {
      /* ignore */
    }
    ctx.db = null;
    if (ctx.uiHideTimer) {
      clearTimeout(ctx.uiHideTimer);
      ctx.uiHideTimer = null;
    }
    if (ctx.ui?.container) {
      ctx.ui.container.classList.remove('is-visible', 'is-saving', 'is-error');
    }
  };

  if (typeof setTimeout === 'function') {
    setTimeout(() => {
      void runAutosave(ctx);
    }, 1000);
  } else {
    void runAutosave(ctx);
  }
}

function forceAutosave(instance) {
  const ctx = getAutosaveContext(instance);
  if (!ctx) return;
  ctx.lastChange = 0;
  void runAutosave(ctx, { force: true });
}

async function clearSession(instance, deps) {
  if (!instance || !deps) return;
  const { state } = instance;
  state.traces = {};
  state.order = [];
  state.folders = {};
  state.folderOrder = [rootFolderId()];
  state.ui = { activeFolder: rootFolderId() };
  state.history = [];
  state.future = [];
  if (state.global && typeof state.global === 'object') {
    state.global.sessionTitle = '';
  }

  deps.ensureFolderStructure(state);
  deps.normalizeGlobalInputState(state);
  deps.renderFolderTree(instance);
  deps.syncInputControls(instance);
  deps.applyDisplayUnits(instance);
  deps.renderPlot(instance);
  deps.updateHistoryButtons(instance);
  deps.syncDemoButton(instance);

  const ctx = ensureAutosaveContext(instance);
  if (!ctx) return;

  try {
    if (!ctx.db) {
      ctx.db = await openAutosaveDB();
    }
    await deleteAutosaveEntry(ctx.db);
  } catch (err) {
    console.warn('Autosave clear failed', err);
    updateAutosaveUI(ctx, 'error', 'Failed to clear autosave');
    signalAutosaveActivity(instance);
    return;
  }

  ctx.lastSerialized = '';
  ctx.lastChange = Date.now();
  updateAutosaveUI(ctx, 'saved', 'Workspace cleared');
  signalAutosaveActivity(instance);
}

function applySessionState(instance, st, deps) {
  if (!st || typeof st !== 'object') {
    throw new Error('Session payload is empty or invalid');
  }
  if (Number(st.version) !== SESSION_SCHEMA_VERSION) {
    throw new Error(`Unsupported session version: ${st.version}`);
  }

  const { state } = instance;

  state.global = { ...state.global, ...(st.global || {}) };
  state.traces = {};
  state.order = Array.isArray(st.order) ? st.order.slice() : [];

  const traces = st.traces || {};
  state.order.forEach((id) => {
    const savedTrace = traces[id];
    if (!savedTrace) return;
    const savedData = savedTrace.data && typeof savedTrace.data === 'object' ? savedTrace.data : {};
    const savedSource = savedTrace.source && typeof savedTrace.source === 'object' ? savedTrace.source : {};
    const clonedSource = { ...savedSource };
    if (Array.isArray(clonedSource.x)) {
      clonedSource.x = cloneNumericArray(clonedSource.x);
    } else if (Array.isArray(savedData.x)) {
      clonedSource.x = cloneNumericArray(savedData.x);
    } else {
      delete clonedSource.x;
    }
    clonedSource.y = cloneNumericArray(savedSource.y || savedData.y);

    state.traces[id] = {
      ...savedTrace,
      data: {
        x: cloneNumericArray(savedData.x),
        y: cloneNumericArray(savedData.y)
      },
      source: clonedSource,
      meta: savedTrace.meta && typeof savedTrace.meta === 'object' ? { ...savedTrace.meta } : savedTrace.meta
    };
  });

  state.folders = st.folders || {};
  state.folderOrder = Array.isArray(st.folderOrder) ? st.folderOrder.slice() : [rootFolderId()];
  state.ui = { activeFolder: st.ui?.activeFolder || rootFolderId() };

  deps.ensureFolderStructure(state);
  deps.normalizeGlobalInputState(state);
  const cfg = deps.getDisplayConfig(state.global.units || state.global.inputMode || 'tr');
  state.global.units = cfg.key;
  deps.renderFolderTree(instance);
  deps.syncInputControls(instance);
  deps.applyDisplayUnits(instance);
  deps.renderPlot(instance);
  deps.updateHistoryButtons(instance);
  deps.syncDemoButton(instance);

  forceAutosave(instance);

  return st;
}

async function loadSession(instance, sessionId, deps) {
  const payload = await getSessionRequest(sessionId);
  const st = payload.state || {};
  return applySessionState(instance, st, deps);
}

function exportSession(instance) {
  const state = buildSessionState(instance);
  const exportedAt = new Date().toISOString();
  const payload = {
    schema: 'ftir-session',
    version: SESSION_SCHEMA_VERSION,
    exported_at: exportedAt,
    title: String(instance.state?.global?.sessionTitle || ''),
    state
  };
  const slug = safeSlug(payload.title, 'session');
  const timestamp = exportedAt.replace(/[:.]/g, '').replace(/-/g, '').replace('T', '_');
  const filename = `${slug}_${timestamp}.ben`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importSessionFromFile(instance, file, deps) {
  if (!file) return;
  let text;
  try {
    text = await file.text();
  } catch (err) {
    throw new Error(`Failed to read file: ${err.message || err}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error('Selected file is not valid JSON');
  }

  const st =
    parsed && typeof parsed === 'object' && typeof parsed.state === 'object' ? parsed.state : parsed;
  return applySessionState(instance, st, deps);
}

export function createCanvasBridge(canvasId, instance, deps) {
  if (!canvasId || !instance) return null;
  return {
    id: canvasId,
    get defaultTitle() {
      return String(instance.state?.global?.sessionTitle || 'Snapshot');
    },
    async load() {
      try {
        const payload = await fetchCanvasState(canvasId);
        if (payload?.state) {
          applySessionState(instance, payload.state, deps);
        }
        if (payload?.title && instance.state?.global) {
          instance.state.global.sessionTitle = payload.title;
        }
        window.showAppToast?.({
          title: 'Canvas ready',
          message: payload?.title ? `"${payload.title}" loaded.` : 'Canvas loaded.',
          variant: 'success'
        });
      } catch (err) {
        window.showAppToast?.({
          title: 'Unable to load canvas',
          message: err?.message || String(err),
          variant: 'danger'
        });
        console.warn('Failed to load canvas state', err);
      }
    },
    async save(state, label) {
      await saveCanvasState(canvasId, {
        state,
        version_label: label || state?.global?.sessionTitle || ''
      });
    },
    applyLocal(state) {
      if (!state) return;
      applySessionState(instance, state, deps);
    }
  };
}

export function bindSessionUI(instance, deps) {
  const btnSave = document.getElementById('b_save');
  const btnLoad = document.getElementById('b_load');
  const btnExport = document.getElementById('b_session_export');
  const btnImport = document.getElementById('b_session_import');
  const btnClear = document.getElementById('b_session_clear');
  const btnSave2 = document.getElementById('b_session_save2');
  const snapshotSaveBtn = document.getElementById('c_canvas_snapshot_save');
  const snapshotManageBtn = document.getElementById('c_canvas_snapshot_manage');
  const snapshotModal = document.getElementById('c_canvas_snapshot_modal');
  const inputTitle = document.getElementById('b_session_title');
  const listEl = document.getElementById('b_session_list');
  const modalEl = document.getElementById('b_sessions_modal');
  const modalInstance = modalEl ? bootstrap.Modal.getOrCreateInstance(modalEl) : null;
  const inputImport = document.getElementById('b_session_import_input');
  const autosaveIndicator = document.getElementById('autosave_indicator');
  const autosaveIcon = autosaveIndicator?.querySelector('.autosave-icon') || null;
  const autosaveText = autosaveIndicator?.querySelector('.autosave-text') || null;
  const sessionBanner = document.getElementById('b_session_alert');
  let sessionAuthBlocked = false;
  const activeCanvasId = getActiveCanvasId();
  const canvasBridge = activeCanvasId ? createCanvasBridge(activeCanvasId, instance, deps) : null;
  const canvasMode = !!canvasBridge;
  if (canvasMode) {
    sessionAuthBlocked = true;
  }

  const updateBackendAccess = () => {
    const disabled = sessionAuthBlocked;
    const msg = disabled ? 'Sign in to save sessions.' : 'Save your current session.';
    if (btnSave) {
      btnSave.disabled = disabled;
      btnSave.title = msg;
    }
    if (btnSave2) {
      btnSave2.disabled = disabled;
      btnSave2.title = msg;
    }
    deps.updateWorkspaceSummary?.({ sessionAuthBlocked: disabled });
  };

  updateBackendAccess();

  if (canvasMode) {
    [btnSave, btnSave2, btnLoad].forEach((btn) => btn?.classList.add('d-none'));
    modalEl?.classList.add('d-none');
    hideBanner();
    window.showAppToast?.({
      title: 'Canvas linked to dashboard',
      message: 'Changes sync directly to this canvas.',
      variant: 'info'
    });
    void canvasBridge.load();
    initCanvasSnapshots({
      bridge: canvasBridge,
      saveButton: snapshotSaveBtn,
      manageButton: snapshotManageBtn,
      modal: snapshotModal
    });
  } else {
    [snapshotSaveBtn, snapshotManageBtn].forEach((btn) => {
      if (btn) {
        btn.disabled = true;
        btn.title = 'Snapshots available when editing a project canvas.';
      }
    });
  }

  const hideBanner = () => {
    if (sessionBanner) {
      sessionBanner.classList.add('d-none');
    }
  };

  const showBanner = (message, variant = 'warning') => {
    if (!sessionBanner) {
      console.warn(message);
      return;
    }
    sessionBanner.textContent = message;
    sessionBanner.className = `alert alert-${variant}`;
    sessionBanner.classList.remove('d-none');
  };

  const interpretVariant = (message) => {
    if (!message) return 'warning';
    return /exceed|too large|limit/i.test(message) ? 'danger' : 'warning';
  };

  const refreshList = async () => {
    if (canvasMode || !listEl) return;
    listEl.replaceChildren();
    hideBanner();
    try {
      const data = await listSessionsRequest();
      sessionAuthBlocked = !!data.requiresAuth;
      instance.sessionAuthBlocked = sessionAuthBlocked;
      updateBackendAccess();

      if (sessionAuthBlocked) {
        const li = document.createElement('li');
        li.className = 'list-group-item text-muted';
        li.textContent = 'Sign in to view, load, or delete saved sessions.';
        listEl.appendChild(li);
        deps.updateWorkspaceSummary?.({ sessionAuthBlocked: true, cloudCount: 0 });
        showBanner('Sign in to view your cloud sessions.', 'info');
        return;
      }

      const items = Array.isArray(data.items) ? data.items : [];
      deps.updateWorkspaceSummary?.({ sessionAuthBlocked: false, cloudCount: items.length });
      if (!items.length) {
        const empty = document.createElement('li');
        empty.className = 'list-group-item text-muted';
        empty.textContent = 'No saved sessions yet.';
        listEl.appendChild(empty);
        showBanner('No cloud sessions yet. Save this workspace to create one.', 'info');
        return;
      }

      items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center gap-3';
        const titleText = escapeHtml(item.title || item.session_id);
        const metaText = escapeHtml(describeSession(item));
        li.innerHTML = `
          <div class="flex-grow-1">
            <div class="fw-semibold">${titleText}</div>
            <div class="small text-muted">${metaText}</div>
          </div>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary session-load" data-id="${item.session_id}">Load</button>
            <button class="btn btn-outline-danger session-delete" data-id="${item.session_id}">Delete</button>
          </div>
        `;
        listEl.appendChild(li);
      });
      hideBanner();
    } catch (err) {
      console.error('Session list failed', err);
      const li = document.createElement('li');
      li.className = 'list-group-item text-danger';
      li.textContent = err.message || String(err);
      listEl.appendChild(li);
      deps.updateWorkspaceSummary?.({ sessionAuthBlocked, cloudCount: 0 });
      showBanner(err.message || 'Session list failed', 'danger');
    }
  };

  btnSave?.addEventListener('click', async () => {
    if (sessionAuthBlocked) {
      showBanner('Sign in to save sessions.', 'info');
      return;
    }
    const title = prompt('Session title (optional)') || '';
    try {
      await saveSessionRequest({ title, state: buildSessionState(instance) });
      hideBanner();
      window.showAppToast?.({
        title: 'Session saved',
        message: title ? `"${title}" synced to cloud.` : 'Cloud session saved.',
        variant: 'success'
      });
      await refreshList();
    } catch (err) {
      const message = err?.message || String(err);
      showBanner(message, interpretVariant(message));
    }
  });

  btnSave2?.addEventListener('click', async () => {
    if (sessionAuthBlocked) {
      showBanner('Sign in to save sessions.', 'info');
      return;
    }
    const title = inputTitle?.value.trim() || '';
    try {
      await saveSessionRequest({ title, state: buildSessionState(instance) });
      if (inputTitle) inputTitle.value = '';
      hideBanner();
      window.showAppToast?.({
        title: 'Session saved',
        message: title ? `"${title}" synced to cloud.` : 'Cloud session saved.',
        variant: 'success'
      });
      await refreshList();
    } catch (err) {
      const message = err?.message || String(err);
      showBanner(message, interpretVariant(message));
    }
  });

  btnExport?.addEventListener('click', () => {
    try {
      exportSession(instance);
      window.showAppToast?.({
        title: 'Local export ready',
        message: 'Downloaded a .ben backup of this workspace.',
        variant: 'info'
      });
    } catch (err) {
      showBanner(err.message || String(err), 'danger');
    }
  });

  btnImport?.addEventListener('click', () => {
    if (inputImport) {
      inputImport.value = '';
      inputImport.click();
    }
  });

  inputImport?.addEventListener('change', async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    try {
      await importSessionFromFile(instance, file, deps);
      modalInstance?.hide();
      hideBanner();
      window.showAppToast?.({
        title: 'Session imported',
        message: file.name ? `"${file.name}" loaded from local backup.` : 'Local session imported.',
        variant: 'success'
      });
    } catch (err) {
      showBanner(err.message || String(err), 'danger');
    } finally {
      event.target.value = '';
    }
  });

  btnClear?.addEventListener('click', async () => {
    try {
      await clearSession(instance, deps);
      hideBanner();
      deps.updateWorkspaceSummary?.({ cloudCount: 0 });
      window.showAppToast?.({
        title: 'Workspace cleared',
        message: 'Autosave reset. Cloud sessions untouched.',
        variant: 'info'
      });
    } catch (err) {
      showBanner(err.message || String(err), 'danger');
    }
  });

  btnLoad?.addEventListener('click', () => {
    if (modalEl) {
      refreshList().catch(() => {});
    }
  });

  listEl?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (sessionAuthBlocked) {
      showBanner('Sign in to manage sessions.', 'info');
      return;
    }
    const id = btn.dataset.id;
    if (!id) return;
    if (btn.classList.contains('session-load')) {
      try {
        await loadSession(instance, id, deps);
        hideBanner();
        window.showAppToast?.({
          title: 'Session loaded',
          message: 'Cloud session restored.',
          variant: 'success'
        });
        modalInstance?.hide();
      } catch (err) {
        showBanner(err.message || String(err), 'danger');
      }
    } else if (btn.classList.contains('session-delete')) {
      try {
        await deleteSessionRequest(id);
        window.showAppToast?.({
          title: 'Session deleted',
          message: 'Removed from cloud storage.',
          variant: 'warning'
        });
        await refreshList();
      } catch (err) {
        showBanner(err.message || String(err), 'danger');
      }
    }
  });

  modalEl?.addEventListener('show.bs.modal', () => {
    refreshList().catch(() => {});
  });

  void initAutosave(
    instance,
    deps,
    {
      container: autosaveIndicator,
      icon: autosaveIcon,
      text: autosaveText
    },
    {
      canvasId: canvasBridge?.id || null,
      remoteSave: canvasBridge ? (state) => canvasBridge.save(state) : null
    }
  );
}
