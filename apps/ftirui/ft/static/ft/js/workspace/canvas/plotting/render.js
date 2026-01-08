/**
 * Responsibility: Manage Plotly rendering for workspace panels without owning business logic.
 * Inputs: receives panel identifiers, DOM nodes, and figure data prepared by upstream controllers.
 * Outputs: updates Plotly-managed DOM elements and returns promises for render/resize tasks.
 * Never: never mutate PanelsModel state, never access browser UI modules, never emit autosave/history events.
 */

const rendered = new WeakSet();  // marks containers that had an initial render
const resizeQueue = new Set();
let resizeRaf = null;
const MODEBAR_LETTER_ICONS = {
  t: {
    width: 24,
    height: 24,
    path: 'M4 5 H20 V8 H13 V20 H11 V8 H4 Z'
  },
  n: {
    width: 24,
    height: 24,
    path: 'M5 4 H8 V20 H5 Z M16 4 H19 V20 H16 Z M8 4 L16 20 H13 L5 4 Z'
  },
  l: {
    width: 24,
    height: 24,
    path: 'M6 4 H10 V16 H18 V20 H6 Z'
  },
  r: {
    width: 24,
    height: 24,
    path: 'M5 4 H13 Q19 4 19 10 Q19 15 13 15 H10 V20 H5 Z M10 15 L19 20 H14 L8 15 Z'
  },
  p: {
    width: 24,
    height: 24,
    path: 'M5 4 H13 Q19 4 19 10 Q19 16 13 16 H9 V20 H5 Z M9 8 V12 H13 Q15 12 15 10 Q15 8 13 8 Z'
  },
  c: {
    width: 24,
    height: 24,
    path: 'M19 6 Q16 4 12 4 Q7 4 5 9 V15 Q7 20 12 20 Q16 20 19 18 L17 16 Q15 17 12 17 Q9 17 8 14 V10 Q9 7 12 7 Q15 7 17 8 Z'
  },
  e: {
    width: 24,
    height: 24,
    path: 'M6 4 H18 V7 H10 V12 H16 V15 H10 V20 H18 V23 H6 Z'
  }
};
const MODEBAR_CUSTOM_ICONS = {
  note: {
    width: 24,
    height: 24,
    path: 'M6 3 H15 L19 7 V21 H6 Z M15 3 V7 H19'
  },
  rect: {
    width: 24,
    height: 24,
    path: 'M5 5 H19 V19 H5 Z'
  },
  squiggle: {
    width: 24,
    height: 24,
    path: 'M3 15 Q6 5 10 12 T17 12 Q20 10 21 7'
  },
  crosshair: {
    width: 24,
    height: 24,
    path: 'M12 4 V9 M12 15 V20 M4 12 H9 M15 12 H20 M12 9 A3 3 0 1 0 12 15 A3 3 0 1 0 12 9'
  },
  clear: {
    width: 24,
    height: 24,
    path: 'M8 4 H16 L17 6 H21 V8 H3 V6 H7 Z M6 8 H18 L17 20 H7 Z'
  }
};

const resolveIcon = (name, fallback) => {
  if (typeof Plotly !== 'undefined' && Plotly?.Icons?.[name]) {
    return Plotly.Icons[name];
  }
  return fallback;
};

const normalizeLayout = (layout = {}) => {
  if (!layout || typeof layout !== 'object') return layout;
  let next = layout;
  if (layout.title || layout.subtitle) {
    next = { ...next };
    delete next.title;
    delete next.subtitle;
  }
  return next;
};

const focusAnnotation = (gd, index) => {
  if (!gd || typeof index !== 'number') return;
  const selector = `.infolayer .annotation[data-index="${index}"] .annotation-text`;
  const target = gd.querySelector(selector) || gd.querySelector(`.infolayer .annotation[data-index="${index}"] text`);
  if (!target) return;
  const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
  const dblClickEvent = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
  target.dispatchEvent(clickEvent);
  target.dispatchEvent(dblClickEvent);
};

const togglePlotTitle = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const annotations = Array.isArray(gd.layout?.annotations)
    ? gd.layout.annotations.slice()
    : [];
  const titleIndex = annotations.findIndex((ann) => ann?.meta?.workspaceTitle);
  if (titleIndex >= 0) {
    const currentText = typeof annotations[titleIndex]?.text === 'string'
      ? annotations[titleIndex].text.trim()
      : '';
    if (currentText) {
      gd.__workspaceTitleCache = currentText;
    }
    annotations.splice(titleIndex, 1);
    Plotly.relayout(gd, {
      annotations,
      'title.text': null,
      'title.subtitle': null
    });
    return;
  }
  const next = gd.__workspaceTitleCache || 'Plot title';
  annotations.push({
    text: next,
    xref: 'paper',
    yref: 'paper',
    x: 0.5,
    y: 0.98,
    xanchor: 'center',
    yanchor: 'top',
    showarrow: false,
    align: 'center',
    editable: true,
    captureevents: true,
    font: {
      size: 16,
      color: '#0f172a',
      family: 'Open Sans, verdana, arial, sans-serif',
      weight: 600
    },
    meta: { workspaceTitle: true }
  });
  Plotly.relayout(gd, {
    annotations,
    'title.text': null,
    'title.subtitle': null
  });
};

const addPlotNote = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const annotations = Array.isArray(gd.layout?.annotations)
    ? gd.layout.annotations.slice()
    : (Array.isArray(gd._fullLayout?.annotations) ? gd._fullLayout.annotations.slice() : []);
  const note = {
    text: 'Note',
    xref: 'paper',
    yref: 'paper',
    x: 0.5,
    y: 0.5,
    showarrow: false,
    align: 'left',
    bgcolor: 'rgba(0,0,0,0)',
    borderwidth: 0,
    borderpad: 0,
    font: {
      size: 12,
      color: '#0f172a'
    },
    captureevents: true,
    meta: { workspaceNote: true }
  };
  annotations.push(note);
  const index = annotations.length - 1;
  const relayoutPromise = Plotly.relayout(gd, { annotations });
  if (relayoutPromise && typeof relayoutPromise.then === 'function') {
    relayoutPromise.then(() => requestAnimationFrame(() => focusAnnotation(gd, index)));
  }
};

const ensureNoteCleanup = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  if (gd.__workspaceNoteCleanup) return;
  const clampTitle = (ann) => {
    if (!ann?.meta?.workspaceTitle || typeof ann?.y !== 'number') return ann;
    const clamped = Math.min(1, Math.max(0, ann.y));
    if (clamped === ann.y) return ann;
    return { ...ann, y: clamped };
  };
  const handler = (relayoutData = {}) => {
    const relayoutKeys = Object.keys(relayoutData);
    const touchesAnnotations = relayoutKeys.some((key) => key.startsWith('annotations[') || key === 'annotations');
    if (!touchesAnnotations) return;
    const annotations = Array.isArray(gd.layout?.annotations)
      ? gd.layout.annotations.slice()
      : [];
    if (!annotations.length) return;
    let changed = false;
    const next = [];
    annotations.forEach((ann) => {
      const isWorkspace = ann?.meta?.workspaceNote || ann?.meta?.workspaceTitle;
      if (isWorkspace) {
        const text = typeof ann?.text === 'string' ? ann.text.trim() : '';
        if (!text.length) {
          changed = true;
          return;
        }
      }
      const normalized = clampTitle(ann);
      if (normalized !== ann) {
        changed = true;
      }
      next.push(normalized);
    });
    if (!changed) return;
    Plotly.relayout(gd, { annotations: next });
  };
  if (typeof gd.on === 'function') {
    gd.on('plotly_relayout', handler);
  } else if (typeof gd.addEventListener === 'function') {
    gd.addEventListener('plotly_relayout', handler);
  }
  gd.__workspaceNoteCleanup = handler;
};

const ensureShapeEraser = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  if (gd.__workspaceEraseHandler) return;
  const handler = (event) => {
    if (!gd.__workspaceEraseMode) return;
    const target = event?.target;
    if (!target?.closest) return;
    const inShapeLayer = target.closest('.shapelayer');
    if (!inShapeLayer) return;
    const shapes = Array.isArray(gd.layout?.shapes)
      ? gd.layout.shapes.slice()
      : (Array.isArray(gd._fullLayout?.shapes) ? gd._fullLayout.shapes.slice() : []);
    if (!shapes.length) return;
    const indexed = target.closest('[data-index]');
    let index = indexed ? Number(indexed.getAttribute('data-index')) : NaN;
    if (!Number.isFinite(index) || index < 0 || index >= shapes.length) {
      index = shapes.length - 1;
    }
    shapes.splice(index, 1);
    Plotly.relayout(gd, { shapes });
  };
  gd.addEventListener('click', handler);
  gd.__workspaceEraseHandler = handler;
};

const toggleDragMode = (gd, mode) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const current = gd.layout?.dragmode || gd._fullLayout?.dragmode || 'zoom';
  if (current === mode) {
    Plotly.relayout(gd, { dragmode: gd.__workspaceDragmodeCache || 'zoom' });
    gd.__workspaceEraseMode = false;
    return;
  }
  gd.__workspaceDragmodeCache = current;
  gd.__workspaceEraseMode = mode === 'eraseshape';
  if (gd.__workspaceEraseMode) {
    ensureShapeEraser(gd);
  }
  Plotly.relayout(gd, { dragmode: mode });
};

const toggleCrosshair = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const currentX = gd.layout?.xaxis?.showspikes ?? gd._fullLayout?.xaxis?.showspikes;
  const currentY = gd.layout?.yaxis?.showspikes ?? gd._fullLayout?.yaxis?.showspikes;
  const isOn = !!(currentX || currentY);
  const patch = isOn
    ? {
        'xaxis.showspikes': false,
        'yaxis.showspikes': false,
        hovermode: 'closest'
      }
    : {
        'xaxis.showspikes': true,
        'yaxis.showspikes': true,
        'xaxis.spikemode': 'across',
        'yaxis.spikemode': 'across',
        'xaxis.spikesnap': 'cursor',
        'yaxis.spikesnap': 'cursor',
        'xaxis.spikethickness': 1,
        'yaxis.spikethickness': 1,
        hovermode: 'x'
      };
  Plotly.relayout(gd, patch);
};

const clearUserDrawings = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const annotations = Array.isArray(gd.layout?.annotations)
    ? gd.layout.annotations.slice()
    : (Array.isArray(gd._fullLayout?.annotations) ? gd._fullLayout.annotations.slice() : []);
  const shapes = Array.isArray(gd.layout?.shapes)
    ? gd.layout.shapes.slice()
    : (Array.isArray(gd._fullLayout?.shapes) ? gd._fullLayout.shapes.slice() : []);
  const keepAnnotations = annotations.filter((ann) => ann?.meta?.peakOverlay === true);
  const keepShapes = shapes.filter((shape) => shape?.meta?.peakOverlay === true);
  Plotly.relayout(gd, {
    annotations: keepAnnotations,
    shapes: keepShapes
  });
};

const MODEBAR_CUSTOM_BUTTONS = [
  {
    name: 'Crosshair cursor',
    title: 'Toggle crosshair cursor',
    icon: MODEBAR_CUSTOM_ICONS.crosshair,
    click: (gd) => toggleCrosshair(gd)
  },
  {
    name: 'Plot title',
    title: 'Toggle plot title',
    icon: MODEBAR_LETTER_ICONS.t,
    click: (gd) => togglePlotTitle(gd)
  },
  {
    name: 'Notes',
    title: 'Draw text note',
    icon: MODEBAR_CUSTOM_ICONS.note,
    click: (gd) => addPlotNote(gd)
  },
  {
    name: 'Draw line',
    title: 'Draw line',
    icon: resolveIcon('drawline', MODEBAR_LETTER_ICONS.l),
    click: (gd) => toggleDragMode(gd, 'drawline')
  },
  {
    name: 'Draw rect',
    title: 'Draw rectangle',
    icon: MODEBAR_CUSTOM_ICONS.rect,
    click: (gd) => toggleDragMode(gd, 'drawrect')
  },
  {
    name: 'Draw open path',
    title: 'Draw freehand path',
    icon: resolveIcon('drawopenpath', MODEBAR_LETTER_ICONS.p),
    click: (gd) => toggleDragMode(gd, 'drawopenpath')
  },
  {
    name: 'Draw closed path',
    title: 'Draw closed path',
    icon: resolveIcon('drawclosedpath', MODEBAR_CUSTOM_ICONS.squiggle),
    click: (gd) => toggleDragMode(gd, 'drawclosedpath')
  },
  {
    name: 'Erase shape',
    title: 'Erase shape',
    icon: resolveIcon('eraseshape', MODEBAR_LETTER_ICONS.e),
    click: (gd) => toggleDragMode(gd, 'eraseshape')
  },
  {
    name: 'Clear drawings',
    title: 'Clear drawings',
    icon: resolveIcon('trash', MODEBAR_CUSTOM_ICONS.clear),
    click: (gd) => clearUserDrawings(gd)
  }
];

const plotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  editable: true,
  edits: {
    legendPosition: true,
    titleText: false,
    annotationText: true,
    annotationPosition: true,
    shapePosition: true
  },
  modeBarButtonsToAdd: MODEBAR_CUSTOM_BUTTONS
};
const lockedPlotConfig = {
  ...plotConfig,
  displayModeBar: false,
  editable: false,
  staticPlot: true
};
const resolvePlotConfig = (figure) => (
  figure?.layout?.meta?.workspacePanel?.editLocked === true
    ? lockedPlotConfig
    : plotConfig
);

function _scheduleResizeFlush() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(async () => {
    const items = Array.from(resizeQueue);
    resizeQueue.clear();
    resizeRaf = null;
    for (const { panelId, el } of items) {
      try {
        // Plotly relayout to fit container; no model writes here.
        if (el && el.offsetParent !== null) {
          // Use Plotly.Plots.resize to compute size from parent box
          // eslint-disable-next-line no-undef
          await Plotly.Plots.resize(el);
        }
      } catch (e) {
        // swallow to avoid breaking batch
        console.error('[render.resize] panel', panelId, e);
      }
    }
  });
}

export function isRendered(containerEl) {
  return rendered.has(containerEl);
}

export async function renderInitial(panelId, containerEl, figure) {
  if (!containerEl) throw new Error('renderInitial: missing containerEl');
  const layout = normalizeLayout(figure?.layout ?? {});
  // eslint-disable-next-line no-undef
  await Plotly.newPlot(containerEl, figure?.data ?? [], layout, resolvePlotConfig(figure));
  ensureNoteCleanup(containerEl);
  rendered.add(containerEl);
}

export async function renderUpdate(panelId, containerEl, figure) {
  if (!containerEl) throw new Error('renderUpdate: missing containerEl');
  if (!isRendered(containerEl)) {
    await renderInitial(panelId, containerEl, figure);
    return;
  }
  const layout = normalizeLayout(figure?.layout ?? {});
  // eslint-disable-next-line no-undef
  await Plotly.react(containerEl, figure?.data ?? [], layout, resolvePlotConfig(figure));
  ensureNoteCleanup(containerEl);
  rendered.add(containerEl);
}

export function resize(panelId, containerEl) {
  if (!containerEl) return;
  resizeQueue.add({ panelId, el: containerEl });
  _scheduleResizeFlush();
}

export async function exportFigure(panelId, containerEl, opts = {}) {
  if (!containerEl) throw new Error('exportFigure: missing containerEl');
  const {
    format = 'png',       // 'png' | 'svg' | 'jpeg' | 'webp'
    width, height, scale = 2, background, view = 'current', figure
  } = opts;
  const exportOpts = { format, width, height, scale };
  const wantsCustomBackground = background === 'white' || background === 'transparent';
  const wantsFullRange = view === 'full';
  const useScratch = wantsCustomBackground || wantsFullRange;

  const cloneFigure = (value) => {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  };

  const applyFullRange = (layout = {}) => {
    Object.keys(layout).forEach((key) => {
      if (!/^xaxis\d*$/.test(key) && !/^yaxis\d*$/.test(key)) return;
      const axis = layout[key];
      if (!axis || typeof axis !== 'object') return;
      const isReversed = axis.autorange === 'reversed'
        || (Array.isArray(axis.range)
          && axis.range.length === 2
          && Number(axis.range[0]) > Number(axis.range[1]));
      axis.autorange = isReversed ? 'reversed' : true;
      if (Object.prototype.hasOwnProperty.call(axis, 'range')) {
        delete axis.range;
      }
    });
  };

  const applyBackground = (layout = {}) => {
    if (background === 'transparent') {
      layout.paper_bgcolor = 'rgba(0,0,0,0)';
      layout.plot_bgcolor = 'rgba(0,0,0,0)';
    } else if (background === 'white') {
      layout.paper_bgcolor = '#ffffff';
      layout.plot_bgcolor = '#ffffff';
    }
  };

  if (!useScratch) {
    // eslint-disable-next-line no-undef
    return Plotly.toImage(containerEl, exportOpts);
  }

  const sourceFigure = figure || {
    data: containerEl.data ?? [],
    layout: containerEl.layout ?? {}
  };
  const nextFigure = cloneFigure(sourceFigure || {});
  nextFigure.data = Array.isArray(nextFigure.data) ? nextFigure.data : [];
  nextFigure.layout = nextFigure.layout && typeof nextFigure.layout === 'object' ? nextFigure.layout : {};
  if (wantsFullRange) {
    applyFullRange(nextFigure.layout);
  }
  if (wantsCustomBackground) {
    applyBackground(nextFigure.layout);
  }

  const resolvedWidth = Number.isFinite(Number(width)) && Number(width) > 0
    ? Math.round(Number(width))
    : Math.round(containerEl.offsetWidth || containerEl.clientWidth || 800);
  const resolvedHeight = Number.isFinite(Number(height)) && Number(height) > 0
    ? Math.round(Number(height))
    : Math.round(containerEl.offsetHeight || containerEl.clientHeight || 600);

  const scratch = document.createElement('div');
  scratch.style.position = 'fixed';
  scratch.style.left = '-10000px';
  scratch.style.top = '0';
  scratch.style.width = `${resolvedWidth}px`;
  scratch.style.height = `${resolvedHeight}px`;
  scratch.style.opacity = '0';
  scratch.style.pointerEvents = 'none';
  document.body.appendChild(scratch);

  try {
    // eslint-disable-next-line no-undef
    await Plotly.newPlot(scratch, nextFigure.data ?? [], nextFigure.layout ?? {}, {
      staticPlot: true,
      displayModeBar: false,
      responsive: false,
      editable: false
    });
    // eslint-disable-next-line no-undef
    return Plotly.toImage(scratch, exportOpts);
  } finally {
    // eslint-disable-next-line no-undef
    if (typeof Plotly !== 'undefined' && typeof Plotly.purge === 'function') {
      try {
        Plotly.purge(scratch);
      } catch (e) {
        // ignore purge errors
      }
    }
    scratch.remove();
  }
}

export async function applyRelayout(panelId, containerEl, layoutPatch) {
  if (!containerEl || !layoutPatch) return;
  // eslint-disable-next-line no-undef
  await Plotly.relayout(containerEl, layoutPatch);
}
