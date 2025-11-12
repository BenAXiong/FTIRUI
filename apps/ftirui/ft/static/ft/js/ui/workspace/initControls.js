import { getCsrfToken } from '../../lib/csrf.js';
import { el, setHTML, onEl } from '../utils/dom.js';
import { initWorkspaceCanvas } from '../interface/workspaceCanvas.js';

const csrftoken = getCsrfToken();

let lastPlotMode = null; // 'preview' | 'live'
let markerCount = 0;
let dropZone = null;
let convertInput = null;
let canvasBootstrapped = false;
let workspaceMounted = false;

function renderPlotly(data) {
  const config = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToAdd: ['toImage'],
    toImageButtonOptions: {
      format: 'png',
      filename: 'ftir_plot',
      height: 600,
      width: 1200,
      scale: 2
    }
  };
  Plotly.newPlot('plotly_plot', data.traces, data.layout, config);
}

function addMarkerAt(xVal, yVal) {
  markerCount += 1;
  const trace = {
    name: `Marker ${markerCount}`,
    x: [xVal],
    y: [yVal],
    mode: 'markers',
    type: 'scatter'
  };
  Plotly.addTraces('plotly_plot', [trace]);
}

async function fetchPreview(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('delimiter', el('delimiter')?.value || '');
  fd.append('decimal_comma', el('decimal_comma')?.checked || false);
  fd.append('skiprows', el('skiprows')?.value || '0');
  fd.append('sheet', el('sheet')?.value || '');

  const resp = await fetch('/preview/', {
    method: 'POST',
    headers: { 'X-CSRFToken': csrftoken },
    body: fd
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    setHTML('preview_area', `<div class="text-danger">${data.error || 'Preview failed'}</div>`);
    return;
  }

  const cols = data.columns || [];
  const rows = data.rows || [];
  let html = '<table class="table table-sm table-striped preview-table"><thead><tr>';
  for (const column of cols) {
    html += `<th>${column}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    for (const column of cols) {
      html += `<td>${row[column] ?? ''}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  setHTML('preview_area', html);
}

async function fetchPlotData(file) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('x_col', el('x_col')?.value || '0');
  fd.append('y_col', el('y_col')?.value || '1');
  fd.append('delimiter', el('delimiter')?.value || '');
  fd.append('decimal_comma', el('decimal_comma')?.checked || false);
  fd.append('skiprows', el('skiprows')?.value || '0');
  fd.append('sheet', el('sheet')?.value || '');
  fd.append('invert', el('invert')?.checked || true);

  const resp = await fetch('/data/', {
    method: 'POST',
    headers: { 'X-CSRFToken': csrftoken },
    body: fd
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    setHTML('plot_placeholder', data.error || 'Plot failed');
    return;
  }
  renderPlotly(data);
}

async function doLivePlot() {
  const liveInput = el('live_file');
  const img = el('plot_img_live');
  if (!liveInput || !img) return;

  const files = liveInput.files || [];
  if (!files.length) {
    img.alt = 'Choose Feather file(s)';
    img.removeAttribute('src');
    return;
  }

  const fd = new FormData();
  for (const file of files) {
    fd.append('file', file);
  }
  const invertField = el('invert_live');
  const xminField = el('xmin_live');
  const xmaxField = el('xmax_live');
  fd.append('invert', invertField ? invertField.checked : false);
  fd.append('xmin', xminField ? xminField.value || 'auto' : 'auto');
  fd.append('xmax', xmaxField ? xmaxField.value || 'auto' : 'auto');

  try {
    const resp = await fetch('/plot', {
      method: 'POST',
      headers: { 'X-CSRFToken': csrftoken },
      body: fd
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      img.alt = data.error || 'Plot failed';
      img.removeAttribute('src');
      return;
    }
    const blob = await resp.blob();
    img.src = URL.createObjectURL(blob);
    lastPlotMode = 'live';
  } catch (error) {
    console.error('Live plot failed', error);
    img.alt = 'Plot failed';
    img.removeAttribute('src');
  }
}

async function scheduleReplot(scope) {
  if (scope === 'preview' && lastPlotMode === 'preview') {
    await handleNewFile(false);
  } else if (scope === 'live' && lastPlotMode === 'live') {
    await doLivePlot();
  }
}

function filesToFileList(files) {
  const dt = new DataTransfer();
  [...files].forEach((file) => dt.items.add(file));
  return dt.files;
}

async function handleNewFile(updateDropZone = true) {
  if (!convertInput) return;

  const files = convertInput.files || [];
  if (!files.length) {
    setHTML('preview_area', '<div class="text-danger">Choose a file.</div>');
    return;
  }

  if (updateDropZone && dropZone) {
    dropZone.classList.remove('idle');
    dropZone.classList.add('has-files');
  }
  const placeholder = el('plot_placeholder');
  placeholder?.remove();

  const file = files[0];
  try {
    await fetchPlotData(file);
    await fetchPreview(file);
    lastPlotMode = 'preview';
    markerCount = 0;
  } catch (error) {
    console.error('Preview refresh failed', error);
  }
}

function relayoutFromInputs() {
  const xmin = el('xmin')?.value || '';
  const xmax = el('xmax')?.value || '';
  const invert = el('invert')?.checked;

  const update = {
    'xaxis.autorange': invert ? 'reversed' : true
  };
  if (xmin || xmax) {
    if (xmin) update['xaxis.range[0]'] = parseFloat(xmin);
    if (xmax) update['xaxis.range[1]'] = parseFloat(xmax);
  } else {
    update['xaxis.range'] = null;
  }
  Plotly.relayout('plotly_plot', update);
}

function setupDropZone() {
  if (!dropZone || !convertInput) return;

  dropZone.addEventListener('click', () => {
    if (!dropZone.classList.contains('has-files')) {
      convertInput.click();
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', async (event) => {
    const files = event.dataTransfer?.files;
    if (!files || !files.length) return;
    convertInput.files = filesToFileList(files);
    await handleNewFile();
  });

  convertInput.addEventListener('change', () => {
    void handleNewFile();
  });
}

function setupPreviewPopup() {
  const btnOpen = document.getElementById('btn_preview_popup');
  const btnClose = document.getElementById('btn_close_preview');
  const popup = document.getElementById('preview_popup');
  const popupBody = document.getElementById('preview_popup_body');
  const previewArea = document.getElementById('preview_area');
  const previewAnchor = document.getElementById('preview_anchor');
  if (!popup || !previewArea || !popupBody || !previewAnchor) return;

  let backdrop = null;

  const closePreviewPopup = () => {
    popup.hidden = true;
    previewAnchor.appendChild(previewArea);
    previewArea.style.display = 'none';
    if (backdrop) {
      backdrop.remove();
      backdrop = null;
    }
    document.removeEventListener('keydown', escClose);
  };

  const escClose = (event) => {
    if (event.key === 'Escape') {
      closePreviewPopup();
    }
  };

  const openPreviewPopup = () => {
    popupBody.appendChild(previewArea);
    previewArea.style.display = '';
    popup.hidden = false;
    if (!backdrop && popup.parentElement) {
      backdrop = document.createElement('div');
      backdrop.className = 'preview-backdrop';
      popup.parentElement.appendChild(backdrop);
      backdrop.addEventListener('click', closePreviewPopup);
    }
    document.addEventListener('keydown', escClose);
  };

  btnOpen?.addEventListener('click', openPreviewPopup);
  btnClose?.addEventListener('click', closePreviewPopup);
}

function initConvertPanel() {
  const previewToggleButton = el('btn_toggle_preview');
  if (previewToggleButton) {
    previewToggleButton.addEventListener('click', () => {
      const previewWrap = el('preview_area');
      if (!previewWrap) return;
      previewWrap.style.display = previewWrap.style.display === 'none' ? '' : 'none';
    });
  }

  const convertButton = el('btn_convert_feather');
  if (convertButton) {
    convertButton.addEventListener('click', async () => {
      const files = convertInput?.files;
      if (!files || !files.length) {
        setHTML('convert_status', '<div class="text-danger">Choose file(s) to convert.</div>');
        return;
      }

      const fd = new FormData();
      for (const file of files) {
        fd.append('files', file);
      }
      fd.append('x_col', el('x_col')?.value ?? '');
      fd.append('y_col', el('y_col')?.value ?? '');
      fd.append('absorbance', el('absorbance')?.checked ?? false);
      fd.append('assume_percent', el('assume_percent')?.checked ?? false);
      fd.append('delimiter', el('delimiter')?.value ?? '');
      fd.append('decimal_comma', el('decimal_comma')?.checked ?? false);
      fd.append('no_header', el('no_header')?.checked ?? false);
      fd.append('skiprows', el('skiprows')?.value ?? '');
      fd.append('sheet', el('sheet')?.value ?? '');
      fd.append('header_row', el('header_row')?.value ?? '');

      const resp = await fetch('/plot/', {
        method: 'POST',
        headers: { 'X-CSRFToken': csrftoken },
        body: fd
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setHTML('convert_status', `<div class="text-danger">${data.error || 'Conversion failed'}</div>`);
        return;
      }

      const outputs = data.outputs || [];
      if (!outputs.length) {
        setHTML('convert_status', '<div class="text-danger">No outputs.</div>');
        return;
      }
      for (const output of outputs) {
        const anchor = document.createElement('a');
        anchor.href = output.url;
        anchor.download = output.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      setHTML('convert_status', `<div class="alert alert-success py-2 mb-0">Downloaded ${outputs.length} file(s).</div>`);
    });
  }

  onEl('invert', 'change', () => {
    void scheduleReplot('preview');
  });
  onEl('xmin', 'input', () => {
    void scheduleReplot('preview');
  });
  onEl('xmax', 'input', () => {
    void scheduleReplot('preview');
  });
  onEl('btn_reset_x', 'click', () => {
    const xmin = el('xmin');
    const xmax = el('xmax');
    if (xmin) xmin.value = '';
    if (xmax) xmax.value = '';
    void scheduleReplot('preview');
  });
  onEl('btn_reset_y', 'click', () => {
    const ymin = el('ymin');
    const ymax = el('ymax');
    if (ymin) ymin.value = '';
    if (ymax) ymax.value = '';
    void scheduleReplot('preview');
  });

  onEl('invert', 'change', relayoutFromInputs);
  onEl('xmin', 'input', relayoutFromInputs);
  onEl('xmax', 'input', relayoutFromInputs);
  onEl('btn_reset_x', 'click', relayoutFromInputs);

  const plotElement = el('plotly_plot');
  if (plotElement) {
    plotElement.addEventListener('plotly_click', (event) => {
      const point = event?.points?.[0];
      if (!point) return;
      addMarkerAt(point.x, point.y);
    });
  }
}

function initLivePanel() {
  const liveFileInput = el('live_file');
  if (liveFileInput) {
    liveFileInput.addEventListener('change', () => {
      void doLivePlot();
    });
  }

  const livePlotButton = el('btn_plot');
  if (livePlotButton) {
    livePlotButton.addEventListener('click', () => {
      void doLivePlot();
    });
  }

  const invertLive = el('invert_live');
  const xminLive = el('xmin_live');
  const xmaxLive = el('xmax_live');
  invertLive?.addEventListener('change', () => {
    void scheduleReplot('live');
  });
  xminLive?.addEventListener('input', () => {
    void scheduleReplot('live');
  });
  xmaxLive?.addEventListener('input', () => {
    void scheduleReplot('live');
  });
}

function bootWorkspaceCanvas() {
  if (canvasBootstrapped) return;
  initWorkspaceCanvas();
  canvasBootstrapped = true;
}

export function mountWorkspace() {
  if (workspaceMounted) return true;
  const workspacePane = document.getElementById('pane-plotC');
  if (!workspacePane) return false;

  dropZone = el('drop_zone');
  convertInput = el('conv_files');

  initConvertPanel();
  initLivePanel();
  setupDropZone();
  setupPreviewPopup();
  bootWorkspaceCanvas();
  workspaceMounted = true;
  return true;
}

export function __resetWorkspaceMountForTests() {
  workspaceMounted = false;
  canvasBootstrapped = false;
}
