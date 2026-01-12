export function createBrowserTabsController({ root, onTabChange } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return null;
  const tabButtons = Array.from(root.querySelectorAll('[data-browser-tab]'));
  const tabPanels = Array.from(root.querySelectorAll('[data-browser-tab-panel]'));
  if (!tabButtons.length || !tabPanels.length) return null;

  const setActive = (tabId) => {
    const resolved = tabId || tabButtons[0]?.dataset?.browserTab;
    if (!resolved) return;
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.browserTab === resolved;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
    tabPanels.forEach((panel) => {
      const isActive = panel.dataset.browserTabPanel === resolved;
      panel.classList.toggle('is-active', isActive);
      panel.setAttribute('aria-hidden', String(!isActive));
    });
    root.dataset.browserActiveTab = resolved;
    if (typeof onTabChange === 'function') {
      onTabChange(resolved);
    }
  };

  const handleClick = (event) => {
    const btn = event.target?.closest?.('[data-browser-tab]');
    if (!btn) return;
    event.preventDefault();
    setActive(btn.dataset.browserTab);
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', handleClick);
  });

  const initial =
    tabButtons.find((btn) => btn.getAttribute('aria-selected') === 'true')?.dataset?.browserTab
    || tabButtons.find((btn) => btn.classList.contains('is-active'))?.dataset?.browserTab
    || tabButtons[0]?.dataset?.browserTab;
  setActive(initial);

  return {
    setActive,
    teardown() {
      tabButtons.forEach((btn) => {
        btn.removeEventListener('click', handleClick);
      });
    }
  };
}
