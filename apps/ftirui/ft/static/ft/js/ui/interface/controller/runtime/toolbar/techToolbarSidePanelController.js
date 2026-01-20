const resolveLabel = (item, index) => {
  if (item?.label) return item.label;
  const toggle = item?.toggle || null;
  const ariaLabel = toggle?.getAttribute?.('aria-label');
  if (ariaLabel) return ariaLabel;
  const title = toggle?.getAttribute?.('title');
  if (title) return title;
  return `TB2 ${index + 1}`;
};

export function createTechToolbarSidePanelController({
  dom = {},
  items = []
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const panel = dom.panel
    || documentRoot?.querySelector?.('[data-tech-side-panel]')
    || null;
  const body = dom.body
    || panel?.querySelector?.('[data-tech-side-panel-body]')
    || panel;

  if (!panel || !body || !Array.isArray(items) || !items.length) return null;

  const menuState = new Map();
  const sectionState = new Map();
  const listeners = [];
  let activeMode = 'menus';
  let baseVisible = true;

  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
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

  const buildSections = () => {
    if (sectionState.size) return;
    items.forEach((item, index) => {
      const section = documentRoot?.createElement?.('section');
      const header = documentRoot?.createElement?.('button');
      const bodyEl = documentRoot?.createElement?.('div');
      if (!section || !header || !bodyEl) return;
      section.className = 'workspace-tech-panel-section';
      header.type = 'button';
      header.className = 'workspace-tech-panel-section-header';
      const title = documentRoot?.createElement?.('span');
      const icon = documentRoot?.createElement?.('i');
      if (title) {
        title.textContent = resolveLabel(item, index);
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
      sectionState.set(item, { section, header, bodyEl });
      addListener(header, 'click', () => {
        section.classList.toggle('is-collapsed');
      });
    });
  };

  const mountMenus = () => {
    buildSections();
    items.forEach((item) => {
      const menu = item?.menu || null;
      const section = sectionState.get(item);
      if (!menu || !section?.bodyEl) return;
      mountMenu(menu, section.bodyEl);
    });
  };

  const restoreMenus = () => {
    items.forEach((item) => {
      const menu = item?.menu || null;
      if (!menu) return;
      restoreMenu(menu);
    });
  };

  const setPanelVisibility = (visible) => {
    const next = !!visible;
    panel.hidden = !next;
    panel.setAttribute('aria-hidden', String(!next));
  };

  const setMode = (mode, { visibleOverride = null } = {}) => {
    const nextMode = mode || 'menus';
    const showPanel = nextMode === 'panel';
    if (activeMode === nextMode) {
      setPanelVisibility(typeof visibleOverride === 'boolean' ? visibleOverride : (showPanel && baseVisible));
      return;
    }
    activeMode = nextMode;
    if (showPanel) {
      mountMenus();
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
