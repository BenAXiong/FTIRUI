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
    updateToolbarMetrics = () => {}
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

        const header = document.createElement('div');
        header.className = 'workspace-panel-header';

        const title = document.createElement('div');
        title.className = 'workspace-panel-title';
        title.textContent = `Graph ${panelState.index}`;

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
        `;

        axesPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const L = figure.layout || {};
          const X = L.xaxis || {};
          const Y = L.yaxis || {};

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
        };

        axesPopover.addEventListener('input', (e) => {
          const slider = e.target.closest('[data-role="axes-thickness-custom"] input[type="range"]');
          if (!slider) return;
          const wrap = slider.closest('[data-role="axes-thickness-custom"]');
          const r = wrap.querySelector('[data-readout]');
          if (r) r.textContent = `${slider.value}px`;
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
            const t = e.target.closest('[data-thickness],[data-side],[data-preset],[data-apply]');
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
          });

          axesPopover.__close = closeAxesPopover;
          appendPopoverControl(axesBtn, axesPopover);

          // === Major Grid (header toggle) ==============================================
          const figureForLayout = safeGetPanelFigure(panelId);
          const currentLayout = figureForLayout.layout || {};
          const isMajorGridOn = Boolean(currentLayout?.xaxis?.showgrid || currentLayout?.yaxis?.showgrid);

          const gridMajorBtn = createToggleButton({
            icon: 'bi-grid-3x3-gap',
            title: 'Toggle major grid',
            pressed: isMajorGridOn,
            onClick: (on) => safeHandleHeaderAction(panelId, 'grid-major', { on })
          });
          controlsWrapper.appendChild(gridMajorBtn);

          // === Grid (popover) : minor grid controls ===================================
          const gridBtn = document.createElement('button');
          gridBtn.type = 'button';
          gridBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn workspace-panel-action-btn-popover';
          gridBtn.innerHTML = '<i class="bi bi-grid"></i>';
          gridBtn.title = 'Minor grid options';
          gridBtn.setAttribute('aria-expanded', 'false');

          const gridPopover = document.createElement('div');
          gridPopover.className = 'workspace-panel-popover';
          gridPopover.innerHTML = `
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
                <input type="range" min="1" max="10" step="1" class="form-range" style="width:160px" />
                <span class="small text-muted ms-2" data-readout>2</span>
                <button type="button" class="btn btn-sm btn-outline-secondary ms-2" data-apply>Apply</button>
              </div>
              <div class="form-text">Sets minor grid at 1/(N+1) of the major tick spacing.</div>
            </div>
          `;

          // Sync UI to current layout on open
          gridPopover.onOpen = () => {
            const figure = safeGetPanelFigure(panelId);
            const L = figure.layout || {};
            const isMinorOn = !!(L?.xaxis?.minor?.showgrid || L?.yaxis?.minor?.showgrid);
            const minorToggle = gridPopover.querySelector('[data-role="minor-toggle"]');
            minorToggle.querySelectorAll('.workspace-panel-popover-btn').forEach(b => {
              const on = (b.dataset.minor === 'on');
              b.classList.toggle('is-active', on === isMinorOn);
            });

            // Try to infer current subdivisions from dtick ratio (if numeric)
            const xn = Number(L?.xaxis?.minor?.dtick);
            const xd = Number(L?.xaxis?.dtick);
            let sub = 2; // default
            if (Number.isFinite(xn) && Number.isFinite(xd) && xn > 0) {
              const est = Math.round(xd / xn - 1);
              if (est >= 1 && est <= 10) sub = est;
            }
            const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
            wrap.querySelector('input[type="range"]').value = String(sub);
            wrap.querySelector('[data-readout]').textContent = String(sub);
          };

          // Local click handlers ╬ô├Ñ├å central dispatcher
          gridPopover.addEventListener('click', (e) => {
            const t = e.target.closest('[data-minor],[data-apply]');
            if (!t) return;

            if (t.dataset.minor) {
              const on = t.dataset.minor === 'on';
              // toggle buttons UI
              const group = gridPopover.querySelector('[data-role="minor-toggle"]');
              group.querySelectorAll('.workspace-panel-popover-btn').forEach(b =>
                b.classList.toggle('is-active', b === t)
              );
              safeHandleHeaderAction(panelId, 'grid-minor', { on });
              e.stopPropagation();
              return;
            }

            if (t.hasAttribute('data-apply')) {
              const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
              const val = Number(wrap.querySelector('input[type="range"]').value || 2);
              wrap.querySelector('[data-readout]').textContent = String(val);
              safeHandleHeaderAction(panelId, 'grid-minor-subdiv', { subdiv: Math.max(1, Math.min(10, Math.round(val))) });
              e.stopPropagation();
              return;
            }
          });

          // Live readout while sliding (optional)
          gridPopover.addEventListener('input', (e) => {
            const r = e.target.closest('[data-role="minor-subdiv"] input[type="range"]');
            if (!r) return;
            const wrap = gridPopover.querySelector('[data-role="minor-subdiv"]');
            wrap.querySelector('[data-readout]').textContent = String(r.value);
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
            <div class="workspace-panel-popover-label">Major</div>
            <div class="workspace-panel-popover-items" data-role="ticks-major">
              <div class="btn-group" role="group" aria-label="Major placement">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-placement="outside">Outside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="inside">Inside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-placement="none">None</button>
              </div>
              <button type="button" class="btn btn-outline-secondary ms-2 workspace-panel-popover-btn" data-labels="toggle">Labels</button>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-offset">
                <span class="small text-muted">Tick start</span>
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="X╬ô├⌐├ç">
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="Y╬ô├⌐├ç">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-apply-offset>Apply</button>
              </div>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-major-dtick">
                <span class="small text-muted">Spacing</span>
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="Γò¼├╢X">
                <input type="number" step="any" class="form-control form-control-sm" style="width:90px" placeholder="Γò¼├╢Y">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-apply-dtick>Apply</button>
              </div>
            </div>
          </div>

          <div class="workspace-panel-popover-section">
            <div class="workspace-panel-popover-label">Minor</div>
            <div class="workspace-panel-popover-items" data-role="ticks-minor">
              <div class="btn-group" role="group" aria-label="Minor placement">
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="outside">Outside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn" data-minor-placement="inside">Inside</button>
                <button type="button" class="btn btn-outline-secondary workspace-panel-popover-btn is-active" data-minor-placement="none">None</button>
              </div>
              <div class="ms-3 d-flex align-items-center gap-2" data-role="ticks-subdiv">
                <span class="small text-muted">Subdivisions</span>
                <input type="range" min="1" max="10" step="1" class="form-range" style="width:120px" />
                <span class="small text-muted" data-readout>2</span>
              </div>
            </div>
            <div class="form-text">Minor ticks between majors (N per interval).</div>
          </div>
        `;

        ticksPopover.onOpen = () => {
          const figure = safeGetPanelFigure(panelId);
          const L = figure.layout || {};
          const X = L.xaxis || {};
          const Y = L.yaxis || {};

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
            const xInput = offWrap.querySelector('input[placeholder="X╬ô├⌐├ç"]');
            const yInput = offWrap.querySelector('input[placeholder="Y╬ô├⌐├ç"]');
            xInput.value = (X.tick0 != null && X.tick0 !== '') ? String(X.tick0) : '';
            yInput.value = (Y.tick0 != null && Y.tick0 !== '') ? String(Y.tick0) : '';
          }

          // Subdivisions: infer from dtick ratio if numeric, else default 2
          const xn = Number(X.minor?.dtick);
          const xd = Number(X.dtick);
          let sub = 2;
          if (Number.isFinite(xn) && Number.isFinite(xd) && xn > 0) {
            const est = Math.round(xd / xn - 1);
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
            dtWrap.querySelector('input[placeholder="Γò¼├╢X"]').value = Number.isFinite(dx) ? String(dx) : '';
            dtWrap.querySelector('input[placeholder="Γò¼├╢Y"]').value = Number.isFinite(dy) ? String(dy) : '';
          }

          const mplace = (X.minor?.ticks ?? '');
          ticksPopover.querySelectorAll('[data-role="ticks-minor"] [data-minor-placement]')
            .forEach(b => {
              const val = b.dataset.minorPlacement;   // ╬ô┬ú├á correct
              const active = (mplace === '' && val === 'none') || (mplace === val);
              b.classList.toggle('is-active', active);
            });
        };

        ticksPopover.addEventListener('click', (e) => {
          const t = e.target.closest('[data-placement],[data-labels],[data-minor],[data-minor-placement]');
          // const t = e.target.closest('[data-placement],[data-labels],[data-minor],[data-minor-placement],[data-apply],[data-apply-offset],[data-apply-dtick]');
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
          // if (t.hasAttribute('data-apply-offset')) {
          //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-offset"]');
          //   const x0raw = wrap.querySelector('input[placeholder="X╬ô├⌐├ç"]').value;
          //   const y0raw = wrap.querySelector('input[placeholder="Y╬ô├⌐├ç"]').value;
          //   const x0 = x0raw === '' ? null : Number(x0raw);
          //   const y0 = y0raw === '' ? null : Number(y0raw);
          //   safeHandleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
          //   e.stopPropagation();
          //   return;
          // }

          // // Major ticks spacing
          // if (t.hasAttribute('data-apply-dtick')) {
          //   const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
          //   const dxRaw = wrap.querySelector('input[placeholder="Γò¼├╢X"]').value;
          //   const dyRaw = wrap.querySelector('input[placeholder="Γò¼├╢Y"]').value;
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
            const val = Math.max(1, Math.min(10, Math.round(Number(slider.value) || 2)));
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
          const x0raw = wrap.querySelector('input[placeholder="X╬ô├⌐├ç"]').value;
          const y0raw = wrap.querySelector('input[placeholder="Y╬ô├⌐├ç"]').value;
          const x0 = x0raw === '' ? null : Number(x0raw);
          const y0 = y0raw === '' ? null : Number(y0raw);
          safeHandleHeaderAction(panelId, 'ticks-major-offset', { x0, y0 });
        });

        const autoApplyDtick = debounce(() => {
          const wrap = ticksPopover.querySelector('[data-role="ticks-major-dtick"]');
          if (!wrap) return;
          const dxRaw = wrap.querySelector('input[placeholder="Γò¼├╢X"]').value;
          const dyRaw = wrap.querySelector('input[placeholder="Γò¼├╢Y"]').value;
          const dx = dxRaw === '' ? null : Number(dxRaw);
          const dy = dyRaw === '' ? null : Number(dyRaw);
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

        const labelsAxisBtn = createToggleButton({
          icon: 'bi-type',
          title: 'Toggle axis labels',
          pressed: true,
          onClick: (on) => safeHandleHeaderAction(panelId, 'ticklabels', { on })
        });
        controlsWrapper.appendChild(labelsAxisBtn);

        const labelsDataBtn = createToggleButton({
          icon: 'bi-card-text',
          title: 'Toggle data labels'
        });
        controlsWrapper.appendChild(labelsDataBtn);

        const scaleBtn = document.createElement('button');
        scaleBtn.type = 'button';
        scaleBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
        scaleBtn.dataset.scaleMode = 'linear';
        scaleBtn.setAttribute('aria-pressed', 'false');
        scaleBtn.innerHTML = '<i class="bi bi-graph-up"></i>';
        scaleBtn.title = 'Scale: Linear';
        scaleBtn.addEventListener('click', () => {
          const nextMode = scaleBtn.dataset.scaleMode === 'linear' ? 'log' : 'linear';
          scaleBtn.dataset.scaleMode = nextMode;
          const isLog = nextMode === 'log';
          scaleBtn.classList.toggle('is-active', isLog);
          scaleBtn.setAttribute('aria-pressed', String(isLog));
          scaleBtn.innerHTML = isLog ? '<i class="bi bi-graph-down"></i>' : '<i class="bi bi-graph-up"></i>';
          scaleBtn.title = isLog ? 'Scale: Log' : 'Scale: Linear';
          safeHandleHeaderAction(panelId, isLog ? 'yscale-log' : 'yscale-linear');
        });
        controlsWrapper.appendChild(scaleBtn);

        const legendBtn = createToggleButton({
          icon: 'bi-list-ul',
          title: 'Toggle legend',
          pressed: true,
          onClick: () => safeHandleHeaderAction(panelId, 'legend')
        });
        controlsWrapper.appendChild(legendBtn);

        const annotationsBtn = createToggleButton({
          icon: 'bi-chat-square-text',
          title: 'Toggle annotations'
        });
        controlsWrapper.appendChild(annotationsBtn);

        const smoothingBtn = createToggleButton({
          icon: 'bi-graph-up-arrow',
          title: 'Toggle smoothing presets',
          onClick: (on) => safeHandleHeaderAction(panelId, 'smooth', { on })
        });
        controlsWrapper.appendChild(smoothingBtn);

        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'btn btn-outline-secondary workspace-panel-action-btn';
        exportBtn.innerHTML = '<i class="bi bi-camera"></i>';
        exportBtn.title = 'Export image';
        exportBtn.addEventListener('click', () => safeHandleHeaderAction(panelId, 'export', {}));
        controlsWrapper.appendChild(exportBtn);

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

        const refreshActionOverflow = () => {
          const collapsed = controlsWrapper.classList.contains('is-collapsed');
          const expanded = controlsWrapper.classList.contains('is-expanded');
          if (expanded) {
            controlsWrapper.classList.remove('is-expanded');
          }
          let isOverflowing = false;
          if (!collapsed) {
            isOverflowing = controlsWrapper.scrollWidth - controlsWrapper.clientWidth > 1;
          }
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
