const DEFAULT_SECTION_ID = 'section_all';

const sections = new Map();
let sectionOrder = [];
let sectionCounter = 0;
const graphToSection = new Map();

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const cloneSection = (section) => {
  if (!section) return null;
  return {
    id: section.id,
    name: section.name,
    collapsed: !!section.collapsed,
    locked: !!section.locked,
    parentId: section.parentId || null,
    children: ensureArray(section.children).slice(),
    visible: section.visible !== false
  };
};

const normalizeCreateSectionInput = (input, options = {}) => {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const payload = { ...input };
    return {
      name: payload.name,
      options: {
        parentId: payload.parentId ?? null,
        id: payload.id,
        collapsed: payload.collapsed,
        locked: payload.locked,
        visible: payload.visible,
        children: ensureArray(payload.children)
      }
    };
  }
  return {
    name: input,
    options: {
      parentId: options?.parentId ?? null,
      id: options?.id,
      collapsed: options?.collapsed,
      locked: options?.locked,
      visible: options?.visible,
      children: ensureArray(options?.children)
    }
  };
};

export const getDefaultSectionId = () => DEFAULT_SECTION_ID;

export const getSectionOrder = () => sectionOrder.slice();

export const getSectionCounter = () => sectionCounter;

export const listSections = () => Array.from(sections.values()).map(cloneSection);

export const getSection = (sectionId) => cloneSection(sections.get(sectionId));

export const getGraphAssignments = () => new Map(graphToSection);

export const resetSectionsModel = () => {
  sections.clear();
  sectionOrder = [];
  sectionCounter = 0;
  graphToSection.clear();
};

export const ensureDefaultSection = () => {
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
      base.children = ensureArray(base.children);
      base.visible = base.visible !== false;
      base.locked = true;
    }
  }
  if (!sectionOrder.includes(DEFAULT_SECTION_ID)) {
    sectionOrder.unshift(DEFAULT_SECTION_ID);
  }
  return cloneSection(sections.get(DEFAULT_SECTION_ID));
};

const generateSectionId = () => {
  sectionCounter += 1;
  return `section_${Math.random().toString(36).slice(2, 8)}${sectionCounter}`;
};

export const createSection = (input, maybeOptions = {}) => {
  ensureDefaultSection();
  const { name, options } = normalizeCreateSectionInput(input, maybeOptions);
  const {
    parentId = null,
    id: incomingId,
    collapsed = false,
    locked = false,
    visible = true,
    children = []
  } = options || {};
  const resolvedParent = parentId && sections.has(parentId) ? sections.get(parentId) : null;
  if (resolvedParent && !Array.isArray(resolvedParent.children)) {
    resolvedParent.children = [];
  }
  let id = incomingId;
  if (!id) {
    id = generateSectionId();
  } else if (sections.has(id)) {
    return cloneSection(sections.get(id));
  } else {
    sectionCounter += 1;
  }
  const parentChildCount = Array.isArray(resolvedParent?.children) ? resolvedParent.children.length : 0;
  const defaultName = typeof name === 'string' && name.trim()
    ? name.trim()
    : (resolvedParent
      ? `Subgroup ${parentChildCount + 1}`
      : `Group ${sectionOrder.length + 1}`);
  const section = {
    id,
    name: defaultName,
    collapsed: !!collapsed,
    locked: !!locked,
    parentId: resolvedParent ? resolvedParent.id : null,
    children: ensureArray(children).slice(),
    visible: visible !== false
  };
  sections.set(id, section);
  if (section.parentId) {
    if (!resolvedParent.children.includes(id)) {
      resolvedParent.children.push(id);
    }
  } else if (!sectionOrder.includes(id)) {
    sectionOrder.push(id);
  }
  // UI should re-render after this method
  return cloneSection(section);
};

export const renameSection = (sectionId, name) => {
  const section = sections.get(sectionId);
  if (!section) return null;
  if (section.locked && sectionId !== DEFAULT_SECTION_ID) return cloneSection(section);
  const trimmed = name?.trim();
  if (!trimmed) return cloneSection(section);
  section.name = trimmed;
  // UI should re-render after this method
  return cloneSection(section);
};

export const setSectionCollapsed = (sectionId, collapsed) => {
  const section = sections.get(sectionId);
  if (!section) return null;
  section.collapsed = !!collapsed;
  // UI should re-render after this method
  return cloneSection(section);
};

export const setSectionVisible = (sectionId, visible) => {
  const section = sections.get(sectionId);
  if (!section) return null;
  section.visible = visible !== false;
  // UI should re-render after this method
  return cloneSection(section);
};

export const toggleSectionVisibility = (sectionId) => {
  const section = sections.get(sectionId);
  if (!section) return null;
  section.visible = section.visible === false;
  // UI should re-render after this method
  return cloneSection(section);
};

export const collectSectionAncestors = (sectionId) => {
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

export const collectSectionDescendants = (sectionId) => {
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

export const isSectionVisible = (sectionId) => {
  let current = sections.get(sectionId);
  while (current) {
    if (current.visible === false) return false;
    current = current.parentId ? sections.get(current.parentId) : null;
  }
  return true;
};

const removeChildReference = (sectionId) => {
  const section = sections.get(sectionId);
  if (!section) return;
  if (section.parentId && sections.has(section.parentId)) {
    const parent = sections.get(section.parentId);
    parent.children = ensureArray(parent.children).filter((id) => id !== sectionId);
  } else {
    sectionOrder = sectionOrder.filter((id) => id !== sectionId);
  }
};

const reassignGraphsFromSections = (sectionIds, targetId = DEFAULT_SECTION_ID) => {
  ensureDefaultSection();
  const reassigned = [];
  const target = sections.has(targetId) ? targetId : DEFAULT_SECTION_ID;
  const toReassign = new Set(sectionIds);
  graphToSection.forEach((value, graphId) => {
    if (toReassign.has(value)) {
      graphToSection.set(graphId, target);
      reassigned.push(graphId);
    }
  });
  return reassigned;
};

export const deleteSection = (sectionId) => {
  if (!sectionId || sectionId === DEFAULT_SECTION_ID) {
    return { removed: [], reassignedGraphs: [] };
  }
  const section = sections.get(sectionId);
  if (!section || section.locked) {
    return { removed: [], reassignedGraphs: [] };
  }
  const descendants = collectSectionDescendants(sectionId);
  const reassignedGraphs = reassignGraphsFromSections(descendants, DEFAULT_SECTION_ID);
  descendants.forEach((id) => {
    if (!sections.has(id)) return;
    removeChildReference(id);
    sections.delete(id);
  });
  ensureDefaultSection();
  // UI should re-render after this method
  return {
    removed: descendants.filter((id) => id !== DEFAULT_SECTION_ID),
    reassignedGraphs
  };
};

export const serializeSections = () => ({
  counter: sectionCounter,
  order: sectionOrder.slice(),
  items: Array.from(sections.values()).map((section) => ({
    id: section.id,
    name: section.name,
    collapsed: !!section.collapsed,
    locked: !!section.locked,
    parentId: section.parentId || null,
    children: ensureArray(section.children).slice(),
    visible: section.visible !== false
  }))
});

export const restoreSections = (snapshot) => {
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
      children: ensureArray(item.children).slice(),
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
      section.children = ensureArray(section.children).slice();
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

export const registerGraph = (graphId, sectionId = DEFAULT_SECTION_ID) => {
  if (!graphId) return DEFAULT_SECTION_ID;
  ensureDefaultSection();
  const resolved = sections.has(sectionId) ? sectionId : DEFAULT_SECTION_ID;
  graphToSection.set(graphId, resolved);
  return resolved;
};

export const unregisterGraph = (graphId) => {
  if (!graphId) return false;
  return graphToSection.delete(graphId);
};

export const assignGraphToSection = (graphId, sectionId) => {
  if (!graphId) return DEFAULT_SECTION_ID;
  ensureDefaultSection();
  const resolved = sections.has(sectionId) ? sectionId : DEFAULT_SECTION_ID;
  graphToSection.set(graphId, resolved);
  // UI should re-render after this method
  return resolved;
};

export const getGraphSection = (graphId) => graphToSection.get(graphId) || DEFAULT_SECTION_ID;

export const getGraphsInSection = (sectionId) => {
  const target = sectionId || DEFAULT_SECTION_ID;
  const result = [];
  graphToSection.forEach((value, graphId) => {
    if (value === target) {
      result.push(graphId);
    }
  });
  return result;
};

export const reassignGraphsToDefault = (sectionIds) => {
  const ids = Array.isArray(sectionIds) ? sectionIds : [sectionIds];
  return reassignGraphsFromSections(ids, DEFAULT_SECTION_ID);
};

export const createSectionsModel = (snapshot) => {
  resetSectionsModel();
  if (snapshot) {
    restoreSections(snapshot);
  } else {
    ensureDefaultSection();
  }
  return {
    snapshot: () => serializeSections(),
    ensureDefaultSection: () => ensureDefaultSection(),
    createSection: (payload = {}) => createSection(payload),
    deleteSection: (sectionId) => deleteSection(sectionId),
    renameSection: (sectionId, name) => renameSection(sectionId, name),
    setSectionCollapsed: (sectionId, collapsed) => setSectionCollapsed(sectionId, collapsed),
    setSectionVisible: (sectionId, visible) => setSectionVisible(sectionId, visible),
    toggleSectionVisibility: (sectionId) => toggleSectionVisibility(sectionId),
    collectSectionAncestors: (sectionId) => collectSectionAncestors(sectionId),
    collectSectionDescendants: (sectionId) => collectSectionDescendants(sectionId),
    isSectionVisible: (sectionId) => isSectionVisible(sectionId),
    assignGraphToSection: (graphId, sectionId) => assignGraphToSection(graphId, sectionId),
    registerGraph: (graphId, sectionId) => registerGraph(graphId, sectionId),
    unregisterGraph: (graphId) => unregisterGraph(graphId),
    getGraphSection: (graphId) => getGraphSection(graphId),
    getGraphsInSection: (sectionId) => getGraphsInSection(sectionId),
    reassignGraphsToDefault: (ids) => reassignGraphsToDefault(ids),
    getGraphAssignments: () => getGraphAssignments(),
    getSection: (sectionId) => getSection(sectionId),
    listSections: () => listSections(),
    getSectionOrder: () => getSectionOrder(),
    getSectionCounter: () => getSectionCounter(),
    getOrder: () => getSectionOrder(),
    getGraphs: (sectionId) => getGraphsInSection(sectionId),
    load: (nextSnapshot) => {
      resetSectionsModel();
      if (nextSnapshot) {
        restoreSections(nextSnapshot);
      } else {
        ensureDefaultSection();
      }
    }
  };
};
