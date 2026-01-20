export function createGraphTypeController({
  toggle,
  menu,
  getActivePanelId = () => null,
  panelSupportsPlot = () => true,
  setPanelTag = () => false,
  showToast = () => {}
} = {}) {
  if (!toggle || !menu) return null;
  const iconTarget = toggle.querySelector('[data-graph-icon-target]');
  const labelTarget = toggle.querySelector('[data-graph-label-target]');
  const options = Array.from(menu.querySelectorAll('[data-graph-option]'));
  if (!iconTarget || !labelTarget || !options.length) {
    return null;
  }

  const getDropdownInstance = () => {
    const bootstrapApi = window.bootstrap?.Dropdown;
    if (!bootstrapApi?.getOrCreateInstance) {
      return null;
    }
    return bootstrapApi.getOrCreateInstance(toggle);
  };

  const dispatchGraphChange = (key, label, panelId) => {
    toggle.dispatchEvent(new CustomEvent('workspace:graph-type-change', {
      bubbles: true,
      detail: { key, label, panelId }
    }));
  };

  const setActiveOption = (option, { emit = true, panelId = null } = {}) => {
    if (!option) return;
    const label = option.getAttribute('data-graph-label') || 'Graph type';
    const icon = option.getAttribute('data-graph-icon') || 'bi-graph-up';
    const key = option.getAttribute('data-graph-option') || '';
    iconTarget.className = `workspace-toolbar-icon bi ${icon}`;
    iconTarget.setAttribute('aria-hidden', 'true');
    labelTarget.textContent = `Primary graph: ${label}`;
    toggle.setAttribute('title', `Primary graph: ${label}`);
    toggle.setAttribute('aria-label', `Primary graph: ${label}`);
    if (key) {
      toggle.dataset.graphKey = key;
    } else {
      delete toggle.dataset.graphKey;
    }
    options.forEach((opt) => opt.classList.toggle('is-active', opt === option));
    if (emit) {
      dispatchGraphChange(key, label, panelId);
    }
  };

  const updatePanelTag = (label, panelId) => {
    const targetPanelId = panelId || getActivePanelId?.();
    if (!targetPanelId) {
      showToast('Select a graph to set its tag.', 'info');
      return false;
    }
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(targetPanelId)) {
      showToast('Tags are only available for plot panels.', 'info');
      return false;
    }
    setPanelTag(targetPanelId, { tagKey: label, tagSource: 'manual' }, { render: false, persistChange: true });
    return true;
  };

  const handleOptionClick = (event) => {
    event.preventDefault();
    const option = event.currentTarget;
    if (!option) return;
    const label = option.getAttribute('data-graph-label') || 'Graph type';
    const panelId = getActivePanelId?.() || null;
    if (!updatePanelTag(label, panelId)) {
      return;
    }
    setActiveOption(option, { panelId });
    try {
      getDropdownInstance()?.hide();
    } catch {
      /* ignore bootstrap hide errors */
    }
  };

  options.forEach((option) => option.addEventListener('click', handleOptionClick));

  const initialOption = options.find((opt) => opt.classList.contains('is-active')) || options[0];
  if (initialOption) {
    setActiveOption(initialOption);
  }

  return {
    toggle,
    options,
    setActiveOption
  };
}
