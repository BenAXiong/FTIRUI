const deepClone = (value) => {
  if (!value || typeof value !== 'object') return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
};

const registry = new Map();

const fallbackAdapter = {
  normalize(value) {
    return deepClone(value);
  },
  serialize(value) {
    return deepClone(value);
  }
};

export function registerContentKind(kind, adapter = {}) {
  if (!kind || typeof kind !== 'string') {
    throw new Error('contentStore: kind must be a non-empty string');
  }
  const normalized = {
    normalize: typeof adapter.normalize === 'function'
      ? adapter.normalize
      : fallbackAdapter.normalize,
    serialize: typeof adapter.serialize === 'function'
      ? adapter.serialize
      : fallbackAdapter.serialize
  };
  registry.set(kind, normalized);
}

const getAdapter = (kind) => {
  if (kind && registry.has(kind)) {
    return registry.get(kind);
  }
  return fallbackAdapter;
};

export function normalizeContentPayload(value, { kind } = {}) {
  const adapter = getAdapter(kind);
  const normalized = adapter.normalize(value, { kind });
  if (!normalized || typeof normalized !== 'object') {
    return null;
  }
  return normalized;
}

export function cloneContentPayload(value, { kind } = {}) {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const adapter = getAdapter(kind);
  const cloned = adapter.serialize(value, { kind });
  if (!cloned || typeof cloned !== 'object') {
    return null;
  }
  return cloned;
}
