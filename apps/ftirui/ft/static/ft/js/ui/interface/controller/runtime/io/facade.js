export function createIoFacade({
  dom = {},
  services = {},
  actions = {},
  history = {},
  persistence = {},
  notifications = {},
  state = {},
  helpers = {},
  utils = {}
} = {}) {
  const {
    canvas = null,
    emptyOverlay = null,
    browseButton = null,
    fileInput = null,
    demoButton = null,
    addPlotButton = null,
    resetButton = null
  } = {
    canvas: dom.canvas,
    emptyOverlay: dom.emptyOverlay,
    browseButton: dom.browseBtn,
    fileInput: dom.fileInput,
    demoButton: dom.demoBtn,
    addPlotButton: dom.addPlotBtn,
    resetButton: dom.resetBtn
  };

  const {
    uploadTraceFile = async () => null,
    fetchDemoFiles = async () => []
  } = services;

  const {
    ingestPanel = () => {},
    appendFilesToGraph = async () => {},
    clearPanels = () => {},
    renderBrowser = () => {},
    updateCanvasState = () => {}
  } = actions;

  const {
    history: historyApi = null,
    pushHistory = () => {},
    updateHistoryButtons = () => {}
  } = history;

  const {
    persist = () => {}
  } = persistence;

  const {
    showToast = () => {}
  } = notifications;

  const {
    panels: panelsState = {},
    workspace: workspaceState = {}
  } = state || {};

  const getPanelRecord = typeof panelsState.getRecord === 'function'
    ? panelsState.getRecord
    : () => null;
  const getNextPanelSequence = typeof workspaceState.getNextPanelSequence === 'function'
    ? workspaceState.getNextPanelSequence
    : () => 0;
  const hasPanels = typeof workspaceState.hasPanels === 'function'
    ? workspaceState.hasPanels
    : () => false;

  const {
    resetColorCursor = () => {}
  } = helpers;

  const {
    decodeName = (value) => value
  } = utils;

  let pendingGraphFileTarget = null;
  const listeners = [];

  const addListener = (target, event, handler, options) => {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(event, handler, options);
    listeners.push({ target, event, handler, options });
  };

  const removeAllListeners = () => {
    listeners.splice(0).forEach(({ target, event, handler, options }) => {
      if (target && typeof target.removeEventListener === 'function') {
        target.removeEventListener(event, handler, options);
      }
    });
  };

  const requestGraphFileBrowse = (panelId) => {
    if (!fileInput) return;
    if (panelId && typeof getPanelRecord === 'function' && !getPanelRecord(panelId)) {
      return;
    }
    pendingGraphFileTarget = panelId || null;
    try {
      fileInput.value = '';
    } catch {
      // ignore
    }
    try {
      fileInput.click();
    } catch {
      // ignore interaction errors (e.g., blocked by browser)
    }
  };

  const handleFilesPayload = async (files, { origin } = {}) => {
    const safeFiles = Array.from(files || []).filter(Boolean);
    if (!safeFiles.length) return;

    let historyPushed = false;
    let ingestedCount = 0;
    const failures = [];
    const formatIngestError = (error) => {
      if (!error) return 'Unknown error';
      const raw = typeof error?.message === 'string' ? error.message : String(error);
      const segments = raw.split('\n').filter(Boolean);
      const headline = segments.shift() || 'Upload failed';
      let detail = '';
      for (const segment of segments) {
        if (detail) break;
        if (!segment.trim()) continue;
        if (segment.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(segment);
            if (parsed && typeof parsed.error === 'string') {
              detail = parsed.error;
              break;
            }
          } catch {
            detail = segment.trim();
          }
        } else {
          detail = segment.trim();
        }
      }
      return detail ? `${headline} – ${detail}` : headline;
    };

    for (const file of safeFiles) {
      try {
        const payload = await uploadTraceFile(file, 'auto');
        if (!historyPushed) {
          pushHistory();
          historyPushed = true;
        }
        ingestPanel({
          ...payload,
          name: decodeName(payload?.name) || decodeName(file?.name) || 'Trace',
          filename: decodeName(payload?.filename || file?.name || '')
        }, { skipHistory: true, skipPersist: true });
        ingestedCount += 1;
      } catch (err) {
        const friendlyName = decodeName(file?.name || '');
        const summary = formatIngestError(err);
        console.warn(
          '[workspace:upload] Skipping %s: %s',
          friendlyName || 'unnamed file',
          summary
        );
        console.debug('[workspace:upload] Full ingest error details', err);
        failures.push({
          name: decodeName(file?.name || ''),
          error: summary
        });
      }
    }

    if (!ingestedCount) {
      if (failures.length) {
        showToast('No files were added. Some files could not be parsed.', 'warning');
      }
      return;
    }

    persist();
    updateHistoryButtons();

    const message =
      origin === 'drop'
        ? 'Files added from drop.'
        : origin === 'demo'
          ? 'Demo files added to workspace.'
          : 'Files added to workspace.';
    showToast(message, 'success');

    if (failures.length) {
      const label = failures.length === 1
        ? (failures[0].name || '1 file')
        : `${failures.length} files`;
      showToast(`Skipped ${label} that could not be parsed.`, 'warning');
    }
  };

  const handleImportedFiles = async (fileList, options = {}) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    await handleFilesPayload(files, options);
  };

  const loadDemoGraphs = async () => {
    if (!demoButton) return;
    demoButton.disabled = true;
    demoButton.classList.add('disabled');
    try {
      const files = await fetchDemoFiles(12);
      if (!files.length) {
        showToast('No demo files available right now.', 'warning');
        return;
      }
      await handleFilesPayload(files, { origin: 'demo' });
    } catch (err) {
      console.warn('Failed to load demo files', err);
      showToast('Unable to load demo files.', 'danger');
    } finally {
      demoButton.disabled = false;
      demoButton.classList.remove('disabled');
    }
  };

  const onBrowseClick = () => {
    pendingGraphFileTarget = null;
    requestGraphFileBrowse(null);
  };

  const onFileInputChange = async () => {
    const targetGraphId = pendingGraphFileTarget;
    const files = fileInput?.files;
    pendingGraphFileTarget = null;
    if (targetGraphId) {
      await appendFilesToGraph(targetGraphId, files);
    } else {
      await handleImportedFiles(files, { origin: 'browse' });
    }
    if (fileInput) {
      try {
        fileInput.value = '';
      } catch {
        // ignore
      }
    }
  };

  const onDemoClick = () => {
    loadDemoGraphs();
  };

  const deactivateCanvas = () => {
    canvas?.classList.remove('is-active');
  };

  const onCanvasDrag = (event) => {
    event.preventDefault();
    canvas?.classList.add('is-active');
  };

  const onCanvasDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    deactivateCanvas();
    const files = event.dataTransfer?.files;
    if (files?.length) {
      await handleImportedFiles(files, { origin: 'drop' });
    }
  };

  const onAddSampleClick = () => {
    ingestPanel({
      name: `Sample ${getNextPanelSequence()}`
    });
    showToast('Sample graph added to workspace.', 'success');
    updateHistoryButtons();
  };

  const onResetClick = () => {
    if (!hasPanels()) return;
    pushHistory();
    clearPanels();
    resetColorCursor();
    persist();
    updateCanvasState();
    renderBrowser();
    showToast('Workspace canvas cleared.', 'warning');
    updateHistoryButtons();
  };

  const attach = () => {
    addListener(browseButton, 'click', onBrowseClick);
    addListener(fileInput, 'change', onFileInputChange);
    addListener(demoButton, 'click', onDemoClick);

    if (canvas) {
      addListener(canvas, 'dragover', onCanvasDrag);
      addListener(canvas, 'dragenter', onCanvasDrag);
      addListener(canvas, 'dragleave', deactivateCanvas);
      addListener(canvas, 'dragend', deactivateCanvas);
      addListener(canvas, 'drop', onCanvasDrop);
    }
    if (emptyOverlay) {
      addListener(emptyOverlay, 'dragover', onCanvasDrag);
      addListener(emptyOverlay, 'dragenter', onCanvasDrag);
      addListener(emptyOverlay, 'dragleave', deactivateCanvas);
      addListener(emptyOverlay, 'dragend', deactivateCanvas);
      addListener(emptyOverlay, 'drop', onCanvasDrop);
    }

    addListener(addPlotButton, 'click', onAddSampleClick);
    addListener(resetButton, 'click', onResetClick);
  };

  const detach = () => {
    removeAllListeners();
    pendingGraphFileTarget = null;
  };

  return {
    attach,
    detach,
    requestGraphFileBrowse,
    handleImportedFiles
  };
}
