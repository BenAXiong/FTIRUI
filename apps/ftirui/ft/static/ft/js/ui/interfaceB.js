import { newId, nextColor }     from '../core/state.js';
import { render }               from '../core/plot.js';
import { parseFileToXY,
         downsamplePreview,
         checksumFile }         from '../core/parse.js';

export function initUI_IntB(instance) {
  const { dz, inp, add } = instance.dom;

  // Open picker only while idle; once files loaded, rely on button
  dz.addEventListener('click', () => {
    if (!dz.classList.contains('has-files')) inp.click();
  });

  // Drag styles
  ['dragenter','dragover'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); })
  );
  ['dragleave','drop'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); })
  );

  // Drop → multi-file ingest
  dz.addEventListener('drop', async (e) => {
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    dz.classList.add('has-files');
    await handleFiles(instance, files);
  });

  // Button → file input
  add.addEventListener('click', () => inp.click());
  inp.addEventListener('change', async () => {
    if (!inp.files?.length) return;
    dz.classList.add('has-files');
    await handleFiles(instance, inp.files);
    // optionally: inp.value = '';
  });

  // Chips and drawer
  renderChips(instance);
  bindChipsEvents(instance);
  renderDrawer(instance);
  bindDrawerEvents(instance);
}

async function handleFiles(instance, filesLike) {
  const files = Array.from(filesLike || []);
  if (!files.length) return;

  const startIdx = instance.state.order.length;
  let colorIdx = startIdx;

  for (const f of files) {
    await createTraceFromFile(instance, f, colorIdx++);
  }

  render(instance);
  renderChips(instance);
  bindChipsEvents(instance);
  renderChips(instance);
  renderDrawer(instance);
}

async function createTraceFromFile(instance, file, colorIndex) {
  const { x, y } = await parseFileToXY(file);
  const { px, py } = downsamplePreview(x, y);
  const sum = await checksumFile(file);

  const assumeAbsorbance = false; // (later: wire a small checkbox if you need it)
  
    let yCanon;
    if (assumeAbsorbance) {
    // T = 10^(-A)  (matches server _absorbance_to_transmittance)
    yCanon = y.map(v => Math.pow(10, -Number(v)));
    } else {
    // Heuristic like server _normalize_transmittance:
    // If max(y) is between ~1.5 and 120, treat as % and divide by 100; else assume already fraction.
    let yMax = -Infinity;
    for (let i = 0; i < y.length; i++) {
        const v = Number(y[i]);
        if (v > yMax) yMax = v;
    }
    const looksPercent = (yMax > 1.5 && yMax <= 120.0);
    yCanon = looksPercent ? y.map(v => Number(v) / 100.0) : y.map(v => Number(v));
    }
  
  const id = newId();
  const meta = {
    id,
    name: file.name,
    filename: file.name,
    size: file.size,
    color: nextColor(colorIndex),
    visible: true,
    opacity: 1.0,
    dash: 'solid',
    preview: { x: px, y: py },
    checksum: sum,
    data: { x: x.map(Number), y: yCanon }
  };

  instance.state.traces[id] = meta;
  instance.state.order.push(id);
}


/* Chips */

function chipsContainer(instance) {
  return document.getElementById('b_chips');
}

function renderChips(instance) {
  const list = chipsContainer(instance);
  if (!list) return;

  const { state } = instance;
  const frag = document.createDocumentFragment();

  state.order.forEach((id) => {
    const t = state.traces[id];
    if (!t) return;

    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.id = id;

    chip.innerHTML = `
      <span class="color-dot" title="Change color" style="--c:${t.color}"></span>
      <input class="vis" type="checkbox" ${t.visible ? 'checked' : ''} title="Show/Hide (Alt+click = solo)">
      <span class="name" title="${t.name}">${t.name}</span>
      <button class="remove" title="Remove">&times;</button>
    `;
    frag.appendChild(chip);
  });

  list.replaceChildren(frag);
}

/* Chip interactions */

function bindChipsEvents(instance) {
  const list = chipsContainer(instance);
  if (!list || list._bound) return;
  list._bound = true;

  list.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const id = chip.dataset.id;
    const { state } = instance;
    const meta = state.traces[id];
    if (!meta) return;

    // Remove
    if (e.target.classList.contains('remove')) {
      delete state.traces[id];
      state.order = state.order.filter(x => x !== id);
      render(instance);
      renderChips(instance);
      return;
    }

    // Color change
    if (e.target.classList.contains('color-dot')) {
      // create a hidden color input on the fly
      const picker = document.createElement('input');
      picker.type = 'color';
      picker.value = toHexColor(meta.color);
      picker.style.position = 'fixed';
      picker.style.left = '-9999px';
      document.body.appendChild(picker);
      picker.addEventListener('input', () => {
        meta.color = picker.value;
        e.target.style.setProperty('--c', meta.color);
        render(instance);
      });
      picker.addEventListener('change', () => picker.remove());
      picker.click();
      return;
    }

    // Visibility toggle (with Alt = solo)
    if (e.target.classList.contains('vis')) {
      const alt = e.altKey;
      if (alt) {
        // Solo: make this visible, hide others
        Object.values(state.traces).forEach(tr => tr.visible = (tr.id === id));
      } else {
        meta.visible = e.target.checked;
      }
      render(instance);
      renderChips(instance);
      return;
    }
  });
}

// helper: normalize anything to #RRGGBB
function toHexColor(c) {
  // Already hex?
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
  // crude named-color to hex (uses canvas)
  const ctx = toHexColor._ctx || (toHexColor._ctx = document.createElement('canvas').getContext('2d'));
  ctx.fillStyle = '#000'; ctx.fillStyle = c;  // browser converts
  const computed = ctx.fillStyle;            // rgba(...) or #rrggbb
  if (computed.startsWith('#')) return computed;
  // rgba(r,g,b,a) → hex
  const m = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) {
    const r = (+m[1]).toString(16).padStart(2,'0');
    const g = (+m[2]).toString(16).padStart(2,'0');
    const b = (+m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`;
  }
  return '#888888';
}


/* Trace drawer */

function drawerListEl() {
  return document.getElementById('b_drawer_list');
}

function renderDrawer(instance) {
  const root = drawerListEl();
  if (!root) return;

  const { state } = instance;
  const frag = document.createDocumentFragment();

  state.order.forEach((id, idx) => {
    const t = state.traces[id];
    if (!t) return;

    const row = document.createElement('div');
    row.className = 'trace-row';
    row.dataset.id = id;

    row.innerHTML = `
      <input class="vis" type="checkbox" ${t.visible ? 'checked' : ''} title="Show/Hide">
      <div class="name"><input class="rename" type="text" value="${escapeHtml(t.name)}" title="Rename"></div>
      <input class="color form-control form-control-sm" type="color" value="${toHexColor(t.color)}" title="Color">
      <select class="dash form-select form-select-sm" title="Dash">
        ${['solid','dot','dash','longdash','dashdot','longdashdot']
          .map(d => `<option value="${d}" ${t.dash===d?'selected':''}>${d}</option>`).join('')}
      </select>
      <input class="opacity form-range" type="range" min="0.1" max="1" step="0.05" value="${t.opacity ?? 1}">
      <button class="icon-btn up" title="Move up">▲</button>
      <button class="icon-btn down" title="Move down">▼</button>
      <button class="icon-btn remove ms-1" title="Remove">&times;</button>
    `;
    frag.appendChild(row);
  });

  root.replaceChildren(frag);
}

function escapeHtml(s='') {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Drawer events (delegation)

function bindDrawerEvents(instance) {
  const root = drawerListEl();
  if (!root || root._bound) return;
  root._bound = true;

  root.addEventListener('input', (e) => {
    const row = e.target.closest('.trace-row'); if (!row) return;
    const id = row.dataset.id;
    const t = instance.state.traces[id]; if (!t) return;

    if (e.target.classList.contains('rename')) {
      t.name = e.target.value || t.name;
      render(instance);
      renderChips(instance);
      // keep drawer as-is (name reflects on next open or live if you want)
    }

    if (e.target.classList.contains('color')) {
      t.color = e.target.value;
      render(instance);
      renderChips(instance);
    }

    if (e.target.classList.contains('dash')) {
      t.dash = e.target.value;
      render(instance);
    }

    if (e.target.classList.contains('opacity')) {
      t.opacity = Number(e.target.value);
      render(instance);
    }
  });

  root.addEventListener('click', (e) => {
    const row = e.target.closest('.trace-row'); if (!row) return;
    const id = row.dataset.id;
    const t = instance.state.traces[id]; if (!t) return;

    if (e.target.classList.contains('vis')) {
      t.visible = e.target.checked;
      render(instance);
      renderChips(instance);
      return;
    }

    if (e.target.classList.contains('remove')) {
      delete instance.state.traces[id];
      instance.state.order = instance.state.order.filter(x => x !== id);
      render(instance);
      renderDrawer(instance);
      renderChips(instance);
      return;
    }

    if (e.target.classList.contains('up') || e.target.classList.contains('down')) {
      const arr = instance.state.order;
      const i = arr.indexOf(id);
      const j = e.target.classList.contains('up') ? i-1 : i+1;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      render(instance);
      renderDrawer(instance);
      renderChips(instance);
      return;
    }
  });
}
