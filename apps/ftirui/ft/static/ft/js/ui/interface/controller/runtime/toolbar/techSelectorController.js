import {
  DEFAULT_TAG_LABEL,
  resolveTagLabelFromTechKey,
  resolveTechKeyFromTagLabel
} from '../panels/panelTagMapping.js';

const resolveOptionLabel = (option) => {
  if (!option) return 'Technology';
  return option.getAttribute('data-tech-label') || 'Technology';
};

const resolveOptionSymbol = (option) => {
  if (!option) return 'TECH';
  return option.getAttribute('data-tech-symbol') || 'TECH';
};

export function createTechSelectorController({
  toggle,
  menu,
  getActivePanelId = () => null,
  panelSupportsPlot = () => true,
  getPanelTagKey = () => DEFAULT_TAG_LABEL,
  setPanelTag = () => false,
  ensurePanelTag = () => false,
  showToast = () => {}
} = {}) {
  if (!toggle || !menu) return null;
  const iconTarget = toggle.querySelector('[data-tech-icon-target]');
  const labelTarget = toggle.querySelector('[data-tech-label-target]');
  const options = Array.from(menu.querySelectorAll('[data-tech-option]'));
  if (!iconTarget || !labelTarget || !options.length) {
    return null;
  }

  const optionByKey = new Map();
  options.forEach((option) => {
    const key = option.getAttribute('data-tech-option');
    if (key) {
      optionByKey.set(key, option);
    }
  });
  const unknownOption = optionByKey.get('unknown') || options[0];

  const getDropdownInstance = () => {
    const bootstrapApi = window.bootstrap?.Dropdown;
    if (!bootstrapApi?.getOrCreateInstance) {
      return null;
    }
    return bootstrapApi.getOrCreateInstance(toggle);
  };

  const dispatchTechChange = (key, label, panelId) => {
    toggle.dispatchEvent(new CustomEvent('workspace:tech-change', {
      bubbles: true,
      detail: { key, label, panelId }
    }));
  };

  const setActiveOption = (option, { emit = true, panelId = null } = {}) => {
    if (!option) return;
    const label = resolveOptionLabel(option);
    const symbol = resolveOptionSymbol(option);
    const key = option.getAttribute('data-tech-option') || '';
    iconTarget.textContent = symbol;
    labelTarget.textContent = `${label} controls`;
    toggle.setAttribute('title', `${label} controls`);
    toggle.setAttribute('aria-label', `${label} controls`);
    if (key) {
      toggle.dataset.techKey = key;
    } else {
      delete toggle.dataset.techKey;
    }
    options.forEach((opt) => opt.classList.toggle('is-active', opt === option));
    if (emit) {
      dispatchTechChange(key, label, panelId);
    }
  };

  const syncToPanel = (panelId) => {
    const resolvedPanelId = panelId || getActivePanelId();
    if (!resolvedPanelId || (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(resolvedPanelId))) {
      setActiveOption(unknownOption, { panelId: resolvedPanelId });
      return;
    }
    ensurePanelTag?.(resolvedPanelId, { persistChange: false });
    const tagLabel = getPanelTagKey(resolvedPanelId, DEFAULT_TAG_LABEL);
    const techKey = resolveTechKeyFromTagLabel(tagLabel, options);
    const option = optionByKey.get(techKey) || unknownOption;
    setActiveOption(option, { panelId: resolvedPanelId });
  };

  const handleOptionClick = (event) => {
    event.preventDefault();
    const option = event.currentTarget;
    if (!option) return;
    const panelId = getActivePanelId();
    if (!panelId) {
      showToast('Select a graph to set its tech tag.', 'info');
      return;
    }
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
      showToast('Tech tags are only available for plot panels.', 'info');
      return;
    }
    const techKey = option.getAttribute('data-tech-option') || '';
    const tagLabel = resolveTagLabelFromTechKey(techKey, options);
    setPanelTag(panelId, { tagKey: tagLabel, tagSource: 'manual' }, { render: false, persistChange: true });
    setActiveOption(option, { panelId });
    try {
      getDropdownInstance()?.hide();
    } catch {
      /* ignore bootstrap hide errors */
    }
  };

  options.forEach((option) => option.addEventListener('click', handleOptionClick));

  syncToPanel(getActivePanelId());

  return {
    toggle,
    options,
    setActiveOption,
    syncToPanel
  };
}
