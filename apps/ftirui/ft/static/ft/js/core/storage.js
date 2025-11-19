const NAMESPACE_KEY = 'ftir.workspace.v1';
const APP_ID = 'ftir.workspace';
const SCHEMA_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 1200;
const LEGACY_NAMESPACE_KEYS = ['ftir.workspace.canvas.v1'];

const coerceBoolean = (value, defaultValue = false) => (value === true ? true : value === false ? false : defaultValue);

const normalizeSectionsSnapshot = (sections) => {
  if (!sections || typeof sections !== 'object') return null;
  const items = Array.isArray(sections.items)
    ? sections.items
        .map((section) => {
          if (!section || typeof section !== 'object') return null;
          const children = Array.isArray(section.children) ? section.children.slice() : [];
          return {
            ...section,
            collapsed: coerceBoolean(section.collapsed, false),
            locked: coerceBoolean(section.locked, false),
            visible: section.visible === false ? false : true,
            parentId: section.parentId || null,
            children
          };
        })
        .filter(Boolean)
    : null;
  const normalized = {
    ...sections
  };
  if (items) normalized.items = items;
  if (Object.prototype.hasOwnProperty.call(sections, 'order') && Array.isArray(sections.order)) {
    normalized.order = sections.order.slice();
  }
  if (Object.prototype.hasOwnProperty.call(sections, 'counter')) {
    const counter = Number(sections.counter);
    normalized.counter = Number.isFinite(counter) ? counter : 0;
  }
  return normalized;
};

const cloneContent = (value) => {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { ...value };
  }
};

const normalizePanelsSnapshot = (panels) => {
  if (!panels || typeof panels !== 'object') return null;
  const items = Array.isArray(panels.items)
    ? panels.items
        .map((panel) => {
          if (!panel || typeof panel !== 'object' || !panel.id) return null;
          return {
            ...panel,
            collapsed: coerceBoolean(panel.collapsed, false),
            hidden: panel.hidden === true,
            sectionId: panel.sectionId || panel.section || null,
            content: cloneContent(panel.content)
          };
        })
        .filter(Boolean)
    : null;
  const normalized = {
    ...panels
  };
  if (items) normalized.items = items;
  if (Object.prototype.hasOwnProperty.call(panels, 'counter')) {
    const counter = Number(panels.counter);
    normalized.counter = Number.isFinite(counter) ? counter : 0;
  }
  if (Object.prototype.hasOwnProperty.call(panels, 'zIndexCursor')) {
    const zIndexCursor = Number(panels.zIndexCursor);
    normalized.zIndexCursor = Number.isFinite(zIndexCursor) ? zIndexCursor : 0;
  }
  return normalized;
};

const normalizeFiguresSnapshot = (figures) => {
  if (!figures || typeof figures !== 'object') return null;
  const normalized = {};
  Object.entries(figures).forEach(([panelId, figure]) => {
    if (!panelId) return;
    const safeFigure = figure && typeof figure === 'object' ? figure : {};
    const data = Array.isArray(safeFigure.data)
      ? safeFigure.data.map((trace) => (trace && typeof trace === 'object' ? { ...trace } : trace))
      : [];
    const layout = safeFigure.layout && typeof safeFigure.layout === 'object'
      ? { ...safeFigure.layout }
      : {};
    normalized[panelId] = {
      data,
      layout
    };
  });
  return Object.keys(normalized).length ? normalized : null;
};

const normalizeUiPrefs = (prefs, fallback = {}) => {
  const source = prefs && typeof prefs === 'object' ? { ...prefs } : {};
  if (Object.prototype.hasOwnProperty.call(fallback, 'colorCursor') && !Object.prototype.hasOwnProperty.call(source, 'colorCursor')) {
    source.colorCursor = fallback.colorCursor;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'colorCursor')) {
    const value = Number(source.colorCursor);
    source.colorCursor = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  }
  return Object.keys(source).length ? source : null;
};

const normalizeSnapshot = (snapshot) => ({
  sections: normalizeSectionsSnapshot(snapshot?.sections),
  panels: normalizePanelsSnapshot(snapshot?.panels),
  figures: normalizeFiguresSnapshot(snapshot?.figures),
  uiPrefs: normalizeUiPrefs(snapshot?.uiPrefs, snapshot)
});

const MIGRATORS = new Map([
  [0, (input) => ({
    version: 1,
    data: normalizeSnapshot(input)
  })]
]);

const createMigrationError = (code, detail = null) => ({
  error: { code, detail }
});

const STORAGE_ERROR_MESSAGES = {
  invalid_payload: 'Saved workspace data was invalid and has been reset.',
  app_mismatch: 'Saved workspace data belonged to a different application and was ignored.',
  version_newer: 'Saved workspace data comes from a newer version. Please update to load it.',
  missing_migrator: 'Saved workspace data is from an unsupported version and was cleared.',
  invalid_migration_result: 'Saved workspace data could not be upgraded and has been reset.',
  invalid_version_step: 'Saved workspace upgrade encountered invalid version metadata and was reset.',
  normalized_empty: 'Saved workspace data was empty and has been cleared.',
  parse_error: 'Saved workspace data was corrupted and has been cleared.',
  load_failure: 'Failed to load saved workspace data; starting with defaults.'
};

const STORAGE_ERROR_VARIANTS = {
  version_newer: 'warning',
  app_mismatch: 'warning'
};

const STORAGE_ERROR_PURGE_CODES = new Set([
  'invalid_payload',
  'app_mismatch',
  'missing_migrator',
  'invalid_migration_result',
  'invalid_version_step',
  'normalized_empty',
  'parse_error',
  'load_failure'
]);

const emitToast = (message, variant = 'info') => {
  if (typeof window !== 'undefined' && typeof window.showAppToast === 'function') {
    window.showAppToast({ message, variant });
  }
};

const reportStorageIssue = (code, detail, storageInstance, key) => {
  const message = STORAGE_ERROR_MESSAGES[code] || 'Saved workspace data could not be loaded.';
  const variant = STORAGE_ERROR_VARIANTS[code] || 'danger';
  emitToast(message, variant);
  console.warn(`[storage] ${message}`, detail || '');
  if (storageInstance && key && STORAGE_ERROR_PURGE_CODES.has(code)) {
    try {
      storageInstance.removeItem(key);
    } catch {
      /* ignore */
    }
  }
};

let cachedStorage;
let cachedStorageType = null;
let pendingSnapshot = null;
let debounceTimer = null;


const isDevMode = () => {
  if (typeof window === 'undefined') return false;
  if (typeof window.__FTIR_DEV__ !== 'undefined') return !!window.__FTIR_DEV__;
  if (typeof window.__DEV__ !== 'undefined') return !!window.__DEV__;
  const host = window.location?.hostname || '';
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
};

const testWritable = (storage, key) => {
  if (!storage) return false;
  try {
    storage.setItem(key, '__test__');
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const resolveStorage = () => {
  if (cachedStorageType === 'unavailable') return null;
  if (cachedStorage) return cachedStorage;
  if (typeof window === 'undefined') {
    cachedStorageType = 'unavailable';
    return null;
  }

  const candidates = [];
  try {
    candidates.push({ type: 'local', target: window.localStorage });
  } catch {
    /* ignore */
  }
  try {
    candidates.push({ type: 'session', target: window.sessionStorage });
  } catch {
    /* ignore */
  }

  if (!candidates.length) {
    cachedStorageType = 'unavailable';
    return null;
  }

  const preferSession = isDevMode();
  const preference = preferSession ? ['session', 'local'] : ['local', 'session'];

  for (const desiredType of preference) {
    const match = candidates.find((item) => item.type === desiredType);
    if (match && testWritable(match.target, `${NAMESPACE_KEY}::probe`)) {
      cachedStorage = match.target;
      cachedStorageType = desiredType;
      return cachedStorage;
    }
  }

  // Fallback to any writable option.
  const fallback = candidates.find((item) => testWritable(item.target, `${NAMESPACE_KEY}::probe`));
  if (fallback) {
    cachedStorage = fallback.target;
    cachedStorageType = fallback.type;
    return cachedStorage;
  }

  cachedStorageType = 'unavailable';
  return null;
};

const cloneSnapshot = (snapshot) => JSON.parse(JSON.stringify(normalizeSnapshot(snapshot || {})));

const composePayload = (snapshot, timestamp = Date.now()) => ({
  version: SCHEMA_VERSION,
  app: APP_ID,
  timestamp,
  data: cloneSnapshot(snapshot)
});

const commitPayload = (payload) => {
  const storage = resolveStorage();
  if (!storage) return false;
  try {
    storage.setItem(NAMESPACE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('[storage] Failed to persist workspace snapshot', err);
    return false;
  }
};

const clearDebounceTimer = () => {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
};

const resetPending = () => {
  pendingSnapshot = null;
  clearDebounceTimer();
};

export const migrate = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return createMigrationError('invalid_payload');
  }
  if (payload.app && payload.app !== APP_ID) {
    return createMigrationError('app_mismatch', { app: payload.app });
  }

  let version = Number(payload.version);
  if (!Number.isFinite(version)) {
    version = 0;
  }
  if (version > SCHEMA_VERSION) {
    return createMigrationError('version_newer', { version });
  }

  let data = payload.data && typeof payload.data === 'object'
    ? payload.data
    : {
        sections: payload.sections ?? null,
        panels: payload.panels ?? null,
        figures: payload.figures ?? null,
        uiPrefs: payload.uiPrefs ?? null,
        colorCursor: payload.colorCursor
      };

  let workingVersion = version;
  let workingData = data;

  while (workingVersion < SCHEMA_VERSION) {
    const migrator = MIGRATORS.get(workingVersion);
    if (typeof migrator !== 'function') {
      return createMigrationError('missing_migrator', { from: workingVersion });
    }
    const result = migrator(workingData);
    if (!result || typeof result !== 'object') {
      return createMigrationError('invalid_migration_result', { from: workingVersion });
    }
    const nextVersion = Number(result.version ?? workingVersion + 1);
    if (!Number.isFinite(nextVersion) || nextVersion <= workingVersion) {
      return createMigrationError('invalid_version_step', { from: workingVersion, to: result.version });
    }
    workingVersion = nextVersion;
    workingData = result.data ?? workingData;
  }

  const normalizedData = normalizeSnapshot(workingData);
  if (!normalizedData) {
    return createMigrationError('normalized_empty');
  }

  return {
    version: SCHEMA_VERSION,
    data: normalizedData
  };
};

export const getNamespace = () => NAMESPACE_KEY;

export const getStorageType = () => cachedStorageType;

export const hasSnapshot = () => {
  if (pendingSnapshot) return true;
  const storage = resolveStorage();
  if (!storage) return false;
  try {
    if (storage.getItem(NAMESPACE_KEY) != null) return true;
    return LEGACY_NAMESPACE_KEYS.some((key) => storage.getItem(key) != null);
  } catch {
    return false;
  }
};

export const clear = () => {
  const storage = resolveStorage();
  resetPending();
  if (!storage) return false;
  let removed = false;
  const keys = [NAMESPACE_KEY, ...LEGACY_NAMESPACE_KEYS];
  keys.forEach((key) => {
    try {
      if (storage.getItem(key) != null) {
        removed = true;
      }
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  });
  return removed;
};

export const save = (snapshot, { timestamp = Date.now() } = {}) => {
  resetPending();
  const payload = composePayload(snapshot, timestamp);
  return commitPayload(payload);
};

export const queueSave = (snapshot, { delay = DEFAULT_DEBOUNCE_MS } = {}) => {
  const storage = resolveStorage();
  if (!storage) return false;
  pendingSnapshot = cloneSnapshot(snapshot);
  clearDebounceTimer();
  debounceTimer = setTimeout(() => {
    const snapshotToPersist = pendingSnapshot;
    resetPending();
    if (snapshotToPersist) {
      const payload = composePayload(snapshotToPersist);
      commitPayload(payload);
    }
  }, Math.max(0, delay));
  return true;
};

export const flush = () => {
  if (!pendingSnapshot) return false;
  const snapshotToPersist = pendingSnapshot;
  resetPending();
  return save(snapshotToPersist);
};

export const load = () => {
  const storage = resolveStorage();
  if (!storage) return null;
  if (pendingSnapshot) {
    const snapshot = cloneSnapshot(pendingSnapshot);
    return {
      ...snapshot,
      meta: {
        version: SCHEMA_VERSION,
        timestamp: Date.now(),
        storage: cachedStorageType
      }
    };
  }
  let sourceKey = NAMESPACE_KEY;
  let raw = null;
  try {
    raw = storage.getItem(sourceKey);
    if (!raw) {
      for (const legacyKey of LEGACY_NAMESPACE_KEYS) {
        const legacyRaw = storage.getItem(legacyKey);
        if (legacyRaw) {
          raw = legacyRaw;
          sourceKey = legacyKey;
          break;
        }
      }
      if (!raw) return null;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      reportStorageIssue('parse_error', err, storage, sourceKey);
      return null;
    }
    if (!payload || typeof payload !== 'object') {
      reportStorageIssue('invalid_payload', null, storage, sourceKey);
      return null;
    }

    const migrated = migrate(payload);
    if (!migrated || migrated.error || !migrated.data) {
      const { error } = migrated || {};
      const code = error?.code || 'load_failure';
      reportStorageIssue(code, error?.detail, storage, sourceKey);
      return null;
    }
    const snapshot = cloneSnapshot(migrated.data);
    const timestamp = Number(payload.timestamp) || null;

    if (sourceKey !== NAMESPACE_KEY) {
      try {
        const rewritePayload = composePayload(snapshot, timestamp ?? Date.now());
        storage.setItem(NAMESPACE_KEY, JSON.stringify(rewritePayload));
      } catch (rewriteErr) {
        console.warn('[storage] Failed to rewrite legacy snapshot', rewriteErr);
      }
      try {
        storage.removeItem(sourceKey);
      } catch {
        /* ignore */
      }
    }

    return {
      ...snapshot,
      meta: {
        version: migrated.version || SCHEMA_VERSION,
        timestamp,
        storage: cachedStorageType
      }
    };
  } catch (err) {
    reportStorageIssue('load_failure', err, storage, sourceKey);
    return null;
  }
};

export const getPendingSnapshot = () => (pendingSnapshot ? cloneSnapshot(pendingSnapshot) : null);

export const DEFAULT_DELAY = DEFAULT_DEBOUNCE_MS;

export const CURRENT_VERSION = SCHEMA_VERSION;
