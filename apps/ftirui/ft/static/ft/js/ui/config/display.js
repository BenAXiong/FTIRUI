const EPSILON_ABSORBANCE = 1e-8;

const DISPLAY_CONFIG = {
  fraction: {
    key: 'fraction',
    label: 'Transmittance',
    axis: 'Transmittance',
    metaValue: 'Transmittance',
    apply(base) {
      return Array.isArray(base) ? base.slice() : [];
    }
  },
  absorbance: {
    key: 'absorbance',
    label: 'Absorbance',
    axis: 'Absorbance (A)',
    metaValue: 'Absorbance',
    apply(base) {
      if (!Array.isArray(base)) return [];
      return base.map((value) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) return null;
        return -Math.log10(Math.max(num, EPSILON_ABSORBANCE));
      });
    }
  }
};

function resolveDisplayKey(inputMode) {
  const trimmed = (inputMode || '').trim().toLowerCase();
  if (trimmed.startsWith('abs')) return 'absorbance';
  return 'fraction';
}

export function getDisplayConfig(inputModeOrKey) {
  const key = DISPLAY_CONFIG[inputModeOrKey]?.key
    ? inputModeOrKey
    : resolveDisplayKey(inputModeOrKey);
  return DISPLAY_CONFIG[key] || DISPLAY_CONFIG.fraction;
}

export { DISPLAY_CONFIG };
