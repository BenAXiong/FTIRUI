// Tiny helpers you already have in your project—import them here if you prefer.// For portability, we keep this module framework-agnostic and use callbacks passed from the caller.export function createChipPanels(root = document.body) {  const panels = {    wrap: null, color: null, style: null, info: null,    pinned: false, rowId: null, timers: {}  };  function ensureDom() {    if (panels.wrap) return;    const wrap = document.createElement('div');    wrap.id = 'chipPanels';    wrap.style.position = 'absolute';    wrap.style.zIndex = '9999';    wrap.style.pointerEvents = 'none';    root.appendChild(wrap);    const mk = (id, title) => {      const el = document.createElement('div');      el.id = id;      el.className = 'chip-panel';      el.style.position = 'fixed';      el.style.minWidth = '180px';      el.style.maxWidth = '280px';      el.style.padding = '8px 10px';      el.style.borderRadius = '10px';      el.style.boxShadow = '0 8px 24px rgba(0,0,0,.18)';      el.style.background = 'var(--bs-body-bg, #222)';      el.style.color = 'var(--bs-body-color, #eee)';      el.style.display = 'none';      el.style.pointerEvents = 'auto';      el.innerHTML = `<div class="chip-title" style="opacity:.7;font-size:.85rem;margin-bottom:6px">${title}</div>`;      wrap.appendChild(el);      return el;    };    panels.wrap = wrap;    panels.color = mk('chipColor', 'Color');    panels.style = mk('chipStyle', 'Style');    panels.info  = mk('chipInfo',  'Info');  }  function place(anchorEl) {    const vp = {        w: document.documentElement.clientWidth,        h: document.documentElement.clientHeight    };    const r = anchorEl.getBoundingClientRect();    // Preferred positions    // Color: above chip    let colorLeft = r.left;                     // align left edges    let colorTop  = r.top - 8;                  // start just above    // Temporarily show to measure height (once populated)    panels.color.style.display = 'block';    const colorH = panels.color.offsetHeight || 140;    panels.color.style.display = 'none';    colorTop = r.top - colorH - 8;              // final: fully above    // Style: to the right of chip    let styleLeft = r.right + 10;    let styleTop  = r.top - 4;    // Info: to the right, below Style by ~160px    // (You can measure true height if you prefer)    let infoLeft = r.right + 10;    let infoTop  = styleTop + 160;    // Clamp inside viewport    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));    colorLeft = clamp(colorLeft, 8, vp.w - 200);    colorTop  = clamp(colorTop,  8, vp.h - 40);    styleLeft = clamp(styleLeft, 8, vp.w - 220);    styleTop  = clamp(styleTop,  8, vp.h - 40);    infoLeft  = clamp(infoLeft,  8, vp.w - 220);    infoTop   = clamp(infoTop,   8, vp.h - 40);    // Apply    panels.color.style.left = `${colorLeft}px`;    panels.color.style.top  = `${colorTop}px`;    panels.style.style.left = `${styleLeft}px`;    panels.style.style.top  = `${styleTop}px`;    panels.info.style.left  = `${infoLeft}px`;    panels.info.style.top   = `${infoTop}px`;    // Set arrow directions    panels.color.dataset.pos = 'top';    panels.style.dataset.pos = 'right';    panels.info.dataset.pos  = 'right'; }  function show(on = true, parts = { color:true, style:true, info:false }) {    const d = on ? 'block' : 'none';    panels.color.style.display = on && parts.color ? 'block' : 'none';    panels.style.style.display = on && parts.style ? 'block' : 'none';    panels.info.style.display  = on && parts.info  ? 'block' : 'none';    // Auto-open the native color picker when the Color panel becomes visible    if (on && parts.color) {      const picker = panels.color.querySelector('input[type=color]');      if (picker && typeof picker.showPicker === 'function') {        // Let layout settle, then open        setTimeout(() => picker.showPicker(), 0);      }    }  }  function hideIfNotPinned() {    if (panels.pinned) return;    show(false);    panels.rowId = null;  }  function pin(on) {    panels.pinned = !!on;    const outline = on ? '1px solid var(--bs-primary,#0d6efd)' : 'none';    panels.color.style.outline = panels.style.style.outline = panels.info.style.outline = outline;  }  function populate(trace, opts) {    // Color    const palette = [      '#FA3C3C','#F08228','#E6AF2D','#E6DC32','#A0E632','#00DC00',      '#00D28C','#00C8C8','#00A0FF','#1E3CFF','#6E00DC','#A000C8'    ];    panels.color.innerHTML = `      <div class="chip-title">Color</div>      <div class="row-line">        <input type="color" class="chip-color-inline" value="${trace.color || '#888888'}" data-act="c-native-inline" />        <input class="chip-input" data-act="c-hex" value="${(trace.color || '#888888')}" />      </div>      <div class="swatch-grid">        ${palette.map(c => `<button class="chip-swatch" data-act="c-swatch" data-val="${c}" aria-label="Set color ${c}" style="--c:${c}"></button>`).join('')}      </div>    `;    // Style    const width = trace.width || 2;    const opacity = trace.opacity ?? 1;    const dash = trace.dash || 'solid';    panels.style.innerHTML = `      <div class="chip-title">Style</div>      <div style="display:grid; gap:8px">        <div class="row-line">          <span class="lbl">Thickness</span>          <input class="w100" type="range" min="0.5" max="3" step="0.5" value="${width}" data-act="s-width">          <span class="val s-width-val">${Number(width).toFixed(1)} pt</span>        </div>        <div class="row-line">          <span class="lbl">Opacity</span>          <input class="w100" type="range" min="0.05" max="1" step="0.05" value="${opacity}" data-act="s-opacity">          <span class="val s-opacity-val">${opacity.toFixed(2)}</span>        </div>        <div class="row-line">          <span class="lbl">Pattern</span>          <div class="dash-choices" role="group" aria-label="Line pattern">            ${['solid','dot','dash','longdash','dashdot','longdashdot'].map(v => `              <button type="button" class="dash-btn ${dash===v?'is-active':''}" data-act="s-dash-btn" data-val="${v}" title="${v}">                <svg width="50" height="10" viewBox="0 0 50 10" preserveAspectRatio="none" aria-hidden="true">                  <line x1="2" y1="5" x2="48" y2="5"                        stroke="currentColor" stroke-width="2"                        ${v==='dot'        ? 'stroke-dasharray="0 5"' :                          v==='dash'       ? 'stroke-dasharray="6 6"' :                          v==='longdash'   ? 'stroke-dasharray="12 6"' :                          v==='dashdot'    ? 'stroke-dasharray="10 5 2 5"' :                          v==='longdashdot'? 'stroke-dasharray="16 6 2 6"' :                                             ''}/>                </svg>              </button>            `).join('')}          </div>        </div>      </div>    `;    // Info    const meta = trace.meta && typeof trace.meta === 'object'      ? Object.entries(trace.meta).map(([k,v]) => `<div><b>${k}</b>: ${String(v)}</div>`).join('')      : (trace.meta ? String(trace.meta) : '<i>No metadata</i>');    panels.info.innerHTML = `      <div class="chip-title">Info</div>      <div style="max-height:160px; overflow:auto">${meta}</div>      <div style="margin-top:8px; display:flex; gap:6px; justify-content:flex-end">        <button class="btn btn-sm btn-outline-secondary" data-act="i-raw">Raw data…</button>      </div>    `;    // Wire inputs on wrapper (one-time listeners; branch by dataset)    if (!panels._wired) {      panels.wrap.addEventListener('input', (e) => {        const act = e.target?.dataset?.act;        if (!act || !panels.rowId) return;        const rowId = panels.rowId;        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);        const t = opts.getTraceById(rowId);        if (!rowEl || !t) return;        if (act === 'c-hex')       t.color   = e.target.value;        if (act === 'c-native-inline') t.color = e.target.value;        else if (act === 's-width')          t.width   = Number(e.target.value) || 2;        if (act === 's-width') {          panels.style.querySelector('.s-width-val')?.replaceChildren(`${t.width.toFixed(1)} pt`);        }        else if (act === 's-opacity')t.opacity = Number(e.target.value) || 1;        if (act === 's-opacity') {          panels.style.querySelector('.s-opacity-val')?.replaceChildren(t.opacity.toFixed(2));        }        opts.repaintChip(rowEl);        opts.renderPlot();      });      panels.wrap.addEventListener('change', (e) => {        const act = e.target?.dataset?.act;        if (!act || !panels.rowId) return;        if (act !== 's-dash') return;        const rowId = panels.rowId;        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);        const t = opts.getTraceById(rowId);        if (!rowEl || !t) return;        t.dash = e.target.value;        opts.repaintChip(rowEl);        opts.renderPlot();      });      panels.wrap.addEventListener('click', (e) => {        const act = e.target?.dataset?.act;        if (!act || !panels.rowId) return;        const rowId = panels.rowId;        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);        const t = opts.getTraceById(rowId);        if (!rowEl || !t) return;        if (act === 'c-swatch') {          t.color = e.target.dataset.val;          opts.repaintChip(rowEl);          opts.renderPlot();        } else if (act === 's-dash-btn') {          t.dash = e.target.closest('[data-val]')?.dataset.val || 'solid';          // toggle active state          panels.style.querySelectorAll('.dash-btn').forEach(b => b.classList.toggle('is-active', b.dataset.val===t.dash));          opts.repaintChip(rowEl);          opts.renderPlot();        } else if (act === 'i-raw') {          opts.openRawData?.(rowId);        }      });      // Global close behaviors      document.addEventListener('click', (e) => {        const inPanel = e.target.closest?.('#chipPanels, .chip-panel');        const onChip  = e.target.closest?.('.line-chip');        if (inPanel || onChip) return;        hideIfNotPinned();        pin(false);      });      document.addEventListener('keydown', (e) => {        if (e.key === 'Escape') {          hideIfNotPinned();          pin(false);        }      });      ['scroll','resize'].forEach(ev =>        window.addEventListener(ev, () => {          if (!panels.pinned || !panels.rowId) return;          const row = opts.tree.querySelector(`.folder-trace[data-id="${panels.rowId}"]`);          const chip = row?.querySelector('.line-chip');          if (chip) place(chip);        })      );      panels._wired = true;    }  }  function mount(opts) {    ensureDom();    // Hover open (with short delay). Use pointerover (bubbling) for delegation.    opts.tree.addEventListener('pointerover', (e) => {      const chip = e.target.closest?.('.line-chip');      if (!chip) return;      const row = chip.closest('.folder-trace');      if (!row) return;      clearTimeout(panels.timers.open);      panels.timers.open = setTimeout(() => {        if (panels.pinned && panels.rowId && panels.rowId !== row.dataset.id) return;        const trace = opts.getTraceById(row.dataset.id);        populate(trace, opts);        place(chip);        show(true, { color:true, style: true, info: false});        panels.rowId = row.dataset.id;      }, 140);    }, true);    // Hover on name → show Info only    opts.tree.addEventListener('pointerover', (e) => {      const row = e.target.closest?.('.folder-trace');      if (!row) return;      // Any of these depending on your row template:      const nameEl = e.target.closest?.('.trace-name, .file-name, .rename');      const nameEl = e.target.closest?.('.trace-name, .file-name, .rename, .trace-info-icon');      clearTimeout(panels.timers.open);      panels.timers.open = setTimeout(() => {        const trace = opts.getTraceById(row.dataset.id);        populate(trace, opts);        // position near the chip, even though we’re hovering the name        const chip = row.querySelector('.line-chip');        place(chip || nameEl);        show(true, { color:false, style:false, info:true });        place(nameEl || chip);      }, 120);    }, true);    // Leave row → hide (unless entering panel or pinned)    opts.tree.addEventListener('pointerout', (e) => {      const row = e.target.closest?.('.folder-trace');      if (!row) return;      const intoPanel = e.relatedTarget && e.relatedTarget.closest?.('#chipPanels, .chip-panel');      if (intoPanel) return;      hideIfNotPinned();    }, true);    // Click chip → pin/unpin + (re)open    opts.tree.addEventListener('click', (e) => {      const chip = e.target.closest?.('.line-chip');      if (!chip) return;      const row = chip.closest('.folder-trace');      if (!row) return;      const nowPin = !(panels.pinned && panels.rowId === row.dataset.id);      pin(nowPin);      const trace = opts.getTraceById(row.dataset.id);      populate(trace, opts);      place(chip);      show(true);      panels.rowId = row.dataset.id;    });  }  return {    mount,    showFor(rowId, anchorEl) {      ensureDom();      panels.rowId = rowId;      place(anchorEl);      show(true);    },    hide() {      show(false);      panels.pinned = false;      panels.rowId = null;    },    destroy() {      if (!panels.wrap) return;      panels.wrap.remove();      panels.wrap = panels.color = panels.style = panels.info = null;      panels.pinned = false; panels.rowId = null;      // NOTE: If you mount multiple times, also keep references to remove listeners you added on mount.    }  };}
// Lightweight floating chip panels for Color, Style, and Info.
// This module exposes createChipPanels(root) which returns an object with mount(opts).
// opts expected by mount:
//   - tree: root element that contains .folder-trace rows
//   - getTraceById(id): returns trace object
//   - repaintChip(rowEl): repaints the .line-chip preview for a row
//   - renderPlot(): re-render plot after changes
//   - openRawData?(id): callback to open raw data

export function createChipPanels(root = document.body) {
  const panels = {
    wrap: null,
    color: null,
    style: null,
    info: null,
    pinned: false,
    rowId: null,
    timers: {},
    _wired: false
  };

  function ensureDom() {
    if (panels.wrap) return;
    const wrap = document.createElement('div');
    wrap.id = 'chipPanels';
    wrap.style.position = 'fixed';
    wrap.style.inset = '0';
    wrap.style.pointerEvents = 'none';
    wrap.style.zIndex = '9999';
    root.appendChild(wrap);

    const mk = (id, title) => {
      const el = document.createElement('div');
      el.id = id;
      el.className = 'chip-panel';
      el.style.position = 'fixed';
      el.style.display = 'none';
      el.style.pointerEvents = 'auto';
      el.innerHTML = `<div class="chip-title">${title}</div>`;
      wrap.appendChild(el);
      return el;
    };

    panels.wrap = wrap;
    panels.color = mk('chipColor', 'Color');
    panels.style = mk('chipStyle', 'Style');
    panels.info  = mk('chipInfo',  'Info');
  }

  function place(anchorEl) {
    if (!anchorEl) return;
    const vp = {
      w: document.documentElement.clientWidth,
      h: document.documentElement.clientHeight
    };
    const r = anchorEl.getBoundingClientRect();

    // Color: above anchor
    let colorLeft = r.left;
    panels.color.style.display = 'block';
    const colorH = panels.color.offsetHeight || 140;
    panels.color.style.display = 'none';
    let colorTop = r.top - colorH - 8;

    // Style: to the right
    let styleLeft = r.right + 10;
    let styleTop  = r.top - 4;

    // Info: to the right, below Style
    let infoLeft = r.right + 10;
    let infoTop  = styleTop + 160;

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    colorLeft = clamp(colorLeft, 8, vp.w - 220);
    colorTop  = clamp(colorTop, 8, vp.h - 40);
    styleLeft = clamp(styleLeft, 8, vp.w - 240);
    styleTop  = clamp(styleTop, 8, vp.h - 40);
    infoLeft  = clamp(infoLeft, 8, vp.w - 240);
    infoTop   = clamp(infoTop, 8, vp.h - 40);

    panels.color.style.left = `${colorLeft}px`;
    panels.color.style.top  = `${colorTop}px`;
    panels.style.style.left = `${styleLeft}px`;
    panels.style.style.top  = `${styleTop}px`;
    panels.info.style.left  = `${infoLeft}px`;
    panels.info.style.top   = `${infoTop}px`;

    panels.color.dataset.pos = 'top';
    panels.style.dataset.pos = 'right';
    panels.info.dataset.pos  = 'right';
  }

  function show(on = true, parts = { color:true, style:true, info:false }) {
    const d = on ? 'block' : 'none';
    panels.color.style.display = on && parts.color ? 'block' : 'none';
    panels.style.style.display = on && parts.style ? 'block' : 'none';
    panels.info.style.display  = on && parts.info  ? 'block' : 'none';
    if (on && parts.color) {
      const picker = panels.color.querySelector('input[type=color]');
      if (picker && typeof picker.showPicker === 'function') {
        setTimeout(() => picker.showPicker(), 0);
      }
    }
  }

  function hideIfNotPinned() {
    if (panels.pinned) return;
    show(false);
    panels.rowId = null;
  }

  function pin(on) {
    panels.pinned = !!on;
    const outline = on ? '1px solid var(--bs-primary,#0d6efd)' : 'none';
    panels.color.style.outline = outline;
    panels.style.style.outline = outline;
    panels.info.style.outline  = outline;
  }

  function populate(trace, opts) {
    // Color
    const palette = [
      '#FA3C3C','#F08228','#E6AF2D','#E6DC32','#A0E632','#00DC00',
      '#00D28C','#00C8C8','#00A0FF','#1E3CFF','#6E00DC','#A000C8'
    ];
    panels.color.innerHTML = `
      <div class="chip-title">Color</div>
      <div class="row-line">
        <input type="color" class="chip-color-inline" value="${trace.color || '#888888'}" data-act="c-native-inline" />
        <input class="chip-input" data-act="c-hex" value="${trace.color || '#888888'}" />
      </div>
      <div class="swatch-grid">
        ${palette.map(c => `<button class="chip-swatch" data-act="c-swatch" data-val="${c}" aria-label="Set color ${c}" style="--c:${c}"></button>`).join('')}
      </div>
    `;

    // Style
    const width = trace.width || 2;
    const opacity = trace.opacity ?? 1;
    const dash = trace.dash || 'solid';
    const dashOpts = ['solid','dot','dash','longdash','dashdot','longdashdot'];
    const dashBtn = (v) => `
      <button type="button" class="dash-btn ${dash===v?'is-active':''}" data-act="s-dash-btn" data-val="${v}" title="${v}">
        <svg width="50" height="10" viewBox="0 0 50 10" preserveAspectRatio="none" aria-hidden="true">
          <line x1="2" y1="5" x2="48" y2="5" stroke="currentColor" stroke-width="2"
            ${v==='dot'        ? 'stroke-dasharray="0 5"' :
              v==='dash'       ? 'stroke-dasharray="6 6"' :
              v==='longdash'   ? 'stroke-dasharray="12 6"' :
              v==='dashdot'    ? 'stroke-dasharray="10 5 2 5"' :
              v==='longdashdot'? 'stroke-dasharray="16 6 2 6"' : ''} />
        </svg>
      </button>`;

    panels.style.innerHTML = `
      <div class="chip-title">Style</div>
      <div style="display:grid; gap:8px">
        <div class="row-line">
          <span class="lbl">Thickness</span>
          <input class="w100" type="range" min="0.5" max="3" step="0.5" value="${width}" data-act="s-width">
          <span class="val s-width-val">${Number(width).toFixed(1)} pt</span>
        </div>
        <div class="row-line">
          <span class="lbl">Opacity</span>
          <input class="w100" type="range" min="0.05" max="1" step="0.05" value="${opacity}" data-act="s-opacity">
          <span class="val s-opacity-val">${Number(opacity).toFixed(2)}</span>
        </div>
        <div class="row-line">
          <span class="lbl">Pattern</span>
          <div class="dash-choices" role="group" aria-label="Line pattern">
            ${dashOpts.map(dashBtn).join('')}
          </div>
        </div>
      </div>
    `;

    // Info
    const meta = trace.meta && typeof trace.meta === 'object'
      ? Object.entries(trace.meta).map(([k,v]) => `<div><b>${k}</b>: ${String(v)}</div>`).join('')
      : (trace.meta ? String(trace.meta) : '<i>No metadata</i>');
    panels.info.innerHTML = `
      <div class="chip-title">Info</div>
      <div style="max-height:160px; overflow:auto">${meta}</div>
      <div style="margin-top:8px; display:flex; gap:6px; justify-content:flex-end">
        <button class="btn btn-sm btn-outline-secondary" data-act="i-raw">Raw data</button>
      </div>
    `;

    // One-time wiring on the wrapper
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
          panels.style.querySelector('.s-width-val')?.replaceChildren(`${t.width.toFixed(1)} pt`);
        } else if (act === 's-opacity') {
          t.opacity = Number(e.target.value) || 1;
          panels.style.querySelector('.s-opacity-val')?.replaceChildren(t.opacity.toFixed(2));
        } else {
          return;
        }
        opts.repaintChip(rowEl);
        opts.renderPlot();
      });

      panels.wrap.addEventListener('click', (e) => {
        const act = e.target?.dataset?.act;
        if (!panels.rowId) return;
        const rowId = panels.rowId;
        const rowEl = opts.tree.querySelector(`.folder-trace[data-id="${rowId}"]`);
        const t = opts.getTraceById(rowId);
        if (!rowEl || !t) return;

        if (act === 'c-swatch') {
          t.color = e.target.dataset.val;
          opts.repaintChip(rowEl);
          opts.renderPlot();
        } else if (act === 's-dash-btn') {
          t.dash = e.target.closest('[data-val]')?.dataset.val || 'solid';
          panels.style.querySelectorAll('.dash-btn').forEach(b => b.classList.toggle('is-active', b.dataset.val === t.dash));
          opts.repaintChip(rowEl);
          opts.renderPlot();
        } else if (act === 'i-raw') {
          opts.openRawData?.(rowId);
        }
      });

      // Close when clicking outside, unless pin is on
      document.addEventListener('click', (e) => {
        const inPanel = e.target.closest?.('#chipPanels, .chip-panel');
        const onChip  = e.target.closest?.('.line-chip');
        const onInfo  = e.target.closest?.('.trace-info-icon');
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

      ['scroll','resize'].forEach(ev => {
        window.addEventListener(ev, () => {
          if (!panels.pinned || !panels.rowId) return;
          const row = opts.tree.querySelector(`.folder-trace[data-id="${panels.rowId}"]`);
          const chip = row?.querySelector('.line-chip');
          if (chip) place(chip);
        });
      });

      panels._wired = true;
    }
  }

  function mount(opts) {
    ensureDom();

    // Hover open (chip): show color+style
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
        place(chip);
        show(true, { color:true, style:true, info:false });
        panels.rowId = row.dataset.id;
      }, 140);
    }, true);

    // Hover on name/info icon: show Info only
    opts.tree.addEventListener('pointerover', (e) => {
      const row = e.target.closest?.('.folder-trace');
      if (!row) return;
      const anchor = e.target.closest?.('.trace-name, .file-name, .rename, .trace-info-icon');
      if (!anchor) return;
      clearTimeout(panels.timers.open);
      panels.timers.open = setTimeout(() => {
        const trace = opts.getTraceById(row.dataset.id);
        populate(trace, opts);
        const chip = row.querySelector('.line-chip');
        place(anchor || chip);
        show(true, { color:false, style:false, info:true });
        panels.rowId = row.dataset.id;
      }, 120);
    }, true);

    // Leave row: hide unless entering panel or pinned
    opts.tree.addEventListener('pointerout', (e) => {
      const row = e.target.closest?.('.folder-trace');
      if (!row) return;
      const intoPanel = e.relatedTarget && e.relatedTarget.closest?.('#chipPanels, .chip-panel');
      if (intoPanel) return;
      hideIfNotPinned();
    }, true);

    // Click chip: pin/unpin and open all
    opts.tree.addEventListener('click', (e) => {
      const chip = e.target.closest?.('.line-chip');
      const infoBtn = e.target.closest?.('.trace-info-icon');
      if (!chip && !infoBtn) return;
      const row = (chip || infoBtn).closest('.folder-trace');
      if (!row) return;
      const trace = opts.getTraceById(row.dataset.id);
      populate(trace, opts);
      if (chip) {
        const nowPin = !(panels.pinned && panels.rowId === row.dataset.id);
        pin(nowPin);
        place(chip);
        show(true, { color:true, style:true, info:false });
      } else if (infoBtn) {
        pin(true);
        place(infoBtn);
        show(true, { color:false, style:false, info:true });
      }
      panels.rowId = row.dataset.id;
    });
  }

  return {
    mount,
    showFor(rowId, anchorEl) {
      ensureDom();
      panels.rowId = rowId;
      place(anchorEl);
      show(true, { color:true, style:true, info:true });
    },
    hide() {
      show(false);
      panels.pinned = false;
      panels.rowId = null;
    },
    destroy() {
      if (!panels.wrap) return;
      panels.wrap.remove();
      panels.wrap = panels.color = panels.style = panels.info = null;
      panels.pinned = false; panels.rowId = null;
    }
  };
}
