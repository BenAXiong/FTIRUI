import { buildData, buildLayout } from '../../core/plot/index.js';

const STORAGE_KEY = 'ftir.workspace.canvas.v1';
const MIN_WIDTH = 260;
const MIN_HEIGHT = 200;

export function initWorkspaceCanvas(instance) {
  const canvas = document.getElementById('b_canvas_root');
  const addPlotBtn = document.getElementById('b_canvas_add_plot');
  const resetBtn = document.getElementById('b_canvas_reset_layout');
  if (!canvas || canvas.dataset.initialized === '1') return;
  canvas.dataset.initialized = '1';

  const panels = new Map();
  const interact = typeof window !== 'undefined' ? window.interact : null;

  const resizeAll = () => {
    panels.forEach(({ plotEl }) => {
      if (plotEl && typeof Plotly?.Plots?.resize === 'function') {
        Plotly.Plots.resize(plotEl);
      }
    });
  };

  const scheduleResize = (entry) => {
    if (!entry) return;
    if (entry.resizeFrame) return;
    entry.resizeFrame = requestAnimationFrame(() => {
      entry.resizeFrame = null;
      if (entry.plotEl && typeof Plotly?.Plots?.resize === 'function') {
        Plotly.Plots.resize(entry.plotEl);
      }
    });
  };

  const updateCanvasState = () => {
    canvas.classList.toggle('has-panels', panels.size > 0);
  };

  const persist = () => {
    const payload = {
      version: 1,
      panels: Array.from(panels.values()).map(({ state }) => ({
        id: state.id,
        type: state.type,
        x: state.x,
        y: state.y,
        width: state.width,
        height: state.height,
        figure: state.figure
      }))
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn('Failed to persist workspace layout', err);
    }
    updateCanvasState();
  };

  const clearStorage = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to clear workspace layout', err);
    }
  };

  const loadSavedPanels = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.panels)) {
        return parsed.panels;
      }
    } catch (err) {
      console.warn('Failed to load workspace layout', err);
    }
    return [];
  };

  const generatePanelId = () => 'canvas_' + Math.random().toString(36).slice(2, 9);

  const cloneFigure = (figure) => {
    if (!figure) return figure;
    try {
      return JSON.parse(JSON.stringify(figure));
    } catch (err) {
      console.warn('Failed to clone figure', err);
      return figure;
    }
  };

  const buildSampleFigure = () => {
    const points = Array.from({ length: 120 }, (_, idx) => idx / 10);
    return {
      data: [
        {
          type: 'scatter',
          mode: 'lines',
          name: 'sin(x)',
          x: points,
          y: points.map((v) => Math.sin(v)),
          line: { color: '#0d6efd', width: 2 }
        },
        {
          type: 'scatter',
          mode: 'lines',
          name: 'cos(x)',
          x: points,
          y: points.map((v) => Math.cos(v)),
          line: { color: '#6610f2', width: 2 }
        }
      ],
      layout: {
        hovermode: 'x',
        margin: { l: 50, r: 15, t: 30, b: 40 },
        xaxis: { title: { text: 'x' } },
        yaxis: { title: { text: 'Amplitude' } },
        legend: { orientation: 'h' }
      }
    };
  };

  const figureFromInstance = () => {
    if (instance?.state?.order?.length) {
      const data = buildData(instance.state);
      const layout = buildLayout(instance.state);
      return { figure: { data, layout }, fallback: false };
    }
    return { figure: buildSampleFigure(), fallback: true };
  };

  const applyPosition = (entry) => {
    entry.el.style.transform = `translate(${entry.state.x}px, ${entry.state.y}px)`;
  };

  const applySize = (entry) => {
    entry.el.style.width = `${entry.state.width}px`;
    entry.el.style.height = `${entry.state.height}px`;
  };

  const removePanel = (id) => {
    const entry = panels.get(id);
    if (!entry) return;
    panels.delete(id);
    entry.el.remove();
    persist();
    if (typeof window?.showAppToast === 'function') {
      window.showAppToast({ message: 'Panel removed from canvas.', variant: 'info', delay: 2400 });
    }
  };

  const configureInteractivity = (entry) => {
    if (!interact) return;
    interact(entry.el)
      .draggable({
        inertia: true,
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: canvas,
            endOnly: true
          })
        ],
        listeners: {
          start: () => {
            entry.el.classList.add('is-active');
            canvas.classList.add('is-active');
          },
          move: (event) => {
            entry.state.x += event.dx;
            entry.state.y += event.dy;
            applyPosition(entry);
          },
          end: () => {
            entry.el.classList.remove('is-active');
            canvas.classList.remove('is-active');
            persist();
          }
        }
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        inertia: true,
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: canvas,
            endOnly: true
          }),
          interact.modifiers.restrictSize({
            min: { width: MIN_WIDTH, height: MIN_HEIGHT }
          })
        ],
        listeners: {
          start: () => {
            entry.el.classList.add('is-active');
            canvas.classList.add('is-active');
          },
          move: (event) => {
            entry.state.width = Math.max(MIN_WIDTH, event.rect.width);
            entry.state.height = Math.max(MIN_HEIGHT, event.rect.height);
            entry.state.x += event.deltaRect.left;
            entry.state.y += event.deltaRect.top;
            applySize(entry);
            applyPosition(entry);
            scheduleResize(entry);
          },
          end: () => {
            entry.el.classList.remove('is-active');
            canvas.classList.remove('is-active');
            persist();
          }
        }
      });
  };

  const attachPlot = (entry) => {
    if (typeof Plotly === 'undefined') return;
    const fig = cloneFigure(entry.state.figure);
    Plotly.newPlot(entry.plotEl, fig?.data || [], fig?.layout || {}, {
      displaylogo: false,
      responsive: true
    });
    scheduleResize(entry);
  };

  const registerPanel = (incomingState, { skipPersist = false, silent = false } = {}) => {
    const baseState = {
      id: incomingState.id || generatePanelId(),
      type: incomingState.type || 'plot',
      x: Number.isFinite(incomingState.x) ? incomingState.x : 36 + panels.size * 24,
      y: Number.isFinite(incomingState.y) ? incomingState.y : 36 + panels.size * 24,
      width: Number.isFinite(incomingState.width) ? incomingState.width : 420,
      height: Number.isFinite(incomingState.height) ? incomingState.height : 280,
      figure: cloneFigure(incomingState.figure) || buildSampleFigure()
    };

    const panelEl = document.createElement('div');
    panelEl.className = 'workspace-panel';
    panelEl.dataset.panelId = baseState.id;

    const header = document.createElement('div');
    header.className = 'workspace-panel-header';

    const title = document.createElement('div');
    title.className = 'workspace-panel-title';
    title.textContent = baseState.type === 'plot' ? 'Plot panel' : 'Panel';

    const actions = document.createElement('div');
    actions.className = 'workspace-panel-actions btn-group btn-group-sm';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn btn-outline-secondary';
    closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
    closeBtn.addEventListener('click', () => removePanel(baseState.id));

    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'workspace-panel-body';

    const plotHost = document.createElement('div');
    plotHost.className = 'workspace-panel-plot';
    body.appendChild(plotHost);

    panelEl.appendChild(header);
    panelEl.appendChild(body);

    canvas.appendChild(panelEl);

    const entry = {
      state: baseState,
      el: panelEl,
      plotEl: plotHost,
      resizeFrame: null
    };

    applySize(entry);
    applyPosition(entry);

    panels.set(baseState.id, entry);
    attachPlot(entry);
    configureInteractivity(entry);
    updateCanvasState();

    if (!skipPersist) {
      persist();
      if (!silent && typeof window?.showAppToast === 'function') {
        window.showAppToast({
          message: 'Plot panel added to canvas.',
          variant: 'success',
          delay: 2200
        });
      }
    }
  };

  addPlotBtn?.addEventListener('click', () => {
    const { figure, fallback } = figureFromInstance();
    registerPanel(
      {
        type: 'plot',
        figure,
        width: 440,
        height: 300
      },
      { silent: true }
    );
    const message = fallback
      ? 'No traces loaded yet. Added a sample plot to the canvas.'
      : 'Current plot added to the canvas.';
    if (typeof window?.showAppToast === 'function') {
      window.showAppToast({
        message,
        variant: fallback ? 'info' : 'success',
        delay: 2600
      });
    }
  });

  resetBtn?.addEventListener('click', () => {
    if (!panels.size) return;
    panels.forEach(({ el }) => el.remove());
    panels.clear();
    clearStorage();
    updateCanvasState();
    if (typeof window?.showAppToast === 'function') {
      window.showAppToast({
        message: 'Workspace canvas cleared.',
        variant: 'warning',
        delay: 2200
      });
    }
  });

  loadSavedPanels().forEach((state) => {
    registerPanel(state, { skipPersist: true, silent: true });
  });
  updateCanvasState();

  window.addEventListener('resize', resizeAll);
}
