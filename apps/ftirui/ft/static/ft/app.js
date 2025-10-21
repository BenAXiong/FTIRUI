import { createState }   from './js/core/state.js';
import { initUI_IntB } from './js/ui/interfaceB.js';
import { initWorkspaceCanvas } from './js/ui/interface/workspaceCanvas.js';
import { getCsrfToken } from './js/lib/csrf.js';

// Option A likely already initializes somewhere else.
// If not, you can do a similar instance for A later.

// pick saved theme or fallback to system
const saved = localStorage.getItem('theme');
const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const start = saved || (systemDark ? 'dark' : 'light');
document.documentElement.setAttribute('data-bs-theme', start);

const setTheme = (t) => {
    document.documentElement.setAttribute('data-bs-theme', t);
    localStorage.setItem('theme', t);
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) icon.textContent = t === 'dark' ? '🌙' : '☀️';
};

document.getElementById('themeToggle')?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
    setTheme(cur === 'dark' ? 'light' : 'dark');
});

// sync icon on load
(function initIcon(){
    const cur = document.documentElement.getAttribute('data-bs-theme') || 'light';
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) icon.textContent = cur === 'dark' ? '🌙' : '☀️';
})();

// CSRF
const csrftoken = getCsrfToken();

// Helpers
function el(id){ return document.getElementById(id); }
function setHTML(id, html){ el(id).innerHTML = html; }
function show(id, yes){ el(id).style.display = yes ? '' : 'none'; }

const toastContainer = document.getElementById('app_toasts');
const toastVariants = {
  success: 'text-bg-success',
  info: 'text-bg-info',
  warning: 'text-bg-warning',
  danger: 'text-bg-danger',
  primary: 'text-bg-primary'
};

function showAppToast({ title = '', message = '', variant = 'primary', delay = 4500 } = {}) {
  if (!toastContainer || typeof bootstrap === 'undefined') {
    if (title || message) console.info(title ? `${title}: ${message}` : message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${toastVariants[variant] || toastVariants.primary}`;
  toast.role = 'status';
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `
    <div class="toast-header">
      <strong class="me-auto">${title || 'Notice'}</strong>
      <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body">${message || ''}</div>
  `;
  toastContainer.appendChild(toast);
  const toastObj = new bootstrap.Toast(toast, { delay, autohide: true });
  toast.addEventListener('hidden.bs.toast', () => toast.remove());
  toastObj.show();
}

window.showAppToast = showAppToast;
const AUTH_STORAGE_KEY = 'ftir:last-auth';

const userStatusCard = el('user_status');
let currentUserState = null;
const userSignInLink = el('user_sign_in');
const userSignOutLink = el('user_sign_out');

userSignInLink?.addEventListener('click', () => {
  showAppToast({
    title: 'Signing in',
    message: 'Redirecting to login…',
    variant: 'info',
    delay: 2400
  });
});

userSignOutLink?.addEventListener('click', () => {
  showAppToast({
    title: 'Signing out',
    message: 'Redirecting to logout…',
    variant: 'info',
    delay: 2400
  });
});

function applyUserStatus(data) {
  if (!userStatusCard) return;
  userStatusCard.classList.remove('is-error');
  currentUserState = data;
  const nameEl = userStatusCard.querySelector('.user-primary');
  const secondaryEl = userStatusCard.querySelector('.user-secondary');
  const avatarEl = userStatusCard.querySelector('.user-avatar');
  const signInBtn = el('user_sign_in');
  const signOutBtn = el('user_sign_out');

  if (data.authenticated) {
    if (nameEl) nameEl.textContent = data.username || 'Account';
    if (secondaryEl) {
      const sessionsLabel = typeof data.session_count === 'number' ? `${data.session_count} cloud sessions` : 'Signed in';
      secondaryEl.textContent = sessionsLabel;
    }
    if (signInBtn) {
      signInBtn.href = data.login_url || signInBtn.getAttribute('href') || '/accounts/login/';
      signInBtn.classList.add('d-none');
    }
    if (signOutBtn) {
      signOutBtn.href = data.logout_url || signOutBtn.getAttribute('href') || '/accounts/logout/';
      signOutBtn.classList.remove('d-none');
    }
    if (avatarEl) {
      if (data.avatar) {
        avatarEl.innerHTML = `<img src="${data.avatar}" alt="">`;
        avatarEl.classList.remove('placeholder');
      } else {
        avatarEl.innerHTML = '<i class="bi bi-person-circle"></i>';
        avatarEl.classList.add('placeholder');
      }
    }
    userStatusCard.dataset.authenticated = '1';
  } else {
    if (nameEl) nameEl.textContent = 'Guest';
    if (secondaryEl) secondaryEl.textContent = 'Not signed in';
    if (signInBtn) {
      signInBtn.href = data.login_url || signInBtn.getAttribute('href') || '/accounts/login/';
      signInBtn.classList.remove('d-none');
    }
    if (signOutBtn) {
      signOutBtn.href = data.logout_url || signOutBtn.getAttribute('href') || '/accounts/logout/';
      signOutBtn.classList.add('d-none');
    }
    if (avatarEl) {
      avatarEl.innerHTML = '<i class="bi bi-person-circle"></i>';
      avatarEl.classList.add('placeholder');
    }
    userStatusCard.dataset.authenticated = '0';
  }
}

async function refreshUserStatus(options = {}) {
  if (!userStatusCard) return null;
  const previousState = currentUserState;
  try {
    const resp = await fetch('/api/me/', { credentials: 'same-origin' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    let storedAuth;
    try {
      storedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    } catch (storageErr) {
      storedAuth = null;
    }

    const prevAuth =
      typeof previousState?.authenticated === 'boolean'
        ? previousState.authenticated
        : storedAuth !== null
          ? storedAuth === '1'
          : undefined;
    const newAuth = !!data.authenticated;

    applyUserStatus(data);

    if (prevAuth !== undefined && prevAuth !== newAuth) {
      if (newAuth) {
        showAppToast({
          title: 'Signed in',
          message: data.username ? `Welcome back, ${data.username}!` : 'Cloud features are now enabled.',
          variant: 'success'
        });
      } else {
        showAppToast({
          title: 'Signed out',
          message: 'Cloud features paused. Local autosave continues offline.',
          variant: 'info'
        });
      }
    }

    try {
      localStorage.setItem(AUTH_STORAGE_KEY, newAuth ? '1' : '0');
    } catch (storageErr) {
      console.warn('Unable to persist auth state indicator', storageErr);
    }

    document.dispatchEvent(new CustomEvent('ftir:user-status', { detail: { data, previous: previousState } }));
    return data;
  } catch (err) {
    console.warn('User status failed', err);
    userStatusCard.classList.add('is-error');
    const nameEl = userStatusCard.querySelector('.user-primary');
    const secondaryEl = userStatusCard.querySelector('.user-secondary');
    if (nameEl) nameEl.textContent = 'Offline';
    if (secondaryEl) secondaryEl.textContent = 'Unable to reach account services';
    if (!userStatusCard.dataset.errorToastShown) {
      showAppToast({
        title: 'Account status unavailable',
        message: err?.message || 'Unable to reach account services.',
        variant: 'warning'
      });
      userStatusCard.dataset.errorToastShown = '1';
    }
    return null;
  }
}

window.refreshUserStatus = refreshUserStatus;
if (userStatusCard) {
  refreshUserStatus();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshUserStatus();
    }
  });
}

// ---- Convert: Preview table ----
el('btn_toggle_preview').addEventListener('click', ()=> {
    const wrap = el('preview_area');
    wrap.style.display = (wrap.style.display === 'none') ? '' : 'none';
});


// Auto-plot on Live tab when Feather files are chosen
const liveFileInput = el('live_file');
if (liveFileInput) {
    liveFileInput.addEventListener('change', async () => {
        await doLivePlot();
    });
}

// ---- Plotly render helpers ----
function renderPlotly(data){
  const config = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToAdd: ['toImage'],
    toImageButtonOptions: {
      format:'png', filename:'ftir_plot',
      height:600, width:1200, scale:2
    },
  };
  Plotly.newPlot('plotly_plot', data.traces, data.layout, config);
}

function addMarkerAt(xVal, yVal){
  // add a small scatter point as a marker
  const trace = {name: `Marker ${++markerCount}`, x:[xVal], y:[yVal], mode:'markers', type:'scatter'};
  Plotly.addTraces('plotly_plot', [trace]);
}

// ---- Table preview (new JSON: columns + rows[dict]) ----
async function fetchPreview(file){
  const fd = new FormData();
  fd.append('file', file);
  fd.append('delimiter', el('delimiter')?.value || '');
  fd.append('decimal_comma', el('decimal_comma')?.checked || false);
  fd.append('skiprows', el('skiprows')?.value || '0');
  fd.append('sheet', el('sheet')?.value || '');

  const resp = await fetch('/preview/', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
  const data = await resp.json().catch(()=>({}));
  if(!resp.ok){ setHTML('preview_area', `<div class="text-danger">${data.error||'Preview failed'}</div>`); return; }

  const cols = data.columns || [];
  const rows = data.rows || [];
  let html = '<table class="table table-sm table-striped preview-table"><thead><tr>';
  for (const c of cols) html += `<th>${c}</th>`;
  html += '</tr></thead><tbody>';
  for (const r of rows){
    html += '<tr>';
    for (const c of cols){ html += `<td>${r[c] ?? ''}</td>`; }
    html += '</tr>';
  }
  html += '</tbody></table>';
  setHTML('preview_area', html);
}

// ---- /data -> Plotly JSON ----
async function fetchPlotData(file){
  const fd = new FormData();
  fd.append('file', file);
  fd.append('x_col', el('x_col')?.value || '0');
  fd.append('y_col', el('y_col')?.value || '1');
  fd.append('delimiter', el('delimiter')?.value || '');
  fd.append('decimal_comma', el('decimal_comma')?.checked || false);
  fd.append('skiprows', el('skiprows')?.value || '0');
  fd.append('sheet', el('sheet')?.value || '');
  fd.append('invert', el('invert')?.checked || true); // FT-IR default

  const resp = await fetch('/data/', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
  const data = await resp.json().catch(()=>({}));
  if(!resp.ok){ setHTML('plot_placeholder', data.error || 'Plot failed'); return; }
  renderPlotly(data);
}










// ---- Plot: Convert -> immediate downloads ----
el('btn_convert_feather').addEventListener('click', async () => {
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
    const liveInput = el('live_file');
    const img = el('plot_img_live');
    if (!liveInput || !img) return;

    const files = liveInput.files || [];
    if (!files.length){ img.alt='Choose Feather file(s)'; img.removeAttribute('src'); return; }

    const fd = new FormData();
    for (const f of files) fd.append('file', f);  // multiple
    const invertField = el('invert_live');
    const xminField = el('xmin_live');
    const xmaxField = el('xmax_live');
    fd.append('invert', invertField ? invertField.checked : false);
    fd.append('xmin', xminField ? (xminField.value || 'auto') : 'auto');
    fd.append('xmax', xmaxField ? (xmaxField.value || 'auto') : 'auto');

    const resp = await fetch('/plot', { method:'POST', headers:{'X-CSRFToken':csrftoken}, body:fd });
    if (!resp.ok){ const d = await resp.json().catch(()=>({})); img.alt = d.error||'Plot failed'; img.removeAttribute('src'); return; }
    const blob = await resp.blob(); img.src = URL.createObjectURL(blob);
    lastPlotMode = 'live';
}
const livePlotButton = el('btn_plot');
if (livePlotButton) {
    livePlotButton.addEventListener('click', doLivePlot);
}

// ---- Auto replot on invert/x-range changes ----
let lastPlotMode = null; // 'preview' | 'live'
function scheduleReplot(scope){
    if (scope === 'preview' && lastPlotMode === 'preview') doPlotPreview();
    if (scope === 'preview' && lastPlotMode === 'preview') doPreview();
    if (scope === 'live' && lastPlotMode === 'live') doLivePlot();
}

// Plot panel controls
el('invert').addEventListener('change', ()=>scheduleReplot('preview'));
el('xmin').addEventListener('input', ()=>scheduleReplot('preview'));
el('xmax').addEventListener('input', ()=>scheduleReplot('preview'));
el('btn_reset_x').addEventListener('click', ()=>{ el('xmin').value=''; el('xmax').value=''; scheduleReplot('preview'); });
el('btn_reset_y').addEventListener('click', ()=>{ el('ymin').value=''; el('ymax').value=''; scheduleReplot('preview'); });

// Live panel controls
const invertLive = el('invert_live');
const xminLive = el('xmin_live');
const xmaxLive = el('xmax_live');
if (invertLive) invertLive.addEventListener('change', ()=>scheduleReplot('live'));
if (xminLive) xminLive.addEventListener('input', ()=>scheduleReplot('live'));
if (xmaxLive) xmaxLive.addEventListener('input', ()=>scheduleReplot('live'));

// helper: build a FileList for input

// ---- Drag & drop / click to select ----
const dz  = el('drop_zone');
const inp = el('conv_files');

function filesToFileList(files){ 
    const dt=new DataTransfer(); 
    [...files].forEach(f=>dt.items.add(f)); 
    return dt.files; 
}



if (dz && inp){
  dz.addEventListener('click', (e) => {
    if (!dz.classList.contains('has-files')) inp.click();
});
  ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('dragover'); }));
  ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('dragover'); }));
  dz.addEventListener('drop', async (e) => {
    const files = e.dataTransfer?.files; if(!files || !files.length) return;
    inp.files = filesToFileList(files);
    await handleNewFile();
  });
  inp.addEventListener('change', handleNewFile);
}

async function handleNewFile(){
  const placeholder = el('plot_placeholder');
  if (inp.files?.length){
    dz.classList.remove('idle'); dz.classList.add('has-files');
    placeholder?.remove();
    // 1) Plotly JSON + render
    await fetchPlotData(inp.files[0]);
    // 2) Table preview
    await fetchPreview(inp.files[0]);
  }
}

// ---- Axis controls: re-request /data with invert or ranges if you prefer server logic,
// but here we’ll do client-side relayout for snappy UX ----
function relayoutFromInputs(){
  const xmin = el('xmin')?.value || '';
  const xmax = el('xmax')?.value || '';
  const invert = el('invert')?.checked;

  const update = {
    'xaxis.autorange': invert ? 'reversed' : true
  };
  if (xmin || xmax){
    // let Plotly parse numeric; empty means auto
    if (xmin) update['xaxis.range[0]'] = parseFloat(xmin);
    if (xmax) update['xaxis.range[1]'] = parseFloat(xmax);
  } else {
    update['xaxis.range'] = null; // auto
  }
  Plotly.relayout('plotly_plot', update);
}

el('invert')?.addEventListener('change', relayoutFromInputs);
el('xmin')?.addEventListener('input', relayoutFromInputs);
el('xmax')?.addEventListener('input', relayoutFromInputs);
el('btn_reset_x')?.addEventListener('click', () => { el('xmin').value=''; el('xmax').value=''; relayoutFromInputs(); });

// ---- Click to drop a marker ----
el('plotly_plot')?.addEventListener('plotly_click', (ev) => {
  if (!ev || !ev.points || !ev.points.length) return;
  const p = ev.points[0];
  addMarkerAt(p.x, p.y);
});

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




// Tabs M1

document.addEventListener('DOMContentLoaded', () => {
  // Lazy init Option B when its tab is first shown
  const plotBTab = document.getElementById('tab-plotB');
  const plotCTab = document.getElementById('tab-plotC');
  let initializedB = false;
  let initializedCanvas = false;

  const initPlotB = () => {
    if (initializedB) return;

    const instanceB = {
      dom: {
        plot: document.getElementById('b_plot_el'),
        dz:   document.getElementById('b_dropzone'),
        inp:  document.getElementById('b_file_input'),
        demoBtn: document.getElementById('b_demo_btn'),
        browseBtn: document.getElementById('b_browse_btn')
      },
      state: createState(),   // fresh, independent state for Plot B
    };

    initUI_IntB(instanceB);   // sets up DnD + multi-file ingest + render
    initializedB = true;
  };

  const initCanvas = () => {
    if (initializedCanvas) return;
    initWorkspaceCanvas();
    initializedCanvas = true;
  };

  plotBTab?.addEventListener('shown.bs.tab', initPlotB);
  plotCTab?.addEventListener('shown.bs.tab', initCanvas);

  if (document.getElementById('pane-plotB')?.classList.contains('show')) {
    initPlotB();
  }
  if (document.getElementById('pane-plotC')?.classList.contains('show')) {
    initCanvas();
  }
});


