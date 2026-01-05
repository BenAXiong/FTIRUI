const resolveToken = (techKey, techOptions = []) => {
  if (!techKey) return 'TECH';
  const option = techOptions.find((opt) => opt?.getAttribute?.('data-tech-option') === techKey);
  const symbol = option?.getAttribute?.('data-tech-symbol')
    || option?.getAttribute?.('data-tech-label')
    || techKey;
  return String(symbol || 'TECH').replace(/\s+/g, '').toUpperCase();
};

const captureDefaults = (buttons = []) => {
  const defaults = new Map();
  buttons.forEach(({ node }) => {
    if (!node) return;
    const hidden = node.querySelector('.visually-hidden');
    defaults.set(node, {
      title: node.getAttribute('title') || '',
      ariaLabel: node.getAttribute('aria-label') || '',
      hiddenText: hidden ? hidden.textContent : ''
    });
  });
  return defaults;
};

const getOriginalIcon = (node) => {
  if (!node) return null;
  const existing = node.querySelector('[data-tech-original-icon]');
  if (existing) return existing;
  const icon = node.querySelector('.workspace-toolbar-icon:not(.workspace-toolbar-tech-badge)');
  if (icon) {
    icon.dataset.techOriginalIcon = 'true';
  }
  return icon;
};

const getBadge = (node, icon) => {
  if (!node) return null;
  let badge = node.querySelector('[data-tech-badge]');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'workspace-toolbar-icon workspace-toolbar-tech-badge';
    badge.dataset.techBadge = 'true';
    if (icon && typeof icon.after === 'function') {
      icon.after(badge);
    } else {
      node.prepend(badge);
    }
  }
  return badge;
};

const restoreDefaults = (defaults, buttons = []) => {
  buttons.forEach(({ node }) => {
    const fallback = defaults.get(node);
    if (!node || !fallback) return;
    node.setAttribute('title', fallback.title);
    node.setAttribute('aria-label', fallback.ariaLabel);
    const hidden = node.querySelector('.visually-hidden');
    if (hidden) {
      hidden.textContent = fallback.hiddenText;
    }
    const icon = getOriginalIcon(node);
    if (icon) {
      icon.hidden = false;
    }
    const badge = node.querySelector('[data-tech-badge]');
    if (badge) {
      badge.hidden = true;
    }
  });
};

const applyTechLabels = (token, buttons = []) => {
  buttons.forEach(({ node, slot }) => {
    if (!node) return;
    const label = `${token}${slot}`;
    node.setAttribute('title', label);
    node.setAttribute('aria-label', label);
    const hidden = node.querySelector('.visually-hidden');
    if (hidden) {
      hidden.textContent = label;
    }
    const icon = getOriginalIcon(node);
    const badge = getBadge(node, icon);
    if (icon) {
      icon.hidden = true;
    }
    if (badge) {
      badge.textContent = label;
      badge.hidden = false;
    }
  });
};

export function createTechToolbarLabelController({
  techToggle,
  techOptions = [],
  buttons = [],
  defaultTech = 'ftir'
} = {}) {
  if (!techToggle || !buttons.length) return null;
  const defaults = captureDefaults(buttons);

  const updateLabels = (techKey) => {
    if (!techKey || techKey === defaultTech) {
      restoreDefaults(defaults, buttons);
      return;
    }
    const token = resolveToken(techKey, techOptions);
    applyTechLabels(token, buttons);
  };

  const handleTechChange = (event) => {
    updateLabels(event?.detail?.key || techToggle.dataset?.techKey);
  };

  updateLabels(techToggle.dataset?.techKey || defaultTech);
  techToggle.addEventListener('workspace:tech-change', handleTechChange);

  return {
    updateLabels,
    teardown() {
      techToggle.removeEventListener('workspace:tech-change', handleTechChange);
    }
  };
}
