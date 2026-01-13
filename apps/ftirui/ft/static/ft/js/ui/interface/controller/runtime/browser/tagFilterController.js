import { DEFAULT_TAG_LABEL, normalizeTagLabelToken } from '../panels/panelTagMapping.js';

const resolveTechSections = (menu) => {
  if (!menu) return [];
  const sections = [];
  const sectionEls = Array.from(menu.querySelectorAll('[data-tech-section]'));
  sectionEls.forEach((sectionEl) => {
    const sectionId = sectionEl.getAttribute('data-tech-section') || '';
    const title = sectionEl.querySelector('.workspace-tech-selector-title')?.textContent?.trim()
      || sectionId
      || 'Tags';
    const options = Array.from(sectionEl.querySelectorAll('[data-tech-option]')).map((option) => ({
      key: option.getAttribute('data-tech-option') || '',
      label: option.getAttribute('data-tech-label') || option.textContent || '',
      symbol: option.getAttribute('data-tech-symbol') || ''
    })).filter((option) => option.label);
    sections.push({ id: sectionId, title, options });
  });
  return sections;
};

export function createBrowserTagFilterController({
  filterMenu,
  techMenu,
  getPanelTagKey = () => DEFAULT_TAG_LABEL,
  onChange
} = {}) {
  if (!filterMenu || !techMenu) return null;
  const tagMenu = filterMenu.querySelector('[data-tag-filter-menu]');
  if (!tagMenu) return null;

  const sections = resolveTechSections(techMenu);
  const tagState = new Map();
  const sectionTokens = new Map();
  const buttonByToken = new Map();
  const sectionToggleById = new Map();

  const setButtonState = (token, enabled) => {
    const btn = buttonByToken.get(token);
    if (!btn) return;
    btn.classList.toggle('is-active', enabled);
    btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  };

  const setSectionState = (sectionId) => {
    const toggle = sectionToggleById.get(sectionId);
    if (!toggle) return;
    const tokens = sectionTokens.get(sectionId) || [];
    const enabledCount = tokens.filter((token) => tagState.get(token)?.enabled !== false).length;
    toggle.classList.toggle('is-active', enabledCount === tokens.length);
    toggle.classList.toggle('is-muted', enabledCount === 0);
    toggle.setAttribute('aria-pressed', enabledCount > 0 ? 'true' : 'false');
  };

  const emitChange = () => {
    if (typeof onChange === 'function') {
      onChange(getTagFiltersSnapshot());
    }
  };

  const toggleTagToken = (token) => {
    if (!tagState.has(token)) return;
    const entry = tagState.get(token);
    entry.enabled = entry.enabled === false;
    setButtonState(token, entry.enabled !== false);
    if (entry.sectionId) {
      setSectionState(entry.sectionId);
    }
    emitChange();
  };

  const toggleSection = (sectionId) => {
    const tokens = sectionTokens.get(sectionId) || [];
    if (!tokens.length) return;
    const shouldEnable = tokens.some((token) => tagState.get(token)?.enabled === false);
    tokens.forEach((token) => {
      const entry = tagState.get(token);
      if (!entry) return;
      entry.enabled = shouldEnable;
      setButtonState(token, entry.enabled);
    });
    setSectionState(sectionId);
    emitChange();
  };

  const buildMenu = () => {
    tagMenu.innerHTML = '';
    sections.forEach((section) => {
      const sectionId = section.id || section.title;
      const sectionWrap = document.createElement('div');
      sectionWrap.className = 'workspace-tech-selector-section workspace-browser-tag-section';
      sectionWrap.dataset.tagSection = sectionId;

      const sectionToggle = document.createElement('button');
      sectionToggle.type = 'button';
      sectionToggle.className = 'workspace-tech-selector-title workspace-browser-tag-section-toggle';
      sectionToggle.textContent = section.title;
      sectionToggle.dataset.tagSection = sectionId;
      sectionToggle.setAttribute('aria-pressed', 'true');
      sectionWrap.appendChild(sectionToggle);
      sectionToggleById.set(sectionId, sectionToggle);

      const grid = document.createElement('div');
      grid.className = 'workspace-tech-selector-grid workspace-browser-tag-grid';
      const tokens = [];

      section.options.forEach((option) => {
        const label = String(option.label || '').trim();
        if (!label) return;
        const token = normalizeTagLabelToken(label);
        if (!token) return;
        tokens.push(token);
        if (!tagState.has(token)) {
          tagState.set(token, {
            label,
            enabled: true,
            sectionId
          });
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline-secondary workspace-toolbar-btn workspace-toolbar-btn-no-counter workspace-tech-option workspace-browser-tag-option is-active';
        btn.dataset.tagToken = token;
        btn.dataset.tagLabel = label;
        btn.dataset.tagSection = sectionId;
        btn.title = label;

        const symbol = option.symbol || label.slice(0, 2).toUpperCase();
        btn.innerHTML = `<span class="workspace-toolbar-icon workspace-tech-symbol" aria-hidden="true">${symbol}</span>`;
        grid.appendChild(btn);
        buttonByToken.set(token, btn);
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          toggleTagToken(token);
        });
      });

      sectionTokens.set(sectionId, tokens);
      sectionToggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleSection(sectionId);
      });

      sectionWrap.appendChild(grid);
      tagMenu.appendChild(sectionWrap);
      setSectionState(sectionId);
    });
  };

  const isPanelTagEnabled = (panelId) => {
    const label = typeof getPanelTagKey === 'function'
      ? getPanelTagKey(panelId, DEFAULT_TAG_LABEL)
      : DEFAULT_TAG_LABEL;
    const token = normalizeTagLabelToken(label || DEFAULT_TAG_LABEL);
    if (!token) return true;
    const entry = tagState.get(token);
    if (!entry) return true;
    return entry.enabled !== false;
  };

  const hasActiveFilters = () => Array.from(tagState.values()).some((entry) => entry.enabled === false);

  const getTagFiltersSnapshot = () => {
    const snapshot = {};
    tagState.forEach((entry, token) => {
      snapshot[token] = entry.enabled !== false;
    });
    return snapshot;
  };

  buildMenu();

  return {
    isPanelTagEnabled,
    hasActiveFilters,
    getTagFiltersSnapshot
  };
}
