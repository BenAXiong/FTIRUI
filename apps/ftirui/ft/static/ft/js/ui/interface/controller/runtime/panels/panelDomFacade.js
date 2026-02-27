import { getPanelType } from './registry/index.js';

export function createPanelDomFacade({
  canvas,
  registerPanelDom,
  updatePanelRuntime,
  actions = {},
  selectors = {}
} = {}) {
    const {
      handleHeaderAction = () => {},
      removePanel = () => {},
      bringPanelToFront = () => {},
      updateToolbarMetrics = () => {},
      startPanelRename = () => {},
      setPanelContent = () => {},
      onStylePainterSelectionChange = () => {},
      onStylePainterPopoverOpen = () => {},
      onStylePainterButtonClick = () => {},
      onTemplatesPopoverOpen = () => {},
      onTemplatesSave = () => {},
      onTemplatesApply = () => {},
      onTemplatesRename = () => {},
      onTemplatesDelete = () => {},
      onTemplatesDuplicate = () => {},
      onSpreadsheetDock = () => {},
      duplicatePanel = () => {},
      onPanelLockToggle = () => {},
      onPanelPinToggle = () => {},
      onPanelVisibilityToggle = () => {}
  } = actions;

    const {
      getPanelFigure = () => ({ data: [], layout: {} }),
      getPanelContent = () => null,
      listPlotPanels = () => []
    } = selectors;

  const safeRegisterPanelDom = typeof registerPanelDom === 'function' ? registerPanelDom : () => {};
  const safeUpdatePanelRuntime = typeof updatePanelRuntime === 'function' ? updatePanelRuntime : () => {};
  const safeHandleHeaderAction = typeof handleHeaderAction === 'function' ? handleHeaderAction : () => {};
  const safeRemovePanel = typeof removePanel === 'function' ? removePanel : () => {};
  const safeBringPanelToFront = typeof bringPanelToFront === 'function' ? bringPanelToFront : () => {};
  const safeUpdateToolbarMetrics = typeof updateToolbarMetrics === 'function' ? updateToolbarMetrics : () => {};
  const safeStylePainterSelectionChange = typeof onStylePainterSelectionChange === 'function'
    ? onStylePainterSelectionChange
    : () => {};
  const safeStylePainterPopoverOpen = typeof onStylePainterPopoverOpen === 'function'
    ? onStylePainterPopoverOpen
    : () => {};
  const safeStylePainterButtonClick = typeof onStylePainterButtonClick === 'function'
    ? onStylePainterButtonClick
    : () => {};
  const safeTemplatesPopoverOpen = typeof onTemplatesPopoverOpen === 'function'
    ? onTemplatesPopoverOpen
    : () => {};
  const safeTemplatesSave = typeof onTemplatesSave === 'function'
    ? onTemplatesSave
    : () => {};
  const safeTemplatesApply = typeof onTemplatesApply === 'function'
    ? onTemplatesApply
    : () => {};
  const safeTemplatesRename = typeof onTemplatesRename === 'function'
    ? onTemplatesRename
    : () => {};
  const safeTemplatesDelete = typeof onTemplatesDelete === 'function'
    ? onTemplatesDelete
    : () => {};
  const safeTemplatesDuplicate = typeof onTemplatesDuplicate === 'function'
    ? onTemplatesDuplicate
    : () => {};
  const safeSpreadsheetDock = typeof onSpreadsheetDock === 'function'
    ? onSpreadsheetDock
    : () => {};
  const safeDuplicatePanel = typeof duplicatePanel === 'function' ? duplicatePanel : () => {};
  const safePanelLockToggle = typeof onPanelLockToggle === 'function' ? onPanelLockToggle : () => {};
  const safePanelPinToggle = typeof onPanelPinToggle === 'function' ? onPanelPinToggle : () => {};
  const safePanelVisibilityToggle = typeof onPanelVisibilityToggle === 'function'
    ? onPanelVisibilityToggle
    : () => {};
  const safeGetPanelFigure = typeof getPanelFigure === 'function' ? getPanelFigure : (() => ({ data: [], layout: {} }));
  const safeGetPanelContent = typeof getPanelContent === 'function' ? getPanelContent : (() => null);
  const safeListPlotPanels = typeof listPlotPanels === 'function' ? listPlotPanels : (() => []);
  const safeSetPanelContent = typeof setPanelContent === 'function' ? setPanelContent : () => {};
  const readPanelLockState = (panelId) => {
    const meta = safeGetPanelFigure(panelId)?.layout?.meta;
    const panelMeta = meta && typeof meta === 'object' ? meta.workspacePanel : null;
    const contentMeta = safeGetPanelContent(panelId)?.meta?.workspacePanel;
    return {
      editLocked: panelMeta?.editLocked === true || contentMeta?.editLocked === true,
      pinned: panelMeta?.pinned === true || contentMeta?.pinned === true
    };
  };
  const getUIPortal = () => {
    if (typeof document === 'undefined') return null;
    let portal = document.querySelector('.ui-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.className = 'ui-portal';
      document.body.appendChild(portal);
    }
    return portal;
  };

  const placePopover = (btn, pop, opts = {}) => {
    if (!btn || !pop) return;
    const anchorRect = typeof opts.getAnchorRect === 'function'
      ? opts.getAnchorRect(btn, pop)
      : (typeof btn.getBoundingClientRect === 'function' ? btn.getBoundingClientRect() : null);
    if (!anchorRect) return;
    const strategy = opts.strategy || 'above';
    const offsetX = Number.isFinite(opts.offsetX) ? Number(opts.offsetX) : 0;
    const offsetY = Number.isFinite(opts.offsetY) ? Number(opts.offsetY) : 0;
    let left = anchorRect.left + (anchorRect.width / 2);
    let top = anchorRect.top + offsetY;
    if (strategy === 'right-side') {
      const align = opts.align || 'center';
      left = anchorRect.right + offsetX;
      if (align === 'start') {
        top = anchorRect.top + offsetY;
      } else if (align === 'end') {
        top = anchorRect.bottom + offsetY;
      } else {
        top = anchorRect.top + (anchorRect.height / 2) + offsetY;
      }
    }
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.bottom = 'auto';
    pop.style.right = 'auto';
    if (strategy === 'right-side') {
      pop.dataset.popPlacement = 'side';
    } else {
      delete pop.dataset.popPlacement;
    }
  };

  const openPortaledPopover = (btn, pop, opts = {}) => {
    if (!btn || !pop) return;
    const portal = getUIPortal();
    if (!portal) return;
    pop.__origParent = pop.parentElement;
    portal.appendChild(pop);
    pop.__placementOpts = opts;
    placePopover(btn, pop, opts);
    pop.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    pop.__reflow = () => placePopover(btn, pop, pop.__placementOpts || {});
    window.addEventListener('scroll', pop.__reflow, true);
    window.addEventListener('resize', pop.__reflow, true);
  };

  const closePortaledPopover = (btn, pop) => {
    if (!btn || !pop) return;
    pop.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    if (pop.__origParent) {
      pop.__origParent.appendChild(pop);
    }
    window.removeEventListener('scroll', pop.__reflow, true);
    window.removeEventListener('resize', pop.__reflow, true);
    delete pop.__reflow;
    delete pop.__origParent;
    delete pop.__placementOpts;
    delete pop.dataset.popPlacement;
  };

  const registerPopoverButton = (btn, pop, options = {}) => {
    if (!btn || !pop) return;
    const {
      openOnHover = false,
      suppressClickToggle = false,
      hoverOpenDelay = 80,
      hoverCloseDelay = 120,
      ...placementOptions
    } = options;
    btn.setAttribute('aria-expanded', 'false');
    const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
    const open = () => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      if (typeof pop.onOpen === 'function') pop.onOpen();
      openPortaledPopover(btn, pop, placementOptions);
    };
    const close = () => closePortaledPopover(btn, pop);
    const onBtnClick = (event) => {
      event.stopPropagation();
      const openState = isOpen();
      if (openState) {
        close();
      } else {
        open();
      }
    };
    if (!suppressClickToggle) {
      btn.addEventListener('click', onBtnClick);
    }

    let hoverOpenTimer = null;
    let hoverCloseTimer = null;
    const isHoverTarget = (node) => !!node && (btn.contains(node) || pop.contains(node));
    const hasFocusInside = () => pop.contains(document.activeElement);
    const scheduleOpen = () => {
      if (!openOnHover) return;
      clearTimeout(hoverCloseTimer);
      if (isOpen()) return;
      hoverOpenTimer = setTimeout(open, hoverOpenDelay);
    };
    const scheduleClose = (event) => {
      if (!openOnHover) return;
      clearTimeout(hoverOpenTimer);
      if (isHoverTarget(event?.relatedTarget)) return;
      hoverCloseTimer = setTimeout(() => {
        const hovering = btn.matches(':hover') || pop.matches(':hover');
        if (!hovering && !hasFocusInside()) close();
      }, hoverCloseDelay);
    };

    if (openOnHover) {
      btn.addEventListener('mouseenter', scheduleOpen);
      btn.addEventListener('mouseleave', scheduleClose);
      pop.addEventListener('mouseenter', scheduleOpen);
      pop.addEventListener('mouseleave', scheduleClose);
      pop.addEventListener('focusin', scheduleOpen);
      pop.addEventListener('focusout', scheduleClose);
    }

    const onDocClick = (event) => {
      if (!isOpen()) return;
      if (!pop.contains(event.target) && !btn.contains(event.target)) {
        close();
      }
    };
    document.addEventListener('click', onDocClick, { capture: true });
    pop.__btn = btn;
    pop.__close = close;
  };

  const getPanelTypeConfig = (panelState) => getPanelType(panelState?.type);

  const mountPanel = ({ panelId, panelState, runtime } = {}) => {
    if (!panelId || !panelState) return null;
        const panelType = getPanelTypeConfig(panelState);
        const isPlotPanel = panelType?.capabilities?.plot !== false;
        const isMarkdownPanel = panelType?.id === 'markdown';
        const isSpreadsheetPanel = panelType?.id === 'spreadsheet';
        const panelEl = document.createElement('div');
        panelEl.className = 'workspace-panel';
        if (panelType?.panelClass) {
          panelEl.classList.add(panelType.panelClass);
        }
        if (isPlotPanel) {
          panelEl.classList.add('workspace-panel--plot');
        }
        panelEl.dataset.panelId = panelId;
        panelEl.dataset.graphIndex = String(panelState.index);
        const initialTitle = (typeof panelState.title === 'string' && panelState.title.trim())
          ? panelState.title.trim()
          : (Number.isInteger(panelState.index) && panelState.index > 0 ? `Graph ${panelState.index}` : 'Graph');
        panelEl.dataset.graphTitle = initialTitle;

        const header = document.createElement('div');
        header.className = 'workspace-panel-header';
        const headerTagBadge = isPlotPanel
          ? (() => {
            const badge = document.createElement('span');
            badge.className = 'dashboard-tag graph-canvas-tag';
            badge.hidden = true;
            return badge;
          })()
          : null;

        const title = document.createElement('div');
        title.className = 'workspace-panel-title';
        title.dataset.panelId = panelId;
        const resolvedTitle = initialTitle;
        title.textContent = resolvedTitle;
        title.addEventListener('dblclick', (evt) => {
          evt.stopPropagation();
          startPanelRename(panelId, title, { selectAll: true });
        });

        const actions = document.createElement('div');
        actions.className = 'workspace-panel-actions';
        const actionsCenter = document.createElement('div');
        actionsCenter.className = 'workspace-panel-actions-center';
        const actionsRight = document.createElement('div');
        actionsRight.className = 'workspace-panel-actions-right';
        let refreshActionOverflow = () => {};
        let contentHandles = null;
        let markdownPreviewToggleBtn = null;
        let markdownPreviewToggleIcon = null;
        let markdownRenderToggleBtn = null;
        let markdownRenderToggleLabel = null;
        let plotHost = null;
        let stylePainterBtn = null;
        let stylePainterPopover = null;
        let lockBtn = null;
        let pinBtn = null;
        let setDataTabButtonActive = null;
        let panelLockState = { editLocked: false, pinned: false };
        const buildMarkdownPreviewIcon = () => {
          const icon = document.createElement('span');
          icon.className = 'workspace-markdown-preview-toggle-icon';
          icon.setAttribute('aria-hidden', 'true');
          const editorPane = document.createElement('span');
          editorPane.className = 'pane pane--primary';
          const previewPane = document.createElement('span');
          previewPane.className = 'pane pane--secondary';
          icon.appendChild(editorPane);
          icon.appendChild(previewPane);
          return icon;
        };
        const updateMarkdownPreviewToggle = () => {
          if (!markdownPreviewToggleBtn) return;
          const hasHandles = Boolean(contentHandles);
          const renderMode = contentHandles?.getRenderMode?.() ?? 'markdown';
          const isPlain = renderMode === 'plain';
          markdownPreviewToggleBtn.disabled = !hasHandles || isPlain;
          const mode = contentHandles?.getMode?.() ?? 'split';
          const previewVisible = mode !== 'edit';
          const label = 'Toggle view';
          markdownPreviewToggleBtn.title = label;
          markdownPreviewToggleBtn.setAttribute('aria-label', label);
          markdownPreviewToggleBtn.classList.toggle('is-preview-visible', previewVisible);
          markdownPreviewToggleBtn.classList.toggle('is-preview-only', mode === 'preview');
          markdownPreviewToggleBtn.classList.toggle('is-edit-only', mode === 'edit');
          markdownPreviewToggleBtn.classList.toggle('is-split-horizontal', mode === 'split-h');
          markdownPreviewToggleBtn.classList.toggle('is-preview-available', hasHandles);
          markdownPreviewToggleBtn.dataset.mode = mode;
          if (!markdownPreviewToggleIcon && markdownPreviewToggleBtn) {
            markdownPreviewToggleIcon = buildMarkdownPreviewIcon();
            markdownPreviewToggleBtn.appendChild(markdownPreviewToggleIcon);
          }
        };
        const updateMarkdownRenderToggle = () => {
          if (!markdownRenderToggleBtn) return;
          const renderMode = contentHandles?.getRenderMode?.() ?? 'markdown';
          const isPlain = renderMode === 'plain';
          const label = isPlain ? 'T' : 'Md';
          markdownRenderToggleBtn.title = isPlain ? 'Plain text' : 'Markdown';
          markdownRenderToggleBtn.setAttribute('aria-label', markdownRenderToggleBtn.title);
          markdownRenderToggleBtn.setAttribute('aria-pressed', String(!isPlain));
          if (markdownRenderToggleLabel) {
            markdownRenderToggleLabel.textContent = label;
          } else {
            markdownRenderToggleBtn.textContent = label;
          }
          markdownRenderToggleBtn.classList.toggle('is-plain', isPlain);
        };

    const createToggleButton = ({
      icon,
      title,
      pressed = false,
      onClick = null
    }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
      btn.innerHTML = `<i class="bi ${icon}"></i>`;
      btn.title = title;
      btn.setAttribute('aria-pressed', String(pressed));
      btn.classList.toggle('is-active', pressed);
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(next));
        btn.classList.toggle('is-active', next);
        if (typeof onClick === 'function') {
          const result = onClick(next, btn);
          if (result === false) {
            const reverted = !next;
            btn.setAttribute('aria-pressed', String(reverted));
            btn.classList.toggle('is-active', reverted);
          }
        }
      });
      return btn;
    };

  const applyHeaderLockState = (state) => {
    if (!panelEl) return;
    panelEl.classList.toggle('is-edit-locked', state?.editLocked === true);
    panelEl.classList.toggle('is-panel-pinned', state?.pinned === true);
    panelEl.querySelectorAll('.workspace-panel-action-btn').forEach((btn) => {
      if (state?.editLocked === true && btn.dataset?.panelAction !== 'lock') {
        if (!btn.disabled) {
          btn.dataset.lockDisabled = '1';
        }
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('is-locked');
      } else if (btn.dataset.lockDisabled === '1') {
        btn.disabled = false;
        btn.removeAttribute('aria-disabled');
        btn.classList.remove('is-locked');
        delete btn.dataset.lockDisabled;
      }
    });
  };
    if (isPlotPanel) {
        const popoverClosers = [];
        const registerPopoverCloser = (fn) => {
          if (typeof fn !== 'function') return;
          if (!popoverClosers.includes(fn)) {
            popoverClosers.push(fn);
          }
        };

        const closeAllPopovers = (ignore) => {
          popoverClosers.forEach((closeFn) => {
            if (closeFn && closeFn !== ignore) {
              closeFn();
            }
          });
        };

        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'workspace-panel-actions-collection';
        controlsWrapper.setAttribute('aria-hidden', 'false');

        const ACTION_ORDER_ATTR = 'data-panel-action-order';
        const actionItems = [];
        let overflowPanel = null;

        const toOrder = (node) => Number(node?.getAttribute(ACTION_ORDER_ATTR)) || 0;

        const registerActionItem = (node) => {
          if (!node) return null;
          node.dataset.panelActionItem = '1';
          node.classList.add('workspace-panel-action-item');
          node.classList.remove('is-overflowed');
          node.removeAttribute('data-panel-action-overflow');
          return node;
        };
        const appendActionItem = (node) => {
          if (!node) return null;
          registerActionItem(node);
          node.setAttribute(ACTION_ORDER_ATTR, String(actionItems.length));
          actionItems.push(node);
          controlsWrapper.appendChild(node);
          return node;
        };
        const isVisibleActionItem = (item) => {
          if (!item || item.hidden) return false;
          if (item.offsetParent !== null) return true;
          return item.getClientRects().length > 0;
        };
        const getOrderedInlineItems = ({ includeHidden = false } = {}) => actionItems
          .filter((item) => item
            && item.parentElement === controlsWrapper
            && (includeHidden || isVisibleActionItem(item)))
          .sort((a, b) => toOrder(a) - toOrder(b));
        const moveItemToInline = (node) => {
          if (!node || node.parentElement === controlsWrapper) return;
          const nextSibling = getOrderedInlineItems()
            .find((item) => toOrder(item) > toOrder(node)) || null;
          if (nextSibling) {
            controlsWrapper.insertBefore(node, nextSibling);
          } else {
            controlsWrapper.appendChild(node);
          }
          node.classList.remove('is-overflowed');
          node.removeAttribute('data-panel-action-overflow');
        };
        const moveAllItemsInline = () => {
          actionItems.forEach((item) => moveItemToInline(item));
        };
        const moveItemToOverflow = (node) => {
          if (!node || !overflowPanel || node.parentElement === overflowPanel) return;
          overflowPanel.appendChild(node);
          node.classList.add('is-overflowed');
          node.setAttribute('data-panel-action-overflow', '1');
        };

        const appendPopoverControl = (buttonEl, popoverEl, options = {}) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'workspace-panel-action-wrapper';
          wrapper.appendChild(buttonEl);
          wrapper.appendChild(popoverEl);
          appendActionItem(wrapper);

          // generic portal wiring for all popovers
          registerPopoverButton(buttonEl, popoverEl, options);
        };

        const readMergedAxisState = (axisKey, { includeMinor = false, includeTitle = false } = {}) => {
          const figure = safeGetPanelFigure(panelId);
          const layout = figure.layout || {};
          const runtimeLayout = plotHost?.layout || {};
          const fullRuntimeLayout = plotHost?._fullLayout || {};
          const runtimeAxis = {
            ...(fullRuntimeLayout?.[axisKey] || {}),
            ...(runtimeLayout?.[axisKey] || {})
          };
          const modelAxis = layout[axisKey] || {};
          const axis = {
            ...runtimeAxis,
            ...modelAxis
          };
          if (includeMinor) {
            axis.minor = {
              ...(runtimeAxis.minor || {}),
              ...(modelAxis.minor || {})
            };
          }
          if (includeTitle) {
            axis.title = {
              ...(runtimeAxis.title || {}),
              ...(modelAxis.title || {})
            };
          }
          return axis;
        };

        const readAxisSides = () => {
          const X = readMergedAxisState('xaxis', { includeMinor: true });
          const Y = readMergedAxisState('yaxis', { includeMinor: true });
          const xOn = { top: false, bottom: false };
          const yOn = { left: false, right: false };
          if (X.visible === false) {
            // none
          } else if (X.mirror) {
            xOn.top = true;
            xOn.bottom = true;
          } else {
            xOn[(X.side || 'bottom')] = true;
          }
          if (Y.visible === false) {
            // none
          } else if (Y.mirror) {
            yOn.left = true;
            yOn.right = true;
          } else {
            yOn[(Y.side || 'left')] = true;
          }
          return {
            top: xOn.top,
            bottom: xOn.bottom,
            left: yOn.left,
            right: yOn.right
          };
        };

        const readAxisLabelState = () => {
          const X = readMergedAxisState('xaxis', { includeTitle: true });
          const Y = readMergedAxisState('yaxis', { includeTitle: true });
          const labelsOn = (X.showticklabels !== false) && (Y.showticklabels !== false);
          return { labelsOn, X, Y };
        };

        const readGridState = () => {
          const X = readMergedAxisState('xaxis', { includeMinor: true });
          const Y = readMergedAxisState('yaxis', { includeMinor: true });
          return {
            majorOn: Boolean(X.showgrid || Y.showgrid),
            minorOn: Boolean(X.minor?.showgrid || Y.minor?.showgrid)
          };
        };

        const readTickState = () => {
          const X = readMergedAxisState('xaxis', { includeMinor: true });
          const Y = readMergedAxisState('yaxis', { includeMinor: true });
          const majorOn = (X.ticks ?? 'outside') !== '' || (Y.ticks ?? 'outside') !== '';
          const minorOn = (X.minor?.ticks ?? '') !== '' || (Y.minor?.ticks ?? '') !== '' || X.minor?.show === true || Y.minor?.show === true;
          return { majorOn, minorOn };
        };

        const setActionButtonState = (button, isOn) => {
          if (!button) return;
          const next = Boolean(isOn);
          button.classList.toggle('is-active', next);
          button.setAttribute('aria-pressed', String(next));
        };

        const axesBtn = document.createElement('button');
        axesBtn.type = 'button';
        axesBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        axesBtn.innerHTML = '<i class="bi bi-diagram-3"></i>';
        axesBtn.title = 'Axes options';
        axesBtn.setAttribute('aria-expanded', 'false');
        axesBtn.setAttribute('aria-pressed', 'false');
        {
          const { top, bottom, left, right } = readAxisSides();
          setActionButtonState(axesBtn, top && bottom && left && right);
        }

        const axesPopover = document.createElement('div');
        axesPopover.className = 'workspace-panel-popover workspace-panel-popover-axes';
        axesPopover.innerHTML = `
          <div class="workspace-panel-popover-axes-grid">
            <div class="workspace-panel-popover-axes-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Presets</div>
                <div class="workspace-panel-popover-items workspace-panel-popover-axes-presets" data-role="axes-presets">
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="all">All</button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="none">None</button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="xy">X + Y</button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="upright">Up + Right</button>
                </div>
              </div>
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Visible axes</div>
                <div class="workspace-panel-popover-items workspace-panel-popover-axes-visibility">
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Top axis" data-side="top" aria-pressed="true"><i class="bi bi-arrow-up"></i></button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Bottom axis" data-side="bottom" aria-pressed="true"><i class="bi bi-arrow-down"></i></button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Left axis" data-side="left" aria-pressed="true"><i class="bi bi-arrow-left"></i></button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Right axis" data-side="right" aria-pressed="true"><i class="bi bi-arrow-right"></i></button>
                </div>
              </div>
            </div>
            <div class="workspace-panel-popover-axes-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Scale</div>
                <div class="workspace-panel-popover-items workspace-panel-popover-axes-scale" data-role="axes-scale">
                  <div class="workspace-panel-popover-axes-scale-row" data-axis="x">
                    <span class="workspace-panel-popover-axes-scale-label">x-axis</span>
                    <div class="btn-group" role="group">
                      <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="x" data-scale="linear">Linear</button>
                      <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="x" data-scale="log">Log</button>
                    </div>
                  </div>
                  <div class="workspace-panel-popover-axes-scale-row" data-axis="y">
                    <span class="workspace-panel-popover-axes-scale-label">y-axis</span>
                    <div class="btn-group" role="group">
                      <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="y" data-scale="linear">Linear</button>
                      <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="y" data-scale="log">Log</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="workspace-panel-popover-section" data-snapshot-section="size">
                <div class="workspace-panel-popover-label">Thickness</div>
                <div class="workspace-panel-popover-items workspace-panel-popover-axes-thickness" data-role="axes-thickness">
                  <div class="workspace-panel-popover-axes-thickness-pills">
                    <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thin">Thin</button>
                    <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-thickness="medium">Medium</button>
                    <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thick">Thick</button>
                  </div>
                  <div class="workspace-panel-popover-axes-thickness-slider" data-role="axes-thickness-custom">
                    <input type="range" min="1" max="6" step="1"
                          class="form-range" style="width:140px" />
                    <span class="small text-muted" data-readout>2px</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        axesPopover.onOpen = () => {
          const X = readMergedAxisState('xaxis', { includeMinor: true });
          const Y = readMergedAxisState('yaxis', { includeMinor: true });

          // Resolve which sides are ON from Plotly state
          const { top, bottom, left, right } = readAxisSides();

          const cont = axesPopover.querySelector('.workspace-panel-popover-axes-visibility');
          const set = (side, on) => {
            const b = cont.querySelector(`[data-side="${side}"]`);
            if (!b) return;
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-active', on);
          };
          ['top','bottom','left','right'].forEach(s => set(s, false));
          set('top', top);
          set('bottom', bottom);
          set('left', left);
          set('right', right);

          // Thickness pills ╬ô├ç├╢ infer from linewidth
          const w = Number(X.linewidth ?? Y.linewidth ?? 1);
          const level = w >= 1.75 ? 'thick' : w <= 0.75 ? 'thin' : 'medium';
          axesPopover
            .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.thickness === level));

          const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
          if (sliderWrap) {
            const slider = sliderWrap.querySelector('input[type="range"]');
            const readout = sliderWrap.querySelector('[data-readout]');
            const px = Math.max(1, Math.round(Number(X.linewidth ?? Y.linewidth ?? 2)));
            slider.value = String(px);
            if (readout) readout.textContent = `${px}px`;
          }

          const scaleWrap = axesPopover.querySelector('[data-role="axes-scale"]');
          if (scaleWrap) {
            const xType = (X.type || 'linear').toLowerCase();
            scaleWrap.querySelectorAll('[data-scale-axis="x"]').forEach((btn) => {
              const isLog = btn.dataset.scale === 'log';
              const isActive = isLog ? xType === 'log' : xType !== 'log';
              btn.classList.toggle('is-active', isActive);
              btn.setAttribute('aria-pressed', String(isActive));
            });
            const yType = (Y.type || 'linear').toLowerCase();
            scaleWrap.querySelectorAll('[data-scale-axis="y"]').forEach((btn) => {
              const isLog = btn.dataset.scale === 'log';
              const isActive = isLog ? yType === 'log' : yType !== 'log';
              btn.classList.toggle('is-active', isActive);
              btn.setAttribute('aria-pressed', String(isActive));
            });
          }

          setActionButtonState(axesBtn, top && bottom && left && right);
        };

        axesPopover.addEventListener('input', (e) => {
          const slider = e.target.closest('[data-role="axes-thickness-custom"] input[type="range"]');
          if (!slider) return;
          const wrap = slider.closest('[data-role="axes-thickness-custom"]');
          const resolved = Math.max(1, Math.min(6, Math.round(Number(slider.value) || 1)));
          const readout = wrap.querySelector('[data-readout]');
          if (readout) readout.textContent = `${resolved}px`;
          axesPopover
            .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn[data-thickness]')
            .forEach((btn) => btn.classList.remove('is-active'));
          safeHandleHeaderAction(panelId, 'axes-thickness-custom', { value: resolved });
          e.stopPropagation();
        });

        let axesOutsideActive = false;
        const closeAxesPopover = () => {
          if (!axesPopover.classList.contains('is-open')) return;
          axesPopover.classList.remove('is-open');
          axesBtn.setAttribute('aria-expanded', 'false');
          controlsWrapper.classList.remove('allow-popover');
          if (axesOutsideActive) {
            document.removeEventListener('click', handleAxesOutsideClick);
            axesOutsideActive = false;
          }
        };
        registerPopoverCloser(closeAxesPopover);
        const handleAxesOutsideClick = (event) => {
          if (axesPopover.contains(event.target) || axesBtn.contains(event.target)) return;
          closeAxesPopover();
        };

          axesPopover.addEventListener('click', (event) => event.stopPropagation());

          axesPopover.addEventListener('click', (e) => {
            const t = e.target.closest('[data-thickness],[data-side],[data-preset],[data-scale-axis]');
            if (!t) return;

            // Helper to read/write individual side buttons
            const cont = axesPopover.querySelector('.workspace-panel-popover-axes-visibility');
            const setSide = (side, on) => {
              const b = cont.querySelector(`[data-side="${side}"]`);
              if (!b) return;
              b.setAttribute('aria-pressed', String(on));
              b.classList.toggle('is-active', on);
            };
            const isOn = (side) =>
              cont.querySelector(`[data-side="${side}"]`).getAttribute('aria-pressed') === 'true';

            // 1) Thickness pills
            if (t.dataset.thickness) {
              axesPopover
                .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn[data-thickness]')
                .forEach((b) => b.classList.toggle('is-active', b === t));

              // Map to visible widths 1/2/3
              const level = t.dataset.thickness;
              const map = { thin: 1, medium: 2, thick: 3 };
              safeHandleHeaderAction(panelId, 'axes-thickness', { level, value: map[level] });

              // keep slider readout in sync
              const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
              if (sliderWrap) {
                const slider = sliderWrap.querySelector('input[type="range"]');
                const readout = sliderWrap.querySelector('[data-readout]');
                slider.value = String(map[level]);
                if (readout) readout.textContent = `${map[level]}px`;
              }

              e.stopPropagation();
              return;
            }

            // 2) Presets (apply sides)
            if (t.dataset.preset) {
              const preset = t.dataset.preset;
              if (preset === 'all') {
                setSide('top', true); setSide('bottom', true);
                setSide('left', true); setSide('right', true);
              } else if (preset === 'xy') {
                setSide('top', false); setSide('bottom', true);
                setSide('left', true); setSide('right', false);
              } else if (preset === 'none') {
                ['top','bottom','left','right'].forEach((s) => setSide(s, false));
              } else if (preset === 'upright') {
                setSide('top', true);  setSide('bottom', false);
                setSide('left', false); setSide('right', true);
              }

              safeHandleHeaderAction(panelId, 'axes-side', {
                top: isOn('top'),
                bottom: isOn('bottom'),
                left: isOn('left'),
                right: isOn('right')
              });
              setActionButtonState(axesBtn, ['top', 'bottom', 'left', 'right'].every((side) => isOn(side)));
              e.stopPropagation();
              return;
            }

            // 3) Independent side toggle
            if (t.dataset.side) {
              const pressed = t.getAttribute('aria-pressed') !== 'true';
              t.setAttribute('aria-pressed', String(pressed));
              t.classList.toggle('is-active', pressed);

              safeHandleHeaderAction(panelId, 'axes-side', {
                top: isOn('top'),
                bottom: isOn('bottom'),
                left: isOn('left'),
                right: isOn('right')
              });
              setActionButtonState(axesBtn, ['top', 'bottom', 'left', 'right'].every((side) => isOn(side)));
              e.stopPropagation();
              return;
            }

            if (t.dataset.scaleAxis) {
              const axis = t.dataset.scaleAxis;
              const scale = t.dataset.scale || 'linear';
              const group = t.closest('[data-axis]');
              if (group) {
                group.querySelectorAll('[data-scale-axis]').forEach((btn) => {
                  const active = btn === t;
                  btn.classList.toggle('is-active', active);
                  btn.setAttribute('aria-pressed', String(active));
                });
              }
              const action = `${axis}scale-${scale}`;
              safeHandleHeaderAction(panelId, action);
              e.stopPropagation();
            }
          });

        axesPopover.__close = closeAxesPopover;
        axesBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const { top, bottom, left, right } = readAxisSides();
          const allOn = top && bottom && left && right;
          const next = allOn
            ? { top: false, bottom: true, left: true, right: false }
            : { top: true, bottom: true, left: true, right: true };
          safeHandleHeaderAction(panelId, 'axes-side', next);
          setActionButtonState(axesBtn, !allOn);
        });
        appendPopoverControl(axesBtn, axesPopover, { openOnHover: true, suppressClickToggle: true });

        const axisLabelsBtn = document.createElement('button');
        axisLabelsBtn.type = 'button';
        axisLabelsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        axisLabelsBtn.innerHTML = '<i class="bi bi-type"></i>';
        axisLabelsBtn.title = 'Axis labels';
        axisLabelsBtn.setAttribute('aria-expanded', 'false');
        axisLabelsBtn.setAttribute('aria-pressed', 'false');
        {
          const { labelsOn } = readAxisLabelState();
          setActionButtonState(axisLabelsBtn, labelsOn);
        }

        const axisLabelsPopover = document.createElement('div');
        axisLabelsPopover.className = 'workspace-panel-popover workspace-panel-popover-axis-labels';
        axisLabelsPopover.innerHTML = `
          <div class="workspace-panel-popover-axis-labels-grid">
            <div class="workspace-panel-popover-axis-labels-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label-row">
                  <div class="workspace-panel-popover-label">Titles</div>
                  <div class="workspace-panel-popover-axis-scope workspace-peak-toggle-group">
                    <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-peak-toggle is-active" data-axis-scope="x" aria-pressed="true">X-axis</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-peak-toggle is-active" data-axis-scope="y" aria-pressed="true">Y-axis</button>
                  </div>
                </div>
                <div class="workspace-panel-popover-items d-flex flex-column gap-2">
                  <div class="workspace-panel-popover-axis-tools">
                    <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-panel-popover-axis-tool" data-axis-tool="superscript" title="Superscript">x<sup>2</sup></button>
                    <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-panel-popover-axis-tool" data-axis-tool="subscript" title="Subscript">x<sub>2</sub></button>
                    <span class="workspace-panel-popover-axis-greek">
                      <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-panel-popover-axis-tool" data-axis-tool="greek" aria-expanded="false" title="Greek letters">&alpha;</button>
                      <span class="workspace-panel-popover-axis-greek-menu" data-axis-greek-menu>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="alpha">&alpha;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="beta">&beta;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="gamma">&gamma;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="delta">&delta;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="epsilon">&epsilon;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="zeta">&zeta;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="eta">&eta;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="theta">&theta;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="iota">&iota;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="kappa">&kappa;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="lambda">&lambda;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="mu">&mu;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="nu">&nu;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="xi">&xi;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="omicron">&omicron;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="pi">&pi;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="rho">&rho;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="sigma">&sigma;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="tau">&tau;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="upsilon">&upsilon;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="phi">&phi;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="chi">&chi;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="psi">&psi;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="omega">&omega;</button>
                      </span>
                    </span>
                    <span class="workspace-panel-popover-axis-symbols">
                      <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn workspace-panel-popover-axis-tool" data-axis-tool="symbols" aria-expanded="false" title="Symbols">&plusmn;</button>
                      <span class="workspace-panel-popover-axis-symbols-menu" data-axis-symbols-menu>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="plusminus">&plusmn;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="times">&times;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="middot">&middot;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="degree">&deg;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="angstrom">&Aring;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="le">&le;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="ge">&ge;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="approx">&asymp;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="notequal">&ne;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="infinity">&infin;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="arrow">&rarr;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="leftarrow">&larr;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="leftright">&harr;</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-axis-insert="equilibrium">&#8644;</button>
                      </span>
                    </span>
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="small text-muted">X</span>
                    <input type="text" class="form-control form-control-sm" data-axis-title="x" placeholder="x-axis title">
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <span class="small text-muted">Y</span>
                    <input type="text" class="form-control form-control-sm" data-axis-title="y" placeholder="y-axis title">
                  </div>
                  <div class="d-flex align-items-center gap-2">
                    <div class="form-check form-switch workspace-panel-popover-switch">
                      <input class="form-check-input" type="checkbox" id="${panelId}_axis_tex" data-axis-title-tex checked disabled>
                      <label class="form-check-label" for="${panelId}_axis_tex">TeX formatting</label>
                    </div>
                    <span class="workspace-panel-popover-tip" aria-label="TeX help">
                      <i class="bi bi-info-circle"></i>
                      <span class="workspace-panel-popover-tip-content">
                        Use $...$ for math. Superscripts: ^{ }. Units: \mathrm{ }.
                      </span>
                    </span>
                  </div>
                  <div class="form-check form-switch workspace-panel-popover-switch">
                    <input class="form-check-input" type="checkbox" id="${panelId}_axis_autocomplete" disabled>
                    <label class="form-check-label" for="${panelId}_axis_autocomplete">Enable autocompletion</label>
                  </div>
                </div>
              </div>
            </div>
            <div class="workspace-panel-popover-axis-labels-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Typography</div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap" data-role="axis-labels-font">
                  <label class="small text-muted mb-0">Font</label>
                  <select class="form-select form-select-sm" data-font-family style="min-width: 150px">
                    <option value="inherit">Workspace default</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times</option>
                    <option value="'Courier New', monospace">Courier</option>
                    <option value="'Roboto', sans-serif">Roboto</option>
                  </select>
                </div>
                <div class="workspace-panel-popover-items workspace-panel-popover-axis-typography-row">
                  <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" data-font-weight="bold" title="Bold">B</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" title="Italic" disabled>I</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" title="Underline" disabled>U</button>
                  <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" title="Strike" disabled>S</button>
                  <input type="number" min="6" max="36" step="1" value="12" class="form-control form-control-sm workspace-panel-popover-axis-size" data-font-size title="Font size" />
                  <input type="color" value="#000000" class="form-control form-control-color form-control-sm workspace-panel-popover-axis-color" data-font-color title="Axis title color" />
                </div>
              </div>
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Layout</div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 workspace-panel-popover-axis-layout">
                  <span class="small text-muted workspace-panel-popover-axis-layout-label">Angle</span>
                  <input type="range" min="-90" max="90" step="5" value="0" class="form-range workspace-panel-popover-axis-range" data-angle />
                  <span class="small text-muted workspace-panel-popover-axis-readout" data-readout-angle>0°</span>
                </div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 workspace-panel-popover-axis-layout">
                  <span class="small text-muted workspace-panel-popover-axis-layout-label">Distance</span>
                  <input type="range" min="0" max="80" step="2" value="10" class="form-range workspace-panel-popover-axis-range" data-distance />
                  <span class="small text-muted workspace-panel-popover-axis-readout" data-readout-distance>10px</span>
                </div>
              </div>
            </div>
          </div>
        `;

        axisLabelsPopover.onOpen = () => {
          const { labelsOn, X, Y } = readAxisLabelState();
          const resolveAxisTitleText = (axisTitle) => {
            if (typeof axisTitle === 'string') return axisTitle;
            if (axisTitle && typeof axisTitle === 'object' && typeof axisTitle.text === 'string') {
              return axisTitle.text;
            }
            return '';
          };

          const visibility = axisLabelsPopover.querySelector('[data-role="axis-labels-toggle"]');
          if (visibility) {
            visibility.querySelectorAll('[data-labels]').forEach((btn) => {
              const isShow = btn.dataset.labels === 'show';
              btn.classList.toggle('is-active', isShow === labelsOn);
              btn.setAttribute('aria-pressed', String(isShow === labelsOn));
            });
          }
          setActionButtonState(axisLabelsBtn, labelsOn);

          const xTitleInput = axisLabelsPopover.querySelector('[data-axis-title="x"]');
          if (xTitleInput) xTitleInput.value = resolveAxisTitleText(X.title);
          const yTitleInput = axisLabelsPopover.querySelector('[data-axis-title="y"]');
          if (yTitleInput) yTitleInput.value = resolveAxisTitleText(Y.title);
          const texToggle = axisLabelsPopover.querySelector('[data-axis-title-tex]');
          if (texToggle) {
            texToggle.checked = true;
            texToggle.disabled = true;
          }

          const fontSelect = axisLabelsPopover.querySelector('[data-font-family]');
          if (fontSelect) {
            const family = X.title?.font?.family || Y.title?.font?.family || 'inherit';
            if (!Array.from(fontSelect.options).some((opt) => opt.value === family)) {
              const option = document.createElement('option');
              option.value = family;
              option.textContent = family;
              fontSelect.appendChild(option);
            }
            const defaultOption = fontSelect.querySelector('option[value="inherit"]');
            if (defaultOption) {
              let defaultFamily = X.title?.font?.family || Y.title?.font?.family
                || plotHost?._fullLayout?.font?.family
                || plotHost?.layout?.font?.family;
              if (!defaultFamily && typeof window !== 'undefined') {
                const source = plotHost || document.body;
                defaultFamily = source ? window.getComputedStyle(source).fontFamily : '';
              }
              const shortName = (defaultFamily || 'Workspace').split(',')[0].trim().replace(/^'["']|["']$/g, '');
              defaultOption.textContent = `${shortName || 'Workspace'} (default)`;
            }
            fontSelect.value = family;
          }

          const weightBtn = axisLabelsPopover.querySelector('[data-font-weight]');
          if (weightBtn) {
            const weight = X.title?.font?.weight ?? Y.title?.font?.weight ?? 400;
            const normalized = typeof weight === 'string' ? weight.toLowerCase() : Number(weight);
            const isBold = normalized === 'bold' || Number(normalized) >= 600;
            weightBtn.classList.toggle('is-active', isBold);
            weightBtn.setAttribute('aria-pressed', String(isBold));
          }

          const sizeInput = axisLabelsPopover.querySelector('[data-font-size]');
          if (sizeInput) {
            const size = Number(X.title?.font?.size ?? Y.title?.font?.size ?? 12);
            sizeInput.value = Number.isFinite(size) ? size : 12;
          }

          const colorInput = axisLabelsPopover.querySelector('[data-font-color]');
          if (colorInput) {
            const color = X.title?.font?.color || Y.title?.font?.color || '#000000';
            const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
            colorInput.value = hexPattern.test(color) ? color : '#000000';
          }

          const angleInput = axisLabelsPopover.querySelector('[data-angle]');
          const angleReadout = axisLabelsPopover.querySelector('[data-readout-angle]');
          if (angleInput && angleReadout) {
            const angle = Number(X.tickangle ?? Y.tickangle ?? 0);
            const resolved = Number.isFinite(angle) ? angle : 0;
            angleInput.value = resolved;
            angleReadout.textContent = `${resolved}°`;
          }

          const distanceInput = axisLabelsPopover.querySelector('[data-distance]');
          const distanceReadout = axisLabelsPopover.querySelector('[data-readout-distance]');
          if (distanceInput && distanceReadout) {
            const dist = Number(X.title?.standoff ?? Y.title?.standoff ?? 10);
            const resolved = Number.isFinite(dist) ? dist : 10;
            distanceInput.value = resolved;
            distanceReadout.textContent = `${resolved}px`;
          }
        };

        let activeAxisTitleInput = null;
        let axisTitleInputMode = null;
        const axisTitleSuperscriptMap = {
          '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074',
          '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
          '+': '\u207A', '-': '\u207B', '=': '\u207C', '(': '\u207D', ')': '\u207E',
          'n': '\u207F', 'i': '\u2071'
        };
        const axisTitleSubscriptMap = {
          '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083', '4': '\u2084',
          '5': '\u2085', '6': '\u2086', '7': '\u2087', '8': '\u2088', '9': '\u2089',
          '+': '\u208A', '-': '\u208B', '=': '\u208C', '(': '\u208D', ')': '\u208E'
        };
        const axisTitleGreekMap = {
          alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4',
          epsilon: '\u03B5', zeta: '\u03B6', eta: '\u03B7', theta: '\u03B8',
          iota: '\u03B9', kappa: '\u03BA', lambda: '\u03BB', mu: '\u03BC',
          nu: '\u03BD', xi: '\u03BE', omicron: '\u03BF', pi: '\u03C0',
          rho: '\u03C1', sigma: '\u03C3', tau: '\u03C4', upsilon: '\u03C5',
          phi: '\u03C6', chi: '\u03C7', psi: '\u03C8', omega: '\u03C9'
        };
        const axisTitleSymbolMap = {
          plusminus: '\u00B1',
          times: '\u00D7',
          middot: '\u00B7',
          degree: '\u00B0',
          angstrom: '\u00C5',
          le: '\u2264',
          ge: '\u2265',
          approx: '\u2248',
          notequal: '\u2260',
          infinity: '\u221E',
          arrow: '\u2192',
          leftarrow: '\u2190',
          leftright: '\u2194',
          equilibrium: '\u21CC'
        };
        const axisTitleMenuLocks = { greek: false, symbols: false };
        const getAxisMenu = (type) => axisLabelsPopover.querySelector(
          type === 'greek' ? '[data-axis-greek-menu]' : '[data-axis-symbols-menu]'
        );
        const getAxisMenuButton = (type) => axisLabelsPopover.querySelector(
          `[data-axis-tool="${type}"]`
        );
        const setAxisTitleMode = (mode) => {
          axisTitleInputMode = mode;
          axisLabelsPopover.querySelectorAll('[data-axis-tool]').forEach((btn) => {
            const tool = btn.dataset.axisTool;
            if (tool !== 'superscript' && tool !== 'subscript') return;
            const wants = tool === mode;
            btn.classList.toggle('is-active', wants);
          });
        };
        const insertAxisTitleText = (input, value) => {
          if (!input) return;
          const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
          const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : input.value.length;
          const next = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`;
          input.value = next;
          const cursor = start + value.length;
          if (typeof input.setSelectionRange === 'function') {
            input.setSelectionRange(cursor, cursor);
          }
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };
        const setAxisMenuState = (type, open) => {
          const menu = getAxisMenu(type);
          const btn = getAxisMenuButton(type);
          if (!menu || !btn) return;
          menu.classList.toggle('is-open', open);
          btn.setAttribute('aria-expanded', String(open));
        };
        const setAxisMenuLock = (type, locked) => {
          axisTitleMenuLocks[type] = locked;
          const btn = getAxisMenuButton(type);
          if (btn) {
            btn.classList.toggle('is-active', locked);
            btn.setAttribute('aria-pressed', String(locked));
          }
          setAxisMenuState(type, locked);
        };
        const wireAxisMenuHover = (type) => {
          const btn = getAxisMenuButton(type);
          const menu = getAxisMenu(type);
          if (!btn || !menu) return;
          const maybeClose = () => {
            if (axisTitleMenuLocks[type]) return;
            if (btn.matches(':hover') || menu.matches(':hover')) return;
            setAxisMenuState(type, false);
          };
          btn.addEventListener('mouseenter', () => {
            if (axisTitleMenuLocks[type]) return;
            setAxisMenuState(type, true);
          });
          btn.addEventListener('mouseleave', maybeClose);
          menu.addEventListener('mouseenter', () => {
            if (axisTitleMenuLocks[type]) return;
            setAxisMenuState(type, true);
          });
          menu.addEventListener('mouseleave', maybeClose);
        };
        wireAxisMenuHover('greek');
        wireAxisMenuHover('symbols');

        axisLabelsPopover.addEventListener('click', (event) => event.stopPropagation());

        axisLabelsPopover.addEventListener('focusin', (event) => {
          if (event.target.matches('[data-axis-title]')) {
            activeAxisTitleInput = event.target;
          }
        });

        axisLabelsPopover.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-labels],[data-font-weight]');
          if (!btn) return;
          if (btn.dataset.labels) {
            const show = btn.dataset.labels === 'show';
            const group = btn.closest('[data-role="axis-labels-toggle"]');
            group?.querySelectorAll('[data-labels]').forEach((el) => {
              const active = el === btn;
              el.classList.toggle('is-active', active);
              el.setAttribute('aria-pressed', String(active));
            });
            safeHandleHeaderAction(panelId, 'axis-title-style', { toggleLabels: show });
            setActionButtonState(axisLabelsBtn, show);
            e.stopPropagation();
            return;
          }
          if (btn.dataset.fontWeight) {
            const nextState = !btn.classList.contains('is-active');
            btn.classList.toggle('is-active', nextState);
            btn.setAttribute('aria-pressed', String(nextState));
            safeHandleHeaderAction(panelId, 'axis-title-style', { fontWeight: nextState ? 'bold' : 'normal' });
            e.stopPropagation();
          }
        });

        axisLabelsPopover.addEventListener('click', (e) => {
          const scopeBtn = e.target.closest('[data-axis-scope]');
          if (scopeBtn) {
            const nextState = !scopeBtn.classList.contains('is-active');
            scopeBtn.classList.toggle('is-active', nextState);
            scopeBtn.setAttribute('aria-pressed', String(nextState));
            e.stopPropagation();
            return;
          }
          const tool = e.target.closest('[data-axis-tool]');
          const insert = e.target.closest('[data-axis-insert]');
          if (!tool && !insert) return;
          if (tool) {
            const mode = tool.dataset.axisTool;
            if (mode === 'superscript' || mode === 'subscript') {
              const next = axisTitleInputMode === mode ? null : mode;
              setAxisTitleMode(next);
              (activeAxisTitleInput || axisLabelsPopover.querySelector('[data-axis-title="x"]'))?.focus();
              e.stopPropagation();
              return;
            }
            if (mode === 'greek') {
              const next = !axisTitleMenuLocks.greek;
              setAxisMenuLock('greek', next);
              (activeAxisTitleInput || axisLabelsPopover.querySelector('[data-axis-title="x"]'))?.focus();
              e.stopPropagation();
              return;
            }
            if (mode === 'symbols') {
              const next = !axisTitleMenuLocks.symbols;
              setAxisMenuLock('symbols', next);
              (activeAxisTitleInput || axisLabelsPopover.querySelector('[data-axis-title="x"]'))?.focus();
              e.stopPropagation();
              return;
            }
          }
          if (insert) {
            const targetInput = activeAxisTitleInput || axisLabelsPopover.querySelector('[data-axis-title="x"]');
            const key = insert.dataset.axisInsert || '';
            const resolved = axisTitleGreekMap[key] || axisTitleSymbolMap[key] || insert.textContent || key;
            insertAxisTitleText(targetInput, resolved);
            targetInput?.focus();
            const menu = insert.closest('[data-axis-greek-menu],[data-axis-symbols-menu]');
            const menuType = menu?.hasAttribute('data-axis-greek-menu') ? 'greek' : 'symbols';
            if (menuType && !axisTitleMenuLocks[menuType]) {
              setAxisMenuState(menuType, false);
            }
            e.stopPropagation();
          }
        });

        axisLabelsPopover.addEventListener('keydown', (e) => {
          if (!e.target.matches('[data-axis-title]')) return;
          if (e.ctrlKey && e.shiftKey) {
            const isSuper = e.code === 'Equal' || e.key === '+';
            const isSub = e.code === 'Minus' || e.key === '-' || e.key === '_';
            if (isSuper || isSub) {
              const mode = isSuper ? 'superscript' : 'subscript';
              const next = axisTitleInputMode === mode ? null : mode;
              setAxisTitleMode(next);
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
          if (!axisTitleInputMode) return;
          const map = axisTitleInputMode === 'superscript'
            ? axisTitleSuperscriptMap
            : axisTitleSubscriptMap;
          const mapped = map[e.key];
          if (!mapped) return;
          e.preventDefault();
          insertAxisTitleText(e.target, mapped);
        });

        axisLabelsPopover.addEventListener('change', (e) => {
          if (e.target.matches('[data-axis-title]')) {
            const axis = e.target.dataset.axisTitle;
            const value = e.target.value;
            if (axis === 'x') {
              safeHandleHeaderAction(panelId, 'axis-title-text', { xTitle: value });
            } else if (axis === 'y') {
              safeHandleHeaderAction(panelId, 'axis-title-text', { yTitle: value });
            }
            e.stopPropagation();
          }
          if (e.target.matches('[data-font-family]')) {
            safeHandleHeaderAction(panelId, 'axis-title-style', { fontFamily: e.target.value });
            e.stopPropagation();
          }
          if (e.target.matches('[data-font-size]')) {
            safeHandleHeaderAction(panelId, 'axis-title-style', { fontSize: e.target.value });
            e.stopPropagation();
          }
          if (e.target.matches('[data-font-color]')) {
            safeHandleHeaderAction(panelId, 'axis-title-style', { color: e.target.value });
            e.stopPropagation();
          }
        });

        axisLabelsPopover.addEventListener('input', (e) => {
          if (e.target.matches('[data-angle]')) {
            const value = Number(e.target.value);
            const readout = axisLabelsPopover.querySelector('[data-readout-angle]');
            if (readout) readout.textContent = `${value}°`;
            safeHandleHeaderAction(panelId, 'axis-title-style', { angle: value });
            e.stopPropagation();
          }
          if (e.target.matches('[data-distance]')) {
            const value = Number(e.target.value);
            const readout = axisLabelsPopover.querySelector('[data-readout-distance]');
            if (readout) readout.textContent = `${value}px`;
            safeHandleHeaderAction(panelId, 'axis-title-style', { distance: value });
            e.stopPropagation();
          }
        });

        axisLabelsBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const { labelsOn } = readAxisLabelState();
          const next = !labelsOn;
          safeHandleHeaderAction(panelId, 'axis-title-style', { toggleLabels: next });
          setActionButtonState(axisLabelsBtn, next);
        });
        appendPopoverControl(axisLabelsBtn, axisLabelsPopover, { openOnHover: true, suppressClickToggle: true });

          // === Major Grid (header toggle) ==============================================
          const currentLayout = safeGetPanelFigure(panelId).layout || {};
          const isMajorGridOn = Boolean(currentLayout?.xaxis?.showgrid || currentLayout?.yaxis?.showgrid);
          const isMinorGridOn = Boolean(currentLayout?.xaxis?.minor?.showgrid || currentLayout?.yaxis?.minor?.showgrid);

          // === Grid options (major + minor) ===========================================
        const gridBtn = document.createElement('button');
        gridBtn.type = 'button';
        gridBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        gridBtn.innerHTML = `
          <span class="workspace-panel-action-icon">
            <span class="workspace-panel-action-icon-grid" aria-hidden="true"></span>
            <span class="visually-hidden">Grid options</span>
          </span>
        `;
          gridBtn.title = 'Grid options';
          gridBtn.setAttribute('aria-expanded', 'false');
          setActionButtonState(gridBtn, isMajorGridOn || isMinorGridOn);

          const gridPopover = document.createElement('div');
          gridPopover.className = 'workspace-panel-popover';
          gridPopover.innerHTML = `
            <div class="workspace-panel-popover-section">
              <div class="workspace-panel-popover-label">Major grid</div>
              <div class="workspace-panel-popover-items" data-role="major-toggle">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-major="on">On</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-major="off">Off</button>
              </div>
              <div class="workspace-panel-popover-items d-flex align-items-center gap-2 mt-2" data-role="major-thickness">
                <span class="small text-muted">Thickness</span>
                <input type="range" min="1" max="6" step="1" class="form-range" style="width:160px" />
                <span class="small text-muted" data-readout>1px</span>
              </div>
            </div>
            <div class="workspace-panel-popover-section">
              <div class="workspace-panel-popover-label">Minor grid</div>
              <div class="workspace-panel-popover-items" data-role="minor-toggle">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor="on">On</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-minor="off">Off</button>
              </div>
            </div>
            <div class="workspace-panel-popover-section">
              <div class="workspace-panel-popover-label">Subdivisions per major</div>
              <div class="workspace-panel-popover-items" data-role="minor-subdiv">
                <input type="range" min="1" max="10" step="1" value="1" class="form-range" style="width:160px" />
                <span class="small text-muted ms-2" data-readout>1</span>
              </div>
            </div>
          `;

          // Sync UI to current layout on open
          gridPopover.onOpen = () => {
            const figure = safeGetPanelFigure(panelId);
            const L = figure.layout || {};
            const majorOn = !!(L?.xaxis?.showgrid || L?.yaxis?.showgrid);
            const majorToggle = gridPopover.querySelector('[data-role="major-toggle"]');
            if (majorToggle) {
              majorToggle.querySelectorAll('.workspace-panel-popover-btn').forEach((btn) => {
                const on = btn.dataset.major === 'on';
                btn.classList.toggle('is-active', on === majorOn);
              });
            }
            const thicknessWrap = gridPopover.querySelector('[data-role="major-thickness"]');
            if (thicknessWrap) {
              const slider = thicknessWrap.querySelector('input[type="range"]');
              const readout = thicknessWrap.querySelector('[data-readout]');
              const width = Math.max(1, Math.round(
                Number(L?.xaxis?.gridwidth)
                || Number(L?.yaxis?.gridwidth)
                || Number(L?.xaxis2?.gridwidth)
                || Number(L?.yaxis2?.gridwidth)
                || 1
              ));
              if (slider) slider.value = String(Math.max(1, Math.min(6, width)));
              if (readout) readout.textContent = `${Math.max(1, Math.min(6, width))}px`;
            }
            const isMinorOn = !!(L?.xaxis?.minor?.showgrid || L?.yaxis?.minor?.showgrid);
            setActionButtonState(gridBtn, majorOn || isMinorOn);
            const minorToggle = gridPopover.querySelector('[data-role="minor-toggle"]');
            minorToggle.querySelectorAll('.workspace-panel-popover-btn').forEach(b => {
              const on = (b.dataset.minor === 'on');
              b.classList.toggle('is-active', on === isMinorOn);
            });

            // Try to infer current subdivisions from dtick ratio (if numeric)
            const xn = Number(L?.xaxis?.minor?.dtick);
            const xd = Number(L?.xaxis?.dtick);
            let sub = 1; // default
            if (Number.isFinite(xn) && Number.isFinite(xd) && xn > 0) {
              const est = Math.round(xd / xn - 1);
              if (est >= 1 && est <= 10) sub = est;
            }
            const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
            wrap.querySelector('input[type="range"]').value = String(sub);
            wrap.querySelector('[data-readout]').textContent = String(sub);
          };

          // Local click handlers - central dispatcher
          gridPopover.addEventListener('click', (e) => {
            const t = e.target.closest('[data-major],[data-minor]');
            if (!t) return;

            if (t.dataset.major) {
              const on = t.dataset.major === 'on';
              const group = gridPopover.querySelector('[data-role="major-toggle"]');
              group.querySelectorAll('.workspace-panel-popover-btn').forEach((b) => {
                b.classList.toggle('is-active', b === t);
              });
              safeHandleHeaderAction(panelId, 'grid-major', { on });
              const { minorOn } = readGridState();
              setActionButtonState(gridBtn, on || minorOn);
              e.stopPropagation();
              return;
            }

            if (t.dataset.minor) {
              const on = t.dataset.minor === 'on';
              const group = gridPopover.querySelector('[data-role="minor-toggle"]');
              group.querySelectorAll('.workspace-panel-popover-btn').forEach(b =>
                b.classList.toggle('is-active', b === t)
              );
              safeHandleHeaderAction(panelId, 'grid-minor', { on });
              const { majorOn } = readGridState();
              setActionButtonState(gridBtn, majorOn || on);
              e.stopPropagation();
              return;
            }
          });

          // Live readout while sliding (optional)
          gridPopover.addEventListener('input', (e) => {
            const majorSlider = e.target.closest('[data-role="major-thickness"] input[type="range"]');
            if (majorSlider) {
              const wrap = gridPopover.querySelector('[data-role="major-thickness"]');
              const resolved = Math.max(1, Math.min(6, Math.round(Number(majorSlider.value) || 1)));
              wrap.querySelector('[data-readout]').textContent = `${resolved}px`;
              safeHandleHeaderAction(panelId, 'grid-major-thickness', { value: resolved });
              e.stopPropagation();
              return;
            }
            const r = e.target.closest('[data-role="minor-subdiv"] input[type="range"]');
            if (!r) return;
            const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
            const resolved = Math.max(1, Math.min(10, Math.round(Number(r.value) || 1)));
            wrap.querySelector('[data-readout]').textContent = String(resolved);
            safeHandleHeaderAction(panelId, 'grid-minor-subdiv', { subdiv: resolved });
            e.stopPropagation();
          });

          // Add to header and auto-portal like other popovers
          gridBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const { majorOn, minorOn } = readGridState();
            const nextOn = !(majorOn || minorOn);
            safeHandleHeaderAction(panelId, 'grid-major', { on: nextOn });
            safeHandleHeaderAction(panelId, 'grid-minor', { on: nextOn });
            setActionButtonState(gridBtn, nextOn);
          });
          appendPopoverControl(gridBtn, gridPopover, { openOnHover: true, suppressClickToggle: true });
          const ticksBtn = document.createElement('button');
          ticksBtn.type = 'button';
          ticksBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
          ticksBtn.innerHTML = '<i class="bi bi-distribute-vertical"></i>';
          ticksBtn.title = 'Tick options';
          ticksBtn.setAttribute('aria-expanded', 'false');
          {
            const { majorOn, minorOn } = readTickState();
            setActionButtonState(ticksBtn, majorOn || minorOn);
          }

        const ticksPopoverIds = {
          between: `${panelState.id}_ticks_between`,
          first: `${panelState.id}_ticks_first`,
          last: `${panelState.id}_ticks_last`
        };

        const ticksPopover = document.createElement('div');
        ticksPopover.className = 'workspace-panel-popover workspace-panel-popover-ticks';
        ticksPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label text-uppercase small text-muted fw-semibold">Major ticks</div>
            <div class="workspace-panel-popover-items" data-role="ticks-major">
              <div class="btn-group" role="group" aria-label="Major placement">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-placement="outside">Outside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="inside">Inside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="none">None</button>
              </div>
              <button type="button" class="btn btn-outline-secondary ms-2 workspace-panel-popover-btn" data-labels="toggle">Labels</button>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-offset">
                <span class="small text-muted">Tick start</span>
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="X0" data-axis="x">
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="Y0" data-axis="y">
              </div>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-dtick">
                <span class="small text-muted">Spacing</span>
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="dX" data-axis="x">
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="dY" data-axis="y">
              </div>
            </div>
          </div>

          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label text-uppercase small text-muted fw-semibold">Minor ticks between major</div>
            <div class="workspace-panel-popover-items" data-role="ticks-minor">
              <div class="btn-group" role="group" aria-label="Minor placement">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-minor-placement="outside">Outside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="inside">Inside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="none">None</button>
              </div>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-subdiv">
                <span class="small text-muted">Subdivisions</span>
                <input type="range" min="1" max="10" step="1" value="1" class="form-range" style="width:120px" />
                <span class="small text-muted" data-readout>1</span>
              </div>
            </div>
          </div>
        `;

        ticksPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const L = figure.layout || {};
          const runtimeLayout = plotHost?.layout || {};
          const fullRuntimeLayout = plotHost?._fullLayout || {};
          const mergeAxisState = (axisKey) => {
            const runtimeAxis = {
              ...(fullRuntimeLayout?.[axisKey] || {}),
              ...(runtimeLayout?.[axisKey] || {})
            };
            const modelAxis = L[axisKey] || {};
            const mergedMinor = {
              ...(runtimeAxis.minor || {}),
              ...(modelAxis.minor || {})
            };
            return {
              ...runtimeAxis,
              ...modelAxis,
              minor: mergedMinor
            };
          };
          const X = mergeAxisState('xaxis');
          const Y = mergeAxisState('yaxis');

          // Major placement (assume both axes share the same, pick X╬ô├ç├ûs as source of truth)
          const majorPlacement = (X.ticks ?? 'outside');
          ticksPopover.querySelectorAll('[data-role="ticks-major"] [data-placement]')
            .forEach(b => b.classList.toggle('is-active', b.dataset.placement === majorPlacement || (majorPlacement === '' && b.dataset.placement === 'none')));

          // Labels on/off (true if both axes show labels)
          const labelsOn = (X.showticklabels !== false) && (Y.showticklabels !== false);
          const labelsBtn = ticksPopover.querySelector('[data-role="ticks-major"] [data-labels="toggle"]');
          labelsBtn.setAttribute('aria-pressed', String(labelsOn));
          labelsBtn.classList.toggle('is-active', labelsOn);

          const offWrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
          if (offWrap) {
            const xInput = offWrap.querySelector('input[data-axis="x"]');
            const yInput = offWrap.querySelector('input[data-axis="y"]');
            xInput.value = (X.tick0 != null && X.tick0 !== '') ? String(X.tick0) : '';
            yInput.value = (Y.tick0 != null && Y.tick0 !== '') ? String(Y.tick0) : '';
          }

          // Subdivisions: infer from dtick ratio if numeric, else default 1
          const minorDtick = Number(X.minor?.dtick);
          const majorDtick = Number(X.dtick);
          let sub = 1;
          if (Number.isFinite(minorDtick) && Number.isFinite(majorDtick) && minorDtick > 0) {
            const est = Math.round(majorDtick / minorDtick - 1);
            if (est >= 1 && est <= 10) sub = est;
          } else if (Number.isFinite(Number(X.minor?.nticks))) {
            const est = Math.round(Number(X.minor.nticks));
            if (est >= 1 && est <= 10) sub = est;
          }
          const wrap = ticksPopover.querySelector('[data-role="ticks-subdiv"]');
          wrap.querySelector('input[type="range"]').value = String(sub);
          wrap.querySelector('[data-readout]').textContent = String(sub);

          // major ticks spacing
          const dtWrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
          if (dtWrap) {
            const dx = Number(X.dtick);
            const dy = Number(Y.dtick);
            dtWrap.querySelector('input[data-axis="x"]').value = Number.isFinite(dx) ? String(dx) : '';
            dtWrap.querySelector('input[data-axis="y"]').value = Number.isFinite(dy) ? String(dy) : '';
          }

          const mplace = X.minor?.ticks ?? 'outside';
          ticksPopover.querySelectorAll('[data-role="ticks-minor"] [data-minor-placement]')
            .forEach(b => {
              const val = b.dataset.minorPlacement;   // ╬ô┬ú├á correct
              const active = (mplace === '' && val === 'none') || (mplace === val);
              b.classList.toggle('is-active', active);
            });
          {
            const { majorOn, minorOn } = readTickState();
            setActionButtonState(ticksBtn, majorOn || minorOn);
          }
        };

        ticksPopover.addEventListener('click', (e) => {
          const t = e.target.closest('[data-placement],[data-labels],[data-minor],[data-minor-placement]');
          if (!t) return;
          // Major placement
          if (t.dataset.placement) {
            const val = t.dataset.placement; // 'outside'|'inside'|'none'
            // toggle UI in the button group
            const group = ticksPopover.querySelector('[data-role="ticks-major"]');
            group.querySelectorAll('[data-placement]').forEach(b => b.classList.toggle('is-active', b === t));
            safeHandleHeaderAction(panelId, 'ticks-placement', { placement: (val === 'none' ? '' : val) });
            {
              const { minorOn } = readTickState();
              setActionButtonState(ticksBtn, val !== 'none' || minorOn);
            }
            e.stopPropagation();
            return;
          }

          // Labels toggle
          if (t.dataset.labels === 'toggle') {
            const next = t.getAttribute('aria-pressed') !== 'true';
            t.setAttribute('aria-pressed', String(next));
            t.classList.toggle('is-active', next);
            safeHandleHeaderAction(panelId, 'ticks-labels', { on: next });
            e.stopPropagation();
            return;
          }

          // // Apply major offsets
          //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
          //   const x0raw = wrap.querySelector('input[data-axis="x"]').value;
          //   const y0raw = wrap.querySelector('input[data-axis="y"]').value;
          //   const x0 = x0raw === '' ? null : Number(x0raw);
          //   const y0 = y0raw === '' ? null : Number(y0raw);
          //   safeHandleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
          //   e.stopPropagation();
          //   return;
          // }

          // // Major ticks spacing
          //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
          //   const dxRaw = wrap.querySelector('input[data-axis="x"]').value;
          //   const dyRaw = wrap.querySelector('input[data-axis="y"]').value;
          //   const dx = dxRaw === '' ? null : Number(dxRaw);
          //   const dy = dyRaw === '' ? null : Number(dyRaw);
          //   safeHandleHeaderAction(panelId, 'ticks-major-dtick', { dx, dy });
          //   e.stopPropagation();
          //   return;
          // }

          // Minor on/off
          if (t.dataset.minor) {
            const on = t.dataset.minor === 'on';
            const group = ticksPopover.querySelector('[data-role="ticks-minor"]');
            group.querySelectorAll('[data-minor]').forEach(b => b.classList.toggle('is-active', b === t));
            safeHandleHeaderAction(panelId, 'ticks-minor', { on });
            {
              const { majorOn } = readTickState();
              setActionButtonState(ticksBtn, majorOn || on);
            }
            e.stopPropagation();
            return;
          }

          // Minor placement
          if (t.dataset.minorPlacement) {
            const val = t.dataset.minorPlacement; // 'outside'|'inside'|'none'
            const group = ticksPopover.querySelector('[data-role="ticks-minor"]');
            group.querySelectorAll('[data-minor-placement]').forEach(b => b.classList.toggle('is-active', b === t));

            safeHandleHeaderAction(panelId, 'ticks-minor-placement', { placement: (val === 'none' ? '' : val) });
            {
              const { majorOn } = readTickState();
              setActionButtonState(ticksBtn, majorOn || val !== 'none');
            }
            e.stopPropagation();
            return;
          }
        });

        // Live readout / auto-apply while sliding
        ticksPopover.addEventListener('input', (e) => {
          const slider = e.target.closest('[data-role="ticks-subdiv"] input[type="range"]');
          if (slider) {
            const wrap = ticksPopover.querySelector('[data-role="ticks-subdiv"]');
            const val = Math.max(1, Math.min(10, Math.round(Number(slider.value) || 1)));
            slider.value = String(val);
            wrap.querySelector('[data-readout]').textContent = String(val);
            autoApplyMinorSubdiv(val);
          }

          // auto-apply tick start / spacing
          if (e.target.closest('[data-role="ticks-major-offset"] input')) {
            autoApplyOffset();
          }
          if (e.target.closest('[data-role="ticks-major-dtick"] input')) {
            autoApplyDtick();
          }
        });

        // --- Debounced helpers for auto-apply ---
        const debounce = (fn, ms=160) => {
          let id; return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
        };

        const autoApplyOffset = debounce(() => {
          const wrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
          if (!wrap) return;
          const x0raw = wrap.querySelector('input[data-axis="x"]').value;
          const y0raw = wrap.querySelector('input[data-axis="y"]').value;
          const x0Numeric = Number(x0raw);
          const y0Numeric = Number(y0raw);
          const x0 = x0raw === '' || !Number.isFinite(x0Numeric) ? null : x0Numeric;
          const y0 = y0raw === '' || !Number.isFinite(y0Numeric) ? null : y0Numeric;
          safeHandleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
        });

        const autoApplyDtick = debounce(() => {
          const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
          if (!wrap) return;
          const dxRaw = wrap.querySelector('input[data-axis="x"]').value;
          const dyRaw = wrap.querySelector('input[data-axis="y"]').value;
          const dxNumeric = Number(dxRaw);
          const dyNumeric = Number(dyRaw);
          const dx = dxRaw === '' || !Number.isFinite(dxNumeric) ? null : dxNumeric;
          const dy = dyRaw === '' || !Number.isFinite(dyNumeric) ? null : dyNumeric;
          safeHandleHeaderAction(panelId, 'ticks-major-dtick', { dx, dy });
        });

        const autoApplyMinorSubdiv = debounce((val) => {
          safeHandleHeaderAction(panelId, 'ticks-minor-subdiv', { subdiv: val });
        });

        ticksBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const { majorOn, minorOn } = readTickState();
          const nextOn = !(majorOn || minorOn);
          safeHandleHeaderAction(panelId, 'ticks-placement', { placement: nextOn ? 'outside' : '' });
          safeHandleHeaderAction(panelId, 'ticks-minor', { on: nextOn });
          setActionButtonState(ticksBtn, nextOn);
        });
        appendPopoverControl(ticksBtn, ticksPopover, { openOnHover: true, suppressClickToggle: true });

        const figureForLegend = safeGetPanelFigure(panelId);
        const figureLayoutForLegend = figureForLegend?.layout || {};
        const legendInitiallyVisible = Object.prototype.hasOwnProperty.call(figureLayoutForLegend, 'showlegend')
          ? !!figureLayoutForLegend.showlegend
          : true;
        const legendBtn = createToggleButton({
          icon: 'bi-list-ul',
          title: 'Toggle legend',
          pressed: legendInitiallyVisible,
          onClick: (isOn) => safeHandleHeaderAction(panelId, 'legend', { on: isOn })
        });
        const legendPopover = document.createElement('div');
        legendPopover.className = 'workspace-panel-popover workspace-panel-popover-legend';
        legendPopover.innerHTML = `
          <div class="workspace-panel-popover-legend-grid">
            <div class="workspace-panel-popover-legend-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Layout</div>
                <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-role="legend-orientation">
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-orientation="v">Vertical</button>
                  <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-orientation="h">Horizontal</button>
                </div>
              </div>
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Title</div>
                <div class="workspace-panel-popover-items d-flex flex-column gap-2">
                  <input type="text" class="form-control form-control-sm" data-legend-title placeholder="Legend title" />
                </div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap mt-2" data-role="legend-title-font">
                  <select class="form-select form-select-sm" data-legend-title-font-family style="min-width: 150px">
                    <option value="inherit">Workspace default</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times</option>
                    <option value="'Courier New', monospace">Courier</option>
                    <option value="'Roboto', sans-serif">Roboto</option>
                  </select>
                  <input type="color" class="form-control form-control-color form-control-sm workspace-panel-popover-legend-color" data-legend-title-font-color title="Legend title color" />
                  <input type="number" min="6" max="36" step="1" class="form-control form-control-sm workspace-panel-popover-legend-size" data-legend-title-font-size title="Legend title size" />
                </div>
              </div>
            </div>
            <div class="workspace-panel-popover-legend-col">
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Traces</div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap" data-role="legend-font">
                  <select class="form-select form-select-sm" data-legend-font-family style="min-width: 150px">
                    <option value="inherit">Workspace default</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Times New Roman', serif">Times</option>
                    <option value="'Courier New', monospace">Courier</option>
                    <option value="'Roboto', sans-serif">Roboto</option>
                  </select>
                  <input type="color" class="form-control form-control-color form-control-sm workspace-panel-popover-legend-color" data-legend-font-color title="Legend font color" />
                  <input type="number" min="6" max="36" step="1" class="form-control form-control-sm workspace-panel-popover-legend-size" data-legend-font-size title="Legend font size" />
                </div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 mt-2">
                  <label class="small text-muted mb-0 legend-width-label">Entry width</label>
                  <input type="number" min="0" max="400" step="1" class="form-control form-control-sm workspace-panel-popover-legend-width" data-legend-entrywidth />
                </div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2 mt-2">
                  <label class="small text-muted mb-0 legend-width-label">Item width</label>
                  <input type="number" min="0" max="400" step="1" class="form-control form-control-sm workspace-panel-popover-legend-width" data-legend-itemwidth />
                </div>
              </div>
              <div class="workspace-panel-popover-section">
                <div class="workspace-panel-popover-label">Border</div>
                <div class="workspace-panel-popover-items d-flex align-items-center gap-2">
                  <div class="workspace-panel-popover-choice" data-role="legend-border-toggle">
                    <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-border="on">On</button>
                    <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-border="off">Off</button>
                  </div>
                  <input type="number" min="0" max="10" step="1" class="form-control form-control-sm workspace-panel-popover-legend-size" data-legend-border-width />
                  <input type="color" class="form-control form-control-color form-control-sm workspace-panel-popover-legend-color" data-legend-border-color title="Legend border color" />
                </div>
              </div>
            </div>
          </div>
        `;
        const legendDebounce = (fn, ms=160) => {
          let id;
          return (...args) => {
            clearTimeout(id);
            id = setTimeout(() => fn(...args), ms);
          };
        };

        const normalizeLegendTitle = (value) => {
          if (value === null || typeof value === 'undefined') return null;
          const text = typeof value === 'string' ? value.trim() : String(value);
          return text.length ? text : null;
        };

        const setLegendToggleGroup = (group, activeValue, attr) => {
          if (!group) return;
          group.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
            const isActive = btn.dataset[attr] === activeValue;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
          });
        };

        const hydrateLegendFontSelect = (select, family) => {
          if (!select) return;
          const value = family || 'inherit';
          if (!Array.from(select.options).some((opt) => opt.value === value)) {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
          }
          const defaultOption = select.querySelector('option[value="inherit"]');
          if (defaultOption) {
            let defaultFamily = family
              || plotHost?._fullLayout?.font?.family
              || plotHost?.layout?.font?.family;
            if (!defaultFamily && typeof window !== 'undefined') {
              const source = plotHost || document.body;
              defaultFamily = source ? window.getComputedStyle(source).fontFamily : '';
            }
            const shortName = (defaultFamily || 'Workspace').split(',')[0].trim().replace(/^'["']|["']$/g, '');
            defaultOption.textContent = `${shortName || 'Workspace'} (default)`;
          }
          select.value = value;
        };

        legendPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const legend = figure?.layout?.legend || plotHost?.layout?.legend || {};
          const title = legend.title || {};

          const titleInput = legendPopover.querySelector('[data-legend-title]');
          if (titleInput) {
            const text = typeof title === 'string' ? title : title?.text || '';
            titleInput.value = text || '';
          }

          const orientationGroup = legendPopover.querySelector('[data-role="legend-orientation"]');
          const orientation = legend.orientation === 'h' ? 'h' : 'v';
          setLegendToggleGroup(orientationGroup, orientation, 'orientation');

          const entryInput = legendPopover.querySelector('[data-legend-entrywidth]');
          if (entryInput) {
            const resolved = Number.isFinite(Number(legend.entrywidth))
              ? Number(legend.entrywidth)
              : (Number.isFinite(Number(plotHost?._fullLayout?.legend?.entrywidth))
                ? Number(plotHost?._fullLayout?.legend?.entrywidth)
                : 0);
            entryInput.value = String(Math.round(resolved));
          }
          const itemInput = legendPopover.querySelector('[data-legend-itemwidth]');
          if (itemInput) {
            const resolved = Number.isFinite(Number(legend.itemwidth))
              ? Number(legend.itemwidth)
              : (Number.isFinite(Number(plotHost?._fullLayout?.legend?.itemwidth))
                ? Number(plotHost?._fullLayout?.legend?.itemwidth)
                : 0);
            itemInput.value = String(Math.round(resolved));
          }

          const legendFont = legend.font || {};
          hydrateLegendFontSelect(legendPopover.querySelector('[data-legend-font-family]'), legendFont.family);
          const legendSize = Number(
            legendFont.size
              ?? plotHost?._fullLayout?.legend?.font?.size
              ?? plotHost?._fullLayout?.font?.size
              ?? 12
          );
          const legendSizeInput = legendPopover.querySelector('[data-legend-font-size]');
          if (legendSizeInput) {
            legendSizeInput.value = Number.isFinite(legendSize) ? String(Math.round(legendSize)) : '12';
          }
          const legendColorInput = legendPopover.querySelector('[data-legend-font-color]');
          if (legendColorInput) {
            legendColorInput.value = legendFont.color || '#000000';
          }

          const titleFont = title?.font || {};
          hydrateLegendFontSelect(legendPopover.querySelector('[data-legend-title-font-family]'), titleFont.family);
          const titleSize = Number(
            titleFont.size
              ?? legendFont.size
              ?? plotHost?._fullLayout?.legend?.title?.font?.size
              ?? plotHost?._fullLayout?.legend?.font?.size
              ?? plotHost?._fullLayout?.font?.size
              ?? 12
          );
          const titleSizeInput = legendPopover.querySelector('[data-legend-title-font-size]');
          if (titleSizeInput) {
            titleSizeInput.value = Number.isFinite(titleSize) ? String(Math.round(titleSize)) : '12';
          }
          const titleColorInput = legendPopover.querySelector('[data-legend-title-font-color]');
          if (titleColorInput) {
            titleColorInput.value = titleFont.color || '#000000';
          }

          const borderGroup = legendPopover.querySelector('[data-role="legend-border-toggle"]');
          const borderWidth = Number(legend.borderwidth ?? 0);
          const borderOn = Number.isFinite(borderWidth) && borderWidth > 0;
          setLegendToggleGroup(borderGroup, borderOn ? 'on' : 'off', 'border');

          const borderWidthInput = legendPopover.querySelector('[data-legend-border-width]');
          if (borderWidthInput) {
            borderWidthInput.value = Number.isFinite(borderWidth) ? String(Math.round(borderWidth)) : '0';
          }
          const borderColorInput = legendPopover.querySelector('[data-legend-border-color]');
          if (borderColorInput) {
            borderColorInput.value = legend.bordercolor || '#000000';
          }
        };

        const applyLegendTitle = legendDebounce(() => {
          const input = legendPopover.querySelector('[data-legend-title]');
          if (!input) return;
          const value = normalizeLegendTitle(input.value);
          safeHandleHeaderAction(panelId, 'legend-title-text', { text: value });
        });

        const applyLegendSpacing = legendDebounce(() => {
          const entryInput = legendPopover.querySelector('[data-legend-entrywidth]');
          const itemInput = legendPopover.querySelector('[data-legend-itemwidth]');
          const entryRaw = entryInput?.value ?? '';
          const itemRaw = itemInput?.value ?? '';
          safeHandleHeaderAction(panelId, 'legend-spacing', {
            entrywidth: entryRaw === '' ? null : entryRaw,
            itemwidth: itemRaw === '' ? null : itemRaw
          });
        });

        const applyLegendBorder = legendDebounce(() => {
          const widthInput = legendPopover.querySelector('[data-legend-border-width]');
          const colorInput = legendPopover.querySelector('[data-legend-border-color]');
          const widthRaw = widthInput?.value ?? '';
          const width = widthRaw === '' ? null : widthRaw;
          safeHandleHeaderAction(panelId, 'legend-border', {
            width,
            color: colorInput?.value
          });
        });

        legendPopover.addEventListener('click', (event) => {
          const orientationBtn = event.target.closest('[data-orientation]');
          if (orientationBtn) {
            const orientation = orientationBtn.dataset.orientation === 'h' ? 'h' : 'v';
            const group = orientationBtn.closest('[data-role="legend-orientation"]');
            setLegendToggleGroup(group, orientation, 'orientation');
            safeHandleHeaderAction(panelId, 'legend-orientation', { value: orientation });
            event.stopPropagation();
            return;
          }
          const borderBtn = event.target.closest('[data-border]');
          if (borderBtn) {
            const on = borderBtn.dataset.border === 'on';
            const group = borderBtn.closest('[data-role="legend-border-toggle"]');
            setLegendToggleGroup(group, on ? 'on' : 'off', 'border');
            safeHandleHeaderAction(panelId, 'legend-border', { on });
            event.stopPropagation();
          }
        });

        legendPopover.addEventListener('change', (event) => {
          if (event.target.matches('[data-legend-font-family]')) {
            safeHandleHeaderAction(panelId, 'legend-font', { fontFamily: event.target.value });
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-title-font-family]')) {
            safeHandleHeaderAction(panelId, 'legend-title-font', { fontFamily: event.target.value });
            event.stopPropagation();
          }
        });

        legendPopover.addEventListener('input', (event) => {
          if (event.target.matches('[data-legend-title]')) {
            applyLegendTitle();
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-entrywidth],[data-legend-itemwidth]')) {
            applyLegendSpacing();
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-font-size]')) {
            safeHandleHeaderAction(panelId, 'legend-font', { fontSize: event.target.value });
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-font-color]')) {
            safeHandleHeaderAction(panelId, 'legend-font', { color: event.target.value });
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-title-font-size]')) {
            safeHandleHeaderAction(panelId, 'legend-title-font', { fontSize: event.target.value });
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-title-font-color]')) {
            safeHandleHeaderAction(panelId, 'legend-title-font', { color: event.target.value });
            event.stopPropagation();
          }
          if (event.target.matches('[data-legend-border-width],[data-legend-border-color]')) {
            applyLegendBorder();
            event.stopPropagation();
          }
        });
        appendPopoverControl(legendBtn, legendPopover, { openOnHover: true, suppressClickToggle: true });

        const dataTabBtn = document.createElement('button');
        dataTabBtn.type = 'button';
        dataTabBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
        dataTabBtn.innerHTML = '<i class="bi bi-table"></i>';
        dataTabBtn.title = 'Open Data sidebar';
        dataTabBtn.setAttribute('aria-label', 'Open Data sidebar');
        dataTabBtn.dataset.panelAction = 'open-data-tab';
        setDataTabButtonActive = (isActive) => {
          const active = isActive === true;
          dataTabBtn.classList.toggle('is-active', active);
          dataTabBtn.setAttribute('aria-pressed', String(active));
          dataTabBtn.title = active ? 'Close Data sidebar' : 'Open Data sidebar';
          dataTabBtn.setAttribute('aria-label', dataTabBtn.title);
        };
        setDataTabButtonActive(false);
        dataTabBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          closeAllPopovers();
          safeHandleHeaderAction(panelId, 'open-data-tab');
        });
        appendActionItem(dataTabBtn);

        const legendDivider = document.createElement('span');
        legendDivider.className = 'workspace-panel-action-divider';
        legendDivider.setAttribute('aria-hidden', 'true');
        appendActionItem(legendDivider);

        stylePainterBtn = document.createElement('button');
        stylePainterBtn.type = 'button';
        stylePainterBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        stylePainterBtn.innerHTML = '<i class="bi bi-brush"></i>';
        stylePainterBtn.title = 'Style painter';
        stylePainterBtn.setAttribute('aria-label', 'Style painter');
        stylePainterBtn.setAttribute('aria-expanded', 'false');
        stylePainterBtn.setAttribute('aria-pressed', 'false');
        stylePainterBtn.dataset.panelAction = 'style-painter';
        stylePainterPopover = document.createElement('div');
        stylePainterPopover.className = 'workspace-panel-popover workspace-panel-popover-style-painter';
        stylePainterPopover.innerHTML = `
          <div class="workspace-panel-popover-label">SELECT FORMATTING TO COPY</div>
          <div class="workspace-panel-popover-section" data-role="style-painter-presets">
            <div class="workspace-panel-popover-items">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-preset="all" aria-pressed="false">All styles</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-preset="scales" aria-pressed="false">Only scales</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-preset="traces" aria-pressed="false">Only traces</button>
            </div>
          </div>
          <div class="workspace-panel-popover-divider" aria-hidden="true"></div>
          <div class="workspace-panel-popover-section" data-role="style-painter-details">
            <div class="workspace-panel-popover-items">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="trace-colors" aria-pressed="false">Trace colors</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="trace-styles" aria-pressed="false">Trace styles</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="trace-markers" aria-pressed="false">Markers</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="color-scales" aria-pressed="false">Color scales</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="graph-dimensions" aria-pressed="false">Graph dimensions</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="scales" aria-pressed="false">Scales</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="fonts" aria-pressed="false">Fonts</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="axis-formatting" aria-pressed="false">Axis formatting</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="gridlines" aria-pressed="false">Gridlines</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="legend" aria-pressed="false">Legend</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-style-detail="background" aria-pressed="false">Background</button>
            </div>
          </div>
        `;

        const setStylePainterToggle = (btn, on) => {
          if (!btn) return;
          btn.setAttribute('aria-pressed', String(on));
          btn.classList.toggle('is-active', on);
        };

        const getStylePainterPresets = () =>
          Array.from(stylePainterPopover.querySelectorAll('[data-style-preset]'));
        const getStylePainterDetails = () =>
          Array.from(stylePainterPopover.querySelectorAll('[data-style-detail]'));
        const readStylePainterSelection = () => {
          const presetBtn = getStylePainterPresets()
            .find((btn) => btn.getAttribute('aria-pressed') === 'true');
          const details = getStylePainterDetails()
            .filter((btn) => btn.getAttribute('aria-pressed') === 'true')
            .map((btn) => btn.dataset.styleDetail)
            .filter(Boolean);
          return {
            preset: presetBtn?.dataset?.stylePreset || null,
            details
          };
        };
        const applyStylePainterSelection = (selection = {}) => {
          const preset = typeof selection.preset === 'string' ? selection.preset : null;
          const detailSet = new Set(
            Array.isArray(selection.details) ? selection.details.filter(Boolean) : []
          );
          getStylePainterPresets().forEach((btn) => {
            setStylePainterToggle(btn, preset && btn.dataset.stylePreset === preset);
          });
          getStylePainterDetails().forEach((btn) => {
            const isActive = !preset && detailSet.has(btn.dataset.styleDetail);
            setStylePainterToggle(btn, isActive);
          });
          updateStylePainterDetailsState();
        };

        const updateStylePainterDetailsState = () => {
          const hasPreset = getStylePainterPresets()
            .some((btn) => btn.getAttribute('aria-pressed') === 'true');
          getStylePainterDetails().forEach((btn) => {
            btn.classList.toggle('is-disabled', hasPreset);
            btn.setAttribute('aria-disabled', String(hasPreset));
            if (hasPreset) {
              setStylePainterToggle(btn, false);
            }
          });
        };

        stylePainterPopover.addEventListener('click', (event) => {
          const presetBtn = event.target.closest('[data-style-preset]');
          if (presetBtn) {
            const next = presetBtn.getAttribute('aria-pressed') !== 'true';
            getStylePainterPresets().forEach((btn) => setStylePainterToggle(btn, false));
            setStylePainterToggle(presetBtn, next);
            updateStylePainterDetailsState();
            safeStylePainterSelectionChange(panelId, readStylePainterSelection());
            event.stopPropagation();
            return;
          }
          const detailBtn = event.target.closest('[data-style-detail]');
          if (detailBtn) {
            const presetsActive = getStylePainterPresets()
              .some((btn) => btn.getAttribute('aria-pressed') === 'true');
            if (presetsActive) {
              getStylePainterPresets().forEach((btn) => setStylePainterToggle(btn, false));
              updateStylePainterDetailsState();
            }
            const next = detailBtn.getAttribute('aria-pressed') !== 'true';
            setStylePainterToggle(detailBtn, next);
            safeStylePainterSelectionChange(panelId, readStylePainterSelection());
            event.stopPropagation();
          }
        });

        stylePainterPopover.onOpen = () => {
          safeStylePainterPopoverOpen(panelId, stylePainterPopover);
          updateStylePainterDetailsState();
        };
        stylePainterPopover.__getSelection = readStylePainterSelection;
        stylePainterPopover.__applySelection = applyStylePainterSelection;

        appendPopoverControl(stylePainterBtn, stylePainterPopover, { openOnHover: true, suppressClickToggle: true });
        stylePainterBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          safeStylePainterButtonClick(panelId, stylePainterBtn);
        });

        const templatesBtn = document.createElement('button');
        templatesBtn.type = 'button';
        templatesBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        templatesBtn.innerHTML = '<i class="bi bi-collection"></i>';
        templatesBtn.title = 'Templates';
        templatesBtn.setAttribute('aria-label', 'Templates');
        templatesBtn.setAttribute('aria-expanded', 'false');
        templatesBtn.dataset.panelAction = 'templates';

        const templatesPopover = document.createElement('div');
        templatesPopover.className = 'workspace-panel-popover workspace-panel-popover-templates';
        templatesPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Current template</div>
            <div class="workspace-panel-popover-items">
              <div class="workspace-panel-popover-subtle" data-template-current>none</div>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
          <div class="workspace-panel-popover-label">Save as new template</div>
          <div class="workspace-panel-popover-items">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-template-save>
                Save as new template
              </button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Apply template</div>
            <div class="workspace-panel-popover-items flex-column gap-2">
              <select class="form-select form-select-sm" data-template-select>
                <option value="" selected disabled>No templates saved</option>
              </select>
              <div class="d-flex flex-wrap gap-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" data-template-action="rename">Rename</button>
                <button type="button" class="btn btn-outline-secondary btn-sm" data-template-action="duplicate">Duplicate</button>
                <button type="button" class="btn btn-outline-danger btn-sm" data-template-action="delete">Delete</button>
              </div>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Recent templates</div>
            <div class="workspace-panel-popover-items flex-column gap-2" data-template-recent-list>
              <div class="workspace-panel-popover-subtle">No recent templates</div>
            </div>
          </div>
        `;
        templatesPopover.addEventListener('click', (event) => {
          const saveBtn = event.target.closest('[data-template-save]');
          if (saveBtn) {
            safeTemplatesSave(panelId, templatesPopover);
            event.stopPropagation();
            return;
          }
          const actionBtn = event.target.closest('[data-template-action]');
          if (actionBtn) {
            const action = actionBtn.dataset.templateAction;
            if (action === 'rename') {
              safeTemplatesRename(panelId, templatesPopover);
            } else if (action === 'duplicate') {
              safeTemplatesDuplicate(panelId, templatesPopover);
            } else if (action === 'delete') {
              safeTemplatesDelete(panelId, templatesPopover);
            }
            event.stopPropagation();
            return;
          }
          const recentBtn = event.target.closest('[data-template-recent]');
          if (recentBtn) {
            safeTemplatesApply(panelId, recentBtn.dataset.templateRecent || '', templatesPopover);
            event.stopPropagation();
          }
        });
        templatesPopover.addEventListener('change', (event) => {
          const select = event.target.closest('[data-template-select]');
          if (!select) return;
          safeTemplatesApply(panelId, select.value, templatesPopover);
          event.stopPropagation();
        });
        templatesPopover.onOpen = () => {
          safeTemplatesPopoverOpen(panelId, templatesPopover);
        };
        appendPopoverControl(templatesBtn, templatesPopover, { openOnHover: true, suppressClickToggle: true });

        panelLockState = readPanelLockState(panelId);
        lockBtn = createToggleButton({
          icon: 'bi-lock',
          title: 'Lock graph',
          pressed: panelLockState.editLocked,
          onClick: (isOn) => safePanelLockToggle(panelId, { on: isOn })
        });
        lockBtn.dataset.panelAction = 'lock';
        lockBtn.classList.add('workspace-panel-action-btn--lock');

        pinBtn = createToggleButton({
          icon: 'bi-pin-angle',
          title: 'Pin position',
          pressed: panelLockState.pinned,
          onClick: (isOn) => safePanelPinToggle(panelId, { on: isOn })
        });
        pinBtn.dataset.panelAction = 'pin';
        pinBtn.classList.add('workspace-panel-action-btn--visibility');

        const snapshotBtn = document.createElement('button');
        snapshotBtn.type = 'button';
        snapshotBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        snapshotBtn.innerHTML = '<i class="bi bi-camera"></i>';
        snapshotBtn.title = 'Snapshot options';
        snapshotBtn.setAttribute('aria-expanded', 'false');
        snapshotBtn.dataset.snapshotFormat = 'png';
        snapshotBtn.dataset.snapshotResolution = '2x';
        snapshotBtn.dataset.snapshotBackground = 'white';
        snapshotBtn.dataset.snapshotView = 'current';
        snapshotBtn.dataset.snapshotPreset = 'custom';

        const snapshotPopover = document.createElement('div');
        snapshotPopover.className = 'workspace-panel-popover workspace-panel-popover-snapshot';
        snapshotPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Preset</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-preset>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="publication">Publication</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="presentation">Presentation</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="web">Web</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-preset="custom">Custom</button>
            </div>
            <div class="workspace-panel-popover-items">
              <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" data-snapshot-save-preset>Save as custom preset</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section" data-snapshot-section="format">
            <div class="workspace-panel-popover-label">Format</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-format>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-format="png">PNG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="svg">SVG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="jpeg">JPEG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="webp">WebP</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section" data-snapshot-section="size">
            <div class="workspace-panel-popover-label">Size</div>
            <div class="workspace-panel-popover-items">
              <label class="small text-muted mb-0">Width</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-width />
              <label class="small text-muted mb-0">Height</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-height />
              <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" data-snapshot-size-reset>Reset</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Resolution</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-resolution>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-resolution="native">Native (1x)</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-resolution="2x">High (2x)</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-resolution="4x">Ultra (4x)</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Background</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-background>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-bg="white">White</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-bg="transparent">Transparent</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Export view</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-view>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-view="current">Current view</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-view="full">Full range</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Capture</div>
            <div class="workspace-panel-popover-items">
              <button type="button" class="btn btn-primary btn-sm workspace-panel-popover-btn" data-snapshot-capture>Capture</button>
              <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" data-snapshot-cancel>Close</button>
            </div>
          </div>
        `;

        const resolveSnapshotDimension = (value) => {
          const numeric = Number(value);
          if (!Number.isFinite(numeric) || numeric <= 0) return null;
          return Math.round(numeric);
        };

        const resolveSnapshotDefaults = () => {
          const targetEl = contentHandles?.plotEl ?? plotHost ?? panelEl;
          if (!targetEl) return { width: null, height: null };
          const rect = typeof targetEl.getBoundingClientRect === 'function'
            ? targetEl.getBoundingClientRect()
            : null;
          const width = resolveSnapshotDimension(
            rect?.width ?? targetEl.offsetWidth ?? targetEl.clientWidth
          );
          const height = resolveSnapshotDimension(
            rect?.height ?? targetEl.offsetHeight ?? targetEl.clientHeight
          );
          return { width, height };
        };

        const syncSnapshotGroup = (groupSelector, dataKey, value) => {
          const group = snapshotPopover.querySelector(groupSelector);
          if (!group) return;
          group.querySelectorAll(`button[${dataKey}]`).forEach((btn) => {
            const candidate = btn.getAttribute(dataKey);
            const isActive = candidate === value;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
          });
        };

        const applySnapshotSizeDefaults = () => {
          const widthInput = snapshotPopover.querySelector('[data-snapshot-width]');
          const heightInput = snapshotPopover.querySelector('[data-snapshot-height]');
          const prevDefaultWidth = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultWidth);
          const prevDefaultHeight = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultHeight);
          const { width, height } = resolveSnapshotDefaults();
          if (width != null) snapshotBtn.dataset.snapshotDefaultWidth = String(width);
          if (height != null) snapshotBtn.dataset.snapshotDefaultHeight = String(height);
          const currentWidth = resolveSnapshotDimension(snapshotBtn.dataset.snapshotWidth);
          const currentHeight = resolveSnapshotDimension(snapshotBtn.dataset.snapshotHeight);
          if ((currentWidth == null || (prevDefaultWidth != null && currentWidth === prevDefaultWidth)) && width != null) {
            snapshotBtn.dataset.snapshotWidth = String(width);
          }
          if ((currentHeight == null || (prevDefaultHeight != null && currentHeight === prevDefaultHeight)) && height != null) {
            snapshotBtn.dataset.snapshotHeight = String(height);
          }
          if (widthInput) {
            widthInput.value = snapshotBtn.dataset.snapshotWidth || (width != null ? String(width) : '');
          }
          if (heightInput) {
            heightInput.value = snapshotBtn.dataset.snapshotHeight || (height != null ? String(height) : '');
          }
        };

        const syncSnapshotSectionWidths = () => {
          const formatSection = snapshotPopover.querySelector('[data-snapshot-section="format"]');
          const sizeSection = snapshotPopover.querySelector('[data-snapshot-section="size"]');
          if (!formatSection || !sizeSection) return;
          sizeSection.style.width = '';
          const width = formatSection.getBoundingClientRect().width;
          if (width) {
            snapshotPopover.style.setProperty('--snapshot-format-width', `${Math.round(width)}px`);
          }
        };

        const SNAPSHOT_PRESETS = {
          publication: {
            format: 'png',
            resolution: '4x',
            background: 'white',
            view: 'full'
          },
          presentation: {
            format: 'png',
            resolution: '2x',
            background: 'white',
            view: 'current'
          },
          web: {
            format: 'png',
            resolution: '1x',
            background: 'transparent',
            view: 'current'
          }
        };

        const readCustomPreset = () => ({
          format: snapshotBtn.dataset.snapshotCustomFormat,
          resolution: snapshotBtn.dataset.snapshotCustomResolution,
          background: snapshotBtn.dataset.snapshotCustomBackground,
          view: snapshotBtn.dataset.snapshotCustomView,
          width: snapshotBtn.dataset.snapshotCustomWidth,
          height: snapshotBtn.dataset.snapshotCustomHeight
        });

        const applySnapshotOptions = (options = {}) => {
          const widthInput = snapshotPopover.querySelector('[data-snapshot-width]');
          const heightInput = snapshotPopover.querySelector('[data-snapshot-height]');
          if (options.format) {
            snapshotBtn.dataset.snapshotFormat = options.format;
            syncSnapshotGroup('[data-snapshot-format]', 'data-format', options.format);
          }
          if (options.resolution) {
            snapshotBtn.dataset.snapshotResolution = options.resolution;
            syncSnapshotGroup('[data-snapshot-resolution]', 'data-resolution', options.resolution);
          }
          if (options.background) {
            snapshotBtn.dataset.snapshotBackground = options.background;
            syncSnapshotGroup('[data-snapshot-background]', 'data-bg', options.background);
          }
          if (options.view) {
            snapshotBtn.dataset.snapshotView = options.view;
            syncSnapshotGroup('[data-snapshot-view]', 'data-view', options.view);
          }
          if (options.width) {
            snapshotBtn.dataset.snapshotWidth = String(options.width);
            if (widthInput) widthInput.value = String(options.width);
          }
          if (options.height) {
            snapshotBtn.dataset.snapshotHeight = String(options.height);
            if (heightInput) heightInput.value = String(options.height);
          }
        };

        const setSnapshotPreset = (preset, { apply = true } = {}) => {
          const resolved = preset || 'custom';
          snapshotBtn.dataset.snapshotPreset = resolved;
          syncSnapshotGroup('[data-snapshot-preset]', 'data-preset', resolved);
          if (!apply) return;
          if (resolved === 'custom') {
            const custom = readCustomPreset();
            applySnapshotOptions(custom);
          } else {
            applySnapshotOptions(SNAPSHOT_PRESETS[resolved] || {});
          }
        };

        const markSnapshotCustom = () => {
          if (snapshotBtn.dataset.snapshotPreset !== 'custom') {
            setSnapshotPreset('custom', { apply: false });
          }
        };

        const captureSnapshot = () => {
          applySnapshotSizeDefaults();
          const format = snapshotBtn.dataset.snapshotFormat || 'png';
          const widthNumeric = Number(snapshotBtn.dataset.snapshotWidth);
          const heightNumeric = Number(snapshotBtn.dataset.snapshotHeight);
          const payload = {
            format,
            resolution: snapshotBtn.dataset.snapshotResolution || '2x',
            background: snapshotBtn.dataset.snapshotBackground || 'white',
            view: snapshotBtn.dataset.snapshotView || 'current'
          };
          if (Number.isFinite(widthNumeric) && widthNumeric > 0) {
            payload.width = Math.round(widthNumeric);
          }
          if (Number.isFinite(heightNumeric) && heightNumeric > 0) {
            payload.height = Math.round(heightNumeric);
          }
          safeHandleHeaderAction(panelId, 'export', payload);
          snapshotPopover.__close?.();
        };

        const saveCustomPreset = () => {
          snapshotBtn.dataset.snapshotCustomFormat = snapshotBtn.dataset.snapshotFormat || 'png';
          snapshotBtn.dataset.snapshotCustomResolution = snapshotBtn.dataset.snapshotResolution || '2x';
          snapshotBtn.dataset.snapshotCustomBackground = snapshotBtn.dataset.snapshotBackground || 'white';
          snapshotBtn.dataset.snapshotCustomView = snapshotBtn.dataset.snapshotView || 'current';
          if (snapshotBtn.dataset.snapshotWidth) {
            snapshotBtn.dataset.snapshotCustomWidth = snapshotBtn.dataset.snapshotWidth;
          } else {
            delete snapshotBtn.dataset.snapshotCustomWidth;
          }
          if (snapshotBtn.dataset.snapshotHeight) {
            snapshotBtn.dataset.snapshotCustomHeight = snapshotBtn.dataset.snapshotHeight;
          } else {
            delete snapshotBtn.dataset.snapshotCustomHeight;
          }
          setSnapshotPreset('custom', { apply: false });
        };

        snapshotPopover.onOpen = () => {
          const formatValue = snapshotBtn.dataset.snapshotFormat || 'png';
          syncSnapshotGroup('[data-snapshot-format]', 'data-format', formatValue);
          const resolutionValue = snapshotBtn.dataset.snapshotResolution || '2x';
          syncSnapshotGroup('[data-snapshot-resolution]', 'data-resolution', resolutionValue);
          const backgroundValue = snapshotBtn.dataset.snapshotBackground || 'white';
          syncSnapshotGroup('[data-snapshot-background]', 'data-bg', backgroundValue);
          const viewValue = snapshotBtn.dataset.snapshotView || 'current';
          syncSnapshotGroup('[data-snapshot-view]', 'data-view', viewValue);
          const presetValue = snapshotBtn.dataset.snapshotPreset || 'custom';
          syncSnapshotGroup('[data-snapshot-preset]', 'data-preset', presetValue);
          applySnapshotSizeDefaults();
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(syncSnapshotSectionWidths);
          } else {
            syncSnapshotSectionWidths();
          }
        };

        snapshotPopover.addEventListener('change', (e) => {
          if (e.target.matches('[data-snapshot-width]')) {
            const raw = e.target.value.trim();
            const rounded = resolveSnapshotDimension(raw);
            const fallback = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultWidth);
            if (rounded != null) {
              snapshotBtn.dataset.snapshotWidth = String(rounded);
              e.target.value = String(rounded);
            } else if (fallback != null) {
              snapshotBtn.dataset.snapshotWidth = String(fallback);
              e.target.value = String(fallback);
            } else {
              delete snapshotBtn.dataset.snapshotWidth;
              e.target.value = '';
            }
            markSnapshotCustom();
            e.stopPropagation();
          }
          if (e.target.matches('[data-snapshot-height]')) {
            const raw = e.target.value.trim();
            const rounded = resolveSnapshotDimension(raw);
            const fallback = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultHeight);
            if (rounded != null) {
              snapshotBtn.dataset.snapshotHeight = String(rounded);
              e.target.value = String(rounded);
            } else if (fallback != null) {
              snapshotBtn.dataset.snapshotHeight = String(fallback);
              e.target.value = String(fallback);
            } else {
              delete snapshotBtn.dataset.snapshotHeight;
              e.target.value = '';
            }
            markSnapshotCustom();
            e.stopPropagation();
          }
        });

        snapshotPopover.addEventListener('click', (e) => {
          const presetButton = e.target.closest('[data-snapshot-preset] button[data-preset]');
          if (presetButton) {
            const chosen = presetButton.dataset.preset || 'custom';
            applySnapshotSizeDefaults();
            setSnapshotPreset(chosen);
            syncSnapshotSectionWidths();
            e.stopPropagation();
            return;
          }

          if (e.target.matches('[data-snapshot-save-preset]')) {
            saveCustomPreset();
            e.stopPropagation();
            return;
          }

          const formatButton = e.target.closest('[data-snapshot-format] button[data-format]');
          if (formatButton) {
            const chosen = formatButton.dataset.format || 'png';
            snapshotBtn.dataset.snapshotFormat = chosen;
            syncSnapshotGroup('[data-snapshot-format]', 'data-format', chosen);
            markSnapshotCustom();
            syncSnapshotSectionWidths();
            e.stopPropagation();
            return;
          }

          const resolutionButton = e.target.closest('[data-snapshot-resolution] button[data-resolution]');
          if (resolutionButton) {
            const chosen = resolutionButton.dataset.resolution || '2x';
            snapshotBtn.dataset.snapshotResolution = chosen;
            syncSnapshotGroup('[data-snapshot-resolution]', 'data-resolution', chosen);
            markSnapshotCustom();
            e.stopPropagation();
            return;
          }

          const backgroundButton = e.target.closest('[data-snapshot-background] button[data-bg]');
          if (backgroundButton) {
            const chosen = backgroundButton.dataset.bg || 'white';
            snapshotBtn.dataset.snapshotBackground = chosen;
            syncSnapshotGroup('[data-snapshot-background]', 'data-bg', chosen);
            markSnapshotCustom();
            e.stopPropagation();
            return;
          }

          const viewButton = e.target.closest('[data-snapshot-view] button[data-view]');
          if (viewButton) {
            const chosen = viewButton.dataset.view || 'current';
            snapshotBtn.dataset.snapshotView = chosen;
            syncSnapshotGroup('[data-snapshot-view]', 'data-view', chosen);
            markSnapshotCustom();
            e.stopPropagation();
            return;
          }

          if (e.target.matches('[data-snapshot-size-reset]')) {
            const widthInput = snapshotPopover.querySelector('[data-snapshot-width]');
            const heightInput = snapshotPopover.querySelector('[data-snapshot-height]');
            const widthDefault = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultWidth);
            const heightDefault = resolveSnapshotDimension(snapshotBtn.dataset.snapshotDefaultHeight);
            if (widthDefault != null) {
              snapshotBtn.dataset.snapshotWidth = String(widthDefault);
              if (widthInput) widthInput.value = String(widthDefault);
            }
            if (heightDefault != null) {
              snapshotBtn.dataset.snapshotHeight = String(heightDefault);
              if (heightInput) heightInput.value = String(heightDefault);
            }
            markSnapshotCustom();
            e.stopPropagation();
            return;
          }

          if (e.target.matches('[data-snapshot-capture]')) {
            captureSnapshot();
            e.stopPropagation();
            return;
          }
          if (e.target.matches('[data-snapshot-cancel]')) {
            snapshotPopover.__close?.();
            e.stopPropagation();
          }
        });

        snapshotBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          captureSnapshot();
        });
        appendPopoverControl(snapshotBtn, snapshotPopover, { openOnHover: true, suppressClickToggle: true });

        const fullscreenBtn = createToggleButton({
          icon: 'bi-arrows-fullscreen',
          title: 'Fullscreen panel',
          onClick: (isOn, btn) => {
            btn.innerHTML = isOn ? '<i class="bi bi-arrows-angle-contract"></i>' : '<i class="bi bi-arrows-fullscreen"></i>';
            btn.title = isOn ? 'Exit fullscreen' : 'Fullscreen panel';
            safeHandleHeaderAction(panelId, 'toggle-fullscreen', { on: isOn });
          }
        });
        fullscreenBtn.hidden = true;
        appendActionItem(fullscreenBtn);

        const overflowBtn = document.createElement('button');
        overflowBtn.type = 'button';
        overflowBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-overflow';
        overflowBtn.innerHTML = '<i class="bi bi-chevron-down"></i>';
        overflowBtn.title = 'More tools';
        overflowBtn.setAttribute('aria-expanded', 'false');
        overflowBtn.hidden = true;

        overflowPanel = document.createElement('div');
        overflowPanel.className = 'workspace-panel-actions-overflow-panel';
        overflowPanel.hidden = true;
        overflowPanel.tabIndex = -1;
        overflowPanel.setAttribute('role', 'menu');
        overflowPanel.setAttribute('aria-hidden', 'true');

        let overflowOutsideActive = false;
        let handleOverflowOutside = () => {};
        let overflowMenuOpen = false;

        const isOverflowMenuOpen = () => overflowMenuOpen;
        const closeOverflowItemPopovers = () => {
          if (!overflowPanel) return;
          overflowPanel.querySelectorAll('.workspace-panel-popover').forEach((pop) => {
            pop?.__close?.();
          });
        };

        const closeOverflowMenu = () => {
          if (!overflowMenuOpen) return;
          closeOverflowItemPopovers();
          closePortaledPopover(overflowBtn, overflowPanel);
          overflowPanel.hidden = true;
          overflowPanel.setAttribute('aria-hidden', 'true');
          overflowPanel.classList.remove('is-open');
          overflowBtn.classList.remove('is-active');
          overflowMenuOpen = false;
          if (overflowOutsideActive) {
            document.removeEventListener('click', handleOverflowOutside);
            overflowOutsideActive = false;
          }
        };
        registerPopoverCloser(closeOverflowMenu);
        handleOverflowOutside = (event) => {
          if (!isOverflowMenuOpen()) return;
          if (overflowPanel.contains(event.target) || overflowBtn.contains(event.target)) return;
          closeOverflowMenu();
        };

        const openOverflowMenu = () => {
          if (overflowMenuOpen) return;
          if (!overflowPanel || !overflowPanel.childElementCount) return;
          closeOverflowItemPopovers();
          overflowPanel.hidden = false;
          overflowPanel.setAttribute('aria-hidden', 'false');
          overflowPanel.classList.add('is-open');
          openPortaledPopover(overflowBtn, overflowPanel);
          overflowPanel.focus({ preventScroll: true });
          overflowBtn.classList.add('is-active');
          overflowMenuOpen = true;
          if (!overflowOutsideActive) {
            document.addEventListener('click', handleOverflowOutside);
            overflowOutsideActive = true;
          }
        };

        overflowBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (overflowBtn.hidden) return;
          const willOpen = !isOverflowMenuOpen();
          closeAllPopovers(willOpen ? closeOverflowMenu : null);
          if (willOpen) {
            openOverflowMenu();
          } else {
            closeOverflowMenu();
          }
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn--close';
        closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
        closeBtn.title = 'Close graph';
        closeBtn.addEventListener('click', () => {
          closeAllPopovers();
          safeRemovePanel(panelState.id);
        });

        const settingsBtn = document.createElement('button');
        settingsBtn.type = 'button';
        settingsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-toggle workspace-panel-action-btn--settings';
        settingsBtn.innerHTML = '<i class="bi bi-wrench"></i>';
        settingsBtn.title = 'Hide graph tools';
        settingsBtn.setAttribute('aria-pressed', 'false');

        const updateSettingsToggle = (collapsed) => {
          settingsBtn.setAttribute('aria-pressed', String(collapsed));
          settingsBtn.innerHTML = collapsed ? '<i class="bi bi-wrench-adjustable"></i>' : '<i class="bi bi-wrench"></i>';
          settingsBtn.title = collapsed ? 'Show graph tools' : 'Hide graph tools';
        };

        let toolsCollapsed = false;
        updateSettingsToggle(toolsCollapsed);
        settingsBtn.addEventListener('click', () => {
          toolsCollapsed = !toolsCollapsed;
          controlsWrapper.classList.toggle('is-collapsed', toolsCollapsed);
          controlsWrapper.setAttribute('aria-hidden', String(toolsCollapsed));
          updateSettingsToggle(toolsCollapsed);
          closeAllPopovers();
          refreshActionOverflow();
          safeUpdateToolbarMetrics();
        });

        const isInlineOverflowing = () => {
          if (!controlsWrapper) return false;
          const inlineItems = getOrderedInlineItems();
          if (inlineItems.length <= 1) return false;
          const containerRect = controlsWrapper.getBoundingClientRect();
          if (!containerRect || !Number.isFinite(containerRect.width)) return false;
          let minLeft = Infinity;
          let maxRight = -Infinity;
          inlineItems.forEach((item) => {
            const rect = item.getBoundingClientRect();
            if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return;
            if (rect.left < minLeft) minLeft = rect.left;
            if (rect.right > maxRight) maxRight = rect.right;
          });
          if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) return false;
          const contentWidth = maxRight - minLeft;
          return contentWidth > containerRect.width + 1;
        };

        const updateActionsReservedWidths = () => {
          if (!actions || !actionsRight || !title) return;
          const actionsRect = actions.getBoundingClientRect();
          const titleRect = title.getBoundingClientRect();
          const rightRect = actionsRight.getBoundingClientRect();
          const gapValue = (() => {
            const styles = window.getComputedStyle(actionsRight);
            return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
          })();
          const sampleBtn = actionsRight.querySelector('.workspace-panel-action-btn')
            || actionsCenter.querySelector('.workspace-panel-action-btn');
          const btnWidth = sampleBtn?.getBoundingClientRect().width || 24;
          const minRightWidth = (btnWidth * 4) + (gapValue * 3);
          const rightReserved = Math.max(rightRect.width || 0, minRightWidth) + 18;
          const leftReserved = Number.isFinite(actionsRect.left) && Number.isFinite(titleRect.right)
            ? Math.max(0, titleRect.right - actionsRect.left + 8)
            : 0;

          actions.style.setProperty('--workspace-panel-actions-right-reserved', `${Math.ceil(rightReserved)}px`);
          actions.style.setProperty('--workspace-panel-actions-left-reserved', `${Math.ceil(leftReserved)}px`);
        };

        const reconcileOverflowItems = ({ preserveMenuState = false } = {}) => {
          const menuWasOpen = isOverflowMenuOpen();
          if (menuWasOpen) {
            closeOverflowMenu();
          }
          moveAllItemsInline();
          if (!controlsWrapper || controlsWrapper.offsetParent === null) {
            return overflowPanel && overflowPanel.childElementCount > 0;
          }
          let wrapped = isInlineOverflowing();
          let guard = 0;
          while (wrapped && guard < actionItems.length) {
            const inlineItems = getOrderedInlineItems();
            if (!inlineItems.length) break;
            const candidate = inlineItems[inlineItems.length - 1];
            moveItemToOverflow(candidate);
            wrapped = isInlineOverflowing();
            guard += 1;
          }
          const hasOverflow = overflowPanel && overflowPanel.childElementCount > 0;
          if (preserveMenuState && menuWasOpen && hasOverflow) {
            openOverflowMenu();
          }
          return hasOverflow;
        };

        refreshActionOverflow = () => {
          updateActionsReservedWidths();
          if (!controlsWrapper || controlsWrapper.clientWidth <= 0) {
            moveAllItemsInline();
            closeOverflowMenu();
            overflowBtn.hidden = true;
            actions.classList.remove('has-overflow');
            return;
          }
          const collapsed = controlsWrapper.classList.contains('is-collapsed');
          if (collapsed) {
            moveAllItemsInline();
            closeOverflowMenu();
            overflowBtn.hidden = true;
            actions.classList.remove('has-overflow');
            return;
          }
          const hasOverflow = reconcileOverflowItems({ preserveMenuState: true });
          if (!hasOverflow) {
            closeOverflowMenu();
          }
          overflowBtn.hidden = !hasOverflow;
          actions.classList.toggle('has-overflow', hasOverflow);
        };
        if (typeof ResizeObserver === 'function') {
          const resizeObserver = new ResizeObserver(() => refreshActionOverflow());
          resizeObserver.observe(actions);
        }

        actionsCenter.appendChild(controlsWrapper);
        actionsCenter.appendChild(overflowBtn);
        actionsRight.appendChild(settingsBtn);
        if (pinBtn) {
          actionsRight.appendChild(pinBtn);
        }
        if (lockBtn) {
          actionsRight.appendChild(lockBtn);
        }
        actionsRight.appendChild(closeBtn);
        actions.appendChild(actionsCenter);
        actions.appendChild(overflowPanel);
        actions.appendChild(actionsRight);
        applyHeaderLockState(panelLockState);
        } else {
          let fullscreenEnabled = false;
          let spreadsheetOverflowPanel = null;
          const nonPlotFullscreenBtn = document.createElement('button');
          nonPlotFullscreenBtn.type = 'button';
          nonPlotFullscreenBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
          nonPlotFullscreenBtn.hidden = true;
          const updateNonPlotFullscreenBtn = () => {
            nonPlotFullscreenBtn.innerHTML = fullscreenEnabled
              ? '<i class="bi bi-arrows-angle-contract"></i>'
              : '<i class="bi bi-arrows-fullscreen"></i>';
            nonPlotFullscreenBtn.title = fullscreenEnabled ? 'Exit fullscreen' : 'Fullscreen panel';
          };
          nonPlotFullscreenBtn.addEventListener('click', () => {
            fullscreenEnabled = !fullscreenEnabled;
            updateNonPlotFullscreenBtn();
            safeHandleHeaderAction(panelId, 'toggle-fullscreen', { on: fullscreenEnabled });
          });
          updateNonPlotFullscreenBtn();

          panelLockState = readPanelLockState(panelId);
          lockBtn = createToggleButton({
            icon: 'bi-lock',
            title: 'Lock panel',
            pressed: panelLockState.editLocked,
            onClick: (isOn) => safePanelLockToggle(panelId, { on: isOn })
          });
          lockBtn.dataset.panelAction = 'lock';
          lockBtn.classList.add('workspace-panel-action-btn--lock');

          pinBtn = createToggleButton({
            icon: 'bi-pin-angle',
            title: 'Pin position',
            pressed: panelLockState.pinned,
            onClick: (isOn) => safePanelPinToggle(panelId, { on: isOn })
          });
          pinBtn.dataset.panelAction = 'pin';
          pinBtn.classList.add('workspace-panel-action-btn--visibility');

          if (isSpreadsheetPanel) {
            const controlsWrapper = document.createElement('div');
            controlsWrapper.className = 'workspace-panel-actions-collection';
            controlsWrapper.setAttribute('aria-hidden', 'false');

            const ACTION_ORDER_ATTR = 'data-panel-action-order';
            const actionItems = [];
            let overflowPanel = null;

            const toOrder = (node) => Number(node?.getAttribute(ACTION_ORDER_ATTR)) || 0;
            const registerActionItem = (node) => {
              if (!node) return null;
              node.dataset.panelActionItem = '1';
              node.classList.add('workspace-panel-action-item');
              node.classList.remove('is-overflowed');
              node.removeAttribute('data-panel-action-overflow');
              return node;
            };
            const appendActionItem = (node) => {
              if (!node) return null;
              registerActionItem(node);
              node.setAttribute(ACTION_ORDER_ATTR, String(actionItems.length));
              actionItems.push(node);
              controlsWrapper.appendChild(node);
              return node;
            };
            const isVisibleActionItem = (item) => {
              if (!item || item.hidden) return false;
              if (item.offsetParent !== null) return true;
              return item.getClientRects().length > 0;
            };
            const getOrderedInlineItems = ({ includeHidden = false } = {}) => actionItems
              .filter((item) => item
                && item.parentElement === controlsWrapper
                && (includeHidden || isVisibleActionItem(item)))
              .sort((a, b) => toOrder(a) - toOrder(b));
            const moveItemToInline = (node) => {
              if (!node || node.parentElement === controlsWrapper) return;
              const nextSibling = getOrderedInlineItems()
                .find((item) => toOrder(item) > toOrder(node)) || null;
              if (nextSibling) {
                controlsWrapper.insertBefore(node, nextSibling);
              } else {
                controlsWrapper.appendChild(node);
              }
              node.classList.remove('is-overflowed');
              node.removeAttribute('data-panel-action-overflow');
            };
            const moveAllItemsInline = () => {
              actionItems.forEach((item) => moveItemToInline(item));
            };
            const moveItemToOverflow = (node) => {
              if (!node || !overflowPanel || node.parentElement === overflowPanel) return;
              overflowPanel.appendChild(node);
              node.classList.add('is-overflowed');
              node.setAttribute('data-panel-action-overflow', '1');
            };

            const appendPopoverControl = (buttonEl, popoverEl, options = {}) => {
              const wrapper = document.createElement('div');
              wrapper.className = 'workspace-panel-action-wrapper';
              wrapper.appendChild(buttonEl);
              wrapper.appendChild(popoverEl);
              appendActionItem(wrapper);
              registerPopoverButton(buttonEl, popoverEl, options);
            };

            const addColumnBtn = document.createElement('button');
            addColumnBtn.type = 'button';
            addColumnBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
            addColumnBtn.innerHTML = '<i class="bi bi-plus-lg"></i>';
            addColumnBtn.title = 'Add column';
            addColumnBtn.addEventListener('click', () => {
              contentHandles?.addColumn?.();
            });
            appendActionItem(addColumnBtn);

            let freezeEnabled = false;
            const freezeBtn = createToggleButton({
              icon: 'bi-snow',
              title: 'Freeze first row/column',
              pressed: freezeEnabled,
              onClick: (isOn) => {
                freezeEnabled = isOn;
                contentHandles?.setFreeze?.(isOn);
              }
            });
            freezeBtn.dataset.panelAction = 'freeze';
            freezeBtn.classList.add('workspace-panel-action-btn--freeze');
            appendActionItem(freezeBtn);
            contentHandles?.setFreeze?.(freezeEnabled);

            const duplicateBtn = document.createElement('button');
            duplicateBtn.type = 'button';
            duplicateBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
            duplicateBtn.innerHTML = '<i class="bi bi-files"></i>';
            duplicateBtn.title = 'Duplicate spreadsheet';
            duplicateBtn.addEventListener('click', () => {
              safeDuplicatePanel(panelId);
            });
            appendActionItem(duplicateBtn);

            const dockBtn = document.createElement('button');
            dockBtn.type = 'button';
            dockBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
            dockBtn.innerHTML = '<i class="bi bi-layout-sidebar-inset"></i>';
            dockBtn.title = 'Open in side bar';
            dockBtn.addEventListener('click', () => {
              safeSpreadsheetDock(panelId);
            });
            appendActionItem(dockBtn);

            const tipsBtn = document.createElement('button');
            tipsBtn.type = 'button';
            tipsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
            tipsBtn.innerHTML = '<i class="bi bi-lightbulb"></i>';
            tipsBtn.title = 'Tips';
            tipsBtn.setAttribute('aria-expanded', 'false');

            const tipsPopover = document.createElement('div');
            tipsPopover.className = 'workspace-panel-popover workspace-panel-popover--tips';
            const ensureTipsContent = () => {
              const tipsMarkup = contentHandles?.getQuickTipsMarkup?.();
              if (!tipsMarkup) return;
              tipsPopover.innerHTML = `
                <div class="workspace-panel-popover-section">
                  ${tipsMarkup}
                </div>
              `;
            };
            tipsPopover.onOpen = () => ensureTipsContent();
            ensureTipsContent();
            const tipsWrapper = document.createElement('div');
            tipsWrapper.className = 'workspace-panel-action-wrapper';
            tipsWrapper.appendChild(tipsBtn);
            tipsWrapper.appendChild(tipsPopover);
            registerPopoverButton(tipsBtn, tipsPopover, { openOnHover: true, suppressClickToggle: true });

            const plotBtn = document.createElement('button');
            plotBtn.type = 'button';
            plotBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
            plotBtn.innerHTML = '<i class="bi bi-graph-up"></i>';
            plotBtn.title = 'Plot options';
            plotBtn.setAttribute('aria-expanded', 'false');
            plotBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              contentHandles?.triggerPlotFromHeader?.();
            });

            const plotPopover = document.createElement('div');
            plotPopover.className = 'workspace-panel-popover workspace-panel-popover--plot';
            plotPopover.onOpen = () => {
              const plotContent = contentHandles?.getPlotPopoverContent?.();
              if (plotContent && !plotPopover.contains(plotContent)) {
                plotPopover.appendChild(plotContent);
              }
            };
            plotPopover.addEventListener('spreadsheet:close-popover', () => {
              plotPopover.__close?.();
            });
            appendPopoverControl(plotBtn, plotPopover, { openOnHover: true, suppressClickToggle: true });

            const extraBtn = document.createElement('button');
            extraBtn.type = 'button';
            extraBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
            extraBtn.innerHTML = '<i class="bi bi-sliders"></i>';
            extraBtn.title = 'Extra options';
            extraBtn.setAttribute('aria-expanded', 'false');

            const extraPopover = document.createElement('div');
            extraPopover.className = 'workspace-panel-popover workspace-panel-popover--spreadsheet-extra';
            extraPopover.onOpen = () => {
              const extraContent = contentHandles?.getExtraOptionsPopoverContent?.();
              if (extraContent && !extraPopover.contains(extraContent)) {
                extraPopover.appendChild(extraContent);
              }
            };
            appendPopoverControl(extraBtn, extraPopover, { openOnHover: true, suppressClickToggle: true });

            const settingsBtn = document.createElement('button');
            settingsBtn.type = 'button';
            settingsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-toggle workspace-panel-action-btn--settings';
            settingsBtn.innerHTML = '<i class="bi bi-wrench"></i>';
            settingsBtn.title = 'Hide tools';
            settingsBtn.setAttribute('aria-pressed', 'false');

            const updateSettingsToggle = (collapsed) => {
              settingsBtn.setAttribute('aria-pressed', String(collapsed));
              settingsBtn.innerHTML = collapsed ? '<i class="bi bi-wrench-adjustable"></i>' : '<i class="bi bi-wrench"></i>';
              settingsBtn.title = collapsed ? 'Show tools' : 'Hide tools';
            };

            let toolsCollapsed = false;
            updateSettingsToggle(toolsCollapsed);
            settingsBtn.addEventListener('click', () => {
              toolsCollapsed = !toolsCollapsed;
              controlsWrapper.classList.toggle('is-collapsed', toolsCollapsed);
              controlsWrapper.setAttribute('aria-hidden', String(toolsCollapsed));
              updateSettingsToggle(toolsCollapsed);
              refreshActionOverflow();
              safeUpdateToolbarMetrics();
            });

            panelLockState = readPanelLockState(panelId);
            lockBtn = createToggleButton({
              icon: 'bi-lock',
              title: 'Lock panel',
              pressed: panelLockState.editLocked,
              onClick: (isOn) => safePanelLockToggle(panelId, { on: isOn })
            });
            lockBtn.dataset.panelAction = 'lock';
            lockBtn.classList.add('workspace-panel-action-btn--lock');

            pinBtn = createToggleButton({
              icon: 'bi-pin-angle',
              title: 'Pin position',
              pressed: panelLockState.pinned,
              onClick: (isOn) => safePanelPinToggle(panelId, { on: isOn })
            });
            pinBtn.dataset.panelAction = 'pin';
            pinBtn.classList.add('workspace-panel-action-btn--visibility');

            const overflowBtn = document.createElement('button');
            overflowBtn.type = 'button';
            overflowBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-overflow';
            overflowBtn.innerHTML = '<i class="bi bi-chevron-down"></i>';
            overflowBtn.title = 'More tools';
            overflowBtn.setAttribute('aria-expanded', 'false');
            overflowBtn.hidden = true;

            overflowPanel = document.createElement('div');
            overflowPanel.className = 'workspace-panel-actions-overflow-panel';
            overflowPanel.hidden = true;
            overflowPanel.tabIndex = -1;
            overflowPanel.setAttribute('role', 'menu');
            overflowPanel.setAttribute('aria-hidden', 'true');
            spreadsheetOverflowPanel = overflowPanel;

            let overflowOutsideActive = false;
            let handleOverflowOutside = () => {};
            let overflowMenuOpen = false;
            const isOverflowMenuOpen = () => overflowMenuOpen;
            const closeOverflowItemPopovers = () => {
              if (!overflowPanel) return;
              overflowPanel.querySelectorAll('.workspace-panel-popover').forEach((pop) => {
                pop?.__close?.();
              });
            };
            const closeOverflowMenu = () => {
              if (!overflowMenuOpen) return;
              closeOverflowItemPopovers();
              closePortaledPopover(overflowBtn, overflowPanel);
              overflowPanel.hidden = true;
              overflowPanel.setAttribute('aria-hidden', 'true');
              overflowPanel.classList.remove('is-open');
              overflowBtn.classList.remove('is-active');
              overflowMenuOpen = false;
              if (overflowOutsideActive) {
                document.removeEventListener('click', handleOverflowOutside);
                overflowOutsideActive = false;
              }
            };
            handleOverflowOutside = (event) => {
              if (!isOverflowMenuOpen()) return;
              if (overflowPanel.contains(event.target) || overflowBtn.contains(event.target)) return;
              closeOverflowMenu();
            };

            const openOverflowMenu = () => {
              if (overflowMenuOpen) return;
              if (!overflowPanel || !overflowPanel.childElementCount) return;
              closeOverflowItemPopovers();
              overflowPanel.hidden = false;
              overflowPanel.setAttribute('aria-hidden', 'false');
              overflowPanel.classList.add('is-open');
              openPortaledPopover(overflowBtn, overflowPanel);
              overflowPanel.focus({ preventScroll: true });
              overflowBtn.classList.add('is-active');
              overflowMenuOpen = true;
              if (!overflowOutsideActive) {
                document.addEventListener('click', handleOverflowOutside);
                overflowOutsideActive = true;
              }
            };

            overflowBtn.addEventListener('click', (event) => {
              event.stopPropagation();
              if (overflowBtn.hidden) return;
              const willOpen = !isOverflowMenuOpen();
              if (willOpen) {
                openOverflowMenu();
              } else {
                closeOverflowMenu();
              }
            });

            const isInlineOverflowing = () => {
              const inlineItems = getOrderedInlineItems();
              if (inlineItems.length <= 1) return false;
              const containerRect = controlsWrapper.getBoundingClientRect();
              if (!containerRect || !Number.isFinite(containerRect.width)) return false;
              let minLeft = Infinity;
              let maxRight = -Infinity;
              inlineItems.forEach((item) => {
                const rect = item.getBoundingClientRect();
                if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.right)) return;
                if (rect.left < minLeft) minLeft = rect.left;
                if (rect.right > maxRight) maxRight = rect.right;
              });
              if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight)) return false;
              const contentWidth = maxRight - minLeft;
              return contentWidth > containerRect.width + 1;
            };

            const updateActionsReservedWidths = () => {
              if (!actions || !actionsRight || !title) return;
              const actionsRect = actions.getBoundingClientRect();
              const titleRect = title.getBoundingClientRect();
              const rightRect = actionsRight.getBoundingClientRect();
              const gapValue = (() => {
                const styles = window.getComputedStyle(actionsRight);
                return Number.parseFloat(styles.columnGap || styles.gap || '0') || 0;
              })();
              const sampleBtn = actionsRight.querySelector('.workspace-panel-action-btn')
                || controlsWrapper.querySelector('.workspace-panel-action-btn');
              const btnWidth = sampleBtn?.getBoundingClientRect().width || 24;
              const minRightWidth = (btnWidth * 4) + (gapValue * 3);
              const rightReserved = Math.max(rightRect.width || 0, minRightWidth) + 18;
              const leftReserved = Number.isFinite(actionsRect.left) && Number.isFinite(titleRect.right)
                ? Math.max(0, titleRect.right - actionsRect.left + 8)
                : 0;
              actions.style.setProperty('--workspace-panel-actions-right-reserved', `${Math.ceil(rightReserved)}px`);
              actions.style.setProperty('--workspace-panel-actions-left-reserved', `${Math.ceil(leftReserved)}px`);
            };

            const reconcileOverflowItems = ({ preserveMenuState = false } = {}) => {
              const menuWasOpen = isOverflowMenuOpen();
              if (menuWasOpen) {
                closeOverflowMenu();
              }
              moveAllItemsInline();
              if (!controlsWrapper || controlsWrapper.offsetParent === null) {
                return overflowPanel && overflowPanel.childElementCount > 0;
              }
              let wrapped = isInlineOverflowing();
              let guard = 0;
              while (wrapped && guard < actionItems.length) {
                const inlineItems = getOrderedInlineItems();
                if (!inlineItems.length) break;
                const candidate = inlineItems[inlineItems.length - 1];
                moveItemToOverflow(candidate);
                wrapped = isInlineOverflowing();
                guard += 1;
              }
              const hasOverflow = overflowPanel && overflowPanel.childElementCount > 0;
              if (preserveMenuState && menuWasOpen && hasOverflow) {
                openOverflowMenu();
              }
              return hasOverflow;
            };

            refreshActionOverflow = () => {
              updateActionsReservedWidths();
              if (!controlsWrapper || controlsWrapper.clientWidth <= 0) {
                moveAllItemsInline();
                closeOverflowMenu();
                overflowBtn.hidden = true;
                actions.classList.remove('has-overflow');
                return;
              }
              const collapsed = controlsWrapper.classList.contains('is-collapsed');
              if (collapsed) {
                moveAllItemsInline();
                closeOverflowMenu();
                overflowBtn.hidden = true;
                actions.classList.remove('has-overflow');
                return;
              }
              const hasOverflow = reconcileOverflowItems({ preserveMenuState: true });
              if (!hasOverflow) {
                closeOverflowMenu();
              }
              overflowBtn.hidden = !hasOverflow;
              actions.classList.toggle('has-overflow', hasOverflow);
            };

            if (typeof ResizeObserver === 'function') {
              const resizeObserver = new ResizeObserver(() => refreshActionOverflow());
              resizeObserver.observe(actions);
            }

            actionsCenter.appendChild(controlsWrapper);
            actionsCenter.appendChild(overflowBtn);
            actionsRight.appendChild(tipsWrapper);
            actionsRight.appendChild(settingsBtn);
          }

          if (isMarkdownPanel) {
            markdownRenderToggleBtn = document.createElement('button');
            markdownRenderToggleBtn.type = 'button';
            markdownRenderToggleBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-markdown-render-toggle';
            markdownRenderToggleLabel = document.createElement('span');
            markdownRenderToggleLabel.className = 'workspace-markdown-render-toggle-label';
            markdownRenderToggleLabel.textContent = 'Md';
            markdownRenderToggleBtn.appendChild(markdownRenderToggleLabel);
            markdownRenderToggleBtn.addEventListener('click', () => {
              if (!contentHandles?.setRenderMode) return;
              const currentMode = contentHandles.getRenderMode?.() ?? 'markdown';
              const nextMode = currentMode === 'plain' ? 'markdown' : 'plain';
              const shouldNormalize = currentMode !== 'plain' && nextMode === 'plain';
              contentHandles.setRenderMode?.(nextMode, {
                normalizeText: shouldNormalize,
                pushHistory: true
              });
              updateMarkdownRenderToggle();
              updateMarkdownPreviewToggle();
            });
            actionsCenter.appendChild(markdownRenderToggleBtn);

            markdownPreviewToggleBtn = document.createElement('button');
            markdownPreviewToggleBtn.type = 'button';
            markdownPreviewToggleBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-markdown-preview-toggle';
            markdownPreviewToggleBtn.addEventListener('click', () => {
              if (!contentHandles) return;
              const modes = ['edit', 'preview', 'split-h', 'split'];
              const currentMode = contentHandles.getMode?.() || 'split';
              const currentIndex = Math.max(0, modes.indexOf(currentMode));
              const nextMode = modes[(currentIndex + 1) % modes.length];
              contentHandles.setMode?.(nextMode);
              updateMarkdownPreviewToggle();
            });
            updateMarkdownPreviewToggle();
            actionsCenter.appendChild(markdownPreviewToggleBtn);
            updateMarkdownRenderToggle();

            const markdownShortcutTabs = [
              {
                id: 'text',
                label: 'Text',
                shortcuts: [
                  { label: 'Bold text', pattern: '**bold**', hint: 'Ctrl/Cmd + B' },
                  { label: 'Italic text', pattern: '*italic*', hint: 'Ctrl/Cmd + I' },
                  { label: 'Strikethrough', pattern: '~~strike~~', hint: 'Wrap text with double tildes' },
                  { label: 'Inline code', pattern: '`code`', hint: 'Wrap with single backticks' },
                  { label: 'Links', pattern: '[title](https://example.com)', hint: 'Select text + Ctrl/Cmd + K' },
                  { label: 'Lists', pattern: '- Item   ·   1. Ordered', hint: 'Type "-" or number + space' }
                ]
              },
              {
                id: 'structure',
                label: 'Structure',
                shortcuts: [
                  { label: 'Headings', pattern: '# H1 … ###### H6', hint: 'Prefix with 1–6 hash symbols' },
                  { label: 'Checklist', pattern: '- [ ] Task   ·   - [x] Done', hint: 'Use [ ] or [x] after "-"' },
                  { label: 'Code block', pattern: '```lang\nprint("hi")\n```', hint: 'Fence with triple backticks' },
                  { label: 'Quote', pattern: '> Focused text', hint: 'Begin line with > + space' },
                  { label: 'Tables', pattern: '| Col | Col |\n| --- | --- |\n| Val | Val |', hint: 'Add a separator row of ---' },
                  { label: 'Rule / divider', pattern: '---', hint: 'Three hyphens, underscores, or asterisks' }
                ]
              },
              {
                id: 'equations',
                label: 'Equations',
                shortcuts: [
                  { label: 'Inline math', pattern: '$E = mc^2$', hint: 'Wrap LaTeX with single $…$' },
                  { label: 'Display math', pattern: '$$\\int_a^b f(x) dx$$', hint: 'Use double $$ for centered blocks' },
                  { label: 'Subscripts & superscripts', pattern: 'H_{2}O   ·   x^{2}', hint: 'Inside $…$, use _ for subscripts and ^ for superscripts' },
                  { label: 'Greek symbols', pattern: '$\\alpha, \\beta, \\gamma$', hint: 'Use LaTeX commands inside $' }
                ]
              }
            ];

            const infoActionWrapper = document.createElement('div');
            infoActionWrapper.className = 'workspace-panel-action-wrapper';

            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
            infoBtn.innerHTML = '<i class="bi bi-info-circle"></i>';
            infoBtn.title = 'Markdown help';
            infoBtn.setAttribute('aria-expanded', 'false');
            infoActionWrapper.appendChild(infoBtn);

            const infoPopover = document.createElement('div');
            infoPopover.className = 'workspace-panel-popover workspace-panel-popover--markdown';

            const introSection = document.createElement('div');
            introSection.className = 'workspace-panel-popover-section';
            const introLabel = document.createElement('div');
            introLabel.className = 'workspace-panel-popover-label';
            introLabel.textContent = 'Markdown shortcuts';
            const introCopy = document.createElement('p');
            introCopy.className = 'workspace-panel-popover-subtle mb-0';
            introCopy.textContent = 'Use tabs to jump between text, layout, and math tips.';
            introSection.appendChild(introLabel);
            introSection.appendChild(introCopy);
            infoPopover.appendChild(introSection);

            const tabsNav = document.createElement('div');
            tabsNav.className = 'workspace-panel-popover-tabs';
            tabsNav.setAttribute('role', 'tablist');

            const panelsContainer = document.createElement('div');
            panelsContainer.className = 'workspace-panel-popover-panels';

            const createShortcutRow = (shortcut = {}) => {
              const row = document.createElement('div');
              row.className = 'workspace-markdown-shortcut';

              const header = document.createElement('div');
              header.className = 'workspace-markdown-shortcut-header';

              const labelEl = document.createElement('span');
              labelEl.className = 'workspace-markdown-shortcut-label';
              labelEl.textContent = shortcut.label || '';

              const patternEl = document.createElement('code');
              patternEl.className = 'workspace-markdown-shortcut-pattern';
              patternEl.textContent = shortcut.pattern || '';

              header.appendChild(labelEl);
              header.appendChild(patternEl);
              row.appendChild(header);

              if (shortcut.description) {
                const descriptionEl = document.createElement('div');
                descriptionEl.className = 'workspace-markdown-shortcut-description';
                descriptionEl.textContent = shortcut.description;
                row.appendChild(descriptionEl);
              }

              if (shortcut.hint) {
                const hintEl = document.createElement('div');
                hintEl.className = 'workspace-markdown-shortcut-hint';
                hintEl.textContent = shortcut.hint;
                row.appendChild(hintEl);
              }

              return row;
            };

            markdownShortcutTabs.forEach((tab, index) => {
              const tabBtn = document.createElement('button');
              tabBtn.type = 'button';
              tabBtn.className = 'workspace-panel-popover-tab';
              tabBtn.dataset.mdTab = tab.id;
              tabBtn.textContent = tab.label;
              tabBtn.setAttribute('role', 'tab');
              tabBtn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
              if (index === 0) {
                tabBtn.classList.add('is-active');
              }
              tabsNav.appendChild(tabBtn);

              const panel = document.createElement('div');
              panel.className = 'workspace-panel-popover-panel';
              panel.dataset.mdPanel = tab.id;
              panel.setAttribute('role', 'tabpanel');
              if (index === 0) {
                panel.classList.add('is-active');
              }
              const list = document.createElement('div');
              list.className = 'workspace-markdown-shortcut-list';
              tab.shortcuts.forEach((shortcut) => {
                list.appendChild(createShortcutRow(shortcut));
              });
              panel.appendChild(list);
              panelsContainer.appendChild(panel);
            });

            const tabsSection = document.createElement('div');
            tabsSection.className = 'workspace-panel-popover-section workspace-panel-popover-section--markdown';
            tabsSection.appendChild(tabsNav);
            tabsSection.appendChild(panelsContainer);
            infoPopover.appendChild(tabsSection);

            const footer = document.createElement('div');
            footer.className = 'workspace-markdown-shortcut-footer';
            const guideBtn = document.createElement('button');
            guideBtn.type = 'button';
            guideBtn.className = 'btn btn-link btn-sm p-0';
            guideBtn.dataset.markdownGuide = '1';
            guideBtn.textContent = 'Open Markdown guide ↗';
            footer.appendChild(guideBtn);
            infoPopover.appendChild(footer);

            let activeMarkdownInfoTab = markdownShortcutTabs[0]?.id || 'text';
            const setMarkdownInfoTab = (tabId) => {
              const resolved = markdownShortcutTabs.find((tab) => tab.id === tabId)?.id
                || markdownShortcutTabs[0]?.id
                || 'text';
              tabsNav.querySelectorAll('[data-md-tab]').forEach((btn) => {
                const isActive = btn.dataset.mdTab === resolved;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-selected', String(isActive));
              });
              panelsContainer.querySelectorAll('[data-md-panel]').forEach((panel) => {
                panel.classList.toggle('is-active', panel.dataset.mdPanel === resolved);
              });
            };

            infoPopover.addEventListener('click', (event) => {
              event.stopPropagation();
              const tabBtn = event.target.closest('[data-md-tab]');
              if (tabBtn) {
                activeMarkdownInfoTab = tabBtn.dataset.mdTab;
                setMarkdownInfoTab(activeMarkdownInfoTab);
                return;
              }
              if (event.target.matches('[data-markdown-guide]')) {
                if (typeof window !== 'undefined' && typeof window.open === 'function') {
                  window.open('https://www.markdownguide.org/cheat-sheet/', '_blank', 'noopener');
                }
              }
            });
            infoPopover.onOpen = () => setMarkdownInfoTab(activeMarkdownInfoTab);

            infoActionWrapper.appendChild(infoPopover);
            actionsCenter.appendChild(infoActionWrapper);
            registerPopoverButton(infoBtn, infoPopover, {
              strategy: 'right-side',
              align: 'center',
              offsetX: 20,
              getAnchorRect: () => {
                const anchorEl = (contentHandles?.plotEl ?? plotHost ?? panelEl);
                if (anchorEl && typeof anchorEl.getBoundingClientRect === 'function') {
                  return anchorEl.getBoundingClientRect();
                }
                return typeof panelEl.getBoundingClientRect === 'function'
                  ? panelEl.getBoundingClientRect()
                  : infoBtn.getBoundingClientRect();
              }
            });
          }

          actionsCenter.appendChild(nonPlotFullscreenBtn);

          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn--close';
          closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
          closeBtn.title = 'Close panel';
          closeBtn.addEventListener('click', () => {
            safeRemovePanel(panelState.id);
          });
          if (pinBtn) {
            actionsRight.appendChild(pinBtn);
          }
          if (lockBtn) {
            actionsRight.appendChild(lockBtn);
          }
          actionsRight.appendChild(closeBtn);
          actions.appendChild(actionsCenter);
          if (spreadsheetOverflowPanel) {
            actions.appendChild(spreadsheetOverflowPanel);
          }
          actions.appendChild(actionsRight);
          applyHeaderLockState(panelLockState);
        }
        if (headerTagBadge) {
          header.appendChild(headerTagBadge);
        }
        header.appendChild(title);
        header.appendChild(actions);
        header.addEventListener('dblclick', (evt) => {
          if (evt.defaultPrevented) return;
          const target = evt.target;
          if (target?.closest?.('.workspace-panel-title')) return;
          if (target?.closest?.('.workspace-panel-actions')) return;
          if (target?.closest?.('button, a, input, select, textarea, label')) return;
          const isFullscreen = panelEl.classList.contains('is-fullscreen');
          safeHandleHeaderAction(panelId, 'toggle-fullscreen', { on: !isFullscreen });
        });
        refreshActionOverflow();
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(refreshActionOverflow);
        } else {
          Promise.resolve().then(refreshActionOverflow);
        }

        const body = document.createElement('div');
        body.className = 'workspace-panel-body';

        plotHost = document.createElement('div');
        plotHost.className = 'workspace-panel-plot';
        body.appendChild(plotHost);
        panelEl.appendChild(header);
        panelEl.appendChild(body);
        if (canvas) {
          canvas.appendChild(panelEl);
        }

        contentHandles = panelType?.mountContent?.({
          panelId,
          panelState,
          rootEl: panelEl,
          hostEl: plotHost,
          actions: {
            setPanelContent: safeSetPanelContent,
            handleHeaderAction: safeHandleHeaderAction
          },
          selectors: {
            getPanelContent: safeGetPanelContent,
            listPlotPanels: safeListPlotPanels
          }
        }) || null;
        if (!contentHandles) {
          contentHandles = { plotEl: plotHost };
        }
        updateMarkdownPreviewToggle();
        updateMarkdownRenderToggle();
        const resolvedPlotHost = contentHandles?.plotEl ?? (isPlotPanel ? plotHost : null);

        const domHandles = {
          rootEl: panelEl,
          headerEl: header,
          titleEl: title,
          plotEl: resolvedPlotHost,
          tagBadgeEl: headerTagBadge,
          stylePainterButton: stylePainterBtn,
          stylePainterPopover,
          runtime,
          contentHandles
        };
        safeRegisterPanelDom(panelId, domHandles);
        safeUpdatePanelRuntime(panelId, {
          refreshActionOverflow,
          setDataTabButtonActive
        });
        panelEl.addEventListener('pointerdown', (evt) => {
          if (typeof evt.button === 'number' && evt.button !== 0) return;
          safeBringPanelToFront(panelId);
        });
        panelEl.addEventListener('focusin', () => safeBringPanelToFront(panelId));

    return {
      rootEl: panelEl,
      headerEl: header,
      plotEl: resolvedPlotHost,
      refreshActionOverflow
    };
  };

  return {
    mountPanel
  };
}
