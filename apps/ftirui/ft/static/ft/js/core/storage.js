const NAMESPACE_KEY = 'ftir.workspace.v1';
const APP_ID = 'ftir.workspace';
const SCHEMA_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 1200;

let cachedStorage;
let cachedStorageType = null;
let pendingSnapshot = null;
let debounceTimer = null;

const noop = () => false;

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

const cloneSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      sections: null,
      panels: null,
      figures: null,
      uiPrefs: null
    };
  }

  const base = {
    sections: snapshot.sections ?? null,
    panels: snapshot.panels ?? null,
    figures: snapshot.figures ?? null,
    uiPrefs: snapshot.uiPrefs ?? null
  };

  if (base.uiPrefs == null && Object.prototype.hasOwnProperty.call(snapshot, 'colorCursor')) {
    base.uiPrefs = { colorCursor: snapshot.colorCursor };
  } else if (base.uiPrefs && Object.prototype.hasOwnProperty.call(snapshot, 'colorCursor')) {
    base.uiPrefs = { ...base.uiPrefs, colorCursor: snapshot.colorCursor };
  }

  return JSON.parse(JSON.stringify(base));
};

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

export const getNamespace = () => NAMESPACE_KEY;

export const getStorageType = () => cachedStorageType;

export const hasSnapshot = () => {
  const storage = resolveStorage();
  if (!storage) return false;
  try {
    return storage.getItem(NAMESPACE_KEY) != null;
  } catch {
    return false;
  }
};

export const clear = () => {
  const storage = resolveStorage();
  resetPending();
  if (!storage) return false;
  try {
    storage.removeItem(NAMESPACE_KEY);
    return true;
  } catch {
    return false;
  }
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
  try {
    const raw = storage.getItem(NAMESPACE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return null;

    const version = Number(payload.version);
    if (!Number.isFinite(version) || version > SCHEMA_VERSION) {
      return null;
    }

    const data = (() => {
      if (payload.data && typeof payload.data === 'object') {
        return payload.data;
      }
      // Backwards compatibility with legacy schema.
      return {
        sections: payload.sections ?? null,
        panels: payload.panels ?? null,
        figures: payload.figures ?? null,
        uiPrefs: payload.uiPrefs ?? null,
        colorCursor: payload.colorCursor
      };
    })();

    const snapshot = {
      sections: data.sections ?? null,
      panels: data.panels ?? null,
      figures: data.figures ?? null,
      uiPrefs: data.uiPrefs ?? null
    };

    if (!snapshot.uiPrefs && Object.prototype.hasOwnProperty.call(data, 'colorCursor')) {
      snapshot.uiPrefs = { colorCursor: data.colorCursor };
    } else if (snapshot.uiPrefs && Object.prototype.hasOwnProperty.call(data, 'colorCursor')) {
      snapshot.uiPrefs = { ...snapshot.uiPrefs, colorCursor: data.colorCursor };
    }

    return {
      ...snapshot,
      meta: {
        version: version || SCHEMA_VERSION,
        timestamp: Number(payload.timestamp) || null,
        storage: cachedStorageType
      }
    };
  } catch (err) {
    console.warn('[storage] Failed to load workspace snapshot', err);
    return null;
  }
};

export const getPendingSnapshot = () => (pendingSnapshot ? cloneSnapshot(pendingSnapshot) : null);

export const DEFAULT_DELAY = DEFAULT_DEBOUNCE_MS;
