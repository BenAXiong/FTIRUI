import {
  DEFAULT_TECH_KEY,
  resolveTechFeatureSet
} from './techToolbarConfig.js';

const collectPlaceholderActions = ({
  techOptions = [],
  resolveFeatures = resolveTechFeatureSet,
  defaultTech = DEFAULT_TECH_KEY
} = {}) => {
  const placeholders = new Map();
  techOptions.forEach((option) => {
    const techKey = option?.getAttribute?.('data-tech-option');
    if (!techKey || techKey === defaultTech) return;
    const features = resolveFeatures({ techKey, techOptions, defaultTech });
    Object.entries(features || {}).forEach(([slot, feature]) => {
      if (!feature?.isPlaceholder || !feature?.action) return;
      placeholders.set(feature.action, {
        techKey,
        slot: Number(slot),
        label: feature.label || `${techKey}${slot}`
      });
    });
  });
  return placeholders;
};

export const registerTechPlaceholderHandlers = ({
  controller,
  techOptions = [],
  resolveFeatures = resolveTechFeatureSet,
  defaultTech = DEFAULT_TECH_KEY,
  notify
} = {}) => {
  if (!controller || typeof controller.registerHandler !== 'function') return null;
  const placeholders = collectPlaceholderActions({ techOptions, resolveFeatures, defaultTech });
  const handler = ({ feature, techKey }) => {
    const label = feature?.label || 'Feature';
    const techLabel = techKey || 'this tech';
    notify?.(`${label} is not available for ${techLabel} yet.`, 'info');
  };
  placeholders.forEach((meta, action) => {
    controller.registerHandler(action, handler);
  });
  return {
    placeholders,
    teardown() {
      placeholders.forEach((_, action) => controller.unregisterHandler(action));
    }
  };
};
