import { getWorkspaceTagColor } from '../../../../utils/tagColors.js';
import { DEFAULT_TAG_LABEL, inferTagLabelFromFigure, normalizeTagLabelToken } from './panelTagMapping.js';

const PANEL_META_KEY = 'workspacePanel';
const TAG_KEY = 'tagKey';
const TAG_SOURCE_KEY = 'tagSource';
const DEFAULT_TAG_KEY = DEFAULT_TAG_LABEL;
const TAG_SOURCE_AUTO = 'auto';
const TAG_SOURCE_MANUAL = 'manual';

const normalizeTagValue = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const readTagState = (figure) => {
  const meta = figure?.layout?.meta;
  const panelMeta = meta && typeof meta === 'object' ? meta[PANEL_META_KEY] : null;
  return {
    tagKey: normalizeTagValue(panelMeta?.[TAG_KEY] ?? panelMeta?.tag),
    tagSource: normalizeTagValue(panelMeta?.[TAG_SOURCE_KEY])
  };
};

const mergeTagState = (figure, patch = {}) => {
  const current = readTagState(figure);
  const hasTagKey = Object.prototype.hasOwnProperty.call(patch, 'tagKey');
  const hasTagSource = Object.prototype.hasOwnProperty.call(patch, 'tagSource');
  const next = {
    tagKey: hasTagKey ? normalizeTagValue(patch.tagKey) : current.tagKey,
    tagSource: hasTagSource ? normalizeTagValue(patch.tagSource) : current.tagSource
  };
  const changed = current.tagKey !== next.tagKey || current.tagSource !== next.tagSource;
  if (!changed) {
    return { figure, state: current, changed: false };
  }
  const layout = figure?.layout && typeof figure.layout === 'object' ? figure.layout : {};
  const meta = layout.meta && typeof layout.meta === 'object' ? { ...layout.meta } : {};
  const existing = meta[PANEL_META_KEY] && typeof meta[PANEL_META_KEY] === 'object'
    ? meta[PANEL_META_KEY]
    : {};
  const nextPanelMeta = { ...existing };

  if (next.tagKey) {
    nextPanelMeta[TAG_KEY] = next.tagKey;
  } else {
    delete nextPanelMeta[TAG_KEY];
  }
  if (next.tagSource) {
    nextPanelMeta[TAG_SOURCE_KEY] = next.tagSource;
  } else {
    delete nextPanelMeta[TAG_SOURCE_KEY];
  }

  if (Object.keys(nextPanelMeta).length) {
    meta[PANEL_META_KEY] = nextPanelMeta;
  } else if (Object.prototype.hasOwnProperty.call(meta, PANEL_META_KEY)) {
    delete meta[PANEL_META_KEY];
  }

  return {
    figure: {
      ...figure,
      layout: {
        ...layout,
        meta
      }
    },
    state: next,
    changed: true
  };
};

export function createPanelTagController({
  getPanelFigure = () => ({ data: [], layout: {} }),
  getPanelDom = () => null,
  updatePanelFigure = () => {},
  renderPlot = () => {},
  persist = () => {},
  panelSupportsPlot = () => true,
  onTagChange = () => {}
} = {}) {
  const syncPanelBadge = (panelId, stateOverride = null) => {
    if (!panelId) return;
    const dom = typeof getPanelDom === 'function' ? getPanelDom(panelId) : null;
    const badge = dom?.tagBadgeEl
      || dom?.headerEl?.querySelector?.('.graph-canvas-tag')
      || null;
    if (!badge) return;
    const figure = getPanelFigure(panelId);
    const state = stateOverride || readTagState(figure);
    const tagKey = normalizeTagValue(state?.tagKey) || DEFAULT_TAG_KEY;
    badge.textContent = tagKey;
    badge.title = `Graph tag: ${tagKey}`;
    badge.dataset.canvasTag = tagKey;
    badge.style.background = getWorkspaceTagColor(tagKey);
    badge.style.color = '#fff';
    badge.hidden = false;
  };

  const getTagKey = (panelId, fallback = DEFAULT_TAG_KEY) => {
    if (!panelId) return fallback;
    const figure = getPanelFigure(panelId);
    if (!figure) return fallback;
    const { tagKey } = readTagState(figure);
    return tagKey || fallback;
  };

  const applyTagPatch = (panelId, patch, { render = false, persistChange = true } = {}) => {
    if (!panelId) return false;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
      return false;
    }
    const figure = getPanelFigure(panelId);
    if (!figure) return false;
    const { figure: nextFigure, state, changed } = mergeTagState(figure, patch);
    if (!changed) return false;
    updatePanelFigure(panelId, nextFigure, { source: 'panel-tag', skipTemplateDirty: true });
    if (render) {
      renderPlot(panelId);
    }
    if (persistChange) {
      persist();
    }
    syncPanelBadge(panelId, state);
    if (typeof onTagChange === 'function') {
      onTagChange(panelId, state);
    }
    return true;
  };

  const ensurePanelTag = (panelId, {
    tagKey = DEFAULT_TAG_KEY,
    tagSource = null,
    persistChange = true
  } = {}) => {
    if (!panelId) return false;
    const figure = getPanelFigure(panelId);
    if (!figure) return false;
    const current = readTagState(figure);
    if (current.tagKey) {
      syncPanelBadge(panelId, current);
      return false;
    }
    return applyTagPatch(panelId, { tagKey, tagSource }, { render: false, persistChange });
  };

  const inferPanelTag = (panelId, { persistChange = true } = {}) => {
    if (!panelId) return false;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
      return false;
    }
    const figure = getPanelFigure(panelId);
    if (!figure) return false;
    const current = readTagState(figure);
    if (current.tagSource === TAG_SOURCE_MANUAL) {
      syncPanelBadge(panelId, current);
      return false;
    }
    const inferred = inferTagLabelFromFigure(figure);
    if (!inferred) {
      syncPanelBadge(panelId, current);
      return false;
    }
    if (normalizeTagLabelToken(current.tagKey) === normalizeTagLabelToken(inferred)) {
      syncPanelBadge(panelId, current);
      return false;
    }
    return applyTagPatch(panelId, {
      tagKey: inferred,
      tagSource: TAG_SOURCE_AUTO
    }, { persistChange });
  };

  return {
    getPanelTagKey: getTagKey,
    setPanelTag: (panelId, { tagKey, tagSource } = {}, options = {}) =>
      applyTagPatch(panelId, { tagKey, tagSource }, options),
    ensurePanelTag,
    inferPanelTag,
    handlePanelFigureUpdate: (panelId, options = {}) => {
      if (!panelId) return;
      syncPanelBadge(panelId);
      if (options?.source === 'panel-tag') return;
      inferPanelTag(panelId, { persistChange: true });
    },
    TAG_SOURCE_MANUAL
  };
}

export const DEFAULT_PANEL_TAG_KEY = DEFAULT_TAG_KEY;
