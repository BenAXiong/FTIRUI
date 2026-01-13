export function createChipPanels(root = document.body) {
  const panels = {
    wrap: null,
    main: null,
    info: null,
    pinned: false,
    rowId: null,
    timers: {},
    paletteKey: 'vibrant'
  };

  const palettes = {
    vibrant: {
      label: 'Vibrant',
      colors: [
        '#FA3C3C', '#F08228', '#E6AF2D', '#E6DC32', '#A0E632', '#00DC00',
        '#00D28C', '#00C8C8', '#00A0FF', '#1E3CFF', '#6E00DC', '#A000C8'
      ]
    },
    muted: {
      label: 'Muted',
      colors: [
        '#C96060', '#C58B60', '#BFA868', '#B3B36C', '#7EAC6C', '#5BB08E',
        '#4C9C9C', '#5A8FB6', '#6B78B6', '#7A69B0', '#8B5FA0', '#A05F8E'
      ]
    },
    mono: {
      label: 'Monochrome',
      colors: [
        '#222222', '#333333', '#444444', '#555555', '#666666', '#777777',
        '#888888', '#999999', '#AAAAAA', '#BBBBBB', '#CCCCCC', '#DDDDDD'
      ]
    }
  };

  const buildSwatches = (paletteColors = []) => paletteColors
    .map((c) => `<button class="chip-swatch" data-act="c-swatch" data-val="${c}" aria-label="Set color ${c}" style="--c:${c}"></button>`)
    .join('');

  function ensureDom() {
    if (panels.wrap) return;
    const wrap = document.createElement('div');
    wrap.id = 'chipPanels';
    wrap.style.position = 'absolute';
    wrap.style.zIndex = '9999';
    wrap.style.pointerEvents = 'none';
    root.appendChild(wrap);

    const mkPanel = (id, title = '') => {
      const el = document.createElement('div');
      el.id = id;
      el.className = 'chip-panel';
      el.style.position = 'fixed';
      el.style.minWidth = id === 'chipMain' ? '260px' : '160px';
      el.style.maxWidth = id === 'chipMain' ? '400px' : '360px';
      if (id !== 'chipMain') {
        el.style.width = 'max-content';
      }
      el.style.padding = '12px 16px';
      el.style.borderRadius = '14px';
      el.style.boxShadow = '0 18px 36px rgba(0,0,0,.28)';
      el.style.background = 'var(--bs-body-bg, #222)';
      el.style.color = 'var(--bs-body-color, #eee)';
      el.style.display = 'none';
      el.style.pointerEvents = 'auto';
      if (title) {
        const heading = document.createElement('div');
        heading.className = 'chip-title';
        heading.textContent = title;
        el.appendChild(heading);
      }
      wrap.appendChild(el);
      return el;
    };

    panels.wrap = wrap;
    panels.main = mkPanel('chipMain');
    panels.info = mkPanel('chipInfo');
    ensureColorisConfigured();
  }

  const measurePanel = (panelEl, fallback = { width: 320, height: 260 }) => {
    if (!panelEl) return { ...fallback };
    const previous = panelEl.style.display;
    panelEl.style.display = 'block';
    const bounds = {
      width: panelEl.offsetWidth || fallback.width,
      height: panelEl.offsetHeight || fallback.height
    };
    panelEl.style.display = previous;
    return bounds;
  };
  let colorisConfigured = false;
  const ensureColorisConfigured = () => {
    if (colorisConfigured) return true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return false;
    const { Coloris } = window;
    if (!Coloris) return false;
    try {
      if (typeof Coloris.init === 'function') {
        Coloris.init();
      }
      Coloris({
        el: '[data-coloris="chip"]',
        wrap: false,
        themeMode: 'auto',
        position: 'top',
        margin: 8,
        format: 'hex',
        alpha: false
      });
      colorisConfigured = true;
      return true;
    } catch (err) {
      console.warn('[chipPanels] Coloris init failed', err);
      return false;
    }
  };

  const pickerToggleMap = new WeakSet();
  const anchorRefs = { main: null, info: null };
  let hoveringPanel = false;
  const wireColorPickerToggle = (inputEl) => {
    if (!inputEl || pickerToggleMap.has(inputEl)) return;
    const reset = () => {
      delete inputEl.dataset.pickerActive;
    };
    const handlePointerDown = (evt) => {
      const colorisReady = ensureColorisConfigured();
      if (colorisReady && window.Coloris) {
        evt.preventDefault();
        return;
      }
      evt.preventDefault();
      const isActive = inputEl.dataset.pickerActive === '1';
      if (isActive) {
        inputEl.blur();
        reset();
        return;
      }
      inputEl.dataset.pickerActive = '1';
      try {
        inputEl.focus({ preventScroll: true });
      } catch {
        inputEl.focus();
      }
      if (typeof inputEl.showPicker === 'function') {
        try {
          inputEl.showPicker();
        } catch (err) {
          if (err?.name !== 'NotAllowedError') {
            console.warn('[chipPanels] showPicker failed', err);
          }
        }
      } else {
        inputEl.click();
      }
    };
    inputEl.addEventListener('pointerdown', handlePointerDown);
    inputEl.addEventListener('change', reset);
    inputEl.addEventListener('blur', reset);
    pickerToggleMap.add(inputEl);
  };

  function place({ mainAnchor = anchorRefs.main, infoAnchor = anchorRefs.info } = {}) {
    if (mainAnchor) anchorRefs.main = mainAnchor;
    if (infoAnchor) anchorRefs.info = infoAnchor;
    const principal = anchorRefs.main || anchorRefs.info;
    if (!principal) return;
    const mainRect = (anchorRefs.main || principal).getBoundingClientRect();
    const infoRect = (anchorRefs.info || principal).getBoundingClientRect();
    const vp = {
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight
    };
    const gap = 14;
    const mainSize = measurePanel(panels.main, { width: 320, height: 260 });
    let mainLeft = mainRect.right + gap;
    if (mainLeft + mainSize.width > vp.w - 8) {
      mainLeft = Math.max(8, vp.w - mainSize.width - 8);
    }
    let mainTop = mainRect.top - 12;
    if (mainTop + mainSize.height > vp.h - 8) {
      mainTop = Math.max(8, vp.h - mainSize.height - 8);
    }
    panels.main.style.left = `${mainLeft}px`;
    panels.main.style.top = `${mainTop}px`;
    panels.main.dataset.pos = 'right';

    const infoSize = measurePanel(panels.info, { width: 240, height: 200 });
    let infoLeft = infoRect.right + gap;
    if (infoLeft + infoSize.width > vp.w - 8) {
      infoLeft = Math.max(8, vp.w - infoSize.width - 8);
    }
    let infoTop = infoRect.top - 12;
    if (infoTop + infoSize.height > vp.h - 8) {
      infoTop = Math.max(8, vp.h - infoSize.height - 8);
    }
    panels.info.style.left = `${infoLeft}px`;
    panels.info.style.top = `${infoTop}px`;
    panels.info.dataset.pos = 'right';
  }

  function show(on = true, parts = { color: true, style: true, info: false }) {
    const mainVisible = on && (parts.color || parts.style || parts.main);
    panels.main.style.display = mainVisible ? 'block' : 'none';
    panels.info.style.display = on && parts.info ? 'block' : 'none';
  }

  function hideIfNotPinned() {
    if (panels.pinned) return;
    show(false);
    panels.rowId = null;
  }

  function pin(on) {
    panels.pinned = !!on;
    const outline = on ? '1px solid var(--bs-primary,#0d6efd)' : 'none';
    panels.main.style.outline = outline;
    panels.info.style.outline = outline;
  }

  function populate(trace, opts) {
    const paletteKey = palettes[panels.paletteKey] ? panels.paletteKey : 'vibrant';
    panels.paletteKey = paletteKey;
    const paletteOptions = Object.entries(palettes)
      .map(([key, entry]) => `
        <button class="chip-palette-option${key === paletteKey ? ' is-active' : ''}" type="button" data-act="palette-select" data-val="${key}">
          ${entry.label}
        </button>
      `)
      .join('');

    const dashOpts = ['solid', 'dot', 'dash', 'longdash'];
    const dashBtn = (value) => {
      const dashAttr = value === 'dot'
        ? 'stroke-dasharray="2 6"'
        : value === 'dash'
          ? 'stroke-dasharray="8 6"'
          : value === 'longdash'
            ? 'stroke-dasharray="14 6"'
            : '';
      return `
        <button class="dash-btn${trace.dash === value ? ' is-active' : ''}" data-act="s-dash-btn" data-val="${value}" type="button">
          <svg viewBox="0 0 36 10" width="36" height="12" aria-hidden="true">
            <line x1="1" y1="5" x2="35" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round" ${dashAttr}></line>
          </svg>
        </button>
      `;
    };

    panels.main.innerHTML = `
      <div class="row-line color-row">
        <input type="color" class="chip-color-inline" value="${trace.color || '#888888'}" data-act="c-native-inline" data-coloris="chip" />
        <input class="chip-input" data-act="c-hex" value="${trace.color || '#888888'}" />
        <div class="chip-palette" data-open="false">
          <button class="chip-palette-toggle" type="button" data-act="palette-toggle" aria-expanded="false">
            Switch palette
            <i class="bi bi-chevron-down" aria-hidden="true"></i>
          </button>
          <div class="chip-palette-menu">
            ${paletteOptions}
          </div>
        </div>
      </div>
      <div class="swatch-grid">
        ${buildSwatches(palettes[paletteKey].colors)}
      </div>
      <div class="row-line">
        <span class="lbl">Thickness</span>
        <input class="w100" type="range" min="0.5" max="3" step="0.5" value="${trace.width || 2}" data-act="s-width" />
        <span class="val s-width-val">${Number(trace.width || 2).toFixed(1)} pt</span>
      </div>
      <div class="row-line">
        <span class="lbl">Opacity</span>
        <input class="w100" type="range" min="0.05" max="1" step="0.05" value="${trace.opacity ?? 1}" data-act="s-opacity" />
        <span class="val s-opacity-val">${Number(trace.opacity ?? 1).toFixed(2)}</span>
      </div>
      <div class="row-line">
        <span class="lbl">Pattern</span>
        <div class="dash-choices">
          ${dashOpts.map(dashBtn).join('')}
        </div>
      </div>
    `;
    ensureColorisConfigured();
    wireColorPickerToggle(panels.main.querySelector('.chip-color-inline'));

    const meta = trace.meta && typeof trace.meta === 'object'
      ? Object.entries(trace.meta).map(([k, v]) => `<div><b>${k}</b>: ${String(v)}</div>`).join('')
      : (trace.meta ? String(trace.meta) : '<i>No metadata</i>');
    panels.info.innerHTML = `
      <div class="chip-title">Info</div>
      <div>${meta}</div>
      <div style="margin-top:8px; display:flex; gap:6px; justify-content:flex-end">
        <button class="btn btn-sm btn-outline-secondary" data-act="i-raw">Raw data</button>
      </div>
    `;

    if (!panels._wired) {
      panels.wrap.addEventListener('input', (e) => {
        const act = e.target?.dataset?.act;
        if (!act || !panels.rowId) return;
        const rowId = panels.rowId;
        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);
        const t = opts.getTraceById(rowId);
        if (!rowEl || !t) return;

        if (act === 'c-hex' || act === 'c-native-inline') {
          t.color = e.target.value;
        } else if (act === 's-width') {
          t.width = Number(e.target.value) || 2;
          panels.main.querySelector('.s-width-val')?.replaceChildren(`${t.width.toFixed(1)} pt`);
        } else if (act === 's-opacity') {
          t.opacity = Number(e.target.value) || 1;
          panels.main.querySelector('.s-opacity-val')?.replaceChildren(t.opacity.toFixed(2));
        } else {
          return;
        }
        opts.repaintChip(rowEl);
        opts.renderPlot();
      });

      const setPaletteMenuOpen = (open) => {
        const paletteWrap = panels.main?.querySelector('.chip-palette');
        const toggle = paletteWrap?.querySelector('.chip-palette-toggle');
        if (!paletteWrap || !toggle) return;
        paletteWrap.dataset.open = open ? 'true' : 'false';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      panels.wrap.addEventListener('click', (e) => {
        const act = e.target?.dataset?.act;
        const paletteWrap = e.target.closest?.('.chip-palette');
        if (!paletteWrap) {
          setPaletteMenuOpen(false);
        }
        if (!panels.rowId) return;
        const rowId = panels.rowId;
        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);
        const t = opts.getTraceById(rowId);
        if (!rowEl || !t) return;

        if (act === 'palette-toggle') {
          const isOpen = paletteWrap?.dataset.open === 'true';
          setPaletteMenuOpen(!isOpen);
        } else if (act === 'palette-select') {
          const nextKey = e.target?.dataset?.val;
          if (nextKey && palettes[nextKey]) {
            panels.paletteKey = nextKey;
            const swatchGrid = panels.main?.querySelector('.swatch-grid');
            if (swatchGrid) {
              swatchGrid.innerHTML = buildSwatches(palettes[nextKey].colors);
            }
            panels.main?.querySelectorAll('.chip-palette-option').forEach((btn) => {
              btn.classList.toggle('is-active', btn.dataset.val === nextKey);
            });
          }
          setPaletteMenuOpen(false);
        } else if (act === 'c-swatch') {
          t.color = e.target.dataset.val;
          opts.repaintChip(rowEl);
          opts.renderPlot();
        } else if (act === 's-dash-btn') {
          t.dash = e.target.closest('[data-val]')?.dataset.val || 'solid';
          t.line = t.line || {};
          t.line.dash = t.dash;
          panels.main.querySelectorAll('.dash-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.val === t.dash);
          });
          opts.repaintChip(rowEl);
          opts.renderPlot();
        } else if (act === 'i-raw') {
          opts.openRawData?.(rowId);
        }
      });

      document.addEventListener('click', (e) => {
        const inPanel = e.target.closest?.('#chipPanels, .chip-panel');
        const onChip = e.target.closest?.('.line-chip');
        const onInfo = e.target.closest?.('.trace-info-icon');
        if (inPanel || onChip || onInfo) return;
        hideIfNotPinned();
        pin(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          hideIfNotPinned();
          pin(false);
        }
      });

      ['scroll', 'resize'].forEach((ev) => {
        window.addEventListener(ev, () => {
          if (!panels.pinned || !panels.rowId) return;
          const row = opts.tree.querySelector(`.folder-trace[data-id="${panels.rowId}"]`);
          const chip = row?.querySelector('.line-chip');
          if (chip) place({ mainAnchor: chip, infoAnchor: row.querySelector('.trace-info-icon') || chip });
        });
      });

      panels._wired = true;
    }
  }

  function mount(opts) {
    ensureDom();

    opts.tree.addEventListener('pointerover', (e) => {
      const chip = e.target.closest?.('.line-chip');
      if (!chip) return;
      const row = chip.closest('.folder-trace');
      if (!row) return;
      clearTimeout(panels.timers.open);
      panels.timers.open = setTimeout(() => {
        if (panels.pinned && panels.rowId && panels.rowId !== row.dataset.id) return;
        const trace = opts.getTraceById(row.dataset.id);
        populate(trace, opts);
        place({ mainAnchor: chip, infoAnchor: chip });
        show(true, { color: true, style: true, info: false });
        panels.rowId = row.dataset.id;
      }, 140);
    }, true);

    opts.tree.addEventListener('pointerout', (e) => {
      const row = e.target.closest?.('.folder-trace');
      if (!row) return;
      if (e.relatedTarget && row.contains(e.relatedTarget)) return;
      const intoPanel = e.relatedTarget && e.relatedTarget.closest?.('#chipPanels, .chip-panel');
      if (intoPanel) return;
      hideIfNotPinned();
    }, true);

    opts.tree.addEventListener('click', (e) => {
      const chip = e.target.closest?.('.line-chip');
      const infoBtn = e.target.closest?.('.trace-info-icon');
      if (!chip && !infoBtn) return;
      const row = (chip || infoBtn).closest('.folder-trace');
      if (!row) return;
      if (infoBtn && panels.pinned && panels.rowId === row.dataset.id && panels.info?.style.display === 'block') {
        show(false);
        pin(false);
        panels.rowId = null;
        return;
      }
      const trace = opts.getTraceById(row.dataset.id);
      populate(trace, opts);
      if (chip) {
        const nowPin = !(panels.pinned && panels.rowId === row.dataset.id);
        pin(nowPin);
        if (!nowPin) {
          hideIfNotPinned();
        } else {
          place({ mainAnchor: chip, infoAnchor: chip });
          show(true, { color: true, style: true, info: false });
        }
      } else if (infoBtn) {
        pin(true);
        place({ mainAnchor: anchorRefs.main || row.querySelector('.line-chip') || infoBtn, infoAnchor: infoBtn });
        show(true, { color: false, style: false, info: true });
      }
      panels.rowId = row.dataset.id;
    });

    panels.wrap.addEventListener('pointerenter', () => {
      hoveringPanel = true;
    });
    panels.wrap.addEventListener('pointerleave', () => {
      hoveringPanel = false;
    });
  }

  return {
    mount,
    isHovering() {
      return hoveringPanel;
    },
    showFor(rowId, anchorEl) {
      ensureDom();
      panels.rowId = rowId;
      place({ mainAnchor: anchorEl, infoAnchor: anchorEl });
      show(true, { color: true, style: true, info: true });
    },
    hide() {
      show(false);
      panels.pinned = false;
      panels.rowId = null;
    },
    destroy() {
      if (!panels.wrap) return;
      panels.wrap.remove();
      panels.wrap = panels.main = panels.info = null;
      panels.pinned = false;
      panels.rowId = null;
    }
  };
}
