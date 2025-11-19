const panelRegistry = new Map();
let defaultTypeId = null;

const normalizeDefinition = (definition) => {
  if (!definition || typeof definition !== 'object') {
    throw new Error('Panel type definition must be an object');
  }
  const { id } = definition;
  if (!id || typeof id !== 'string') {
    throw new Error('Panel type definition requires an id');
  }
  const normalized = {
    id,
    label: definition.label || id,
    isDefault: definition.isDefault === true,
    capabilities: {
      plot: definition.capabilities?.plot !== false
    },
    mountContent: typeof definition.mountContent === 'function'
      ? definition.mountContent
      : ({ hostEl }) => ({ plotEl: hostEl }),
    prepareInitialState: typeof definition.prepareInitialState === 'function'
      ? definition.prepareInitialState
      : () => ({}),
    getDefaultTitle: typeof definition.getDefaultTitle === 'function'
      ? definition.getDefaultTitle
      : (index) => `${definition.label || 'Panel'} ${index || ''}`.trim()
  };
  if (typeof definition.createPanel === 'function') {
    normalized.createPanel = definition.createPanel;
  }
  if (typeof definition.getContent === 'function') {
    normalized.getContent = definition.getContent;
  }
  if (typeof definition.createDefaultContent === 'function') {
    normalized.createDefaultContent = definition.createDefaultContent;
  }
  if (typeof definition.storeSelection === 'function') {
    normalized.storeSelection = definition.storeSelection;
  }
  if (typeof definition.restoreState === 'function') {
    normalized.restoreState = definition.restoreState;
  }
  if (typeof definition.onMount === 'function') {
    normalized.onMount = definition.onMount;
  }
  return normalized;
};

export function registerPanelType(definition) {
  const normalized = normalizeDefinition(definition);
  panelRegistry.set(normalized.id, normalized);
  if (normalized.isDefault || !defaultTypeId) {
    defaultTypeId = normalized.id;
  }
  return normalized;
}

export function getPanelType(typeId) {
  if (typeId && panelRegistry.has(typeId)) {
    return panelRegistry.get(typeId);
  }
  if (defaultTypeId && panelRegistry.has(defaultTypeId)) {
    return panelRegistry.get(defaultTypeId);
  }
  return panelRegistry.values().next().value || null;
}

export function listPanelTypes() {
  return Array.from(panelRegistry.values());
}

export function clearPanelTypes() {
  panelRegistry.clear();
  defaultTypeId = null;
}
