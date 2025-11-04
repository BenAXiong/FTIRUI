/**
 * Build the data model required to render the workspace browser tree.
 *
 * @param {object} ctx Browser state context.
 * @returns {object} structured tree state.
 */
export function createBrowserTreeState({
  searchTerm = '',
  sections,
  sectionOrder,
  defaultSectionId,
  getPanelsOrdered,
  coerceNumber
}) {
  const term = (searchTerm || '').trim().toLowerCase();
  const orderedRecords = getPanelsOrdered();

  const sortedPanels = orderedRecords
    .map((record, position) => {
      const panelId = record?.id;
      if (!panelId) return null;
      const sectionId = sections.has(record.sectionId) ? record.sectionId : defaultSectionId;
      const rawIndex = coerceNumber(record.index, position + 1);
      const index = Number.isFinite(rawIndex) && rawIndex > 0 ? rawIndex : 0;
      return {
        panelId,
        record,
        position,
        meta: {
          id: panelId,
          sectionId,
          hidden: record.hidden === true,
          collapsed: record.collapsed === true,
          index
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aIndex = a.meta.index || (a.position + 1);
      const bIndex = b.meta.index || (b.position + 1);
      return aIndex - bIndex;
    });

  sortedPanels.forEach((item, idx) => {
    if (!item.meta.index || item.meta.index <= 0) {
      item.meta.index = idx + 1;
    }
  });

  const treeSections = sectionOrder
    .map((sectionId) => sections.get(sectionId))
    .filter(Boolean)
    .map((section) => ({
      id: section.id,
      name: section.name || 'Group',
      collapsed: section.collapsed === true,
      locked: section.locked === true,
      parentId: section.parentId || null
    }));

  const treeViewPanels = new Map();
  treeSections.forEach((section) => {
    treeViewPanels.set(section.id, []);
  });

  sortedPanels.forEach((item) => {
    const sectionId = sections.has(item.meta.sectionId) ? item.meta.sectionId : defaultSectionId;
    if (!treeViewPanels.has(sectionId)) {
      treeViewPanels.set(sectionId, []);
    }
    treeViewPanels.get(sectionId).push({
      id: item.panelId,
      name: (item.record?.name || `Graph ${item.meta.index}`),
      hidden: item.record?.hidden === true
    });
  });

  const panelsBySection = new Map();
  sections.forEach((section, id) => {
    panelsBySection.set(id, []);
  });

  sortedPanels.forEach((item) => {
    const sectionId = sections.has(item.meta.sectionId) ? item.meta.sectionId : defaultSectionId;
    item.meta.sectionId = sectionId;
    if (!panelsBySection.has(sectionId)) panelsBySection.set(sectionId, []);
    panelsBySection.get(sectionId).push(item);
  });

  const hasPanels = sortedPanels.length > 0;

  return {
    term,
    sortedPanels,
    treeSections,
    treeViewPanels,
    panelsBySection,
    hasPanels,
    searchTerm // retain original casing for consumers that need raw value
  };
}
