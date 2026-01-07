import { getWorkspaceTagColor } from '../../../../utils/tagColors.js';
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
  const safePanelLockToggle = typeof onPanelLockToggle === 'function' ? onPanelLockToggle : () => {};
  const safePanelPinToggle = typeof onPanelPinToggle === 'function' ? onPanelPinToggle : () => {};
  const safePanelVisibilityToggle = typeof onPanelVisibilityToggle === 'function'
    ? onPanelVisibilityToggle
    : () => {};
    const safeGetPanelFigure = typeof getPanelFigure === 'function' ? getPanelFigure : (() => ({ data: [], layout: {} }));
    const safeGetPanelContent = typeof getPanelContent === 'function' ? getPanelContent : (() => null);
    const safeListPlotPanels = typeof listPlotPanels === 'function' ? listPlotPanels : (() => []);
  const safeSetPanelContent = typeof setPanelContent === 'function' ? setPanelContent : () => {};
  const canvasPrimaryTag = (typeof document !== 'undefined' && document.body?.dataset?.activeCanvasPrimaryTag) || '';
  const canvasPrimaryTagColor = canvasPrimaryTag ? getWorkspaceTagColor(canvasPrimaryTag) : null;

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
    btn.setAttribute('aria-expanded', 'false');
    const open = () => {
      if (typeof pop.onOpen === 'function') pop.onOpen();
      openPortaledPopover(btn, pop, options);
    };
    const close = () => closePortaledPopover(btn, pop);
    const onBtnClick = (event) => {
      event.stopPropagation();
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        close();
      } else {
        open();
      }
    };
    btn.addEventListener('click', onBtnClick);
    const onDocClick = (event) => {
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      if (!isOpen) return;
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
        const panelEl = document.createElement('div');
        panelEl.className = 'workspace-panel';
        if (panelType?.panelClass) {
          panelEl.classList.add(panelType.panelClass);
        }
        panelEl.dataset.panelId = panelId;
        panelEl.dataset.graphIndex = String(panelState.index);
        const initialTitle = (typeof panelState.title === 'string' && panelState.title.trim())
          ? panelState.title.trim()
          : (Number.isInteger(panelState.index) && panelState.index > 0 ? `Graph ${panelState.index}` : 'Graph');
        panelEl.dataset.graphTitle = initialTitle;

        const header = document.createElement('div');
        header.className = 'workspace-panel-header';
        const headerTagBadge = isPlotPanel && canvasPrimaryTag && canvasPrimaryTagColor
          ? (() => {
            const badge = document.createElement('span');
            badge.className = 'dashboard-tag graph-canvas-tag';
            badge.textContent = canvasPrimaryTag;
            badge.title = `Canvas tag: ${canvasPrimaryTag}`;
            badge.dataset.canvasTag = canvasPrimaryTag;
            badge.style.background = canvasPrimaryTagColor;
            badge.style.color = '#fff';
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
        let refreshActionOverflow = () => {};
        let contentHandles = null;
        let markdownPreviewToggleBtn = null;
        let markdownPreviewToggleIcon = null;
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
          markdownPreviewToggleBtn.disabled = !hasHandles;
          const previewVisible = (contentHandles?.getMode?.() ?? 'split') !== 'edit';
          const label = previewVisible ? 'Hide Markdown preview' : 'Show Markdown preview';
          markdownPreviewToggleBtn.title = label;
          markdownPreviewToggleBtn.setAttribute('aria-label', label);
          markdownPreviewToggleBtn.classList.toggle('is-preview-visible', previewVisible);
          markdownPreviewToggleBtn.classList.toggle('is-preview-available', hasHandles);
          if (!markdownPreviewToggleIcon && markdownPreviewToggleBtn) {
            markdownPreviewToggleIcon = buildMarkdownPreviewIcon();
            markdownPreviewToggleBtn.appendChild(markdownPreviewToggleIcon);
          }
        };

    let cursorBtn = null;
    let stylePainterBtn = null;
    let stylePainterPopover = null;
    let graphVisibilityBtn = null;
    let panelLockState = { editLocked: false, pinned: false };
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

        const readPanelLockState = () => {
          const meta = safeGetPanelFigure(panelId)?.layout?.meta;
          const panelMeta = meta && typeof meta === 'object' ? meta.workspacePanel : null;
          return {
            editLocked: panelMeta?.editLocked === true,
            pinned: panelMeta?.pinned === true
          };
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
        const getOrderedInlineItems = () => actionItems
          .filter((item) => item && item.parentElement === controlsWrapper)
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

        const appendPopoverControl = (buttonEl, popoverEl) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'workspace-panel-action-wrapper';
          wrapper.appendChild(buttonEl);
          wrapper.appendChild(popoverEl);
          appendActionItem(wrapper);

          // generic portal wiring for all popovers
          registerPopoverButton(buttonEl, popoverEl);
        };

        cursorBtn = createToggleButton({
          icon: 'bi-crosshair',
          title: 'Toggle crosshair cursor',
          onClick: (isOn) => safeHandleHeaderAction(panelId, 'cursor', { on: isOn })
        });
        appendActionItem(cursorBtn);

        const axesBtn = document.createElement('button');
        axesBtn.type = 'button';
        axesBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        axesBtn.innerHTML = '<i class="bi bi-diagram-3"></i>';
        axesBtn.title = 'Axes options';
        axesBtn.setAttribute('aria-expanded', 'false');

        const axesPopover = document.createElement('div');
        axesPopover.className = 'workspace-panel-popover';
        axesPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Thickness</div>
            <div class="workspace-panel-popover-items" data-role="axes-thickness">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thin">Thin</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-thickness="medium">Medium</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-thickness="thick">Thick</button>
              <div class="ms-2 d-flex align-items-center gap-2" data-role="axes-thickness-custom">
                <input type="range" min="1" max="6" step="1"
                      class="form-range" style="width:140px" />
                <span class="small text-muted" data-readout>2px</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-apply>Apply</button>
              </div>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Visible sides</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-axes-visibility">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Top axis" data-side="top" aria-pressed="true"><i class="bi bi-arrow-up"></i></button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Bottom axis" data-side="bottom" aria-pressed="true"><i class="bi bi-arrow-down"></i></button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Left axis" data-side="left" aria-pressed="true"><i class="bi bi-arrow-left"></i></button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" title="Right axis" data-side="right" aria-pressed="true"><i class="bi bi-arrow-right"></i></button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Presets</div>
            <div class="workspace-panel-popover-items" data-role="axes-presets">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="all">All</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="none">None</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="xy">X + Y</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-preset="upright">Up + Right</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Scale (linear vs log)</div>
            <div class="workspace-panel-popover-items d-flex flex-column gap-2" data-role="axes-scale">
              <div class="btn-group" role="group" data-axis="x">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="x" data-scale="linear">X Linear</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="x" data-scale="log">X Log</button>
              </div>
              <div class="btn-group" role="group" data-axis="y">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="y" data-scale="linear">Y Linear</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-scale-axis="y" data-scale="log">Y Log</button>
              </div>
            </div>
          </div>
        `;

        axesPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const layout = figure.layout || {};
          const runtimeLayout = plotHost?.layout || {};
          const fullRuntimeLayout = plotHost?._fullLayout || {};
          const mergeAxis = (axisKey) => {
            const runtimeAxis = {
              ...(fullRuntimeLayout?.[axisKey] || {}),
              ...(runtimeLayout?.[axisKey] || {})
            };
            const modelAxis = layout[axisKey] || {};
            const minor = {
              ...(runtimeAxis.minor || {}),
              ...(modelAxis.minor || {})
            };
            return {
              ...runtimeAxis,
              ...modelAxis,
              minor
            };
          };
          const X = mergeAxis('xaxis');
          const Y = mergeAxis('yaxis');

          // Resolve which sides are ON from Plotly state
          const xOn = { top:false, bottom:false };
          const yOn = { left:false, right:false };
          if (X.visible === false) {
            // none
          } else if (X.mirror) {
            xOn.top = xOn.bottom = true;
          } else {
            xOn[(X.side || 'bottom')] = true; // 'top'|'bottom'
          }
          if (Y.visible === false) {
            // none
          } else if (Y.mirror) {
            yOn.left = yOn.right = true;
          } else {
            yOn[(Y.side || 'left')] = true; // 'left'|'right'
          }

          const cont = axesPopover.querySelector('.workspace-panel-popover-axes-visibility');
          const set = (side, on) => {
            const b = cont.querySelector(`[data-side="${side}"]`);
            if (!b) return;
            b.setAttribute('aria-pressed', String(on));
            b.classList.toggle('is-active', on);
          };
          ['top','bottom','left','right'].forEach(s => set(s, false));
          set('top', xOn.top);
          set('bottom', xOn.bottom);
          set('left', yOn.left);
          set('right', yOn.right);

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
            const t = e.target.closest('[data-thickness],[data-side],[data-preset],[data-apply],[data-scale-axis]');
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
              e.stopPropagation();
              return;
            }

            // 4) Custom slider "Apply"
            if (t.hasAttribute('data-apply')) {
              const sliderWrap = axesPopover.querySelector('[data-role="axes-thickness-custom"]');
              const slider = sliderWrap?.querySelector('input[type="range"]');
              const readout = sliderWrap?.querySelector('[data-readout]');
              const px = Math.max(1, Math.round(Number(slider?.value || 2)));
              if (readout) readout.textContent = `${px}px`;

              // deselect pills; this is a custom value
              axesPopover
                .querySelectorAll('[data-role="axes-thickness"] .workspace-panel-popover-btn[data-thickness]')
                .forEach((b) => b.classList.remove('is-active'));

              safeHandleHeaderAction(panelId, 'axes-thickness-custom', { value: px });
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
        appendPopoverControl(axesBtn, axesPopover);

        const axisLabelsBtn = document.createElement('button');
        axisLabelsBtn.type = 'button';
        axisLabelsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        axisLabelsBtn.innerHTML = '<i class="bi bi-type"></i>';
        axisLabelsBtn.title = 'Axis labels';
        axisLabelsBtn.setAttribute('aria-expanded', 'false');

        const axisLabelsPopover = document.createElement('div');
        axisLabelsPopover.className = 'workspace-panel-popover workspace-panel-popover-axis-labels';
        axisLabelsPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Visibility</div>
            <div class="workspace-panel-popover-items" data-role="axis-labels-toggle">
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-labels="show">Show labels</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-labels="hide">Hide labels</button>
            </div>
          </div>
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
              <button type="button" class="btn btn-outline-secondary btn-sm workspace-panel-popover-btn" data-font-weight="bold">Bold</button>
            </div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap">
              <label class="small text-muted mb-0">Size</label>
              <input type="number" min="6" max="36" step="1" value="12" class="form-control form-control-sm" data-font-size style="width: 72px" />
              <label class="small text-muted mb-0">Color</label>
              <input type="color" value="#000000" class="form-control form-control-color form-control-sm" data-font-color title="Axis title color" />
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Layout</div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2">
              <span class="small text-muted">Angle</span>
              <input type="range" min="-90" max="90" step="5" value="0" class="form-range" style="width:160px" data-angle />
              <span class="small text-muted" data-readout-angle>0°</span>
            </div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2">
              <span class="small text-muted">Distance</span>
              <input type="range" min="0" max="80" step="2" value="10" class="form-range" style="width:160px" data-distance />
              <span class="small text-muted" data-readout-distance>10px</span>
            </div>
          </div>
        `;

        axisLabelsPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const layout = figure.layout || {};
          const runtimeLayout = plotHost?.layout || {};
          const fullRuntimeLayout = plotHost?._fullLayout || {};
          const mergeAxis = (axisKey) => {
            const runtimeAxis = {
              ...(fullRuntimeLayout?.[axisKey] || {}),
              ...(runtimeLayout?.[axisKey] || {})
            };
            const modelAxis = layout[axisKey] || {};
            const title = {
              ...(runtimeAxis.title || {}),
              ...(modelAxis.title || {})
            };
            return {
              ...runtimeAxis,
              ...modelAxis,
              title
            };
          };
          const X = mergeAxis('xaxis');
          const Y = mergeAxis('yaxis');

          const visibility = axisLabelsPopover.querySelector('[data-role="axis-labels-toggle"]');
          if (visibility) {
            const labelsOn = (X.showticklabels !== false) && (Y.showticklabels !== false);
            visibility.querySelectorAll('[data-labels]').forEach((btn) => {
              const isShow = btn.dataset.labels === 'show';
              btn.classList.toggle('is-active', isShow === labelsOn);
              btn.setAttribute('aria-pressed', String(isShow === labelsOn));
            });
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
            const angle = Number(X.title?.textangle ?? Y.title?.textangle ?? 0);
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

        axisLabelsPopover.addEventListener('click', (event) => event.stopPropagation());

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

        axisLabelsPopover.addEventListener('change', (e) => {
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

        appendPopoverControl(axisLabelsBtn, axisLabelsPopover);

          // === Major Grid (header toggle) ==============================================
          const currentLayout = safeGetPanelFigure(panelId).layout || {};
          const isMajorGridOn = Boolean(currentLayout?.xaxis?.showgrid || currentLayout?.yaxis?.showgrid);

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
          gridBtn.setAttribute('aria-pressed', String(isMajorGridOn));
          gridBtn.classList.toggle('is-active', isMajorGridOn);

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
            gridBtn.setAttribute('aria-pressed', String(majorOn));
            gridBtn.classList.toggle('is-active', majorOn);

            const isMinorOn = !!(L?.xaxis?.minor?.showgrid || L?.yaxis?.minor?.showgrid);
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
              gridBtn.setAttribute('aria-pressed', String(on));
              gridBtn.classList.toggle('is-active', on);
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
          appendPopoverControl(gridBtn, gridPopover);
          const ticksBtn = document.createElement('button');
          ticksBtn.type = 'button';
          ticksBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
          ticksBtn.innerHTML = '<i class="bi bi-distribute-vertical"></i>';
          ticksBtn.title = 'Tick options';
          ticksBtn.setAttribute('aria-expanded', 'false');

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

          const mplace = X.minor?.ticks || 'outside';
          ticksPopover.querySelectorAll('[data-role="ticks-minor"] [data-minor-placement]')
            .forEach(b => {
              const val = b.dataset.minorPlacement;   // ╬ô┬ú├á correct
              const active = (mplace === '' && val === 'none') || (mplace === val);
              b.classList.toggle('is-active', active);
            });
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
            e.stopPropagation();
            return;
          }

          // Minor placement
          if (t.dataset.minorPlacement) {
            const val = t.dataset.minorPlacement; // 'outside'|'inside'|'none'
            const group = ticksPopover.querySelector('[data-role="ticks-minor"]');
            group.querySelectorAll('[data-minor-placement]').forEach(b => b.classList.toggle('is-active', b === t));

            safeHandleHeaderAction(panelId, 'ticks-minor-placement', { placement: (val === 'none' ? '' : val) });
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

        appendPopoverControl(ticksBtn, ticksPopover);

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
        appendActionItem(legendBtn);

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

        appendPopoverControl(stylePainterBtn, stylePainterPopover);
        stylePainterBtn.addEventListener('click', () => {
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
        appendPopoverControl(templatesBtn, templatesPopover);

        const graphHidden = panelState?.hidden === true;
        graphVisibilityBtn = createToggleButton({
          icon: graphHidden ? 'bi-eye-slash' : 'bi-eye',
          title: graphHidden ? 'Show graph' : 'Hide graph',
          pressed: graphHidden,
          onClick: (isOn) => safePanelVisibilityToggle(panelId, { hidden: isOn })
        });
        graphVisibilityBtn.dataset.panelAction = 'graph-visibility';
        appendActionItem(graphVisibilityBtn);

        panelLockState = readPanelLockState();
        const lockBtn = createToggleButton({
          icon: 'bi-lock',
          title: 'Lock graph',
          pressed: panelLockState.editLocked,
          onClick: (isOn) => safePanelLockToggle(panelId, { on: isOn })
        });
        lockBtn.dataset.panelAction = 'lock';
        appendActionItem(lockBtn);

        const pinBtn = createToggleButton({
          icon: 'bi-pin-angle',
          title: 'Pin position',
          pressed: panelLockState.pinned,
          onClick: (isOn) => safePanelPinToggle(panelId, { on: isOn })
        });
        pinBtn.dataset.panelAction = 'pin';
        appendActionItem(pinBtn);

        const annotationsBtn = document.createElement('button');
        annotationsBtn.type = 'button';
        annotationsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
        annotationsBtn.innerHTML = '<i class="bi bi-chat-square-text"></i>';
        annotationsBtn.title = 'Annotation tips';
        annotationsBtn.setAttribute('aria-expanded', 'false');

        const annotationsPopover = document.createElement('div');
        annotationsPopover.className = 'workspace-panel-popover workspace-panel-popover-annotations';
        annotationsPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Annotations</div>
            <div class="workspace-panel-popover-items flex-column gap-2">
              <p class="small mb-0">Use Plotly's drawing tools to add callouts:</p>
              <ul class="small mb-1 ps-3">
                <li>Hover the chart to reveal the mode bar and choose <strong>Draw text</strong> to drop notes.</li>
                <li>Double-click an annotation to edit text or drag to reposition.</li>
                <li>Hold <kbd>Shift</kbd> while dragging to keep annotations aligned.</li>
              </ul>
              <button type="button" class="btn btn-outline-secondary btn-sm align-self-start" data-annotation-guide>Plotly annotation guide</button>
            </div>
          </div>
        `;
        annotationsPopover.addEventListener('click', (event) => {
          if (event.target.matches('[data-annotation-guide]')) {
            if (typeof window !== 'undefined' && typeof window.open === 'function') {
              window.open('https://plotly.com/javascript/text-and-annotations/', '_blank', 'noopener');
            }
            event.stopPropagation();
          }
        });
        appendPopoverControl(annotationsBtn, annotationsPopover);

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
            <div class="workspace-panel-popover-items justify-content-end">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-snapshot-save-preset>Save as custom preset</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Format</div>
            <div class="workspace-panel-popover-items workspace-panel-popover-choice" data-snapshot-format>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-format="png">PNG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="svg">SVG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="jpeg">JPEG</button>
              <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-format="webp">WebP</button>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Size</div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap">
              <label class="small text-muted mb-0">Width</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-width style="width: 70px" />
              <label class="small text-muted mb-0">Height</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-height style="width: 70px" />
              <button type="button" class="btn btn-outline-secondary btn-sm" data-snapshot-size-reset>Reset</button>
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
            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-snapshot-cancel>Close</button>
              <button type="button" class="btn btn-primary btn-sm" data-snapshot-capture>Capture</button>
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
            e.stopPropagation();
            return;
          }
          if (e.target.matches('[data-snapshot-cancel]')) {
            snapshotPopover.__close?.();
            e.stopPropagation();
          }
        });

        appendPopoverControl(snapshotBtn, snapshotPopover);

        const fullscreenBtn = createToggleButton({
          icon: 'bi-arrows-fullscreen',
          title: 'Fullscreen panel',
          onClick: (isOn, btn) => {
            btn.innerHTML = isOn ? '<i class="bi bi-arrows-angle-contract"></i>' : '<i class="bi bi-arrows-fullscreen"></i>';
            btn.title = isOn ? 'Exit fullscreen' : 'Fullscreen panel';
            safeHandleHeaderAction(panelId, 'toggle-fullscreen', { on: isOn });
          }
        });
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
        settingsBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-toggle';
        settingsBtn.innerHTML = '<i class="bi bi-gear-wide"></i>';
        settingsBtn.title = 'Hide graph tools';
        settingsBtn.setAttribute('aria-pressed', 'false');

        const updateSettingsToggle = (collapsed) => {
          settingsBtn.setAttribute('aria-pressed', String(collapsed));
          settingsBtn.innerHTML = collapsed ? '<i class="bi bi-gear-fill"></i>' : '<i class="bi bi-gear-wide"></i>';
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

        const detectInlineWrap = () => {
          const inlineItems = getOrderedInlineItems();
          if (inlineItems.length <= 1) return false;
          const referenceRect = inlineItems[0]?.getBoundingClientRect();
          if (!referenceRect || !Number.isFinite(referenceRect.top)) return false;
          const baseTop = referenceRect.top;
          return inlineItems.some((item) => {
            const rect = item.getBoundingClientRect();
            if (!rect || !Number.isFinite(rect.top)) return false;
            return Math.abs(rect.top - baseTop) > 1.5;
          });
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
          let wrapped = detectInlineWrap();
          let guard = 0;
          while (wrapped && guard < actionItems.length) {
            const inlineItems = getOrderedInlineItems();
            if (!inlineItems.length) break;
            const candidate = inlineItems[inlineItems.length - 1];
            moveItemToOverflow(candidate);
            wrapped = detectInlineWrap();
            guard += 1;
          }
          const hasOverflow = overflowPanel && overflowPanel.childElementCount > 0;
          if (preserveMenuState && menuWasOpen && hasOverflow) {
            openOverflowMenu();
          }
          return hasOverflow;
        };

        refreshActionOverflow = () => {
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

        actions.appendChild(controlsWrapper);
        actions.appendChild(overflowPanel);
        actions.appendChild(overflowBtn);
        actions.appendChild(settingsBtn);
        actions.appendChild(closeBtn);
        applyHeaderLockState(panelLockState);
        } else {
          let fullscreenEnabled = false;
          const nonPlotFullscreenBtn = document.createElement('button');
          nonPlotFullscreenBtn.type = 'button';
          nonPlotFullscreenBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
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

          if (isMarkdownPanel) {
            markdownPreviewToggleBtn = document.createElement('button');
            markdownPreviewToggleBtn.type = 'button';
            markdownPreviewToggleBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-markdown-preview-toggle';
            markdownPreviewToggleBtn.addEventListener('click', () => {
              if (!contentHandles) return;
              const currentMode = contentHandles.getMode?.() || 'split';
              const nextMode = currentMode === 'edit' ? 'split' : 'edit';
              contentHandles.setMode?.(nextMode);
              updateMarkdownPreviewToggle();
            });
            updateMarkdownPreviewToggle();
            actions.appendChild(markdownPreviewToggleBtn);

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
            actions.appendChild(infoActionWrapper);
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

          actions.appendChild(nonPlotFullscreenBtn);

          const closeBtn = document.createElement('button');
          closeBtn.type = 'button';
          closeBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn--close';
          closeBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
          closeBtn.title = 'Close panel';
          closeBtn.addEventListener('click', () => {
            safeRemovePanel(panelState.id);
          });
          actions.appendChild(closeBtn);
        }
        if (headerTagBadge) {
          header.appendChild(headerTagBadge);
        }
        header.appendChild(title);
        header.appendChild(actions);
        refreshActionOverflow();
        if (typeof queueMicrotask === 'function') {
          queueMicrotask(refreshActionOverflow);
        } else {
          Promise.resolve().then(refreshActionOverflow);
        }

        const body = document.createElement('div');
        body.className = 'workspace-panel-body';

        const plotHost = document.createElement('div');
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
        const resolvedPlotHost = contentHandles?.plotEl ?? (isPlotPanel ? plotHost : null);

        const domHandles = {
          rootEl: panelEl,
          headerEl: header,
          titleEl: title,
          plotEl: resolvedPlotHost,
          cursorButton: cursorBtn,
          stylePainterButton: stylePainterBtn,
          stylePainterPopover,
          graphVisibilityButton: graphVisibilityBtn,
          runtime,
          contentHandles
        };
        safeRegisterPanelDom(panelId, domHandles);
        safeUpdatePanelRuntime(panelId, { refreshActionOverflow });
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
