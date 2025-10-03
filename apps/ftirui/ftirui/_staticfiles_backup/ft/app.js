// pick saved theme or fallback to system
const saved = localStorage.getItem('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const start = saved || (systemDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-bs-theme', start);

const setTheme = (t) => {
document.documentElement.setAttribute('data-bs-theme', t);
localStorage.setItem('theme', t);
// optional: swap   icon
const icon = document.querySelector('#themeToggle .theme-icon');
if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
};

document.getElementById('themeToggle')?.addEventListener('click', () => {
const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
setTheme(cur === 'dark' ? 'light' : 'dark');
});

// sync icon on load
(function initIcon(){
const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
const icon = document.querySelector('#themeToggle .theme-icon');
if (icon) icon.textContent = cur === 'dark' ? '☀️' : '🌙';
})();

// CSRF
function getCookie(name){const v=`; ${document.cookie}`;const p=v.split(`; ${name}=`);if(p.length===2) return p.pop().split(';').shift();}
const csrftoken = getCookie('csrftoken');

// Helpers
function el(id){ return document.getElementById(id); }
function setHTML(id, html){ el(id).innerHTML = html; }
function show(id, yes){ el(id).style.display = yes ? '' : 'none'; }

// ---- Convert: Preview table ----
el('btn_toggle_preview').addEventListener('click', ()=> {
const wrap = el('preview_area');
wrap.style.display = (wrap.style.display === 'none') ? '' : 'none';
});

async function doPreview(){
const files = el('conv_files').files;
if (!files.length){
    setHTML('preview_area','<div class="text-danger">Choose a file.</div>');
    return; }
const fd = new FormData();
fd.append('file', files[0]);
fd.append('decimal_comma', el('decimal_comma').checked);
fd.append('delimiter', el('delimiter').value);
fd.append('skiprows', el('skiprows').value);
fd.append('sheet', el('sheet').value);

const resp = await fetch('/preview/', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
const data = await resp.json();
if (!resp.ok){
    setHTML('preview_area', `<div class="text-danger">${data.error||'Preview failed'}</div>`);
    return; }

// render
const headings = data.headings||[];
const rows = data.rows||[];
let html = '<table class="table table-sm table-striped preview-table"><thead><tr>';
for (const h of headings) html += `<th>${h}</th>`;
html += '</tr></thead><tbody>';
for (const r of rows) html += '<tr>' + r.map(v=>`<td>${v??''}</td>`).join('') + '</tr>';
html += '</tbody></table>';
setHTML('preview_area', html);
lastPlotMode = 'preview'; // so axis changes replot preview
};

// ---- Convert: Plot Preview ----
function resetPlotPlaceholder(){
  const img = el('plot_img');
  const ph  = el('plot_placeholder');
  if(img){ img.classList.add('d-none'); img.removeAttribute('src'); img.alt = 'FTIR plot'; }
  if(ph){ ph.style.display = ''; }
}

function showPlot(srcUrl){
  const img = el('plot_img');
  const ph  = el('plot_placeholder');
  if (!img || !ph) return;
  img.onload = () => {};
  img.onerror = () => resetPlotPlaceholder();
  img.src = srcUrl;
  img.classList.remove('d-none');
  ph.style.display = 'none';
}

async function doPlotPreview(){
  const files = el('conv_files').files;
  if (!files.length){ resetPlotPlaceholder(); return; }

  const fd = new FormData();
  fd.append('file', files[0]);
  fd.append('x_col', el('x_col').value);
  fd.append('y_col', el('y_col').value);
  fd.append('delimiter', el('delimiter')?.value || '');
  fd.append('decimal_comma', el('decimal_comma')?.checked || false);
  fd.append('skiprows', el('skiprows')?.value || '0');
  fd.append('sheet', el('sheet')?.value || '');
  fd.append('invert', el('invert')?.checked || false);
  fd.append('xmin', el('xmin')?.value || 'auto');
  fd.append('xmax', el('xmax')?.value || 'auto');

  const resp = await fetch('/plot_preview', { method:'POST', headers:{'X-CSRFToken': csrftoken}, body: fd });
  if(!resp.ok){
    let msg = 'Plot failed';
    try{ const d = await resp.json(); if(d.error) msg = d.error; }catch{}
    resetPlotPlaceholder();
    el('plot_img').alt = msg;
    return;
  }
  const blob = await resp.blob();
  showPlot(URL.createObjectURL(blob));
  lastPlotMode = 'preview';
}


// Auto-plot on Convert tab when a file is chosen
el('conv_files').addEventListener('change', async () => {
await doPlotPreview();
});

el('conv_files').addEventListener('change', async () => {
await doPreview();
});

// Auto-plot on Live tab when Feather files are chosen
el('live_file').addEventListener('change', async () => {
await doLivePlot();
});      

// ---- Convert: Convert -> immediate downloads ----
el('btn_convert').addEventListener('click', async () => {
const files = el('conv_files').files;
const status = el('convert_status');
if (!files.length){ setHTML('convert_status','<div class="text-danger">Choose file(s) to convert.</div>'); return; }

const fd = new FormData();
for (const f of files) fd.append('files', f);
fd.append('x_col', el('x_col').value);
fd.append('y_col', el('y_col').value);
fd.append('absorbance', el('absorbance').checked);
fd.append('assume_percent', el('assume_percent').checked);
fd.append('delimiter', el('delimiter').value);
fd.append('decimal_comma', el('decimal_comma').checked);
fd.append('no_header', el('no_header').checked);
fd.append('skiprows', el('skiprows').value);
fd.append('sheet', el('sheet').value);
fd.append('header_row', el('header_row').value);

const resp = await fetch('/plot/', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
const data = await resp.json();
if (!resp.ok){ setHTML('convert_status', `<div class="text-danger">${data.error||'Conversion failed'}</div>`); return; }

// Trigger immediate downloads (no link list)
const outs = data.outputs||[];
if (!outs.length){ setHTML('convert_status','<div class="text-danger">No outputs.</div>'); return; }
for (const o of outs){
    const a = document.createElement('a');
    a.href = o.url; a.download = o.name;
    document.body.appendChild(a); a.click(); a.remove();
}
setHTML('convert_status', `<div class="alert alert-success py-2 mb-0">Downloaded ${outs.length} file(s).</div>`);
});

// ---- Live: multi-file overlay plot ----
async function doLivePlot(){
const files = el('live_file').files;
const img = el('plot_img_live');
if (!files.length){ img.alt='Choose Feather file(s)'; img.removeAttribute('src'); return; }

const fd = new FormData();
for (const f of files) fd.append('file', f);  // multiple
fd.append('invert', el('invert_live').checked);
fd.append('xmin', el('xmin_live').value || 'auto');
fd.append('xmax', el('xmax_live').value || 'auto');

const resp = await fetch('/plot', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
if (!resp.ok){ const d = await resp.json().catch(()=>({})); img.alt = d.error||'Plot failed'; img.removeAttribute('src'); return; }
const blob = await resp.blob(); img.src = URL.createObjectURL(blob);
lastPlotMode = 'live';
}
el('btn_plot').addEventListener('click', doLivePlot);

// ---- Auto replot on invert/x-range changes ----
let lastPlotMode = null; // 'preview' | 'live'
function scheduleReplot(scope){
if (scope === 'preview' && lastPlotMode === 'preview') doPlotPreview();
if (scope === 'preview' && lastPlotMode === 'preview') doPreview();
if (scope === 'live' && lastPlotMode === 'live') doLivePlot();
}

// Convert panel controls
el('invert').addEventListener('change', ()=>scheduleReplot('preview'));
el('xmin').addEventListener('input', ()=>scheduleReplot('preview'));
el('xmax').addEventListener('input', ()=>scheduleReplot('preview'));
el('btn_reset_x').addEventListener('click', ()=>{ el('xmin').value=''; el('xmax').value=''; scheduleReplot('preview'); });
el('btn_reset_y').addEventListener('click', ()=>{ el('ymin').value=''; el('ymax').value=''; scheduleReplot('preview'); });

// Live panel controls
el('invert_live').addEventListener('change', ()=>scheduleReplot('live'));
el('xmin_live').addEventListener('input', ()=>scheduleReplot('live'));
el('xmax_live').addEventListener('input', ()=>scheduleReplot('live'));

// helper: build a FileList for input
function filesToFileList(files) {
const dt = new DataTransfer();
[...files].forEach(f => dt.items.add(f));
return dt.files;
}

const dz  = document.getElementById('drop_zone');
const inp = document.getElementById('conv_files');

// Safety guard
if (dz && inp) {
dz.addEventListener('click', () => inp.click());

['dragenter','dragover'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); })
);
['dragleave','drop'].forEach(ev =>
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); })
);

dz.addEventListener('drop', e => {
    const files = e.dataTransfer?.files;
    if (!files || !files.length) return;
    inp.files = filesToFileList(files);
    inp.dispatchEvent(new Event('change'));   // <- kick your preview/plot
    dz.classList.remove('idle');              // disable “idle glow”
    dz.classList.add('has-files');
});

inp.addEventListener('change', () => {
  if (inp.files && inp.files.length > 0) {
    dz.classList.remove('idle');
    dz.classList.add('has-files');
  }
});

// Optional: protect the page
['dragover','drop'].forEach(ev =>
    document.body.addEventListener(ev, e => e.preventDefault())
);
}

/* Raw data popup */
const btnOpen = document.getElementById('btn_preview_popup');
const btnClose = document.getElementById('btn_close_preview');
const popup    = document.getElementById('preview_popup');
const popupBody= document.getElementById('preview_popup_body');

const previewArea   = document.getElementById('preview_area');
const previewAnchor = document.getElementById('preview_anchor');

// (optional) a soft backdrop to make the popup stand out over the plot
let backdrop = null;

function openPreviewPopup(){
  if (!popup || !previewArea || !popupBody) return;
  // move the existing node so your current JS keeps updating the same element
  popupBody.appendChild(previewArea);
  previewArea.style.display = '';     // ensure visible inside popup
  popup.hidden = false;

  // add a faint backdrop within the plot card
  if (!backdrop){
    backdrop = document.createElement('div');
    backdrop.className = 'preview-backdrop';
    popup.parentElement.appendChild(backdrop);
    backdrop.addEventListener('click', closePreviewPopup);
  }
  document.addEventListener('keydown', escClose);
}

function closePreviewPopup(){
  if (!popup || !previewArea || !previewAnchor) return;
  // move it back to its home
  previewAnchor.appendChild(previewArea);
  previewArea.style.display = 'none'; // keep it hidden in the side card
  popup.hidden = true;

  if (backdrop){ backdrop.remove(); backdrop = null; }
  document.removeEventListener('keydown', escClose);
}

function escClose(e){ if (e.key === 'Escape') closePreviewPopup(); }

btnOpen?.addEventListener('click', openPreviewPopup);
btnClose?.addEventListener('click', closePreviewPopup);

