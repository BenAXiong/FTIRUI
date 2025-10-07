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

  // Chips
  renderChips(instance);
  bindChipsEvents(instance);
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

}

async function createTraceFromFile(instance, file, colorIndex) {
  const { x, y } = await parseFileToXY(file);
  const { px, py } = downsamplePreview(x, y);
  const sum = await checksumFile(file);
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
    data: { x, y }
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
