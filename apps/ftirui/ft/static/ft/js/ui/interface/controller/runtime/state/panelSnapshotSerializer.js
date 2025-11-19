import { getPanelType } from '../panels/registry/index.js';

const deepClone = (value) => {
  if (!value || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const applyTransform = (record, hookName) => {
  if (!record || typeof record !== 'object') return record;
  const type = getPanelType(record.type);
  const transform = type?.[hookName];
  if (typeof transform !== 'function') {
    return record;
  }
  const cloned = deepClone(record);
  const next = transform(cloned);
  if (next && typeof next === 'object') {
    return next;
  }
  return cloned;
};

export const serializePanelsSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const items = Array.isArray(snapshot.items)
    ? snapshot.items.map((item) => applyTransform(item, 'serializeState'))
    : snapshot.items;
  return {
    ...snapshot,
    items
  };
};

export const hydratePanelsSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  const items = Array.isArray(snapshot.items)
    ? snapshot.items.map((item) => applyTransform(item, 'hydrateState'))
    : snapshot.items;
  return {
    ...snapshot,
    items
  };
};
