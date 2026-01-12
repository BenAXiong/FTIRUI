export const DEFAULT_TECH_KEY = 'ftir';

export const TECH_SLOT_ORDER = [3, 4, 5, 6, 7, 8, 9];

export const DEFAULT_TECH_FEATURES = {
  3: { label: 'Toggle peak marking', action: 'peak-marking', display: 'icon', iconClass: 'bi-bullseye' },
  4: { label: 'Absorbance / Transmittance', action: 'units-toggle', display: 'icon', iconClass: 'bi-arrow-left-right' },
  5: { label: 'Multi-trace options', action: 'multi-trace', display: 'icon', iconClass: 'bi-layers' },
  6: { label: 'ATR correction', action: 'atr-correction', display: 'icon', iconClass: 'bi-funnel' },
  7: { label: 'Derivatization', action: 'derivatization', display: 'icon', iconClass: 'bi-bezier' },
  8: { label: 'Spectral library', action: 'spectral-library', display: 'icon', iconClass: 'bi-collection' },
  9: { label: 'Peak integration', action: 'peak-integration', display: 'icon', iconClass: 'bi-clipboard-data' }
};

export const TECH_FEATURE_OVERRIDES = {};

export const resolveTechToken = (techKey, techOptions = []) => {
  if (!techKey) return 'TECH';
  const option = techOptions.find((opt) => opt?.getAttribute?.('data-tech-option') === techKey);
  const symbol = option?.getAttribute?.('data-tech-symbol')
    || option?.getAttribute?.('data-tech-label')
    || techKey;
  return String(symbol || 'TECH').replace(/\s+/g, '').toUpperCase();
};

export const buildPlaceholderFeatures = (token, techKey) => TECH_SLOT_ORDER.reduce((acc, slot) => {
  acc[slot] = {
    label: `${token}${slot}`,
    action: `${techKey}-${slot}`,
    display: 'badge',
    isPlaceholder: true,
    disabled: true
  };
  return acc;
}, {});

export const resolveTechFeatureSet = ({
  techKey,
  techOptions = [],
  defaultTech = DEFAULT_TECH_KEY
} = {}) => {
  if (!techKey || techKey === defaultTech) {
    return DEFAULT_TECH_FEATURES;
  }
  const token = resolveTechToken(techKey, techOptions);
  const placeholder = buildPlaceholderFeatures(token, techKey);
  const overrides = TECH_FEATURE_OVERRIDES[techKey];
  if (!overrides) return placeholder;
  return { ...placeholder, ...overrides };
};
