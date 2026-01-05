import {
  DEFAULT_TECH_KEY,
  DEFAULT_TECH_FEATURES,
  resolveTechFeatureSet
} from './techToolbarConfig.js';

const captureDefaults = (buttons = []) => {
  const defaults = new Map();
  buttons.forEach(({ node }) => {
    if (!node) return;
    const hidden = node.querySelector('.visually-hidden');
    const icon = getOriginalIcon(node);
    defaults.set(node, {
      title: node.getAttribute('title') || '',
      ariaLabel: node.getAttribute('aria-label') || '',
      hiddenText: hidden ? hidden.textContent : '',
      iconClass: icon ? icon.className : ''
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

const updateIconGlyph = (icon, iconClass) => {
  if (!icon || !iconClass) return;
  icon.classList.forEach((cls) => {
    if (cls.startsWith('bi-')) {
      icon.classList.remove(cls);
    }
  });
  if (!icon.classList.contains('bi')) {
    icon.classList.add('bi');
  }
  icon.classList.add(iconClass);
};

const updateButtonLabel = (node, label) => {
  if (!node) return;
  node.setAttribute('title', label);
  node.setAttribute('aria-label', label);
  const hidden = node.querySelector('.visually-hidden');
  if (hidden) {
    hidden.textContent = label;
  }
};

const updateButtonAction = (node, feature, slot) => {
  if (!node) return;
  if (feature?.action) {
    node.dataset.techAction = feature.action;
  }
  if (slot) {
    node.dataset.techSlot = String(slot);
  }
  if (feature?.isPlaceholder) {
    node.dataset.techPlaceholder = 'true';
  } else {
    delete node.dataset.techPlaceholder;
  }
};

const updateButtonAvailability = (node, feature) => {
  if (!node) return;
  if (typeof feature?.disabled === 'boolean') {
    node.disabled = feature.disabled;
    node.setAttribute('aria-disabled', String(feature.disabled));
  } else {
    node.disabled = false;
    node.removeAttribute('aria-disabled');
  }
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
      if (fallback.iconClass) {
        icon.className = fallback.iconClass;
      }
      icon.hidden = false;
    }
    const badge = node.querySelector('[data-tech-badge]');
    if (badge) {
      badge.hidden = true;
    }
    node.disabled = false;
    node.removeAttribute('aria-disabled');
    delete node.dataset.techPlaceholder;
  });
};

const applyFeatureSet = (features, buttons = []) => {
  buttons.forEach(({ node, slot }) => {
    if (!node) return;
    const feature = features?.[slot] || {};
    const label = feature.label || `Slot ${slot}`;
    updateButtonLabel(node, label);
    updateButtonAction(node, feature, slot);
    updateButtonAvailability(node, feature);

    const icon = getOriginalIcon(node);
    const wantsBadge = feature.display === 'badge';
    const badge = getBadge(node, icon);
    if (wantsBadge) {
      if (icon) {
        icon.hidden = true;
      }
      if (badge) {
        badge.textContent = label;
        badge.hidden = false;
      }
    } else {
      if (icon) {
        if (feature.iconClass) {
          updateIconGlyph(icon, feature.iconClass);
        }
        icon.hidden = false;
      }
      if (badge) {
        badge.hidden = true;
      }
    }
  });
};

export function createTechToolbarLabelController({
  techToggle,
  techOptions = [],
  buttons = [],
  defaultTech = DEFAULT_TECH_KEY,
  resolveFeatures = resolveTechFeatureSet,
  handlers = {}
} = {}) {
  if (!techToggle || !buttons.length) return null;
  const defaults = captureDefaults(buttons);
  const handlerMap = new Map(Object.entries(handlers || {}));
  let activeTechKey = techToggle.dataset?.techKey || defaultTech;
  let activeFeatureSet = resolveFeatures({ techKey: activeTechKey, techOptions, defaultTech });

  const updateToolbar = (techKey) => {
    const nextKey = techKey || defaultTech;
    activeTechKey = nextKey;
    activeFeatureSet = resolveFeatures({ techKey: nextKey, techOptions, defaultTech });
    if (!nextKey || nextKey === defaultTech) {
      restoreDefaults(defaults, buttons);
    } else {
      applyFeatureSet(activeFeatureSet, buttons);
    }
    Object.entries(DEFAULT_TECH_FEATURES).forEach(([slot, feature]) => {
      const button = buttons.find((entry) => String(entry.slot) === String(slot))?.node;
      if (!button) return;
      updateButtonAction(button, feature, Number(slot));
    });
    if (nextKey && nextKey !== defaultTech) {
      buttons.forEach(({ node, slot }) => {
        updateButtonAction(node, activeFeatureSet?.[slot], slot);
      });
    }
  };

  const handleTechChange = (event) => {
    updateToolbar(event?.detail?.key || techToggle.dataset?.techKey);
  };

  const handleButtonClick = (event) => {
    const button = event?.currentTarget;
    if (!button || button.disabled) return;
    const action = button.dataset?.techAction;
    if (!action) return;
    const handler = handlerMap.get(action);
    if (typeof handler !== 'function') return;
    handler({
      action,
      slot: Number(button.dataset?.techSlot || 0),
      techKey: activeTechKey,
      feature: activeFeatureSet?.[button.dataset?.techSlot],
      button,
      event
    });
  };

  buttons.forEach(({ node }) => {
    if (!node || typeof node.addEventListener !== 'function') return;
    node.addEventListener('click', handleButtonClick);
  });

  updateToolbar(activeTechKey);
  techToggle.addEventListener('workspace:tech-change', handleTechChange);

  return {
    updateToolbar,
    getActiveTechKey() {
      return activeTechKey;
    },
    getActiveFeatureSet() {
      return activeFeatureSet;
    },
    registerHandler(action, handler) {
      if (!action || typeof handler !== 'function') return;
      handlerMap.set(action, handler);
    },
    unregisterHandler(action) {
      if (!action) return;
      handlerMap.delete(action);
    },
    teardown() {
      techToggle.removeEventListener('workspace:tech-change', handleTechChange);
      buttons.forEach(({ node }) => {
        if (!node || typeof node.removeEventListener !== 'function') return;
        node.removeEventListener('click', handleButtonClick);
      });
    }
  };
}
