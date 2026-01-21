const ensureArray = (value) => (Array.isArray(value) ? value : []);

const buildCopyLabel = (value, fallback = 'Copy') => {
  const base = typeof value === 'string' ? value.trim() : '';
  if (!base) return fallback;
  return `${base} Copy`;
};

const resolveSiblingBefore = (sectionManager, sectionId) => {
  const section = sectionManager?.get?.(sectionId);
  if (!section) return null;
  const parentId = section.parentId || null;
  const siblings = parentId
    ? ensureArray(sectionManager.get(parentId)?.children)
    : ensureArray(sectionManager.getOrder?.());
  const idx = siblings.indexOf(sectionId);
  if (idx === -1 || idx + 1 >= siblings.length) return null;
  return siblings[idx + 1];
};

export function createBrowserDuplicateActions({
  panelsModel,
  sectionManager,
  registerPanel,
  resolvePanelTitle,
  pushHistory,
  persist,
  updateHistoryButtons,
  showToast
} = {}) {
  const resolveTitle = typeof resolvePanelTitle === 'function'
    ? resolvePanelTitle
    : (record) => (typeof record?.title === 'string' ? record.title.trim() : 'Panel');

  const duplicatePanelRecord = (record, {
    sectionId,
    offset = 24,
    skipHistory = true,
    skipPersist = true,
    allowToast = false
  } = {}) => {
    if (!record || typeof registerPanel !== 'function') return null;
    const baseTitle = resolveTitle(record);
    const nextTitle = buildCopyLabel(baseTitle, 'Graph Copy');
    const candidate = {
      ...record,
      id: undefined,
      index: undefined,
      zIndex: undefined,
      title: nextTitle,
      sectionId: sectionId || record.sectionId
    };
    if (Number.isFinite(candidate.x)) candidate.x += offset;
    if (Number.isFinite(candidate.y)) candidate.y += offset;
    const nextId = registerPanel(candidate, {
      skipHistory,
      skipPersist,
      useModelState: true
    });
    if (nextId && allowToast && typeof showToast === 'function') {
      showToast(`${nextTitle} created.`, 'success');
    }
    return nextId;
  };

  const duplicatePanel = (panelId, {
    sectionId,
    offset = 24,
    skipHistory = false,
    skipPersist = false,
    allowToast = true
  } = {}) => {
    if (!panelId || !panelsModel?.getPanel) return false;
    const record = panelsModel.getPanel(panelId);
    if (!record) return false;
    if (!skipHistory) {
      pushHistory?.();
    }
    const nextId = duplicatePanelRecord(record, {
      sectionId: sectionId || record.sectionId,
      offset,
      skipHistory: true,
      skipPersist: true,
      allowToast
    });
    if (!skipPersist) {
      persist?.();
    }
    updateHistoryButtons?.();
    return nextId || false;
  };

  const duplicateSectionTree = (sectionId, { parentId = null } = {}) => {
    const section = sectionManager?.get?.(sectionId);
    if (!section) return null;
    const nextName = buildCopyLabel(section.name || 'Group', 'Group Copy');
    const newSection = sectionManager?.createSection?.(nextName, { parentId });
    if (!newSection?.id) return null;
    sectionManager?.setSectionCollapsed?.(newSection.id, !!section.collapsed);
    sectionManager?.setSectionVisible?.(newSection.id, section.visible !== false);

    const panels = panelsModel?.getPanelsInSection?.(sectionId) || [];
    panels.forEach((panel) => {
      duplicatePanelRecord(panel, {
        sectionId: newSection.id,
        skipHistory: true,
        skipPersist: true,
        allowToast: false
      });
    });

    ensureArray(section.children).forEach((childId) => {
      duplicateSectionTree(childId, { parentId: newSection.id });
    });

    return newSection.id;
  };

  const duplicateSection = (sectionId, {
    parentId,
    beforeSectionId,
    skipHistory = false,
    skipPersist = false,
    allowToast = true
  } = {}) => {
    if (!sectionId || !sectionManager?.get) return false;
    const section = sectionManager.get(sectionId);
    if (!section) return false;
    if (!skipHistory) {
      pushHistory?.();
    }
    const sourceParent = section.parentId || null;
    const targetParentId = parentId === undefined
      ? sourceParent
      : (parentId || null);
    const shouldPlaceAfterSource = beforeSectionId === undefined && targetParentId === sourceParent;
    const resolvedBefore = shouldPlaceAfterSource
      ? resolveSiblingBefore(sectionManager, sectionId)
      : (beforeSectionId || null);
    const newSectionId = duplicateSectionTree(sectionId, { parentId: targetParentId });
    if (newSectionId && typeof sectionManager.moveSection === 'function' && resolvedBefore) {
      sectionManager.moveSection(newSectionId, { parentId: targetParentId, beforeSectionId: resolvedBefore });
    }
    if (newSectionId && allowToast && typeof showToast === 'function') {
      showToast(`${buildCopyLabel(section.name || 'Group', 'Group Copy')} created.`, 'success');
    }
    if (!skipPersist) {
      persist?.();
    }
    updateHistoryButtons?.();
    return newSectionId || false;
  };

  return {
    duplicatePanel,
    duplicateSection
  };
}
