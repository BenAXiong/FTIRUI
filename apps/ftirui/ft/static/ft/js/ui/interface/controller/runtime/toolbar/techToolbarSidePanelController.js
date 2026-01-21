import { DEFAULT_TECH_KEY, resolveTechFeatureSet } from './techToolbarConfig.js';

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

const resolveToggleIcon = (toggle) => {
  if (!toggle) return null;
  const badge = toggle.querySelector('[data-tech-badge]');
  if (badge && !badge.hidden) return badge;
  const candidates = toggle.querySelectorAll(
    '[data-tech-icon-target], [data-graph-icon-target], [data-units-icon], .workspace-toolbar-icon, .workspace-tech-symbol'
  );
  for (const node of candidates) {
    if (node && !node.hidden) return node;
  }
  return null;
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
  techToggle = null,
  techOptions = [],
  defaultTech = DEFAULT_TECH_KEY,
  featureResolver = resolveTechFeatureSet,
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
  const behaviorToggle = dom.behaviorToggle
    || panel?.querySelector?.('[data-tech-panel-action="toggle-behavior"]')
    || null;
  const behaviorLabel = dom.behaviorLabel
    || panel?.querySelector?.('[data-tech-panel-behavior-label]')
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
  const iconObservers = new Map();
  const tabItems = Array.isArray(tabs) && tabs.length
    ? tabs.map((tab) => ({
      id: tab.id || normalizeId(tab.label) || 'tab',
      label: tab.label || tab.id || 'Tab',
      items: Array.isArray(tab.items) ? tab.items : [],
      aliasOf: tab.aliasOf || null
    }))
    : buildTabsFromItems(items);
  const listeners = [];
  let activeMode = 'menus';
  let baseVisible = true;
  let activeTabId = tabItems[0]?.id || 'tech';
  let visibleTabId = activeTabId;
  let searchTerm = '';

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const getStoredState = () => preferences?.readTechToolbarPanelState?.(null) || null;
  const storedState = getStoredState();
  const collapsedByTab = new Map();
  let sectionBehavior = storedState?.behavior === 'single' ? 'single' : 'free';
  const focusedByTab = new Map();

  if (storedState?.focused && typeof storedState.focused === 'object') {
    Object.entries(storedState.focused).forEach(([tabId, sectionId]) => {
      if (sectionId) focusedByTab.set(tabId, sectionId);
    });
  }

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
    const focused = {};
    focusedByTab.forEach((sectionId, tabId) => {
      if (sectionId) focused[tabId] = sectionId;
    });
    preferences?.writeTechToolbarPanelState?.({
      activeTab: activeTabId,
      collapsed,
      behavior: sectionBehavior,
      focused
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

  const updateSectionLabel = (entry, nextLabel) => {
    if (!entry || !nextLabel) return;
    entry.label = nextLabel;
    if (entry.labelNode) {
      entry.labelNode.textContent = nextLabel;
    }
    if (entry.section) {
      entry.section.dataset.sectionLabel = String(nextLabel || '').toLowerCase();
    }
  };

  const setSectionDisabled = (entry, disabled) => {
    if (!entry?.section || !entry?.header) return;
    entry.section.classList.toggle('is-disabled', disabled);
    entry.section.dataset.sectionDisabled = disabled ? 'true' : 'false';
    entry.header.disabled = !!disabled;
    entry.header.setAttribute('aria-disabled', String(!!disabled));
    if (disabled) {
      applyCollapseState(entry.section, entry.tabId, entry.sectionId, true);
    }
  };

  const updateSectionIcon = (entry) => {
    if (!entry?.toggle || !entry?.titleWrap) return;
    const source = resolveToggleIcon(entry.toggle);
    if (!source) return;
    entry.titleWrap.querySelectorAll('.workspace-tech-panel-section-icon').forEach((node) => node.remove());
    const nextIcon = source.cloneNode(true);
    nextIcon.classList.add('workspace-tech-panel-section-icon');
    nextIcon.setAttribute('aria-hidden', 'true');
    entry.titleWrap.prepend(nextIcon);
    entry.iconNode = nextIcon;
  };

  const attachIconObserver = (entry) => {
    if (!entry?.toggle || typeof MutationObserver === 'undefined') return;
    if (iconObservers.has(entry.toggle)) return;
    const observer = new MutationObserver(() => updateSectionIcon(entry));
    observer.observe(entry.toggle, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true
    });
    iconObservers.set(entry.toggle, observer);
  };

  const syncSectionIcons = () => {
    sectionState.forEach((entry) => {
      if (entry.toggle) updateSectionIcon(entry);
    });
  };

  const applyFeatureSet = (features) => {
    sectionState.forEach((entry) => {
      if (!entry.slot) return;
      const feature = features?.[entry.slot] || null;
      const nextLabel = feature?.label || entry.baseLabel || entry.label;
      updateSectionLabel(entry, nextLabel);
      const isPlaceholder = !!feature?.isPlaceholder || !!feature?.disabled;
      setSectionDisabled(entry, isPlaceholder);
    });
    updateToggleAllButton();
  };

  const applyFocusForTab = (tabId) => {
    const focusId = focusedByTab.get(tabId);
    const allowFocus = panel.dataset.panelLayout === 'tech_2';
    sectionState.forEach((entry) => {
      if (entry.tabId !== tabId) return;
      entry.section.classList.toggle('is-focused', allowFocus && entry.sectionId === focusId);
    });
  };

  const setFocusedSection = (tabId, sectionId) => {
    focusedByTab.set(tabId, sectionId);
    applyFocusForTab(tabId);
    persistState();
  };

  const collapseOtherSections = (tabId, keepSectionId) => {
    const entries = Array.from(sectionState.values()).filter((entry) => entry.tabId === tabId);
    entries.forEach((entry) => {
      if (entry.sectionId === keepSectionId) return;
      applyCollapseState(entry.section, entry.tabId, entry.sectionId, true);
    });
  };

  const enforceSingleBehavior = (tabId) => {
    const entries = Array.from(sectionState.values()).filter((entry) => entry.tabId === tabId);
    const expanded = entries.filter((entry) => !entry.section.classList.contains('is-collapsed'));
    if (expanded.length <= 1) return;
    const keepId = expanded[0]?.sectionId;
    entries.forEach((entry) => {
      applyCollapseState(entry.section, entry.tabId, entry.sectionId, entry.sectionId !== keepId);
    });
  };

  const updateBehaviorControl = () => {
    if (behaviorLabel) {
      behaviorLabel.textContent = sectionBehavior === 'single' ? 'Single' : 'Free';
    }
    if (behaviorToggle) {
      behaviorToggle.setAttribute('aria-pressed', String(sectionBehavior === 'single'));
    }
    panel.dataset.sectionBehavior = sectionBehavior;
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
        const contentWrap = documentRoot?.createElement?.('div');
        if (!section || !header || !bodyEl) return;
        const label = resolveLabel(item, `TB2 ${index + 1}`);
        const sectionId = resolveSectionId(tab.id, item, index);
        const slot = item?.slot ? Number(item.slot) : null;
        section.className = 'workspace-tech-panel-section';
        if (item?.id === 'graph-type') {
          section.classList.add('workspace-tech-panel-section--graph-type');
        }
        section.dataset.sectionId = sectionId;
        section.dataset.panelTab = tab.id;
        section.dataset.sectionLabel = label.toLowerCase();
        header.type = 'button';
        header.className = 'workspace-tech-panel-section-header';
        const titleWrap = documentRoot?.createElement?.('span');
        const title = documentRoot?.createElement?.('span');
        const icon = documentRoot?.createElement?.('i');
        const iconSource = item?.toggle?.querySelector?.('[aria-hidden="true"], [data-tech-icon-target], [data-graph-icon-target], [data-units-icon], .workspace-toolbar-icon, .workspace-tech-symbol');
        if (titleWrap) {
          titleWrap.className = 'workspace-tech-panel-section-title';
          if (iconSource) {
            const iconClone = iconSource.cloneNode(true);
            iconClone.classList.add('workspace-tech-panel-section-icon');
            iconClone.setAttribute('aria-hidden', 'true');
            titleWrap.appendChild(iconClone);
          }
          if (title) {
            title.textContent = label;
            titleWrap.appendChild(title);
          }
          header.appendChild(titleWrap);
        } else if (title) {
          title.textContent = label;
          header.appendChild(title);
        }
        if (icon) {
          icon.className = 'bi bi-chevron-down';
          icon.setAttribute('aria-hidden', 'true');
          header.appendChild(icon);
        }
        bodyEl.className = 'workspace-tech-panel-section-body';
        if (contentWrap) {
          contentWrap.className = 'workspace-tech-panel-section-content';
          contentWrap.appendChild(header);
          contentWrap.appendChild(bodyEl);
          section.appendChild(contentWrap);
        } else {
          section.appendChild(header);
          section.appendChild(bodyEl);
        }
        body.appendChild(section);
        sectionState.set(sectionId, {
          section,
          header,
          bodyEl,
          tabId: tab.id,
          label,
          baseLabel: label,
          titleWrap: titleWrap || null,
          iconNode: titleWrap?.querySelector?.('.workspace-tech-panel-section-icon') || null,
          labelNode: title || null,
          slot: Number.isFinite(slot) ? slot : null,
          sectionId,
          toggle: item?.toggle || null,
          menu: item?.menu || null,
          placeholder: item?.placeholder !== false,
          placeholderText: item?.placeholderText || ''
        });
        const shouldCollapse = collapseSet.has(sectionId) || defaultCollapsed;
        applyCollapseState(section, tab.id, sectionId, shouldCollapse);
        addListener(header, 'click', () => {
          const isCollapsed = section.classList.contains('is-collapsed');
          const nextCollapsed = !isCollapsed;
          applyCollapseState(section, tab.id, sectionId, nextCollapsed);
          if (!nextCollapsed && sectionBehavior === 'single') {
            collapseOtherSections(tab.id, sectionId);
          }
          persistState();
          updateToggleAllButton();
        });
        addListener(section, 'pointerdown', () => {
          if (panel.dataset.panelLayout !== 'tech_2') return;
          setFocusedSection(visibleTabId, sectionId);
        });
        if (item?.toggle) {
          addListener(item.toggle, 'workspace:graph-type-change', () => updateSectionIcon(sectionState.get(sectionId)));
          attachIconObserver(sectionState.get(sectionId));
        }
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
    visibleTabId = nextTab.aliasOf || nextTab.id;
    panel.dataset.panelLayout = activeTabId;
    const buttons = Array.from(tabsRow?.querySelectorAll?.('[data-tech-panel-tab]') || []);
    buttons.forEach((button) => {
      const isActive = button.getAttribute('data-tech-panel-tab') === activeTabId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });
    sectionState.forEach(({ section, tabId: sectionTab }) => {
      section.hidden = sectionTab !== visibleTabId;
    });
    if (sectionBehavior === 'single') {
      enforceSingleBehavior(visibleTabId);
    }
    applyFocusForTab(visibleTabId);
    persistState();
    updateToggleAllButton();
    applySearchFilter(searchTerm);
  };

  const applySearchFilter = (value = '') => {
    searchTerm = value.trim().toLowerCase();
    sectionState.forEach(({ section, tabId, label }) => {
      if (tabId !== visibleTabId) return;
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
    const sections = Array.from(sectionState.values()).filter((entry) => entry.tabId === visibleTabId);
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
    const entries = Array.from(sectionState.values()).filter((entry) => entry.tabId === visibleTabId);
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

  if (behaviorToggle) {
    addListener(behaviorToggle, 'click', (event) => {
      event.preventDefault();
      sectionBehavior = sectionBehavior === 'single' ? 'free' : 'single';
      updateBehaviorControl();
      if (sectionBehavior === 'single') {
        enforceSingleBehavior(visibleTabId);
      }
      persistState();
      updateToggleAllButton();
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

  const updateFeaturesFromTech = (techKey) => {
    const nextKey = techKey || techToggle?.dataset?.techKey || defaultTech;
    if (!nextKey || nextKey === defaultTech) {
      sectionState.forEach((entry) => {
        if (!entry.slot) return;
        updateSectionLabel(entry, entry.baseLabel);
        setSectionDisabled(entry, false);
      });
      syncSectionIcons();
      updateToggleAllButton();
      applySearchFilter(searchTerm);
      return;
    }
    const features = featureResolver({ techKey: nextKey, techOptions, defaultTech });
    applyFeatureSet(features);
    syncSectionIcons();
    applySearchFilter(searchTerm);
  };

  if (typeof document !== 'undefined') {
    addListener(document, 'pointerdown', handleOutsideClick);
  }

  if (!tabItems.some((tab) => tab.id === activeTabId)) {
    activeTabId = tabItems[0]?.id || 'tech';
  }
  updateBehaviorControl();
  setActiveTab(activeTabId);
  syncSectionIcons();
  if (techToggle) {
    updateFeaturesFromTech(techToggle.dataset?.techKey || defaultTech);
    addListener(techToggle, 'workspace:tech-change', (event) => {
      updateFeaturesFromTech(event?.detail?.key);
    });
  }
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
      iconObservers.forEach((observer) => {
        if (observer?.disconnect) observer.disconnect();
      });
      iconObservers.clear();
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
      sectionState.clear();
    }
  };
}
