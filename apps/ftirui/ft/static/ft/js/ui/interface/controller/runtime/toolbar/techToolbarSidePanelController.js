const normalizeId = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const resolveLabel = (item, fallback) => {
  if (item?.label) return item.label;
  const toggle = item?.toggle || null;
  const ariaLabel = toggle?.getAttribute?.('aria-label');
  if (ariaLabel) return ariaLabel;
  const title = toggle?.getAttribute?.('title');
  if (title) return title;
  return fallback;
};

const buildTabsFromItems = (items = []) => ([
  {
    id: 'tech',
    label: 'Tech',
    items
  }
]);

export function createTechToolbarSidePanelController({
  dom = {},
  items = [],
  tabs = [],
  preferences = null,
  onClose = () => {}
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const panel = dom.panel
    || documentRoot?.querySelector?.('[data-tech-side-panel]')
    || null;
  const body = dom.body
    || panel?.querySelector?.('[data-tech-side-panel-body]')
    || panel;
  const tabsRow = dom.tabs
    || panel?.querySelector?.('[data-tech-side-panel-tabs]')
    || null;
  const searchWrap = dom.searchWrap
    || panel?.querySelector?.('[data-tech-panel-search]')
    || null;
  const searchInput = dom.searchInput
    || panel?.querySelector?.('[data-tech-panel-search-input]')
    || null;
  const searchToggle = dom.searchToggle
    || panel?.querySelector?.('[data-tech-panel-action="search-toggle"]')
    || null;
  const toggleAllBtn = dom.toggleAll
    || panel?.querySelector?.('[data-tech-panel-action="toggle-all"]')
    || null;
  const closeBtn = dom.closeBtn
    || panel?.querySelector?.('[data-tech-panel-action="close"]')
    || null;

  if (!panel || !body) return null;

  const menuState = new Map();
  const sectionState = new Map();
  const tabItems = Array.isArray(tabs) && tabs.length
    ? tabs.map((tab) => ({
      id: tab.id || normalizeId(tab.label) || 'tab',
      label: tab.label || tab.id || 'Tab',
      items: Array.isArray(tab.items) ? tab.items : []
    }))
    : buildTabsFromItems(items);
  const listeners = [];
  let activeMode = 'menus';
  let baseVisible = true;
  let activeTabId = tabItems[0]?.id || 'tech';
  let searchTerm = '';

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const getStoredState = () => preferences?.readTechToolbarPanelState?.(null) || null;
  const storedState = getStoredState();
  const collapsedByTab = new Map();

  tabItems.forEach((tab) => {
    const storedCollapsed = storedState?.collapsed?.[tab.id];
    if (Array.isArray(storedCollapsed)) {
      collapsedByTab.set(tab.id, new Set(storedCollapsed));
    }
  });

  if (storedState?.activeTab) {
    activeTabId = storedState.activeTab;
  }

  const persistState = () => {
    const collapsed = {};
    collapsedByTab.forEach((set, tabId) => {
      collapsed[tabId] = Array.from(set);
    });
    preferences?.writeTechToolbarPanelState?.({
      activeTab: activeTabId,
      collapsed
    });
  };

  const ensureMenuState = (menu) => {
    if (!menu || menuState.has(menu)) return menuState.get(menu) || null;
    const state = {
      parent: menu.parentElement,
      nextSibling: menu.nextElementSibling,
      style: menu.getAttribute('style'),
      wasShown: menu.classList.contains('show')
    };
    menuState.set(menu, state);
    return state;
  };

  const mountMenu = (menu, container) => {
    if (!menu || !container) return;
    ensureMenuState(menu);
    menu.classList.add('workspace-tech-panel-menu', 'show');
    menu.removeAttribute('style');
    container.appendChild(menu);
  };

  const restoreMenu = (menu) => {
    const state = menuState.get(menu);
    if (!menu || !state) return;
    menu.classList.remove('workspace-tech-panel-menu');
    if (state.wasShown) {
      menu.classList.add('show');
    } else {
      menu.classList.remove('show');
    }
    if (state.style) {
      menu.setAttribute('style', state.style);
    } else {
      menu.removeAttribute('style');
    }
    const parent = state.parent;
    if (!parent) return;
    const nextSibling = state.nextSibling;
    if (nextSibling && nextSibling.parentNode === parent) {
      parent.insertBefore(menu, nextSibling);
    } else {
      parent.appendChild(menu);
    }
  };

  const resolveSectionId = (tabId, item, index) => {
    const base = item?.id || item?.key || item?.label || `section-${index + 1}`;
    return `${tabId}-${normalizeId(base)}`;
  };

  const resolveCollapseSet = (tabId, fallback = true) => {
    if (collapsedByTab.has(tabId)) return collapsedByTab.get(tabId);
    const set = new Set();
    if (!storedState && fallback) {
      collapsedByTab.set(tabId, set);
    }
    return set;
  };

  const applyCollapseState = (section, tabId, sectionId, collapsed) => {
    const collapseSet = collapsedByTab.get(tabId) || new Set();
    if (collapsed) {
      collapseSet.add(sectionId);
    } else {
      collapseSet.delete(sectionId);
    }
    collapsedByTab.set(tabId, collapseSet);
    section.classList.toggle('is-collapsed', collapsed);
  };

  const buildPlaceholder = (item, bodyEl) => {
    const placeholder = documentRoot?.createElement?.('div');
    if (!placeholder || !bodyEl) return;
    placeholder.className = 'workspace-tech-panel-placeholder text-muted';
    placeholder.textContent = item?.placeholderText || 'Placeholder section.';
    bodyEl.appendChild(placeholder);
  };

  const buildSections = () => {
    if (sectionState.size) return;
    tabItems.forEach((tab) => {
      const collapseSet = resolveCollapseSet(tab.id);
      const defaultCollapsed = !storedState;
      tab.items.forEach((item, index) => {
        const section = documentRoot?.createElement?.('section');
        const header = documentRoot?.createElement?.('button');
        const bodyEl = documentRoot?.createElement?.('div');
        if (!section || !header || !bodyEl) return;
        const label = resolveLabel(item, `TB2 ${index + 1}`);
        const sectionId = resolveSectionId(tab.id, item, index);
        section.className = 'workspace-tech-panel-section';
        if (item?.id === 'graph-type') {
          section.classList.add('workspace-tech-panel-section--graph-type');
        }
        section.dataset.sectionId = sectionId;
        section.dataset.panelTab = tab.id;
        section.dataset.sectionLabel = label.toLowerCase();
        header.type = 'button';
        header.className = 'workspace-tech-panel-section-header';
        const title = documentRoot?.createElement?.('span');
        const icon = documentRoot?.createElement?.('i');
        if (title) {
          title.textContent = label;
          header.appendChild(title);
        }
        if (icon) {
          icon.className = 'bi bi-chevron-down';
          icon.setAttribute('aria-hidden', 'true');
          header.appendChild(icon);
        }
        bodyEl.className = 'workspace-tech-panel-section-body';
        section.appendChild(header);
        section.appendChild(bodyEl);
        body.appendChild(section);
        sectionState.set(sectionId, {
          section,
          header,
          bodyEl,
          tabId: tab.id,
          label,
          menu: item?.menu || null,
          placeholder: item?.placeholder !== false,
          placeholderText: item?.placeholderText || ''
        });
        const shouldCollapse = collapseSet.has(sectionId) || defaultCollapsed;
        applyCollapseState(section, tab.id, sectionId, shouldCollapse);
        addListener(header, 'click', () => {
          const isCollapsed = section.classList.contains('is-collapsed');
          applyCollapseState(section, tab.id, sectionId, !isCollapsed);
          persistState();
          updateToggleAllButton();
        });
        if (!item?.menu && item?.placeholder !== false) {
          buildPlaceholder(item, bodyEl);
        }
      });
    });
  };

  const attachMenus = () => {
    sectionState.forEach((entry) => {
      if (!entry?.menu) return;
      mountMenu(entry.menu, entry.bodyEl);
    });
  };

  const restoreMenus = () => {
    sectionState.forEach((entry) => {
      if (!entry?.menu) return;
      restoreMenu(entry.menu);
    });
  };

  const setPanelVisibility = (visible) => {
    const next = !!visible;
    panel.hidden = !next;
    panel.setAttribute('aria-hidden', String(!next));
  };

  const setActiveTab = (tabId) => {
    const nextTab = tabItems.find((tab) => tab.id === tabId) || tabItems[0];
    if (!nextTab) return;
    activeTabId = nextTab.id;
    const buttons = Array.from(tabsRow?.querySelectorAll?.('[data-tech-panel-tab]') || []);
    buttons.forEach((button) => {
      const isActive = button.getAttribute('data-tech-panel-tab') === activeTabId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    sectionState.forEach(({ section, tabId: sectionTab }) => {
      section.hidden = sectionTab !== activeTabId;
    });
    persistState();
    updateToggleAllButton();
    applySearchFilter(searchTerm);
  };

  const applySearchFilter = (value = '') => {
    searchTerm = value.trim().toLowerCase();
    sectionState.forEach(({ section, tabId, label }) => {
      if (tabId !== activeTabId) return;
      if (!searchTerm) {
        section.hidden = false;
        return;
      }
      const haystack = `${label}`.toLowerCase();
      section.hidden = !haystack.includes(searchTerm);
    });
  };

  const toggleSearch = (forceOpen = null) => {
    const isSearching = panel.classList.contains('is-searching');
    const next = typeof forceOpen === 'boolean' ? forceOpen : !isSearching;
    panel.classList.toggle('is-searching', next);
    if (next) {
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    } else if (searchInput) {
      searchInput.value = '';
      applySearchFilter('');
    }
  };

  const updateToggleAllButton = () => {
    if (!toggleAllBtn) return;
    const sections = Array.from(sectionState.values()).filter((entry) => entry.tabId === activeTabId);
    if (!sections.length) return;
    const allCollapsed = sections.every(({ section }) => section.classList.contains('is-collapsed'));
    toggleAllBtn.setAttribute('title', allCollapsed ? 'Expand all' : 'Collapse all');
    toggleAllBtn.setAttribute('aria-label', allCollapsed ? 'Expand all sections' : 'Collapse all sections');
    const icon = toggleAllBtn.querySelector('i');
    if (icon) {
      icon.className = allCollapsed ? 'bi bi-arrows-expand' : 'bi bi-arrows-collapse';
    }
  };

  const toggleAllSections = () => {
    const entries = Array.from(sectionState.values()).filter((entry) => entry.tabId === activeTabId);
    if (!entries.length) return;
    const shouldExpand = entries.every(({ section }) => section.classList.contains('is-collapsed'));
    entries.forEach(({ section, tabId, sectionId }) => {
      applyCollapseState(section, tabId, sectionId, !shouldExpand);
    });
    persistState();
    updateToggleAllButton();
  };

  buildSections();

  if (tabsRow) {
    addListener(tabsRow, 'click', (event) => {
      const button = event.target?.closest?.('[data-tech-panel-tab]');
      if (!button) return;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      const tabId = button.getAttribute('data-tech-panel-tab');
      if (tabId) {
        setActiveTab(tabId);
      }
    });
  }

  if (toggleAllBtn) {
    addListener(toggleAllBtn, 'click', (event) => {
      event.preventDefault();
      toggleAllSections();
    });
  }

  if (searchToggle) {
    addListener(searchToggle, 'click', (event) => {
      event.preventDefault();
      toggleSearch(true);
    });
  }

  if (searchInput) {
    addListener(searchInput, 'input', () => {
      applySearchFilter(searchInput.value);
    });
    addListener(searchInput, 'keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        toggleSearch(false);
      }
    });
  }

  if (closeBtn) {
    addListener(closeBtn, 'click', (event) => {
      event.preventDefault();
      if (typeof onClose === 'function') {
        onClose();
      }
    });
  }

  const handleOutsideClick = (event) => {
    if (!panel.classList.contains('is-searching')) return;
    if (searchWrap?.contains(event.target)) return;
    toggleSearch(false);
  };

  if (typeof document !== 'undefined') {
    addListener(document, 'pointerdown', handleOutsideClick);
  }

  if (!tabItems.some((tab) => tab.id === activeTabId)) {
    activeTabId = tabItems[0]?.id || 'tech';
  }
  setActiveTab(activeTabId);
  if (!storedState) {
    persistState();
  }

  const setMode = (mode, { visibleOverride = null } = {}) => {
    const nextMode = mode || 'menus';
    const showPanel = nextMode === 'panel';
    if (activeMode === nextMode) {
      setPanelVisibility(typeof visibleOverride === 'boolean' ? visibleOverride : (showPanel && baseVisible));
      return;
    }
    activeMode = nextMode;
    if (showPanel) {
      attachMenus();
    } else {
      restoreMenus();
    }
    setPanelVisibility(typeof visibleOverride === 'boolean' ? visibleOverride : (showPanel && baseVisible));
  };

  const setBaseVisibility = (visible) => {
    baseVisible = !!visible;
    if (activeMode === 'panel') {
      setPanelVisibility(baseVisible);
    }
  };

  const getReservedWidth = () => {
    if (panel.hidden) return 0;
    return Math.round(panel.getBoundingClientRect().width || 0);
  };

  return {
    setMode,
    setBaseVisibility,
    getReservedWidth,
    teardown() {
      restoreMenus();
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
      sectionState.clear();
    }
  };
}
