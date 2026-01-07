const TEMPLATE_STORAGE_KEY = 'ftir.workspace.templates.v1';
const RECENT_LIMIT = 6;

const cloneValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).reduce((acc, key) => {
      acc[key] = cloneValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const hasPath = (obj, path) => {
  let cursor = obj;
  for (let i = 0; i < path.length; i += 1) {
    if (!cursor || typeof cursor !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cursor, path[i])) return false;
    cursor = cursor[path[i]];
  }
  return true;
};

const getPath = (obj, path) => path.reduce((acc, key) => (acc ? acc[key] : undefined), obj);

const setPath = (obj, path, value) => {
  if (!obj) return;
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = path[i];
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path[path.length - 1]] = value;
};

const copyPaths = (target, source, paths = []) => {
  paths.forEach((path) => {
    if (hasPath(source, path)) {
      setPath(target, path, cloneValue(getPath(source, path)));
    }
  });
};

const mergeDeep = (target, patch) => {
  if (!patch || typeof patch !== 'object') return target;
  Object.keys(patch).forEach((key) => {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      mergeDeep(target[key], value);
    } else {
      target[key] = value;
    }
  });
  return target;
};

const axisKeysForLayout = (layout = {}) =>
  Object.keys(layout).filter((key) => /^xaxis\d*$/.test(key) || /^yaxis\d*$/.test(key));

const buildAxisOverrideLayout = (
  panelId,
  baseLayout = {},
  getPanelDom,
  paths = [],
  { includeRange = false } = {}
) => {
  if (!panelId || typeof getPanelDom !== 'function') return baseLayout;
  const plotEl = getPanelDom(panelId)?.plotEl;
  const liveLayout = plotEl?.layout || null;
  const fullLayout = plotEl?._fullLayout || null;
  const axisKeys = new Set([
    ...axisKeysForLayout(baseLayout),
    ...axisKeysForLayout(liveLayout || {}),
    ...axisKeysForLayout(fullLayout || {})
  ]);
  if (!axisKeys.size) return baseLayout;

  const overrides = {};
  axisKeys.forEach((axisKey) => {
    const liveAxis = liveLayout?.[axisKey] || fullLayout?.[axisKey];
    if (!liveAxis || typeof liveAxis !== 'object') return;
    const nextAxis = {};
    if (includeRange) {
      if (Object.prototype.hasOwnProperty.call(liveAxis, 'autorange')) {
        nextAxis.autorange = liveAxis.autorange;
      }
      const isAuto = liveAxis.autorange === true || liveAxis.autorange === 'reversed';
      const range = Array.isArray(liveAxis.range) ? liveAxis.range.slice() : null;
      if (range && !isAuto) {
        nextAxis.range = range;
      }
    }
    if (paths.length) {
      copyPaths(nextAxis, liveAxis, paths);
    }
    if (Object.keys(nextAxis).length) {
      overrides[axisKey] = nextAxis;
    }
  });

  if (!Object.keys(overrides).length) return baseLayout;
  const merged = { ...baseLayout };
  Object.keys(overrides).forEach((axisKey) => {
    const baseAxis = baseLayout?.[axisKey];
    const baseAxisObj = baseAxis && typeof baseAxis === 'object' && !Array.isArray(baseAxis)
      ? baseAxis
      : {};
    merged[axisKey] = { ...baseAxisObj, ...overrides[axisKey] };
  });
  return merged;
};

const TRACE_COLOR_PATHS = [
  ['line', 'color'],
  ['marker', 'color'],
  ['marker', 'line', 'color'],
  ['fillcolor']
];
const TRACE_STYLE_PATHS = [
  ['line', 'width'],
  ['line', 'dash'],
  ['opacity'],
  ['mode'],
  ['fill']
];
const TRACE_MARKER_PATHS = [
  ['marker', 'symbol'],
  ['marker', 'size'],
  ['marker', 'opacity'],
  ['marker', 'line', 'width'],
  ['marker', 'line', 'color']
];
const TRACE_COLOR_SCALE_PATHS = [
  ['colorscale'],
  ['autocolorscale'],
  ['cmin'],
  ['cmax'],
  ['cmid'],
  ['reversescale'],
  ['showscale'],
  ['colorbar'],
  ['zmin'],
  ['zmax']
];
const PEAK_MARKER_STYLE_PATHS = [
  ['meta', 'peakMarking', 'display', 'markerStyle'],
  ['meta', 'peakMarking', 'display', 'offsetAmount'],
  ['meta', 'peakMarking', 'display', 'markerSize']
];

const LAYOUT_DIMENSION_PATHS = [
  ['width'],
  ['height'],
  ['autosize'],
  ['margin']
];
const LAYOUT_FONT_PATHS = [
  ['font'],
  ['title', 'font'],
  ['legend', 'font'],
  ['hoverlabel', 'font']
];
const LAYOUT_LEGEND_PATHS = [
  ['showlegend'],
  ['legend']
];
const LAYOUT_BACKGROUND_PATHS = [
  ['paper_bgcolor'],
  ['plot_bgcolor']
];
const LAYOUT_TRACE_COLOR_PATHS = [
  ['colorway']
];
const LAYOUT_COLOR_SCALE_PATHS = [
  ['coloraxis']
];

const AXIS_SCALE_PATHS = [
  ['type'],
  ['range'],
  ['autorange'],
  ['rangemode']
];
const AXIS_FORMAT_PATHS = [
  ['showline'],
  ['linecolor'],
  ['linewidth'],
  ['mirror'],
  ['ticks'],
  ['ticklen'],
  ['tickwidth'],
  ['tickcolor'],
  ['tickfont'],
  ['tickformat'],
  ['tickangle'],
  ['tickprefix'],
  ['ticksuffix'],
  ['ticklabelposition'],
  ['showticklabels'],
  ['zeroline'],
  ['zerolinecolor'],
  ['zerolinewidth'],
  ['title', 'standoff'],
  ['title', 'textangle']
];
const AXIS_FONT_PATHS = [
  ['title', 'font'],
  ['tickfont']
];
const AXIS_GRID_PATHS = [
  ['showgrid'],
  ['gridcolor'],
  ['gridwidth'],
  ['minor', 'showgrid'],
  ['minor', 'gridcolor'],
  ['minor', 'gridwidth']
];

const buildTraceClone = (trace) => {
  if (!trace || typeof trace !== 'object') return trace;
  const next = { ...trace };
  if (trace.line && typeof trace.line === 'object') {
    next.line = { ...trace.line };
  }
  if (trace.marker && typeof trace.marker === 'object') {
    next.marker = { ...trace.marker };
    if (trace.marker.line && typeof trace.marker.line === 'object') {
      next.marker.line = { ...trace.marker.line };
    }
  }
  if (trace.colorbar && typeof trace.colorbar === 'object') {
    next.colorbar = { ...trace.colorbar };
  }
  return next;
};

const markTraceManualColor = (trace) => {
  if (!trace || typeof trace !== 'object') return;
  const meta = { ...(trace.meta || {}) };
  meta.manualColor = true;
  delete meta.autoColorIndex;
  trace.meta = meta;
};

const templateHasColor = (templateTrace) => {
  if (!templateTrace || typeof templateTrace !== 'object') return false;
  return Boolean(
    templateTrace?.line?.color
    || templateTrace?.marker?.color
    || templateTrace?.marker?.line?.color
    || templateTrace?.fillcolor
  );
};

const normalizeTemplateState = (raw = {}) => {
  const templates = raw && typeof raw.templates === 'object' ? raw.templates : {};
  const order = Array.isArray(raw.order) ? raw.order.filter(Boolean) : [];
  const recent = Array.isArray(raw.recent) ? raw.recent.filter(Boolean) : [];
  return { templates, order, recent };
};

const loadStoredTemplates = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { templates: {}, order: [], recent: [] };
  }
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return { templates: {}, order: [], recent: [] };
    return normalizeTemplateState(JSON.parse(raw));
  } catch {
    return { templates: {}, order: [], recent: [] };
  }
};

const saveStoredTemplates = (state) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage failures */
  }
};

const normalizeTemplateName = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ');
};

const applyAxisCopy = (sourceLayout, layoutPatch, paths) => {
  axisKeysForLayout(sourceLayout).forEach((axisKey) => {
    const axis = sourceLayout?.[axisKey];
    if (!axis || typeof axis !== 'object') return;
    if (!layoutPatch[axisKey]) layoutPatch[axisKey] = {};
    copyPaths(layoutPatch[axisKey], axis, paths);
  });
};

const buildTemplateSnapshot = (panelId, figure, getPanelDom) => {
  const sourceLayout = figure?.layout || {};
  const sourceTraces = Array.isArray(figure?.data) ? figure.data : [];
  const sourceLayoutForScales = buildAxisOverrideLayout(
    panelId,
    sourceLayout,
    getPanelDom,
    AXIS_SCALE_PATHS,
    { includeRange: true }
  );
  const sourceLayoutForAxisFormat = buildAxisOverrideLayout(
    panelId,
    sourceLayout,
    getPanelDom,
    AXIS_FORMAT_PATHS
  );
  const sourceLayoutForGrid = buildAxisOverrideLayout(
    panelId,
    sourceLayout,
    getPanelDom,
    AXIS_GRID_PATHS
  );

  const layoutPatch = {};
  const tracePatches = sourceTraces.map((trace) => {
    const patch = {};
    copyPaths(patch, trace, TRACE_COLOR_PATHS);
    copyPaths(patch, trace, TRACE_STYLE_PATHS);
    copyPaths(patch, trace, TRACE_MARKER_PATHS);
    copyPaths(patch, trace, TRACE_COLOR_SCALE_PATHS);
    return patch;
  });

  copyPaths(layoutPatch, sourceLayout, LAYOUT_TRACE_COLOR_PATHS);
  copyPaths(layoutPatch, sourceLayout, LAYOUT_COLOR_SCALE_PATHS);
  copyPaths(layoutPatch, sourceLayout, LAYOUT_DIMENSION_PATHS);
  copyPaths(layoutPatch, sourceLayout, LAYOUT_FONT_PATHS);
  copyPaths(layoutPatch, sourceLayout, LAYOUT_LEGEND_PATHS);
  copyPaths(layoutPatch, sourceLayout, LAYOUT_BACKGROUND_PATHS);
  copyPaths(layoutPatch, sourceLayout, PEAK_MARKER_STYLE_PATHS);
  applyAxisCopy(sourceLayoutForScales, layoutPatch, AXIS_SCALE_PATHS);
  applyAxisCopy(sourceLayoutForAxisFormat, layoutPatch, AXIS_FORMAT_PATHS);
  applyAxisCopy(sourceLayoutForGrid, layoutPatch, AXIS_GRID_PATHS);
  applyAxisCopy(sourceLayout, layoutPatch, AXIS_FONT_PATHS);

  return { traces: tracePatches, layout: layoutPatch };
};

export function createTemplatesController({
  getPanelDom = () => null,
  getPanelFigure = () => ({ data: [], layout: {} }),
  updatePanelFigure = () => {},
  renderPlot = () => {},
  pushHistory = () => {},
  updateHistoryButtons = () => {},
  persist = () => {},
  panelSupportsPlot = () => true,
  isPanelEditLocked = () => false,
  showToast = () => {}
} = {}) {
  const state = loadStoredTemplates();
  const panelStatus = new Map();
  const popoverByPanel = new Map();

  const getTemplateNames = () => {
    const names = state.order.filter((name) => state.templates[name]);
    Object.keys(state.templates).forEach((name) => {
      if (!names.includes(name)) names.push(name);
    });
    return names;
  };

  const touchRecent = (name) => {
    state.recent = [name, ...state.recent.filter((item) => item !== name)].slice(0, RECENT_LIMIT);
  };

  const getPanelState = (panelId) => {
    if (!panelStatus.has(panelId)) {
      panelStatus.set(panelId, { currentTemplate: null, dirty: false });
    }
    return panelStatus.get(panelId);
  };

  const setPanelTemplate = (panelId, name, { dirty = false } = {}) => {
    const status = getPanelState(panelId);
    status.currentTemplate = name || null;
    status.dirty = dirty;
  };

  const resolveSelectedTemplateName = (panelId, popover) => {
    const templateNames = getTemplateNames();
    if (!templateNames.length) return null;
    if (popover) {
      const select = popover.querySelector('[data-template-select]');
      const selected = normalizeTemplateName(select?.value || '');
      if (selected && templateNames.includes(selected)) {
        return selected;
      }
    }
    const status = getPanelState(panelId);
    if (status.currentTemplate && templateNames.includes(status.currentTemplate)) {
      return status.currentTemplate;
    }
    return null;
  };

  const renderPopover = (panelId, popover) => {
    if (!popover) return;
    const status = getPanelState(panelId);
    const currentName = status.currentTemplate && !status.dirty ? status.currentTemplate : null;
    const currentEl = popover.querySelector('[data-template-current]');
    if (currentEl) {
      currentEl.textContent = currentName || 'none';
    }

    const select = popover.querySelector('[data-template-select]');
    const templateNames = getTemplateNames();
    if (select) {
      select.innerHTML = '';
      if (!templateNames.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No templates saved';
        option.disabled = true;
        option.selected = true;
        select.appendChild(option);
        select.disabled = true;
      } else {
        const hasCurrent = Boolean(currentName && templateNames.includes(currentName));
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select a template';
        placeholder.disabled = true;
        placeholder.selected = !hasCurrent;
        select.appendChild(placeholder);
        templateNames.forEach((name) => {
          const option = document.createElement('option');
          option.value = name;
          option.textContent = name;
          select.appendChild(option);
        });
        if (hasCurrent) {
          select.value = currentName;
        }
        select.disabled = false;
      }
    }

    const actionButtons = popover.querySelectorAll('[data-template-action]');
    const hasTemplates = templateNames.length > 0;
    const selectedName = resolveSelectedTemplateName(panelId, popover);
    actionButtons.forEach((btn) => {
      btn.disabled = !hasTemplates || !selectedName;
    });

    const recentList = popover.querySelector('[data-template-recent-list]');
    if (recentList) {
      recentList.innerHTML = '';
      if (!state.recent.length) {
        const empty = document.createElement('div');
        empty.className = 'workspace-panel-popover-subtle';
        empty.textContent = 'No recent templates';
        recentList.appendChild(empty);
      } else {
        state.recent.forEach((name) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-outline-secondary btn-sm text-start';
          button.textContent = name;
          button.dataset.templateRecent = name;
          recentList.appendChild(button);
        });
      }
    }
  };

  const promptForName = (message = 'Template name', defaultValue = '') => {
    if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
    const raw = window.prompt(message, defaultValue);
    const name = normalizeTemplateName(raw || '');
    return name || null;
  };

  const saveTemplate = (panelId, popover) => {
    if (!panelId) return;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
      showToast('Templates only apply to plot panels.', 'info');
      return;
    }
    const name = promptForName('Template name');
    if (!name) return;
    const exists = Boolean(state.templates[name]);
    if (exists && typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(`Overwrite template "${name}"?`);
      if (!confirmed) return;
    }
    const figure = getPanelFigure(panelId);
    const templatePayload = buildTemplateSnapshot(panelId, figure, getPanelDom);
    const timestamp = Date.now();
    state.templates[name] = {
      name,
      createdAt: state.templates[name]?.createdAt || timestamp,
      updatedAt: timestamp,
      ...templatePayload
    };
    state.order = [name, ...state.order.filter((item) => item !== name)];
    touchRecent(name);
    saveStoredTemplates(state);
    setPanelTemplate(panelId, name, { dirty: false });
    renderPopover(panelId, popover);
    showToast(`Saved template "${name}".`, 'success');
  };

  const applyTemplate = (panelId, name, popover) => {
    if (!panelId || !name) return;
    if (typeof panelSupportsPlot === 'function' && !panelSupportsPlot(panelId)) {
      showToast('Templates only apply to plot panels.', 'info');
      return;
    }
    if (typeof isPanelEditLocked === 'function' && isPanelEditLocked(panelId)) {
      showToast('Graph is locked.', 'info');
      return;
    }
    const template = state.templates[name];
    if (!template) {
      showToast('Template not found.', 'warning');
      return;
    }
    const targetFigure = getPanelFigure(panelId);
    const targetLayout = targetFigure?.layout || {};
    const targetLayoutForMerge = buildAxisOverrideLayout(
      panelId,
      targetLayout,
      getPanelDom,
      AXIS_SCALE_PATHS,
      { includeRange: true }
    );
    const targetTraces = Array.isArray(targetFigure?.data)
      ? targetFigure.data.map((trace) => buildTraceClone(trace))
      : [];
    const templateTraces = Array.isArray(template.traces) ? template.traces : [];
    const count = Math.min(targetTraces.length, templateTraces.length);
    for (let i = 0; i < count; i += 1) {
      const templateTrace = cloneValue(templateTraces[i]);
      mergeDeep(targetTraces[i], templateTrace);
      if (templateHasColor(templateTrace)) {
        markTraceManualColor(targetTraces[i]);
      }
    }
    const layoutPatch = cloneValue(template.layout || {});
    const nextFigure = {
      ...targetFigure,
      data: targetTraces,
      layout: mergeDeep({ ...targetLayoutForMerge }, layoutPatch)
    };

    pushHistory({
      label: `Apply template: ${name}`,
      meta: {
        action: 'templates',
        template: name
      }
    });
    updatePanelFigure(panelId, nextFigure, { source: 'template', skipTemplateDirty: true });
    renderPlot(panelId);
    persist();
    updateHistoryButtons();
    touchRecent(name);
    saveStoredTemplates(state);
    setPanelTemplate(panelId, name, { dirty: false });
    renderPopover(panelId, popover);
    showToast(`Applied template "${name}".`, 'success');
  };

  const renameTemplate = (panelId, popover) => {
    const name = resolveSelectedTemplateName(panelId, popover);
    if (!name) {
      showToast('Select a template to rename.', 'info');
      return;
    }
    const nextName = promptForName('Rename template', name);
    if (!nextName || nextName === name) return;
    if (state.templates[nextName]) {
      showToast('A template with that name already exists.', 'warning');
      return;
    }
    state.templates[nextName] = {
      ...state.templates[name],
      name: nextName,
      updatedAt: Date.now()
    };
    delete state.templates[name];
    state.order = state.order.map((item) => (item === name ? nextName : item));
    state.recent = state.recent.map((item) => (item === name ? nextName : item));
    panelStatus.forEach((status) => {
      if (status.currentTemplate === name) {
        status.currentTemplate = nextName;
      }
    });
    saveStoredTemplates(state);
    renderPopover(panelId, popover);
    showToast(`Renamed template to "${nextName}".`, 'success');
  };

  const deleteTemplate = (panelId, popover) => {
    const name = resolveSelectedTemplateName(panelId, popover);
    if (!name) {
      showToast('Select a template to delete.', 'info');
      return;
    }
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(`Delete template "${name}"?`);
      if (!confirmed) return;
    }
    delete state.templates[name];
    state.order = state.order.filter((item) => item !== name);
    state.recent = state.recent.filter((item) => item !== name);
    panelStatus.forEach((status) => {
      if (status.currentTemplate === name) {
        status.currentTemplate = null;
        status.dirty = false;
      }
    });
    saveStoredTemplates(state);
    renderPopover(panelId, popover);
    showToast(`Deleted template "${name}".`, 'success');
  };

  const duplicateTemplate = (panelId, popover) => {
    const sourceName = resolveSelectedTemplateName(panelId, popover);
    if (!sourceName) {
      showToast('Select a template to duplicate.', 'info');
      return;
    }
    const baseName = `${sourceName}_copy`;
    let candidate = baseName;
    let counter = 2;
    while (state.templates[candidate]) {
      candidate = `${baseName}${counter}`;
      counter += 1;
    }
    const template = state.templates[sourceName];
    const timestamp = Date.now();
    state.templates[candidate] = {
      ...cloneValue(template),
      name: candidate,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.order = [candidate, ...state.order.filter((item) => item !== candidate)];
    touchRecent(candidate);
    saveStoredTemplates(state);
    renderPopover(panelId, popover);
    showToast(`Duplicated template as "${candidate}".`, 'success');
  };

  const handlePopoverOpen = (panelId, popover) => {
    if (!panelId || !popover) return;
    popoverByPanel.set(panelId, popover);
    renderPopover(panelId, popover);
  };

  const handlePanelFigureUpdate = (panelId, { source, skipTemplateDirty } = {}) => {
    if (!panelId) return;
    const status = getPanelState(panelId);
    if (!status.currentTemplate) return;
    if (skipTemplateDirty) return;
    if (source === 'template') return;
    status.dirty = true;
    const popover = popoverByPanel.get(panelId);
    if (popover && popover.classList.contains('is-open')) {
      renderPopover(panelId, popover);
    }
  };

  return {
    handlePopoverOpen,
    handleSaveTemplate: saveTemplate,
    handleApplyTemplate: applyTemplate,
    handleRenameTemplate: renameTemplate,
    handleDeleteTemplate: deleteTemplate,
    handleDuplicateTemplate: duplicateTemplate,
    handlePanelFigureUpdate,
    teardown() {
      popoverByPanel.clear();
      panelStatus.clear();
    }
  };
}
