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
  const MUTATION_CONTEXT_KEY = '__mutationContext__';
  const wrapMutationContext = (info = {}) => ({ [MUTATION_CONTEXT_KEY]: info });

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
    if (!mutations.length) return false;
    const queue = [...mutations];
    let mutationContext = null;
    const maybeContext = queue[queue.length - 1];
    if (maybeContext && typeof maybeContext === 'object' && maybeContext[MUTATION_CONTEXT_KEY]) {
      mutationContext = maybeContext[MUTATION_CONTEXT_KEY];
      queue.pop();
    }
    const tasks = queue.filter((fn) => typeof fn === 'function');
    if (!tasks.length) return false;
    const pushPayload = mutationContext
      ? {
          label: mutationContext.label ?? null,
          meta: mutationContext.meta ?? null
        }
      : null;
    pushHistory(pushPayload);
    tasks.forEach((fn) => fn());
    persist();
    updateHistoryButtons();
    return true;
  };

  const commitLayoutPatch = (panelId, patch, context = null) => {
    if (!patch || typeof patch !== 'object' || !Object.keys(patch).length) {
      return false;
    }
    if (typeof applyLayout !== 'function') {
      return false;
    }
    const contextArg = context ? wrapMutationContext(context) : null;
    const args = [() => applyLayout(panelId, patch)];
    if (contextArg) {
      args.push(contextArg);
    }
    return runLayoutMutations(panelId, ...args);
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
        }, {
          label: 'Axes',
          meta: {
            action: 'axes-thickness',
            detail: `Axis line width ${w}px`
          }
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
        }, {
          label: 'Axes',
          meta: {
            action: 'axes-thickness',
            detail: `Custom axis width ${w}px`
          }
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

        const describeSide = (axis, primary, secondary) => {
          if (!primary && !secondary) return `${axis} hidden`;
          if (primary && secondary) return `${axis} both`;
          return `${axis} ${primary ? 'top' : 'bottom'}`;
        };
        const describeY = (left, right) => {
          if (!left && !right) return 'Y hidden';
          if (left && right) return 'Y both';
          return `Y ${left ? 'left' : 'right'}`;
        };
        const detail = `${describeSide('X', xTop, xBottom)} • ${describeY(yLeft, yRight)}`;

        commitLayoutPatch(panelId, patch, {
          label: 'Axes',
          meta: {
            action: 'axes-side',
            detail
          }
        });
        break;
      }

      case 'legend': {
        if (hasOwn.call(payload, 'on')) {
          const on = !!payload.on;
          commitLayoutPatch(panelId, { showlegend: on }, {
            label: 'Legend',
            meta: {
              action: 'legend',
              detail: `Legend ${on ? 'shown' : 'hidden'}`
            }
          });
          break;
        }
        const task = typeof toggleLegend === 'function'
          ? () => toggleLegend(panelId)
          : null;
        runLayoutMutations(panelId, task, wrapMutationContext({
          label: 'Legend',
          meta: {
            action: 'legend',
            detail: 'Legend toggled'
          }
        }));
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
        runLayoutMutations(panelId, task, wrapMutationContext({
          label: 'Axes',
          meta: {
            action: 'axis-scale',
            detail: `${axisKey === 'yaxis' ? 'Y axis' : 'X axis'} scale ${mode}`
          }
        }));
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
          const context = {
            label: 'Grid',
            meta: {
              action: 'grid-major',
              value: on,
              detail: `Major grid ${on ? 'enabled' : 'disabled'}`
            }
          };
          commitLayoutPatch(panelId, patch, context);
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
          const context = {
            label: 'Grid',
            meta: {
              action: 'grid-major-thickness',
              value: width,
              detail: `Major grid width ${width}px`
            }
          };
          commitLayoutPatch(panelId, patch, context);
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
          const context = {
            label: 'Grid',
            meta: {
              action: 'grid-minor',
              value: on,
              detail: `Minor grid ${on ? 'enabled' : 'disabled'}`
            }
          };
          commitLayoutPatch(panelId, patch, context);
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
          const context = {
            label: 'Grid',
            meta: {
              action: 'grid-minor-subdiv',
              value: subdivisions,
              detail: `Minor grid subdivisions ${subdivisions}`
            }
          };
          commitLayoutPatch(panelId, patch, context);
        }
        break;
      }

      case 'ticklabels': {
        const on = !!payload.on;
        commitLayoutPatch(panelId, {
          'xaxis.showticklabels': on,
          'yaxis.showticklabels': on
        }, {
          label: 'Axis labels',
          meta: {
            action: 'axis-labels',
            detail: `Primary tick labels ${on ? 'shown' : 'hidden'}`
          }
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
        const detail = placement === '' ? 'Tick marks hidden' : `Tick marks ${placement}`;
        commitLayoutPatch(panelId, patch, {
          label: 'Axis ticks',
          meta: {
            action: 'ticks-placement',
            detail
          }
        });
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
        commitLayoutPatch(panelId, patch, {
          label: 'Axis labels',
          meta: {
            action: 'axis-labels',
            detail: `Tick labels ${on ? 'shown' : 'hidden'}`
          }
        });
        break;
      }

      case 'ticks-major-offset': {
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        const detailParts = [];
        if (payload.x0 === null || Number.isFinite(payload.x0)) {
          patch['xaxis.tick0'] = payload.x0;
          if (hasX2) patch['xaxis2.tick0'] = payload.x0;
          detailParts.push(payload.x0 == null ? 'X offset reset' : `X offset ${payload.x0}`);
        }
        if (payload.y0 === null || Number.isFinite(payload.y0)) {
          patch['yaxis.tick0'] = payload.y0;
          if (hasY2) patch['yaxis2.tick0'] = payload.y0;
          detailParts.push(payload.y0 == null ? 'Y offset reset' : `Y offset ${payload.y0}`);
        }
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch, {
            label: 'Axis ticks',
            meta: {
              action: 'ticks-major-offset',
              detail: detailParts.join(' • ') || 'Tick offsets updated'
            }
          });
        }
        break;
      }

      case 'ticks-major-dtick': {
        const figure = getPanelFigure(panelId);
        const hasX2 = axisExists(panelId, figure, 'xaxis2');
        const hasY2 = axisExists(panelId, figure, 'yaxis2');
        const patch = {};
        const detailParts = [];
        if (payload.dx === null || Number.isFinite(payload.dx)) {
          patch['xaxis.dtick'] = payload.dx;
          if (hasX2) patch['xaxis2.dtick'] = payload.dx;
          detailParts.push(payload.dx == null ? 'X spacing auto' : `X spacing ${payload.dx}`);
        }
        if (payload.dy === null || Number.isFinite(payload.dy)) {
          patch['yaxis.dtick'] = payload.dy;
          if (hasY2) patch['yaxis2.dtick'] = payload.dy;
          detailParts.push(payload.dy == null ? 'Y spacing auto' : `Y spacing ${payload.dy}`);
        }
        if (Object.keys(patch).length) {
          commitLayoutPatch(panelId, patch, {
            label: 'Axis ticks',
            meta: {
              action: 'ticks-major-dtick',
              detail: detailParts.join(' • ') || 'Tick spacing updated'
            }
          });
        }
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
          commitLayoutPatch(panelId, patch, {
            label: 'Axis ticks',
            meta: {
              action: 'ticks-minor',
              detail: `Minor ticks ${on ? 'enabled' : 'disabled'}`
            }
          });
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
          const detail = placement === '' ? 'Minor ticks hidden' : `Minor ticks ${placement}`;
          commitLayoutPatch(panelId, patch, {
            label: 'Axis ticks',
            meta: {
              action: 'ticks-minor-placement',
              detail
            }
          });
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
          commitLayoutPatch(panelId, patch, {
            label: 'Axis ticks',
            meta: {
              action: 'ticks-minor-subdiv',
              detail: `Minor subdivisions ${subdivisions}`
            }
          });
        }
        break;
      }

      case 'axis-title-style': {
        const patch = {};
        const detailParts = [];
        if (typeof payload.fontFamily === 'string') {
          const family = payload.fontFamily === 'inherit' ? '' : payload.fontFamily;
          if (family) {
            patch['xaxis.title.font.family'] = family;
            patch['yaxis.title.font.family'] = family;
            detailParts.push(`Font ${family}`);
          } else {
            patch['xaxis.title.font.family'] = null;
            patch['yaxis.title.font.family'] = null;
            detailParts.push('Font reset to default');
          }
        }
        if (payload.fontWeight) {
          const weight = payload.fontWeight === 'bold' ? 700 : 400;
          patch['xaxis.title.font.weight'] = weight;
          patch['yaxis.title.font.weight'] = weight;
          detailParts.push(weight === 700 ? 'Bold titles' : 'Normal weight');
        }
        if (payload.fontSize !== undefined) {
          const sizeNumeric = Number(payload.fontSize);
          if (Number.isFinite(sizeNumeric) && sizeNumeric > 0) {
            const size = Math.max(6, Math.round(sizeNumeric));
            patch['xaxis.title.font.size'] = size;
            patch['yaxis.title.font.size'] = size;
            detailParts.push(`Font size ${size}px`);
          }
        }
        if (typeof payload.color === 'string' && payload.color) {
          patch['xaxis.title.font.color'] = payload.color;
          patch['yaxis.title.font.color'] = payload.color;
          detailParts.push(`Title color ${payload.color}`);
        }
        if (payload.angle !== undefined) {
          const angleNumeric = Number(payload.angle);
          if (Number.isFinite(angleNumeric)) {
            const angle = Math.max(-180, Math.min(180, Math.round(angleNumeric)));
            patch['xaxis.title.textangle'] = angle;
            patch['yaxis.title.textangle'] = angle;
            detailParts.push(`Angle ${angle}°`);
          }
        }
        if (payload.distance !== undefined) {
          const distanceNumeric = Number(payload.distance);
          if (Number.isFinite(distanceNumeric) && distanceNumeric >= 0) {
            const dist = Math.round(distanceNumeric);
            patch['xaxis.title.standoff'] = dist;
            patch['yaxis.title.standoff'] = dist;
            detailParts.push(`Offset ${dist}px`);
          }
        }
        if (payload.toggleLabels !== undefined) {
          const on = !!payload.toggleLabels;
          patch['xaxis.showticklabels'] = on;
          patch['yaxis.showticklabels'] = on;
          detailParts.push(`Labels ${on ? 'shown' : 'hidden'}`);
        }
        if (Object.keys(patch).length) {
          const context = detailParts.length
            ? {
                label: 'Axis labels',
                meta: {
                  action: 'axis-labels',
                  detail: detailParts.join(' • ')
                }
              }
            : null;
          commitLayoutPatch(panelId, patch, context);
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
        const figure = getPanelFigure(panelId);
        const options = {
          format,
          scale: resolvedScale
        };
        const figureLayout = figure?.layout || {};
        const toPositiveInt = (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric <= 0) return null;
          return Math.round(numeric);
        };
        const container = panelDom.plotEl;
        const rect = typeof container?.getBoundingClientRect === 'function'
          ? container.getBoundingClientRect()
          : null;
        const widthCandidate = toPositiveInt(payload.width)
          ?? toPositiveInt(rect?.width)
          ?? toPositiveInt(container?.offsetWidth)
          ?? toPositiveInt(container?.clientWidth)
          ?? toPositiveInt(figureLayout.width);
        const heightCandidate = toPositiveInt(payload.height)
          ?? toPositiveInt(rect?.height)
          ?? toPositiveInt(container?.offsetHeight)
          ?? toPositiveInt(container?.clientHeight)
          ?? toPositiveInt(figureLayout.height);
        if (widthCandidate != null) {
          options.width = widthCandidate;
        }
        if (heightCandidate != null) {
          options.height = heightCandidate;
        }
        if (options.width == null) {
          options.width = 800; // fallback to sensible pixel width for Plotly export
        }
        if (options.height == null) {
          options.height = 600; // fallback to sensible pixel height for Plotly export
        }
        const figureData = Array.isArray(figure?.data) ? figure.data : [];
        const deriveGraphTitle = () => {
          const datasetTitle = panelDom.rootEl?.dataset?.graphTitle;
          if (typeof datasetTitle === 'string') {
            const trimmed = datasetTitle.trim();
            if (trimmed) return trimmed;
          }
          const layoutTitle = figureLayout?.title;
          if (typeof layoutTitle === 'string' && layoutTitle.trim()) {
            return layoutTitle.trim();
          }
          if (layoutTitle && typeof layoutTitle === 'object') {
            const layoutText = typeof layoutTitle.text === 'string' ? layoutTitle.text.trim() : '';
            if (layoutText) return layoutText;
          }
          const idxRaw = panelDom.rootEl?.dataset?.graphIndex;
          const idx = Number(idxRaw);
          if (Number.isInteger(idx) && idx > 0) {
            return `Graph ${idx}`;
          }
          return 'Graph';
        };

        exportFigure(panelId, options)
          .then((url) => {
            if (!url) return;
            const provided = typeof payload.filename === 'string' ? payload.filename.trim() : '';
            const defaultTitle = deriveGraphTitle();
            let baseFilename = provided || defaultTitle;
            if (!provided && figureData.length === 1) {
              const traceName = typeof figureData[0]?.name === 'string' ? figureData[0].name.trim() : '';
              if (traceName) {
                baseFilename = `${baseFilename} - ${traceName}`;
              }
            }
            const sanitizeFilename = (value) => {
              if (!value) return '';
              return value
                .trim()
                .replace(/[^a-z0-9_.\- ]+/gi, '_')
                .replace(/\s{2,}/g, ' ')
                .trim();
            };
            const safeName = sanitizeFilename(baseFilename)
              || sanitizeFilename(defaultTitle)
              || 'Graph';
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
