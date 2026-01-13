import { DEFAULT_TAG_LABEL } from '../panels/panelTagMapping.js';

const normalizeKey = (value) => String(value ?? '').trim().toLowerCase();

export function createCanvasTagsController({
  getPanelsOrdered = () => [],
  getPanelTagKey = () => DEFAULT_TAG_LABEL,
  panelSupportsPlot = () => true,
  dom = {}
} = {}) {
  const cached = {
    list: dom.list || null,
    actions: dom.actions || null
  };

  const ensureListEl = () => {
    if (cached.list && cached.list.isConnected) return cached.list;
    const actions = cached.actions
      || (typeof document !== 'undefined'
        ? document.querySelector('.workspace-hud-card__actions')
        : null);
    if (!actions) return null;
    cached.actions = actions;
    const existing = actions.querySelector('.workspace-tags-list');
    if (existing) {
      cached.list = existing;
      return existing;
    }
    const list = document.createElement('ul');
    list.className = 'dashboard-tags-list workspace-tags-list';
    actions.prepend(list);
    cached.list = list;
    return list;
  };

  const collectTags = () => {
    const result = [];
    const seen = new Set();
    const panels = Array.isArray(getPanelsOrdered()) ? getPanelsOrdered() : [];
    let plotCount = 0;
    panels.forEach((panel) => {
      const panelId = panel?.id;
      if (!panelId) return;
      if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) return;
      plotCount += 1;
      const raw = getPanelTagKey(panelId, DEFAULT_TAG_LABEL) || DEFAULT_TAG_LABEL;
      const label = String(raw).trim() || DEFAULT_TAG_LABEL;
      const key = normalizeKey(label);
      if (!key || seen.has(key)) return;
      seen.add(key);
      result.push(label);
    });
    if (!plotCount) return [];
    return result;
  };

  const renderTagList = (tags) => {
    if (!tags.length && !cached.list) return;
    const list = ensureListEl();
    if (!list) return;
    list.innerHTML = '';
    if (!tags.length) {
      list.hidden = true;
      return;
    }
    list.hidden = false;
    const fragment = document.createDocumentFragment();
    if (tags.length === 1) {
      const li = document.createElement('li');
      li.className = 'dashboard-tag';
      li.textContent = tags[0];
      fragment.appendChild(li);
    } else {
      const summaryItem = document.createElement('li');
      summaryItem.className = 'workspace-tags-summary';

      const summaryTag = document.createElement('span');
      summaryTag.className = 'dashboard-tag workspace-tag-summary';
      summaryTag.textContent = `${tags.length} techs`;
      summaryItem.appendChild(summaryTag);

      const dropdown = document.createElement('div');
      dropdown.className = 'workspace-tags-dropdown';

      const dropdownList = document.createElement('ul');
      dropdownList.className = 'dashboard-tags-list workspace-tags-dropdown-list';
      tags.forEach((tag) => {
        const item = document.createElement('li');
        item.className = 'dashboard-tag';
        item.textContent = tag;
        dropdownList.appendChild(item);
      });
      dropdown.appendChild(dropdownList);
      summaryItem.appendChild(dropdown);
      fragment.appendChild(summaryItem);
    }
    list.appendChild(fragment);
  };

  const refresh = () => {
    const tags = collectTags();
    renderTagList(tags);
    return tags;
  };

  return {
    refresh
  };
}
