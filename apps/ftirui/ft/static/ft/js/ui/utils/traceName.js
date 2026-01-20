export const TRACE_NAME_LEGEND_FONT_STACK = 'Noto Sans Symbols 2, Noto Sans Symbols, Noto Sans, DejaVu Sans, Segoe UI Symbol, Arial Unicode MS, sans-serif';

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
};

const RICH_TAG_RE = /<\s*br\s*\/?>|<\s*\/\s*sub\s*>|<\s*\/\s*sup\s*>|<\s*sub\s*>|<\s*sup\s*>/i;
const NON_ASCII_RE = /[^\x20-\x7E]/;

const decodeEntities = (text) => text.replace(/&(amp|lt|gt|quot|#39);/g, (match) => ENTITY_MAP[match] || match);

export const sanitizeTraceName = (input) => {
  if (input === null || input === undefined) return '';
  let text = String(input);
  if (!text) return '';
  text = decodeEntities(text);
  text = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  text = text.replace(/&lt;\s*br\s*\/\s*&gt;/gi, '<br>');
  text = text.replace(/&lt;\s*br\s*&gt;/gi, '<br>');
  text = text.replace(/&lt;\s*\/\s*sub\s*&gt;/gi, '</sub>');
  text = text.replace(/&lt;\s*sub\s*&gt;/gi, '<sub>');
  text = text.replace(/&lt;\s*\/\s*sup\s*&gt;/gi, '</sup>');
  text = text.replace(/&lt;\s*sup\s*&gt;/gi, '<sup>');
  return text;
};

export const traceNameToPlainText = (input, { lineBreak = ' / ' } = {}) => {
  if (input === null || input === undefined) return '';
  let text = String(input);
  if (!text) return '';
  text = text.replace(/<\s*br\s*\/?>/gi, lineBreak);
  text = text.replace(/<\s*\/\s*sub\s*>/gi, '');
  text = text.replace(/<\s*sub\s*>/gi, '');
  text = text.replace(/<\s*\/\s*sup\s*>/gi, '');
  text = text.replace(/<\s*sup\s*>/gi, '');
  return decodeEntities(text);
};

export const traceNameNeedsLegendFont = (input) => {
  if (input === null || input === undefined) return false;
  const text = String(input);
  return RICH_TAG_RE.test(text) || NON_ASCII_RE.test(text);
};

export const applyLegendFontPolicy = (layout = {}, traces = []) => {
  if (!layout || typeof layout !== 'object') {
    return { layout, changed: false };
  }
  const needsLegendFont = traces.some((trace) => traceNameNeedsLegendFont(trace?.name));
  const nextLayout = { ...layout };
  const nextLegend = { ...(layout.legend || {}) };
  const nextLegendFont = { ...(layout.legend?.font || {}) };
  const meta = { ...(layout.meta || {}) };
  const currentFamily = nextLegendFont.family || '';
  const managedFamily = meta.workspaceLegendFont || '';
  let changed = false;

  if (needsLegendFont) {
    if (!currentFamily || currentFamily === managedFamily) {
      nextLegendFont.family = TRACE_NAME_LEGEND_FONT_STACK;
      meta.workspaceLegendFont = TRACE_NAME_LEGEND_FONT_STACK;
      changed = currentFamily !== TRACE_NAME_LEGEND_FONT_STACK;
    }
  } else if (managedFamily && (!currentFamily || currentFamily === managedFamily)) {
    if (nextLegendFont.family === managedFamily) {
      delete nextLegendFont.family;
    }
    delete meta.workspaceLegendFont;
    changed = true;
  }

  if (changed) {
    nextLegend.font = nextLegendFont;
    nextLayout.legend = nextLegend;
    nextLayout.meta = meta;
  }

  return { layout: changed ? nextLayout : layout, changed };
};
