export function createPanelInteractions({
  interact,
  canvas = null,
  registry = {},
  geometry = {},
  models = {},
  history = {},
  persistence = {},
  plot = {},
  utils = {},
  dimensions = {},
  operations = {}
} = {}) {
  if (!interact) {
    return {
      attach: () => {}
    };
  }

  const {
    getPanelDom = () => null,
    ensurePanelRuntime = () => ({}),
    updatePanelRuntime = () => {}
  } = registry;

  const {
    getPanelGeometry = () => null,
    clampGeometryToCanvas = (geometryValue) => geometryValue,
    applyPanelGeometry = () => {},
    coerceNumber = (value) => Number(value)
  } = geometry;

  const {
    panelsModel = null
  } = models;

  const {
    pushHistory = () => {},
    updateHistoryButtons = () => {}
  } = history;

  const {
    persist = () => {}
  } = persistence;

  const {
    resize: resizePlot = () => {}
  } = plot;

  const {
    bringPanelToFront = () => {}
  } = utils;

  const {
    annotateOperation = () => {}
  } = operations;

  const minWidth = dimensions.minWidth ?? 0;
  const minHeight = dimensions.minHeight ?? 0;

  const attach = (panelId) => {
    if (!panelId) return;
    const dom = getPanelDom(panelId);
    const rootEl = dom?.rootEl;
    const plotHost = dom?.plotEl;
    if (!rootEl) return;
    const runtime = ensurePanelRuntime(panelId);

    const beginInteraction = (mode) => {
      bringPanelToFront(panelId, { persistChange: false });
      let operationId = runtime?.dragSnapshot?.operationId ?? null;
      if (!runtime?.dragSnapshot) {
        operationId = pushHistory({
          label: mode === 'resize' ? 'Resize panel' : 'Move panel',
          meta: {
            action: `panel-${mode}`,
            detail: mode === 'resize' ? 'Resizing panel' : 'Moving panel'
          }
        });
      }
      const modelGeometry = getPanelGeometry(panelId);
      const sourceGeometry = modelGeometry
        || runtime?.visual
        || { x: 0, y: 0, width: minWidth, height: minHeight };
      const baseGeometry = clampGeometryToCanvas(sourceGeometry);
      updatePanelRuntime(panelId, {
        dragSnapshot: {
          mode,
          operationId: operationId || null,
          initial: { ...baseGeometry },
          current: { ...baseGeometry }
        }
      });
      rootEl.classList.add('is-active');
      canvas?.classList.add('is-active');
    };

    const finalizeInteraction = (mode) => {
      const snapshot = runtime?.dragSnapshot;
      const fallback = runtime?.visual
        || getPanelGeometry(panelId)
        || { x: 0, y: 0, width: minWidth, height: minHeight };
      const base = snapshot?.current || snapshot?.initial || fallback;
      const normalized = clampGeometryToCanvas(base);

      if (panelsModel) {
        if (mode === 'resize' && typeof panelsModel.setPanelSize === 'function') {
          panelsModel.setPanelSize(panelId, {
            width: normalized.width,
            height: normalized.height
          });
        }
        if (typeof panelsModel.setPanelPosition === 'function') {
          panelsModel.setPanelPosition(panelId, {
            x: normalized.x,
            y: normalized.y
          });
        }
      }

      const latest = panelsModel?.getPanel?.(panelId);
      applyPanelGeometry(panelId, latest || normalized);
      dom?.runtime?.refreshActionOverflow?.();
      if (plotHost) {
        resizePlot(panelId);
      }

      updatePanelRuntime(panelId, { dragSnapshot: null });
      rootEl.classList.remove('is-active');
      canvas?.classList.remove('is-active');
      persist();
      updateHistoryButtons();
      const opId = snapshot?.operationId;
      if (opId && snapshot?.initial) {
        const dx = normalized.x - snapshot.initial.x;
        const dy = normalized.y - snapshot.initial.y;
        const dw = normalized.width - snapshot.initial.width;
        const dh = normalized.height - snapshot.initial.height;
        const detail = mode === 'resize'
          ? `Size ${snapshot.initial.width}x${snapshot.initial.height} -> ${normalized.width}x${normalized.height}`
          : `Position (${snapshot.initial.x}, ${snapshot.initial.y}) -> (${normalized.x}, ${normalized.y})`;
        annotateOperation(opId, {
          detail,
          action: `panel-${mode}`,
          deltas: {
            x: dx,
            y: dy,
            width: dw,
            height: dh
          }
        });
      }
    };

    interact(rootEl)
      .draggable({
        inertia: false,
        allowFrom: '.workspace-panel-header',
        ignoreFrom: '.workspace-panel-body',
        modifiers: [
          interact.modifiers.restrictRect({
            restriction: canvas,
            endOnly: false
          })
        ],
        listeners: {
          start: () => {
            if (rootEl.classList.contains('is-fullscreen')) return;
            beginInteraction('drag');
          },
          move: (event) => {
            if (!runtime?.dragSnapshot) return;
            const snapshot = runtime.dragSnapshot;
            const previous = snapshot.current || snapshot.initial;
            const next = clampGeometryToCanvas({
              ...previous,
              x: previous.x + coerceNumber(event.dx, 0),
              y: previous.y + coerceNumber(event.dy, 0)
            });
            snapshot.current = next;
            applyPanelGeometry(panelId, next);
            dom?.runtime?.refreshActionOverflow?.();
          },
          end: () => {
            finalizeInteraction('drag');
          }
        }
      })
      .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        inertia: false,
        margin: 6,
        modifiers: [
          interact.modifiers.restrictEdges({
            outer: canvas,
            endOnly: true
          }),
          interact.modifiers.restrictSize({
            min: { width: minWidth, height: minHeight }
          })
        ],
        listeners: {
          start: () => {
            if (rootEl.classList.contains('is-fullscreen')) return;
            beginInteraction('resize');
          },
          move: (event) => {
            if (!runtime?.dragSnapshot) return;
            const snapshot = runtime.dragSnapshot;
            const previous = snapshot.current || snapshot.initial;
            const next = clampGeometryToCanvas({
              x: previous.x + coerceNumber(event.deltaRect?.left, 0),
              y: previous.y + coerceNumber(event.deltaRect?.top, 0),
              width: coerceNumber(event.rect?.width, previous.width),
              height: coerceNumber(event.rect?.height, previous.height)
            });
            snapshot.current = next;
            applyPanelGeometry(panelId, next);
            dom?.runtime?.refreshActionOverflow?.();
            if (plotHost) {
              resizePlot(panelId);
            }
          },
          end: () => {
            finalizeInteraction('resize');
          }
        }
      });
  };

  return {
    attach
  };
}
