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
  const resizePlot = plot.resize || (() => {});
  const historyApi = context.historyApi || {};

  const clampSubdivisions = (value) => Math.max(1, Math.min(10, Math.round(Number(value) || 1)));

  const getRuntimeAxisState = (panelDom, axisKey) => {
    const plotEl = panelDom?.plotEl;
    if (!plotEl) return {};
    return {
      ...(plotEl._fullLayout?.[axisKey] || {}),
      ...(plotEl.layout?.[axisKey] || {})
    };
  };

  const mergeAxisContext = (panelDom, figure, axisKey) => {
    const modelAxis = figure?.layout?.[axisKey] || {};
    const runtimeAxis = getRuntimeAxisState(panelDom, axisKey);
    const minor = {
      ...(runtimeAxis.minor || {}),
      ...(modelAxis.minor || {})
    };
    return {
      model: modelAxis,
      runtime: runtimeAxis,
      combined: {
        ...runtimeAxis,
        ...modelAxis,
        minor
      }
    };
  };

  const resolveMajorSpacing = (ctx) => {
    const numericCandidates = [
      Number(ctx.model?.dtick),
      Number(ctx.runtime?.dtick)
    ];
    for (const candidate of numericCandidates) {
      if (Number.isFinite(candidate) && candidate > 0) {
        return Math.abs(candidate);
      }
    }

    const runtimeTickvals = Array.isArray(ctx.runtime?.tickvals) ? ctx.runtime.tickvals : null;
    const modelTickvals = Array.isArray(ctx.model?.tickvals) ? ctx.model.tickvals : null;
    const tickvals = (runtimeTickvals && runtimeTickvals.length >= 2)
      ? runtimeTickvals
      : (modelTickvals && modelTickvals.length >= 2 ? modelTickvals : null);
    if (tickvals) {
      for (let i = 1; i < tickvals.length; i += 1) {
        const diff = Number(tickvals[i]) - Number(tickvals[i - 1]);
        if (Number.isFinite(diff) && diff !== 0) {
          return Math.abs(diff);
        }
      }
    }

    const range = Array.isArray(ctx.runtime?.range) && ctx.runtime.range.length === 2
      ? ctx.runtime.range
      : (Array.isArray(ctx.model?.range) && ctx.model.range.length === 2 ? ctx.model.range : null);
    const nticks = Number(ctx.runtime?.nticks ?? ctx.model?.nticks);
    if (range && Number.isFinite(nticks) && nticks > 0) {
      const span = Math.abs(Number(range[1]) - Number(range[0]));
      if (Number.isFinite(span) && span > 0) {
        return span / nticks;
      }
    }

    return NaN;
  };

  const resolveSubdivisionCount = (ctx) => {
    const minor = ctx.combined?.minor || {};
    const candidates = [
      Number(minor.nticks)
    ];
    for (const candidate of candidates) {
      if (Number.isFinite(candidate) && candidate > 0) {
        return clampSubdivisions(candidate);
      }
    }

    const minorDtick = Number(minor.dtick);
    const majorSpacing = resolveMajorSpacing(ctx);
    if (Number.isFinite(majorSpacing) && Number.isFinite(minorDtick) && minorDtick > 0) {
      const est = Math.round(majorSpacing / minorDtick - 1);
      if (est >= 1 && est <= 10) {
        return est;
      }
    }

    return 1;
  };

  const buildMinorTickPatch = (axisKey, ctx, subdivisions, { ensureVisible = false } = {}) => {
    const resolvedSubdivisions = clampSubdivisions(subdivisions);
    const patch = {};
    const placement = ctx.combined?.minor?.ticks;
    patch[`${axisKey}.minor.ticks`] = placement == null ? 'outside' : placement;
    patch[`${axisKey}.minor.nticks`] = resolvedSubdivisions;
    patch[`${axisKey}.minor.tickmode`] = 'linear';
    if (ensureVisible) {
      patch[`${axisKey}.minor.show`] = true;
    }
    const majorSpacing = resolveMajorSpacing(ctx);
    const fallbackMinorDtick = Number(ctx.combined?.minor?.dtick);
    const minorDtick = Number.isFinite(majorSpacing) && majorSpacing > 0
      ? majorSpacing / (resolvedSubdivisions + 1)
      : (Number.isFinite(fallbackMinorDtick) && fallbackMinorDtick > 0 ? fallbackMinorDtick : NaN);
    if (Number.isFinite(minorDtick) && minorDtick > 0) {
      patch[`${axisKey}.minor.dtick`] = minorDtick;
    }
    return patch;
  };

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

      case 'grid-major-thickness': {
        const width = Math.max(1, Math.min(6, Math.round(Number(payload.value) || 1)));
        const figure = getPanelFigure(panelId);
        const layoutState = figure.layout || {};
        const liveLayout = dom?.plotEl?.layout || {};
        const patch = {};

        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          const inState = layoutState[axis] && typeof layoutState[axis] === 'object';
          const inLive = liveLayout[axis] && typeof liveLayout[axis] === 'object';
          if (!inState && !inLive) return;
          patch[`${axis}.gridwidth`] = width;
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
        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          if (!axisExists(panelId, figure, axis)) return;
          const axisState = getAxisState(panelId, figure, axis) || {};
          const baseColor = axisState.gridcolor || '#e0e0e0';
          patch[`${axis}.minor.showgrid`] = on;
          patch[`${axis}.minor.gridcolor`] = baseColor;
          patch[`${axis}.minor.gridwidth`] = 1;
          if (on) {
            const ctx = mergeAxisContext(dom, figure, axis);
            const subdivisions = resolveSubdivisionCount(ctx);
            Object.assign(patch, buildMinorTickPatch(axis, ctx, subdivisions, { ensureVisible: true }));
          }
        });
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'grid-minor-subdiv': {
        const subdivisions = clampSubdivisions(payload.subdiv);
        const figure = getPanelFigure(panelId);
        const patch = {};
        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          if (!axisExists(panelId, figure, axis)) return;
          const axisState = getAxisState(panelId, figure, axis) || {};
          const baseColor = axisState?.minor?.gridcolor || axisState.gridcolor || '#e0e0e0';
          const baseWidth = Number.isFinite(axisState?.minor?.gridwidth)
            ? Math.max(0.5, Number(axisState.minor.gridwidth))
            : Math.max(1, Math.round(Number(axisState.gridwidth) || 1));
          const ctx = mergeAxisContext(dom, figure, axis);
          Object.assign(patch, buildMinorTickPatch(axis, ctx, subdivisions, { ensureVisible: true }));
          patch[`${axis}.minor.showgrid`] = true;
          patch[`${axis}.minor.gridcolor`] = baseColor;
          patch[`${axis}.minor.gridwidth`] = baseWidth;
        });
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
        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          if (!axisExists(panelId, figure, axis)) return;
          if (on) {
            const ctx = mergeAxisContext(dom, figure, axis);
            const subdivisions = resolveSubdivisionCount(ctx);
            Object.assign(patch, buildMinorTickPatch(axis, ctx, subdivisions, { ensureVisible: true }));
          } else {
            patch[`${axis}.minor.show`] = false;
          }
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

      case 'ticks-minor-subdiv': {
        const subdivisions = clampSubdivisions(payload.subdiv);
        const figure = getPanelFigure(panelId);
        const patch = {};
        ['xaxis', 'yaxis', 'xaxis2', 'yaxis2'].forEach((axis) => {
          if (!axisExists(panelId, figure, axis)) return;
          const ctx = mergeAxisContext(dom, figure, axis);
          Object.assign(patch, buildMinorTickPatch(axis, ctx, subdivisions, { ensureVisible: true }));
        });
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch);
        }
        break;
      }

      case 'axis-title-style': {
        const patch = {};
        if (typeof payload.fontFamily === 'string') {
          const family = payload.fontFamily === 'inherit' ? '' : payload.fontFamily;
          if (family) {
            patch['xaxis.title.font.family'] = family;
            patch['yaxis.title.font.family'] = family;
          } else {
            patch['xaxis.title.font.family'] = null;
            patch['yaxis.title.font.family'] = null;
          }
        }
        if (payload.fontWeight) {
          const weight = payload.fontWeight === 'bold' ? 700 : 400;
          patch['xaxis.title.font.weight'] = weight;
          patch['yaxis.title.font.weight'] = weight;
        }
        if (payload.fontSize !== undefined) {
          const sizeNumeric = Number(payload.fontSize);
          if (Number.isFinite(sizeNumeric) && sizeNumeric > 0) {
            const size = Math.max(6, Math.round(sizeNumeric));
            patch['xaxis.title.font.size'] = size;
            patch['yaxis.title.font.size'] = size;
          }
        }
        if (typeof payload.color === 'string' && payload.color) {
          patch['xaxis.title.font.color'] = payload.color;
          patch['yaxis.title.font.color'] = payload.color;
        }
        if (payload.angle !== undefined) {
          const angleNumeric = Number(payload.angle);
          if (Number.isFinite(angleNumeric)) {
            const angle = Math.max(-180, Math.min(180, Math.round(angleNumeric)));
            patch['xaxis.title.textangle'] = angle;
            patch['yaxis.title.textangle'] = angle;
          }
        }
        if (payload.distance !== undefined) {
          const distanceNumeric = Number(payload.distance);
          if (Number.isFinite(distanceNumeric) && distanceNumeric >= 0) {
            const dist = Math.round(distanceNumeric);
            patch['xaxis.title.standoff'] = dist;
            patch['yaxis.title.standoff'] = dist;
          }
        }
        if (payload.toggleLabels !== undefined) {
          const on = !!payload.toggleLabels;
          patch['xaxis.showticklabels'] = on;
          patch['yaxis.showticklabels'] = on;
        }
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

      case 'history-undo': {
        if (typeof historyApi.undo === 'function') {
          historyApi.undo();
        }
        break;
      }

      case 'history-redo': {
        if (typeof historyApi.redo === 'function') {
          historyApi.redo();
        }
        break;
      }

      case 'toggle-fullscreen': {
        const on = payload.on === true;
        const panelDom = getPanelDom(panelId);
        const rootEl = panelDom?.rootEl;
        if (!rootEl) return;
        const runtime = panelDom.runtime || {};
        panelDom.runtime = runtime;
        runtime.isFullscreen = on;
        if (on) {
          if (!rootEl.classList.contains('is-fullscreen')) {
            rootEl.dataset.prevTransform = rootEl.style.transform || '';
            rootEl.dataset.prevWidth = rootEl.style.width || '';
            rootEl.dataset.prevHeight = rootEl.style.height || '';
            rootEl.dataset.prevLeft = rootEl.style.left || '';
            rootEl.dataset.prevTop = rootEl.style.top || '';
            rootEl.dataset.prevRight = rootEl.style.right || '';
            rootEl.dataset.prevBottom = rootEl.style.bottom || '';
            rootEl.dataset.prevZindex = rootEl.style.zIndex || '';
            rootEl.dataset.prevPosition = rootEl.style.position || '';
          }
          rootEl.classList.add('is-fullscreen');
          rootEl.style.position = 'fixed';
          rootEl.style.transform = 'none';
          rootEl.style.left = '0';
          rootEl.style.top = '0';
          rootEl.style.right = '0';
          rootEl.style.bottom = '0';
          rootEl.style.width = '100%';
          rootEl.style.height = '100%';
          rootEl.style.zIndex = '1200';
        } else {
          rootEl.classList.remove('is-fullscreen');
          rootEl.style.transform = rootEl.dataset.prevTransform || '';
          rootEl.style.width = rootEl.dataset.prevWidth || '';
          rootEl.style.height = rootEl.dataset.prevHeight || '';
          rootEl.style.left = rootEl.dataset.prevLeft || '';
          rootEl.style.top = rootEl.dataset.prevTop || '';
          rootEl.style.right = rootEl.dataset.prevRight || '';
          rootEl.style.bottom = rootEl.dataset.prevBottom || '';
          rootEl.style.zIndex = rootEl.dataset.prevZindex || '';
          rootEl.style.position = rootEl.dataset.prevPosition || '';
          delete rootEl.dataset.prevTransform;
          delete rootEl.dataset.prevWidth;
          delete rootEl.dataset.prevHeight;
          delete rootEl.dataset.prevLeft;
          delete rootEl.dataset.prevTop;
          delete rootEl.dataset.prevRight;
          delete rootEl.dataset.prevBottom;
          delete rootEl.dataset.prevZindex;
          delete rootEl.dataset.prevPosition;
        }
        panelDom.runtime?.refreshActionOverflow?.();
        renderPlot(panelId);
        resizePlot(panelId);
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
          window.requestAnimationFrame(() => resizePlot(panelId));
        }
        break;
      }

      case 'export': {
        const panelDom = getPanelDom(panelId);
        if (!panelDom?.plotEl) return;
        const requestedFormat = typeof payload.format === 'string' ? payload.format.toLowerCase() : 'png';
        const supportedFormats = ['png', 'jpeg', 'jpg', 'svg', 'webp'];
        const format = supportedFormats.includes(requestedFormat)
          ? (requestedFormat === 'jpg' ? 'jpeg' : requestedFormat)
          : 'png';
        const scaleNumeric = Number(payload.scale);
        const resolvedScale = Number.isFinite(scaleNumeric) && scaleNumeric > 0 ? scaleNumeric : 2;
        const widthNumeric = Number(payload.width);
        const heightNumeric = Number(payload.height);
        const options = {
          format,
          scale: resolvedScale
        };
        if (Number.isFinite(widthNumeric) && widthNumeric > 0) {
          options.width = Math.round(widthNumeric);
        }
        if (Number.isFinite(heightNumeric) && heightNumeric > 0) {
          options.height = Math.round(heightNumeric);
        }
        exportFigure(panelId, options)
          .then((url) => {
            if (!url) return;
            const baseFilename = typeof payload.filename === 'string' && payload.filename.trim()
              ? payload.filename.trim()
              : `plot-${panelId}`;
            const safeName = baseFilename.replace(/[^a-z0-9_.-]+/gi, '_') || `plot-${panelId}`;
            const link = document.createElement('a');
            link.href = url;
            link.download = `${safeName}.${format}`;
            link.click();
          })
          .catch((error) => {
            console.error('Export failed:', error);
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
