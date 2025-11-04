const hasOwn = Object.prototype.hasOwnProperty;

export function createHeaderActions(context = {}) {
  const actionsController = context.actionsController || {};
  const history = context.history || {};
  const persistence = context.persistence || {};
  const selectors = context.selectors || {};
  const traces = context.traces || {};
  const plot = context.plot || {};

  const pushHistory = history.pushHistory || (() => {});
  const updateHistoryButtons = history.updateHistoryButtons || (() => {});
  const persist = persistence.persist || (() => {});

  const getPanelDom = selectors.getPanelDom || (() => null);
  const getPanelFigure = selectors.getPanelFigure || (() => ({ data: [], layout: {} }));

  const normalizePanelTraces = traces.normalizePanelTraces || (() => {});
  const renderPlot = traces.renderPlot || (() => {});

  const applyLayout = actionsController.applyLayout || (() => {});
  const setHoverMode = actionsController.setHoverMode || (() => {});
  const toggleLegend = actionsController.toggleLegend || (() => {});
  const setAxisType = actionsController.setAxisType || (() => {});

  const exportFigure = plot.exportFigure || (() => Promise.resolve());

  const isPrimaryAxis = (axisKey) => axisKey === 'xaxis' || axisKey === 'yaxis';

  const getAxisState = (panelId, figure, axisKey) => {
    const layout = figure?.layout;
    const fromModel = layout && typeof layout === 'object' && typeof layout[axisKey] === 'object'
      ? layout[axisKey]
      : null;
    if (fromModel) return fromModel;
    const runtimeLayout = getPanelDom(panelId)?.plotEl?.layout?.[axisKey];
    return typeof runtimeLayout === 'object' ? runtimeLayout : null;
  };

  const axisExists = (panelId, figure, axisKey) => {
    if (isPrimaryAxis(axisKey)) return true;
    return !!getAxisState(panelId, figure, axisKey);
  };

  const forEachAxis = (panelId, figure, axes, cb) => {
    axes.forEach((axis) => {
      if (!axisExists(panelId, figure, axis)) return;
      cb(axis, getAxisState(panelId, figure, axis) || {});
    });
  };

  const preserveAxisDecorations = (panelId, figure, axisKey, patch) => {
    const axisState = getAxisState(panelId, figure, axisKey);
    if (!axisState) return;
    if (hasOwn.call(axisState, 'showgrid')) {
      patch[`${axisKey}.showgrid`] = axisState.showgrid;
    }
    if (hasOwn.call(axisState, 'showline')) {
      patch[`${axisKey}.showline`] = axisState.showline;
    }
  };

  const runLayoutMutations = (panelId, ...mutations) => {
    const tasks = mutations.filter((fn) => typeof fn === 'function');
    if (!tasks.length) return false;
    pushHistory();
    tasks.forEach((fn) => fn());
    persist();
    updateHistoryButtons();
    return true;
  };

  const commitLayoutPatch = (panelId, patch) => {
    if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) {
      return false;
    }
    if (typeof applyLayout !== 'function') {
      return false;
    }
    return runLayoutMutations(panelId, () => applyLayout(panelId, patch));
  };

  const handleHeaderAction = (panelId, act, payload = {}) => {
    if (!panelId) return;

    const dom = getPanelDom(panelId);

    switch (act) {
      case 'cursor': {
        const on = !!payload.on;
        const patch = on
          ? {
              'xaxis.showspikes': true,
              'yaxis.showspikes': true,
              'xaxis.spikemode': 'across',
              'yaxis.spikemode': 'across',
              'xaxis.spikesnap': 'cursor',
              'yaxis.spikesnap': 'cursor',
              'xaxis.spikethickness': 1,
              'yaxis.spikethickness': 1
            }
          : {
              'xaxis.showspikes': false,
              'yaxis.showspikes': false
            };

        const hoverTask = typeof setHoverMode === 'function'
          ? () => setHoverMode(panelId, on ? 'x' : 'closest')
          : null;
        const layoutTask = typeof applyLayout === 'function'
          ? () => applyLayout(panelId, patch)
          : null;
        runLayoutMutations(panelId, hoverTask, layoutTask);
        break;
      }

      case 'axes-thickness': {
        const level = payload.level || 'medium';
        const map = { thin: 1, medium: 2, thick: 3 };
        const w = Number.isFinite(payload.value) ? payload.value : (map[level] ?? 2);

        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const xColor = layout?.xaxis?.linecolor || '#444';
        const yColor = layout?.yaxis?.linecolor || '#444';

        commitLayoutPatch(panelId, {
          'xaxis.linewidth': w,
          'yaxis.linewidth': w,
          'xaxis.gridwidth': Math.max(0, Math.round(w * 0.75)),
          'yaxis.gridwidth': Math.max(0, Math.round(w * 0.75)),
          'xaxis.linecolor': xColor,
          'yaxis.linecolor': yColor
        });
        break;
      }

      case 'axes-thickness-custom': {
        const w = Math.max(1, Math.round(Number(payload.value) || 2));
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const xColor = layout?.xaxis?.linecolor || '#444';
        const yColor = layout?.yaxis?.linecolor || '#444';

        commitLayoutPatch(panelId, {
          'xaxis.linewidth': w,
          'yaxis.linewidth': w,
          'xaxis.linecolor': xColor,
          'yaxis.linecolor': yColor
        });
        break;
      }

      case 'axes-side': {
        const s = payload || {};
        const figure = getPanelFigure(panelId);
        const layout = figure.layout || {};
        const wx = Math.max(1, Number(layout?.xaxis?.linewidth) || 2);
        const wy = Math.max(1, Number(layout?.yaxis?.linewidth) || 2);
        const cx = layout?.xaxis?.linecolor || '#444';
        const cy = layout?.yaxis?.linecolor || '#444';

        const xTop = !!s.top;
        const xBottom = !!s.bottom;
        const yLeft = !!s.left;
        const yRight = !!s.right;

        const patch = {};

        if (!xTop && !xBottom) {
          patch['xaxis.visible'] = false;
          patch['xaxis.showline'] = false;
        } else {
          patch['xaxis.visible'] = true;
          patch['xaxis.showline'] = true;
          patch['xaxis.side'] = xTop && !xBottom ? 'top' : 'bottom';
          patch['xaxis.mirror'] = xTop && xBottom ? true : false;
          patch['xaxis.linewidth'] = wx;
          patch['xaxis.linecolor'] = cx;
        }

        if (!yLeft && !yRight) {
          patch['yaxis.visible'] = false;
          patch['yaxis.showline'] = false;
        } else {
          patch['yaxis.visible'] = true;
          patch['yaxis.showline'] = true;
          if (yLeft && yRight) {
            patch['yaxis.mirror'] = true;
            patch['yaxis.side'] = 'left';
            patch['yaxis.ticklabelposition'] = 'outside left';
          } else if (yLeft) {
            patch['yaxis.mirror'] = false;
            patch['yaxis.side'] = 'left';
            patch['yaxis.ticklabelposition'] = 'outside left';
          } else {
            patch['yaxis.mirror'] = false;
            patch['yaxis.side'] = 'right';
            patch['yaxis.ticklabelposition'] = 'outside right';
          }
          patch['yaxis.linewidth'] = wy;
          patch['yaxis.linecolor'] = cy;
        }

        commitLayoutPatch(panelId, patch);
        break;
      }

      case 'legend': {
        const task = typeof toggleLegend === 'function'
          ? () => toggleLegend(panelId)
          : null;
        runLayoutMutations(panelId, task);
        break;
      }

      case 'yscale-log':
      case 'yscale-linear':
      case 'xscale-log':
      case 'xscale-linear': {
        const axisKey = act.startsWith('y') ? 'yaxis' : 'xaxis';
        const mode = act.endsWith('log') ? 'log' : 'linear';
        const task = typeof setAxisType === 'function'
          ? () => setAxisType(panelId, axisKey, mode)
          : null;
        runLayoutMutations(panelId, task);
        break;
      }

      case 'grid-major': {
        const on = !!payload.on;
        const patch = {};
        const figure = getPanelFigure(panelId);
        const layoutState = figure.layout || {};
        const liveLayout = dom?.plotEl?.layout || {};

        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis, index) => {
          const isPrimary = index < 2;
          const inState = layoutState[axis] && typeof layoutState[axis] === 'object';
          const inLive = liveLayout[axis] && typeof liveLayout[axis] === 'object';
          if (!isPrimary && !inState && !inLive) return;
          patch[`${axis}.showgrid`] = on;
        });

        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'grid-minor': {
        const on = !!payload.on;
        const figure = getPanelFigure(panelId);
        const patch = {};
        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], (axis, axisState) => {
          const baseColor = axisState.gridcolor || '#e0e0e0';
          patch[`${axis}.minor.showgrid`] = on;
          patch[`${axis}.minor.gridcolor`] = baseColor;
          patch[`${axis}.minor.gridwidth`] = 1;
        });
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'grid-minor-subdiv': {
        const subdivisions = Math.max(1, Math.min(10, Math.round(Number(payload.subdiv) || 2)));
        const figure = getPanelFigure(panelId);
        const patch = {};

        const setMinor = (axis, axisState) => {
          const state = axisState || {};
          let major = Number(state.dtick);
          if (!Number.isFinite(major)) {
            const rng = Array.isArray(state.range) && state.range.length === 2 ? state.range : null;
            const span = rng ? Math.abs(rng[1] - rng[0]) : NaN;
            const nt = Number(state.nticks) || 6;
            if (Number.isFinite(span) && span > 0) {
              major = span / nt;
            }
          }
          if (Number.isFinite(major) && major > 0) {
            patch[`${axis}.minor.dtick`] = major / (subdivisions + 1);
            patch[`${axis}.minor.show`] = true;
          }
        };

        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], setMinor);
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'ticklabels': {
        const on = !!payload.on;
        commitLayoutPatch(panelId, {
          'xaxis.showticklabels': on,
          'yaxis.showticklabels': on
        });
        break;
      }

      case 'ticks-placement': {
        const placement = payload.placement ?? 'outside';
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {
          'xaxis.ticks': placement,
          'yaxis.ticks': placement
        };
        if (hasX2) patch['xaxis2.ticks'] = placement;
        if (hasY2) patch['yaxis2.ticks'] = placement;
        preserveAxisDecorations(panelId, figure, 'xaxis', patch);
        preserveAxisDecorations(panelId, figure, 'yaxis', patch);
        if (hasX2) preserveAxisDecorations(panelId, figure, 'xaxis2', patch);
        if (hasY2) preserveAxisDecorations(panelId, figure, 'yaxis2', patch);
        commitLayoutPatch(panelId, patch);
        break;
      }

      case 'ticks-labels': {
        const on = !!payload.on;
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {
          'xaxis.showticklabels': on,
          'yaxis.showticklabels': on
        };
        if (hasX2) patch['xaxis2.showticklabels'] = on;
        if (hasY2) patch['yaxis2.showticklabels'] = on;
        commitLayoutPatch(panelId, patch);
        break;
      }

      case 'ticks-major-offset': {
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        if (payload.x0 === null || Number.isFinite(payload.x0)) {
          patch['xaxis.tick0'] = payload.x0;
          if (hasX2) patch['xaxis2.tick0'] = payload.x0;
        }
        if (payload.y0 === null || Number.isFinite(payload.y0)) {
          patch['yaxis.tick0'] = payload.y0;
          if (hasY2) patch['yaxis2.tick0'] = payload.y0;
        }
        commitLayoutPatch(panelId, patch);
        break;
      }

      case 'ticks-major-dtick': {
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        if (payload.dx === null || Number.isFinite(payload.dx)) {
          patch['xaxis.dtick'] = payload.dx;
          if (hasX2) patch['xaxis2.dtick'] = payload.dx;
        }
        if (payload.dy === null || Number.isFinite(payload.dy)) {
          patch['yaxis.dtick'] = payload.dy;
          if (hasY2) patch['yaxis2.dtick'] = payload.dy;
        }
        commitLayoutPatch(panelId, patch);
        break;
      }

      case 'ticks-minor': {
        const on = payload.on === true;
        const figure = getPanelFigure(panelId);
        const patch = {};
        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], (axis) => {
          patch[`${axis}.minor.show`] = on;
        });
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'ticks-minor-placement': {
        const placement = payload.placement === '' ? '' : payload.placement;
        const figure = getPanelFigure(panelId);
        const patch = {};
        forEachAxis(panelId, figure, ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'], () => {});
        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          if (!axisExists(panelId, figure, axis)) return;
          patch[`${axis}.minor.ticks`] = placement;
        });
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'smooth': {
        const figure = getPanelFigure(panelId);
        const data = Array.isArray(figure.data) ? figure.data.slice() : [];
        const on = !!payload.on;
        pushHistory();
        const updated = data.map((trace) => {
          const next = { ...trace };
          next.line = { ...(trace?.line || {}) };
          next.line.shape = on ? 'spline' : 'linear';
          if (on) {
            next.line.smoothing = 1.15;
          } else {
            delete next.line.smoothing;
          }
          return next;
        });
        figure.data = updated;
        normalizePanelTraces(panelId, figure);
        renderPlot(panelId);
        persist();
        updateHistoryButtons();
        break;
      }

      case 'export': {
        const panelDom = getPanelDom(panelId);
        if (!panelDom?.plotEl) return;
        exportFigure(panelId, { format: 'png', scale: 2 }).then((url) => {
          const a = document.createElement('a');
          a.href = url;
          a.download = 'plot.png';
          a.click();
        });
        break;
      }

      default: {
        console.warn('Unhandled header action:', act, payload);
        break;
      }
    }
  };

  return {
    handleHeaderAction
  };
}
