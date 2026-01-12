export function createTechToolbarModebarVisibilityController({
  dom = {},
  className = 'workspace-hide-modebar',
  preferences = null
} = {}) {
  const documentRoot = dom.documentRoot
    || (typeof document !== 'undefined' ? document : null);
  const toggle = dom.toggle
    || documentRoot?.querySelector?.('[data-hide-modebar-toggle]')
    || null;
  const body = documentRoot?.body || null;

  if (!toggle || !body) return null;

  const setEnabled = (enabled, { persist = true } = {}) => {
    const next = !!enabled;
    body.classList.toggle(className, next);
    toggle.checked = next;
    toggle.setAttribute('aria-checked', String(next));
    if (persist) {
      preferences?.writeTechToolbarHideModebar?.(next);
    }
  };

  const onChange = () => setEnabled(toggle.checked);

  toggle.addEventListener('change', onChange);
  const stored = preferences?.readTechToolbarHideModebar?.(toggle.checked);
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
