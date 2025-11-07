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
    startPanelRename = () => {}
  } = actions;

  const {
    getPanelFigure = () => ({ data: [], layout: {} })
  } = selectors;

  const safeRegisterPanelDom = typeof registerPanelDom === 'function' ? registerPanelDom : () => {};
  const safeUpdatePanelRuntime = typeof updatePanelRuntime === 'function' ? updatePanelRuntime : () => {};
  const safeHandleHeaderAction = typeof handleHeaderAction === 'function' ? handleHeaderAction : () => {};
  const safeRemovePanel = typeof removePanel === 'function' ? removePanel : () => {};
  const safeBringPanelToFront = typeof bringPanelToFront === 'function' ? bringPanelToFront : () => {};
  const safeUpdateToolbarMetrics = typeof updateToolbarMetrics === 'function' ? updateToolbarMetrics : () => {};
  const safeGetPanelFigure = typeof getPanelFigure === 'function' ? getPanelFigure : (() => ({ data: [], layout: {} }));

  const mountPanel = ({ panelId, panelState, runtime } = {}) => {
    if (!panelId || !panelState) return null;
        const panelEl = document.createElement('div');
        panelEl.className = 'workspace-panel';
        panelEl.dataset.panelId = panelId;
        panelEl.dataset.graphIndex = String(panelState.index);
        const initialTitle = (typeof panelState.title === 'string' && panelState.title.trim())
          ? panelState.title.trim()
          : (Number.isInteger(panelState.index) && panelState.index > 0 ? `Graph ${panelState.index}` : 'Graph');
        panelEl.dataset.graphTitle = initialTitle;

        const header = document.createElement('div');
        header.className = 'workspace-panel-header';

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
              onClick(next, btn);
            }
          });
          return btn;
        };

        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'workspace-panel-actions-collection';
        controlsWrapper.setAttribute('aria-hidden', 'false');

        const appendPopoverControl = (buttonEl, popoverEl) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'workspace-panel-action-wrapper';
          wrapper.appendChild(buttonEl);
          wrapper.appendChild(popoverEl);
          controlsWrapper.appendChild(wrapper);

          // generic portal wiring for all popovers
          registerPopoverButton(buttonEl, popoverEl);
        };

        const cursorBtn = createToggleButton({
          icon: 'bi-crosshair',
          title: 'Toggle crosshair cursor',
          onClick: (isOn) => safeHandleHeaderAction(panelId, 'cursor', { on: isOn })
        });
        controlsWrapper.appendChild(cursorBtn);

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

        function getUIPortal(){
          let n = document.querySelector('.ui-portal');
          if(!n){ n = document.createElement('div'); n.className='ui-portal'; document.body.appendChild(n); }
          return n;
        }
        function placePopoverAbove(btn, pop){
          const r = btn.getBoundingClientRect();
          pop.style.left = `${r.left + r.width/2}px`;
          pop.style.top  = `${r.top}px`;        // top edge of button; CSS translate lifts it above
        }
        function openPortaledPopover(btn, pop){
          const portal = getUIPortal();
          pop.__origParent = pop.parentElement;
          portal.appendChild(pop);
          placePopoverAbove(btn, pop);
          pop.classList.add('is-open');
          btn.setAttribute('aria-expanded','true');

          pop.__reflow = () => placePopoverAbove(btn, pop);
          window.addEventListener('scroll', pop.__reflow, true);
          window.addEventListener('resize', pop.__reflow, true);
        }
        function closePortaledPopover(btn, pop){
          pop.classList.remove('is-open');
          btn.setAttribute('aria-expanded','false');
          if(pop.__origParent) pop.__origParent.appendChild(pop);
          window.removeEventListener('scroll', pop.__reflow, true);
          window.removeEventListener('resize', pop.__reflow, true);
          delete pop.__reflow; delete pop.__origParent;
        }

        function readPopoverOpts(btn){
          return {
            side:  btn.dataset.popSide  || 'up',     // 'up' | 'down'
            align: btn.dataset.popAlign || 'center', // 'center' | 'left' | 'right'
            dx:    Number(btn.dataset.popDx || 0),
            dy:    Number(btn.dataset.popDy || 10)
          };
        }

        function registerPopoverButton(btn, pop){
          // ensure aria state
          btn.setAttribute('aria-expanded','false');

          const open = () => {
            if (typeof pop.onOpen === 'function') pop.onOpen();
            openPortaledPopover(btn, pop);
          };
          const close = () => closePortaledPopover(btn, pop);

          const onBtnClick = (e) => {
            e.stopPropagation();
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            isOpen ? close() : open();
          };
          btn.addEventListener('click', onBtnClick);

          // outside-click close
          const onDocClick = (e) => {
            const isOpen = btn.getAttribute('aria-expanded') === 'true';
            if (!isOpen) return;
            if (!pop.contains(e.target) && !btn.contains(e.target)) close();
          };
          document.addEventListener('click', onDocClick, { capture:true });

          pop.__btn = btn;
          pop.__close = close;
        }

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
        controlsWrapper.appendChild(legendBtn);

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
        snapshotBtn.dataset.snapshotScale = '2';
        snapshotBtn.dataset.snapshotResolution = 'native';
        snapshotBtn.dataset.snapshotBackground = 'white';

        const snapshotPopover = document.createElement('div');
        snapshotPopover.className = 'workspace-panel-popover workspace-panel-popover-snapshot';
        snapshotPopover.innerHTML = `
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Format</div>
            <div class="workspace-panel-popover-items">
              <select class="form-select form-select-sm" data-snapshot-format>
                <option value="png">PNG</option>
                <option value="svg">SVG</option>
                <option value="jpeg">JPEG</option>
                <option value="webp">WebP</option>
              </select>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Size</div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap">
              <label class="small text-muted mb-0">Width</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-width placeholder="Auto" style="width: 65px" />
              <label class="small text-muted mb-0">Height</label>
              <input type="number" min="200" step="50" class="form-control form-control-sm" data-snapshot-height placeholder="Auto" style="width: 65px" />
            </div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2">
              <span class="small text-muted">Scale</span>
              <input type="range" min="1" max="4" step="1" value="2" class="form-range" style="width:160px" data-snapshot-scale />
              <span class="small text-muted" data-snapshot-scale-readout>2x</span>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Quality</div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2 flex-wrap">
              <label class="small text-muted mb-0">Resolution</label>
              <select class="form-select form-select-sm" data-snapshot-resolution style="width: 140px">
                <option value="native">Native (default)</option>
                <option value="2x">High (2x)</option>
                <option value="4x">Ultra (4x)</option>
              </select>
            </div>
            <div class="workspace-panel-popover-items d-flex align-items-center gap-2">
              <span class="small text-muted">Background</span>
              <div class="btn-group btn-group-sm" role="group" data-snapshot-background>
                <button type="button" class="btn btn-outline-secondary is-active" data-bg="white">White</button>
                <button type="button" class="btn btn-outline-secondary" data-bg="transparent">Transparent</button>
              </div>
            </div>
          </div>
          <div class="workspace-panel-popover-section">
            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-outline-secondary btn-sm" data-snapshot-cancel>Close</button>
              <button type="button" class="btn btn-primary btn-sm" data-snapshot-capture>Capture</button>
            </div>
          </div>
        `;

        snapshotPopover.onOpen = () => {
          const formatSelect = snapshotPopover.querySelector('[data-snapshot-format]');
          if (formatSelect) {
            formatSelect.value = snapshotBtn.dataset.snapshotFormat || 'png';
          }
          const widthInput = snapshotPopover.querySelector('[data-snapshot-width]');
          if (widthInput) {
            widthInput.value = snapshotBtn.dataset.snapshotWidth || '';
          }
          const heightInput = snapshotPopover.querySelector('[data-snapshot-height]');
          if (heightInput) {
            heightInput.value = snapshotBtn.dataset.snapshotHeight || '';
          }
          const scaleInput = snapshotPopover.querySelector('[data-snapshot-scale]');
          const scaleReadout = snapshotPopover.querySelector('[data-snapshot-scale-readout]');
          if (scaleInput && scaleReadout) {
            const scaleValue = snapshotBtn.dataset.snapshotScale || '2';
            scaleInput.value = scaleValue;
            scaleReadout.textContent = `${scaleValue}x`;
          }
          const resolutionSelect = snapshotPopover.querySelector('[data-snapshot-resolution]');
          if (resolutionSelect) {
            resolutionSelect.value = snapshotBtn.dataset.snapshotResolution || 'native';
          }
          const backgroundGroup = snapshotPopover.querySelector('[data-snapshot-background]');
          if (backgroundGroup) {
            const activeBg = snapshotBtn.dataset.snapshotBackground || 'white';
            backgroundGroup.querySelectorAll('button[data-bg]').forEach((btn) => {
              const isActive = btn.dataset.bg === activeBg;
              btn.classList.toggle('is-active', isActive);
              btn.setAttribute('aria-pressed', String(isActive));
            });
          }
        };

        snapshotPopover.addEventListener('change', (e) => {
          if (e.target.matches('[data-snapshot-format]')) {
            snapshotBtn.dataset.snapshotFormat = e.target.value;
            e.stopPropagation();
          }
          if (e.target.matches('[data-snapshot-width]')) {
            const raw = e.target.value.trim();
            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric > 0) {
              const rounded = Math.round(numeric);
              snapshotBtn.dataset.snapshotWidth = String(rounded);
              e.target.value = String(rounded);
            } else {
              delete snapshotBtn.dataset.snapshotWidth;
              e.target.value = '';
            }
            e.stopPropagation();
          }
          if (e.target.matches('[data-snapshot-height]')) {
            const raw = e.target.value.trim();
            const numeric = Number(raw);
            if (Number.isFinite(numeric) && numeric > 0) {
              const rounded = Math.round(numeric);
              snapshotBtn.dataset.snapshotHeight = String(rounded);
              e.target.value = String(rounded);
            } else {
              delete snapshotBtn.dataset.snapshotHeight;
              e.target.value = '';
            }
            e.stopPropagation();
          }
          if (e.target.matches('[data-snapshot-resolution]')) {
            snapshotBtn.dataset.snapshotResolution = e.target.value;
            e.stopPropagation();
          }
        });

        snapshotPopover.addEventListener('input', (e) => {
          if (e.target.matches('[data-snapshot-scale]')) {
            const scaleReadout = snapshotPopover.querySelector('[data-snapshot-scale-readout]');
            const value = e.target.value || '1';
            if (scaleReadout) scaleReadout.textContent = `${value}x`;
            snapshotBtn.dataset.snapshotScale = value;
            e.stopPropagation();
          }
        });

        snapshotPopover.addEventListener('click', (e) => {
          const backgroundButton = e.target.closest('[data-snapshot-background] button[data-bg]');
          if (backgroundButton) {
            const chosen = backgroundButton.dataset.bg || 'white';
            const group = snapshotPopover.querySelector('[data-snapshot-background]');
            if (group) {
              group.querySelectorAll('button[data-bg]').forEach((btn) => {
                const isActive = btn === backgroundButton;
                btn.classList.toggle('is-active', isActive);
                btn.setAttribute('aria-pressed', String(isActive));
              });
            }
            snapshotBtn.dataset.snapshotBackground = chosen;
            e.stopPropagation();
            return;
          }

          if (e.target.matches('[data-snapshot-capture]')) {
            const format = snapshotBtn.dataset.snapshotFormat || 'png';
            const scaleNumeric = Number(snapshotBtn.dataset.snapshotScale);
            const widthNumeric = Number(snapshotBtn.dataset.snapshotWidth);
            const heightNumeric = Number(snapshotBtn.dataset.snapshotHeight);
            const payload = {
              format,
              scale: Number.isFinite(scaleNumeric) && scaleNumeric > 0 ? scaleNumeric : 2
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
        controlsWrapper.appendChild(fullscreenBtn);

        const overflowBtn = document.createElement('button');
        overflowBtn.type = 'button';
        overflowBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-actions-overflow';
        overflowBtn.innerHTML = '<i class="bi bi-three-dots"></i>';
        overflowBtn.title = 'More tools';
        overflowBtn.setAttribute('aria-expanded', 'false');
        overflowBtn.hidden = true;

        let overflowOutsideActive = false;
        let handleOverflowOutside = () => {};
        const closeOverflowMenu = () => {
          if (controlsWrapper.classList.contains('is-expanded')) {
            controlsWrapper.classList.remove('is-expanded');
          }
          overflowBtn.classList.remove('is-active');
          overflowBtn.setAttribute('aria-expanded', 'false');
          if (overflowOutsideActive) {
            document.removeEventListener('click', handleOverflowOutside);
            overflowOutsideActive = false;
          }
        };
        registerPopoverCloser(closeOverflowMenu);
        controlsWrapper.__close = closeOverflowMenu;
        handleOverflowOutside = (event) => {
          if (controlsWrapper.contains(event.target) || overflowBtn.contains(event.target)) return;
          closeOverflowMenu();
        };

        overflowBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          const willOpen = !controlsWrapper.classList.contains('is-expanded');
          closeAllPopovers(willOpen ? closeOverflowMenu : null);
          if (willOpen) {
            controlsWrapper.classList.add('is-expanded');
            overflowBtn.classList.add('is-active');
            overflowBtn.setAttribute('aria-expanded', 'true');
            document.addEventListener('click', handleOverflowOutside);
            overflowOutsideActive = true;
          } else {
            closeOverflowMenu();
          }
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'btn btn-outline-secondary';
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

        const refreshActionOverflow = () => {
          const collapsed = controlsWrapper.classList.contains('is-collapsed');
          const expanded = controlsWrapper.classList.contains('is-expanded');
          if (expanded) {
            controlsWrapper.classList.remove('is-expanded');
          }
          const computeAvailableWidth = () => {
            if (!actions) return controlsWrapper.clientWidth;
            const staticButtons = (settingsBtn?.offsetWidth || 0) + (closeBtn?.offsetWidth || 0);
            const overflowReserve = !overflowBtn.hidden ? (overflowBtn.offsetWidth || 0) : 0;
            const gutter = 8;
            const budget = actions.clientWidth - staticButtons - overflowReserve - gutter;
            return Math.max(budget, controlsWrapper.clientWidth, 0);
          };
          const rawOverflow = controlsWrapper.scrollWidth - controlsWrapper.clientWidth > 1;
          const budgetOverflow = controlsWrapper.scrollWidth - computeAvailableWidth() > 1;
          const isOverflowing = !collapsed && (rawOverflow || budgetOverflow);
          if (!isOverflowing) {
            closeOverflowMenu();
          } else if (expanded) {
            controlsWrapper.classList.add('is-expanded');
            overflowBtn.classList.add('is-active');
            overflowBtn.setAttribute('aria-expanded', 'true');
            if (!overflowOutsideActive) {
              document.addEventListener('click', handleOverflowOutside);
              overflowOutsideActive = true;
            }
          }
          overflowBtn.hidden = !isOverflowing;
          actions.classList.toggle('has-overflow', isOverflowing);
        };
        if (typeof ResizeObserver === 'function') {
          const resizeObserver = new ResizeObserver(() => refreshActionOverflow());
          resizeObserver.observe(actions);
        }

        actions.appendChild(controlsWrapper);
        actions.appendChild(overflowBtn);
        actions.appendChild(settingsBtn);
        actions.appendChild(closeBtn);
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

        safeRegisterPanelDom(panelId, {
          rootEl: panelEl,
          headerEl: header,
          titleEl: title,
          plotEl: plotHost,
          runtime
        });
        safeUpdatePanelRuntime(panelId, { refreshActionOverflow });
        panelEl.addEventListener('pointerdown', (evt) => {
          if (typeof evt.button === 'number' && evt.button !== 0) return;
          safeBringPanelToFront(panelId);
        });
        panelEl.addEventListener('focusin', () => safeBringPanelToFront(panelId));

    return {
      rootEl: panelEl,
      headerEl: header,
      plotEl: plotHost,
      refreshActionOverflow
    };
  };

  return {
    mountPanel
  };
}
