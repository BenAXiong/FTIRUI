/**
 * Responsibility: Manage Plotly rendering for workspace panels without owning business logic.
 * Inputs: receives panel identifiers, DOM nodes, and figure data prepared by upstream controllers.
 * Outputs: updates Plotly-managed DOM elements and returns promises for render/resize tasks.
 * Never: never mutate PanelsModel state, never access browser UI modules, never emit autosave/history events.
 */

const rendered = new WeakSet();  // marks containers that had an initial render
const resizeQueue = new Set();
let resizeRaf = null;
const MODEBAR_NUMBER_ICONS = {
  one: {
    width: 24,
    height: 24,
    path: 'M11 4 H13 V20 H11 Z'
  },
  two: {
    width: 24,
    height: 24,
    path: 'M6 4 H18 V7 H6 Z M15 7 H18 V12 H15 Z M6 12 H18 V15 H6 Z M6 15 H9 V20 H6 Z M6 20 H18 V23 H6 Z'
  },
  three: {
    width: 24,
    height: 24,
    path: 'M6 4 H18 V7 H6 Z M6 12 H18 V15 H6 Z M6 20 H18 V23 H6 Z M15 7 H18 V20 H15 Z'
  }
};

const alertModebar = (message) => {
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(message);
  }
};

const MODEBAR_CUSTOM_BUTTONS = [
  {
    name: 'Preset 1',
    title: 'Preset 1',
    icon: MODEBAR_NUMBER_ICONS.one,
    click: () => alertModebar('1')
  },
  {
    name: 'Preset 2',
    title: 'Preset 2',
    icon: MODEBAR_NUMBER_ICONS.two,
    click: () => alertModebar('2')
  },
  {
    name: 'Preset 3',
    title: 'Preset 3',
    icon: MODEBAR_NUMBER_ICONS.three,
    click: () => alertModebar('3')
  }
];

const plotConfig = {
  responsive: true,
  displayModeBar: true,
  displaylogo: false,
  editable: true,
  edits: {
    legendPosition: true
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
