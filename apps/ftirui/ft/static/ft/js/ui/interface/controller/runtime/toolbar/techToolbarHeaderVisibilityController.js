export function createTechToolbarHeaderVisibilityController({
  dom = {},
  className = 'workspace-hide-inactive-headers',
  onToggle = () => {},
  preferences = null
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const toggle = dom.toggle
    || documentRoot?.querySelector?.('[data-hide-inactive-headers-toggle]')
    || null;
  const body = documentRoot?.body || null;

  if (!toggle || !body) return null;

  const setEnabled = (enabled, { persist = true } = {}) => {
    const next = !!enabled;
    body.classList.toggle(className, next);
    toggle.checked = next;
    toggle.setAttribute('aria-checked', String(next));
    if (persist) {
      preferences?.writeTechToolbarHideHeaders?.(next);
    }
    if (typeof onToggle === 'function') {
      onToggle(next);
    }
  };

  const onChange = () => setEnabled(toggle.checked);

  toggle.addEventListener('change', onChange);
  const stored = preferences?.readTechToolbarHideHeaders?.(toggle.checked);
  const initial = typeof stored === 'boolean'
    ? stored
    : (body.classList.contains(className) || toggle.checked);
  setEnabled(initial, { persist: false });

  return {
    setEnabled,
    teardown() {
      toggle.removeEventListener('change', onChange);
    }
  };
}
