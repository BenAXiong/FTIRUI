const defaultEnsureArray = (value) => (Array.isArray(value) ? value : []);

export function createSectionManager({
  defaultSectionId = 'section_all',
  ensureArray = defaultEnsureArray,
  idFactory
} = {}) {
  if (typeof defaultSectionId !== 'string' || !defaultSectionId) {
    throw new Error('createSectionManager requires a defaultSectionId');
  }

  const sections = new Map();
  let sectionOrder = [];
  let sectionCounter = 0;

  const generateSectionId = (nextCounter) => {
    if (typeof idFactory === 'function') {
      return idFactory(nextCounter);
    }
    return `section_${Math.random().toString(36).slice(2, 8)}${nextCounter}`;
  };

  const ensureDefaultSection = () => {
    if (!sections.has(defaultSectionId)) {
      sections.set(defaultSectionId, {
        id: defaultSectionId,
        name: 'Group 1',
        collapsed: false,
        locked: true,
        parentId: null,
        children: [],
        visible: true
      });
    } else {
      const base = sections.get(defaultSectionId);
      base.name = base.name && base.name !== 'All' ? base.name : 'Group 1';
      base.collapsed = false;
      base.locked = true;
      base.parentId = null;
      base.children = ensureArray(base.children);
      base.visible = base.visible !== false;
    }
    if (!sectionOrder.includes(defaultSectionId)) {
      sectionOrder.unshift(defaultSectionId);
    }
  };

  const reset = ({ withDefault = true } = {}) => {
    sectionCounter = 0;
    sections.clear();
    sectionOrder = [];
    if (withDefault) {
      ensureDefaultSection();
    }
  };

  const get = (sectionId) => {
    if (!sectionId) return null;
    return sections.get(sectionId) || null;
  };

  const has = (sectionId) => {
    if (!sectionId) return false;
    return sections.has(sectionId);
  };

  const detachSectionFromParent = (sectionId) => {
    const section = get(sectionId);
    if (!section) return;
    const parentId = section.parentId || null;
    if (parentId) {
      const parent = get(parentId);
      if (parent) {
        parent.children = ensureArray(parent.children).filter((childId) => childId !== sectionId);
      }
    } else {
      sectionOrder = sectionOrder.filter((id) => id !== sectionId);
    }
  };

  const insertSectionIntoParent = (sectionId, parentId, beforeSectionId) => {
    if (parentId) {
      const parent = get(parentId);
      if (!parent) return false;
      const normalized = ensureArray(parent.children).filter((childId) => childId !== sectionId);
      let insertIdx = normalized.length;
      if (beforeSectionId && normalized.includes(beforeSectionId)) {
        insertIdx = normalized.indexOf(beforeSectionId);
      }
      normalized.splice(insertIdx, 0, sectionId);
      parent.children = normalized;
      return true;
    }
    const normalized = sectionOrder.filter((id) => id !== sectionId);
    let insertIdx = normalized.length;
    if (beforeSectionId && normalized.includes(beforeSectionId)) {
      insertIdx = normalized.indexOf(beforeSectionId);
    }
    normalized.splice(insertIdx, 0, sectionId);
    sectionOrder = normalized;
    return true;
  };

  const isSectionAncestor = (ancestorId, sectionId) => {
    if (!ancestorId || !sectionId || ancestorId === sectionId) return false;
    let current = get(sectionId)?.parentId || null;
    const guard = new Set();
    while (current) {
      if (current === ancestorId) return true;
      if (guard.has(current)) break;
      guard.add(current);
      current = get(current)?.parentId || null;
    }
    return false;
  };

  const createSection = (name, { parentId = null } = {}) => {
    ensureDefaultSection();
    sectionCounter += 1;
    const normalizedParent = parentId && has(parentId) ? parentId : null;
    const parent = normalizedParent ? get(normalizedParent) : null;
    const isSubgroup = !!parent;
    if (isSubgroup && parent && !Array.isArray(parent.children)) {
      parent.children = [];
    }
    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const defaultName = trimmedName
      || (isSubgroup
        ? `Subgroup ${(ensureArray(parent?.children).length || 0) + 1}`
        : `Group ${sectionOrder.length + 1}`);
    const id = generateSectionId(sectionCounter);
    const section = {
      id,
      name: defaultName,
      collapsed: false,
      locked: false,
      parentId: normalizedParent,
      children: [],
      visible: true
    };
    sections.set(id, section);
    if (section.parentId) {
      const host = get(section.parentId);
      if (host) {
        host.children = ensureArray(host.children);
        host.children.push(id);
      }
    } else {
      sectionOrder.push(id);
    }
    return section;
  };

  const collectDescendants = (sectionId) => {
    const ids = [];
    const visit = (id) => {
      const node = get(id);
      if (!node) return;
      ids.push(id);
      ensureArray(node.children).forEach(visit);
    };
    visit(sectionId);
    return ids;
  };

  const deleteSection = (sectionId) => {
    if (!sectionId || sectionId === defaultSectionId) return;
    const section = get(sectionId);
    if (!section) return;
    const children = ensureArray(section.children).slice();
    children.forEach((childId) => deleteSection(childId));
    detachSectionFromParent(sectionId);
    sections.delete(sectionId);
  };

  const renameSection = (sectionId, name) => {
    const section = get(sectionId);
    if (!section) return;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) return;
    section.name = trimmed;
  };

  const setSectionCollapsed = (sectionId, collapsed) => {
    const section = get(sectionId);
    if (!section) return;
    section.collapsed = !!collapsed;
  };

  const setSectionVisible = (sectionId, visible) => {
    const section = get(sectionId);
    if (!section) return;
    section.visible = visible !== false;
  };

  const toggleSectionVisibility = (sectionId) => {
    const section = get(sectionId);
    if (!section) return;
    setSectionVisible(sectionId, !(section.visible !== false));
  };

  const isSectionVisible = (sectionId) => {
    let current = get(sectionId);
    const guard = new Set();
    while (current) {
      if (current.visible === false) return false;
      const parentId = current.parentId || null;
      if (!parentId || guard.has(parentId)) break;
      guard.add(parentId);
      current = get(parentId);
    }
    return true;
  };

  const moveSection = (sectionId, { parentId = null, beforeSectionId = null } = {}) => {
    if (!sectionId || sectionId === defaultSectionId) return false;
    const section = get(sectionId);
    if (!section || section.locked) return false;

    const targetParentId = parentId && has(parentId) ? parentId : null;
    const currentParentId = section.parentId || null;

    if (beforeSectionId === sectionId) return false;
    if (!currentParentId && targetParentId) return false;
    if (targetParentId && (targetParentId === sectionId || isSectionAncestor(sectionId, targetParentId))) {
      return false;
    }
    if (targetParentId && get(targetParentId)?.locked) {
      return false;
    }

    let normalizedBefore = beforeSectionId && beforeSectionId !== sectionId && has(beforeSectionId)
      ? beforeSectionId
      : null;

    if (normalizedBefore) {
      const beforeParentId = get(normalizedBefore)?.parentId || null;
      if (beforeParentId !== targetParentId) {
        normalizedBefore = null;
      }
    }

    if (currentParentId === targetParentId) {
      if (targetParentId) {
        const parent = get(targetParentId);
        if (!parent) return false;
        const children = ensureArray(parent.children).slice();
        const currentIdx = children.indexOf(sectionId);
        if (currentIdx === -1) return false;
        let targetIdx = children.length;
        if (normalizedBefore) {
          targetIdx = children.indexOf(normalizedBefore);
          if (targetIdx === -1) {
            normalizedBefore = null;
          }
        }
        if (!normalizedBefore) {
          targetIdx = children.length;
        }
        if (currentIdx === targetIdx || currentIdx + 1 === targetIdx) {
          return false;
        }
      } else {
        const currentIdx = sectionOrder.indexOf(sectionId);
        if (currentIdx === -1) return false;
        let targetIdx = sectionOrder.length;
        if (normalizedBefore) {
          targetIdx = sectionOrder.indexOf(normalizedBefore);
          if (targetIdx === -1) {
            normalizedBefore = null;
          }
        }
        if (!normalizedBefore) {
          targetIdx = sectionOrder.length;
        }
        if (currentIdx === targetIdx || currentIdx + 1 === targetIdx) {
          return false;
        }
      }
    }

    detachSectionFromParent(sectionId);
    section.parentId = targetParentId;
    insertSectionIntoParent(sectionId, targetParentId, normalizedBefore);
    return true;
  };

  const snapshot = () => ({
    counter: sectionCounter,
    order: sectionOrder.slice(),
    items: Array.from(sections.values()).map((section) => ({
      id: section.id,
      name: section.name,
      collapsed: !!section.collapsed,
      locked: !!section.locked,
      parentId: section.parentId || null,
      children: ensureArray(section.children),
      visible: section.visible !== false
    }))
  });

  const load = (snapshotValue) => {
    const snapshotData = snapshotValue || {};
    sections.clear();
    sectionOrder = [];
    sectionCounter = Math.max(0, Number(snapshotData.counter) || 0);
    const items = Array.isArray(snapshotData.items) ? snapshotData.items : [];
    items.forEach((item) => {
      sections.set(item.id, {
        id: item.id,
        name: item.name || 'Group',
        collapsed: !!item.collapsed,
        locked: !!item.locked,
        parentId: item.parentId || null,
        children: ensureArray(item.children),
        visible: item.visible !== false
      });
    });
    const inferredOrder = Array.isArray(snapshotData.order)
      ? snapshotData.order.slice().filter((id) => sections.has(id))
      : Array.from(sections.values())
          .filter((section) => !section.parentId)
          .map((section) => section.id);
    sectionOrder = inferredOrder;
    sections.forEach((section) => {
      if (section.parentId && !sections.has(section.parentId)) {
        section.parentId = null;
        section.children = ensureArray(section.children);
        if (!sectionOrder.includes(section.id)) {
          sectionOrder.push(section.id);
        }
      }
      if (Array.isArray(section.children)) {
        section.children = section.children.filter((childId) => sections.has(childId));
      } else {
        section.children = [];
      }
    });
    ensureDefaultSection();
  };

  reset();

  return {
    get defaultSectionId() {
      return defaultSectionId;
    },
    get size() {
      return sections.size;
    },
    reset,
    ensureDefaultSection,
    createSection,
    deleteSection,
    renameSection,
    setSectionCollapsed,
    setSectionVisible,
    toggleSectionVisibility,
    isSectionVisible,
    isSectionAncestor,
    moveSection,
    collectDescendants,
    snapshot,
    load,
    get,
    has,
    getAll: () => Array.from(sections.values()),
    getOrder: () => sectionOrder.slice(),
    getMap: () => sections,
    getCounter: () => sectionCounter
  };
}

