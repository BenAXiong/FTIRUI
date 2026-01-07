/**
 * Responsibility: Manage Plotly rendering for workspace panels without owning business logic.
 * Inputs: receives panel identifiers, DOM nodes, and figure data prepared by upstream controllers.
 * Outputs: updates Plotly-managed DOM elements and returns promises for render/resize tasks.
 * Never: never mutate PanelsModel state, never access browser UI modules, never emit autosave/history events.
 */

const rendered = new WeakSet();  // marks containers that had an initial render
const resizeQueue = new Set();
let resizeRaf = null;
const plotConfig = {
  responsive: true,
  displayModeBar: true,
  editable: true,
  edits: {
    legendPosition: true
  }
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
    width, height, scale = 2, filename = `panel-${panelId}`
  } = opts;
  // eslint-disable-next-line no-undef
  const url = await Plotly.toImage(containerEl, { format, width, height, scale });
  // trigger download
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function applyRelayout(panelId, containerEl, layoutPatch) {
  if (!containerEl || !layoutPatch) return;
  // eslint-disable-next-line no-undef
  await Plotly.relayout(containerEl, layoutPatch);
}
