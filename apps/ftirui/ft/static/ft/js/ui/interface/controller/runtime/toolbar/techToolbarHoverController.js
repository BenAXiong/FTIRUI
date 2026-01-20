const getDropdownInstance = (toggle) => {
  if (!toggle || typeof window === 'undefined') return null;
  const dropdownApi = window.bootstrap?.Dropdown;
  if (!dropdownApi) return null;
  if (typeof dropdownApi.getOrCreateInstance === 'function') {
    return dropdownApi.getOrCreateInstance(toggle);
  }
  if (typeof dropdownApi.getInstance === 'function') {
    return dropdownApi.getInstance(toggle);
  }
  return null;
};

const isDropdownOpen = (menu, toggle) => {
  if (menu?.classList?.contains('show')) return true;
  return toggle?.getAttribute?.('aria-expanded') === 'true';
};

export function createTechToolbarHoverController({
  items = [],
  openDelayMs = 0,
  closeDelayMs = 140
} = {}) {
  if (!Array.isArray(items) || !items.length) return null;

  let suppressed = false;
  const listeners = [];
  const addListener = (node, event, handler, options) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener(event, handler, options);
    listeners.push({ node, event, handler, options });
  };

  const timers = new Map();
  const clearTimers = (key) => {
    const existing = timers.get(key);
    if (!existing) return;
    if (existing.open) clearTimeout(existing.open);
    if (existing.close) clearTimeout(existing.close);
    timers.delete(key);
  };

  items.forEach((item) => {
    const toggle = item?.toggle || null;
    const menu = item?.menu || null;
    if (!toggle || !menu) return;
    if (toggle.disabled) return;
    const key = toggle;
    const schedule = timers.get(key) || { open: null, close: null, hovered: false };
    timers.set(key, schedule);

    const show = () => {
      if (suppressed) return;
      if (toggle.disabled) return;
      const instance = getDropdownInstance(toggle);
      if (!instance) return;
      if (isDropdownOpen(menu, toggle)) return;
      instance.show();
    };

    const hide = () => {
      if (suppressed) return;
      const instance = getDropdownInstance(toggle);
      if (!instance) return;
      if (!isDropdownOpen(menu, toggle)) return;
      instance.hide();
    };

    const enter = () => {
      schedule.hovered = true;
      if (schedule.close) clearTimeout(schedule.close);
      schedule.close = null;
      if (schedule.open) clearTimeout(schedule.open);
      schedule.open = setTimeout(show, openDelayMs);
    };

    const leave = () => {
      schedule.hovered = false;
      if (schedule.open) clearTimeout(schedule.open);
      schedule.open = null;
      if (schedule.close) clearTimeout(schedule.close);
      schedule.close = setTimeout(() => {
        if (schedule.hovered) return;
        hide();
      }, closeDelayMs);
    };

    addListener(toggle, 'mouseenter', enter);
    addListener(menu, 'mouseenter', enter);
    addListener(toggle, 'mouseleave', leave);
    addListener(menu, 'mouseleave', leave);

    if (item?.suppressClickToggle) {
      addListener(toggle, 'click', (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
    }
  });

  return {
    setSuppressed(next) {
      suppressed = !!next;
      if (suppressed) {
        items.forEach((item) => {
          const toggle = item?.toggle || null;
          const menu = item?.menu || null;
          const instance = getDropdownInstance(toggle);
          if (instance && isDropdownOpen(menu, toggle)) {
            instance.hide();
          }
        });
      }
    },
    teardown() {
      listeners.forEach(({ node, event, handler, options }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener(event, handler, options);
      });
      listeners.length = 0;
      timers.forEach((value) => {
        if (value?.open) clearTimeout(value.open);
        if (value?.close) clearTimeout(value.close);
      });
      timers.clear();
    }
  };
}
