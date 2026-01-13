export const DEFAULT_TAG_LABEL = 'Unknown';

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();
const normalizeToken = (value) => normalizeText(value).replace(/[\s_-]+/g, '');

const readAxisTitle = (axis) => {
  if (!axis || typeof axis !== 'object') return '';
  if (typeof axis.title === 'string') return axis.title;
  if (axis.title && typeof axis.title === 'object' && typeof axis.title.text === 'string') {
    return axis.title.text;
  }
  return '';
};

const TECH_META_KEYS = [
  'X_UNITS',
  'XUNITS',
  'XUNIT',
  'X_UNITS_ORIGINAL',
  'XUNITS_ORIGINAL',
  'XUNIT_ORIGINAL',
  'X_AXIS_UNITS',
  'XAXIS_UNITS',
  'X_AXIS',
  'XAXIS',
  'Y_UNITS',
  'YUNITS',
  'YUNIT',
  'INPUT_MODE',
  'DISPLAY_UNITS',
  'TITLE',
  'SAMPLE',
  'SPECTRUM_TYPE',
  'DATA_TYPE',
  'TECHNIQUE',
  'INSTRUMENT',
  'ORIGIN',
  'SOURCE',
  'JCAMPDX'
];

const collectMetaCandidates = (figure = {}) => {
  const candidates = [];
  const layout = figure.layout && typeof figure.layout === 'object' ? figure.layout : {};
  const traces = Array.isArray(figure.data) ? figure.data : [];
  const pushValue = (value) => {
    const text = normalizeText(value);
    if (text) {
      candidates.push(text);
    }
  };
  traces.forEach((trace) => {
    const meta = trace?.meta && typeof trace.meta === 'object' ? trace.meta : {};
    TECH_META_KEYS.forEach((key) => {
      if (meta[key] !== undefined && meta[key] !== null) {
        pushValue(meta[key]);
      }
    });
  });
  pushValue(readAxisTitle(layout.xaxis));
  pushValue(readAxisTitle(layout.yaxis));
  return candidates;
};

const includesAny = (values, tokens) => values.some((value) => tokens.some((token) => value.includes(token)));

export const inferTagLabelFromFigure = (figure) => {
  const candidates = collectMetaCandidates(figure);
  if (!candidates.length) return null;
  const infraredTokens = ['ftir', 'ft-ir', 'infrared'];
  if (includesAny(candidates, infraredTokens)) {
    return 'FT-IR';
  }
  const wavenumberTokens = ['wavenumber', 'cm-1', 'cm^-1', 'cm?1', '1/cm'];
  const hasWavenumber = includesAny(candidates, wavenumberTokens);
  if (!hasWavenumber) return null;
  const transTokens = ['transmittance', '%t', 't%'];
  const absTokens = ['absorbance'];
  if (includesAny(candidates, transTokens) || includesAny(candidates, absTokens)) {
    return 'FT-IR';
  }
  return null;
};

export const resolveTagLabelFromTechKey = (techKey, techOptions = []) => {
  if (!techKey) return DEFAULT_TAG_LABEL;
  const option = techOptions.find((opt) => opt?.getAttribute?.('data-tech-option') === techKey);
  const label = option?.getAttribute?.('data-tech-label');
  return label ? String(label).trim() : DEFAULT_TAG_LABEL;
};

export const resolveTechKeyFromTagLabel = (tagLabel, techOptions = []) => {
  const token = normalizeToken(tagLabel || '');
  if (!token) return 'unknown';
  const match = techOptions.find((opt) => {
    const label = opt?.getAttribute?.('data-tech-label') || opt?.getAttribute?.('data-tech-option');
    return normalizeToken(label) === token;
  });
  return match?.getAttribute?.('data-tech-option') || 'unknown';
};

export const normalizeTagLabelToken = (value) => normalizeToken(value);
