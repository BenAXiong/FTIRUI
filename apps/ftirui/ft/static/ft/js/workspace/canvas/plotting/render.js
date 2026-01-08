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
  }
};

const togglePlotTitle = (gd) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const layout = gd.layout || {};
  const title = layout.title;
  const rawText = typeof title === 'string'
    ? title
    : (title && typeof title === 'object' ? title.text : '');
  const current = typeof rawText === 'string' ? rawText.trim() : '';
  if (current) {
    gd.__workspaceTitleCache = current;
    Plotly.relayout(gd, { 'title.text': '' });
  } else {
    const next = gd.__workspaceTitleCache || '';
    Plotly.relayout(gd, { 'title.text': next });
  }
};

const toggleDragMode = (gd, mode) => {
  if (!gd || typeof Plotly === 'undefined') return;
  const current = gd.layout?.dragmode || gd._fullLayout?.dragmode || 'zoom';
  if (current === mode) {
    Plotly.relayout(gd, { dragmode: gd.__workspaceDragmodeCache || 'zoom' });
    return;
  }
  gd.__workspaceDragmodeCache = current;
  Plotly.relayout(gd, { dragmode: mode });
};

const MODEBAR_CUSTOM_BUTTONS = [
  {
    name: 'Plot title',
    title: 'Toggle plot title',
    icon: MODEBAR_LETTER_ICONS.t,
    click: (gd) => togglePlotTitle(gd)
  },
  {
    name: 'Notes',
    title: 'Draw text note',
    icon: MODEBAR_LETTER_ICONS.n,
    click: (gd) => toggleDragMode(gd, 'drawtext')
  },
  {
    name: 'Draw line',
    title: 'Draw line',
    icon: MODEBAR_LETTER_ICONS.l,
    click: (gd) => toggleDragMode(gd, 'drawline')
  },
  {
    name: 'Draw rect',
    title: 'Draw rectangle',
    icon: MODEBAR_LETTER_ICONS.r,
    click: (gd) => toggleDragMode(gd, 'drawrect')
  }
];

const plotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  editable: true,
  edits: {
    legendPosition: true,
    titleText: true
  },
  modeBarButtons: [[
    'resetScale2d',
    ...MODEBAR_CUSTOM_BUTTONS
  ]]
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
  // eslint-disable-next-line no-undef
  await Plotly.newPlot(containerEl, figure?.data ?? [], figure?.layout ?? {}, resolvePlotConfig(figure));
  rendered.add(containerEl);
}

export async function renderUpdate(panelId, containerEl, figure) {
  if (!containerEl) throw new Error('renderUpdate: missing containerEl');
  if (!isRendered(containerEl)) {
    await renderInitial(panelId, containerEl, figure);
    return;
  }
  // eslint-disable-next-line no-undef
  await Plotly.react(containerEl, figure?.data ?? [], figure?.layout ?? {}, resolvePlotConfig(figure));
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
