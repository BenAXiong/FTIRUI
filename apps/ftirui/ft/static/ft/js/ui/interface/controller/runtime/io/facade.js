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
    updateCanvasState = () => {},
    focusPanel = () => {}
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

  const MULTI_IMPORT_PREF_KEY = 'ftirui.workspace.multiImportPref.v1';
  const canUsePreferenceStorage = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  const readMultiImportPreference = () => {
    if (!canUsePreferenceStorage) return null;
    try {
      const value = window.localStorage.getItem(MULTI_IMPORT_PREF_KEY);
      return value === 'combined' || value === 'separate' ? value : null;
    } catch {
      return null;
    }
  };
  const writeMultiImportPreference = (value) => {
    if (!canUsePreferenceStorage) return;
    try {
      if (value) {
        window.localStorage.setItem(MULTI_IMPORT_PREF_KEY, value);
      } else {
        window.localStorage.removeItem(MULTI_IMPORT_PREF_KEY);
      }
    } catch {
      /* ignore */
    }
  };
  let cachedMultiImportPreference = readMultiImportPreference();
  const rememberMultiImportPreference = (value) => {
    cachedMultiImportPreference = value;
    writeMultiImportPreference(value);
  };
  const clearMultiImportPreference = () => {
    cachedMultiImportPreference = null;
    writeMultiImportPreference('');
  };

  const setMultiImportPreference = (value) => {
    if (value === 'combined') {
      rememberMultiImportPreference('combined');
    } else if (value === 'separate') {
      rememberMultiImportPreference('separate');
    } else {
      clearMultiImportPreference();
    }
  };

  const getMultiImportPreference = () => cachedMultiImportPreference;

  const promptMultiImportMode = () => {
    if (typeof document === 'undefined' || typeof document.body === 'undefined') {
      return Promise.resolve({ mode: 'separate', remember: false });
    }
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'workspace-import-choice';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const panel = document.createElement('div');
      panel.className = 'workspace-import-choice-panel';
      overlay.appendChild(panel);

      const title = document.createElement('h3');
      title.className = 'workspace-import-choice-title';
      title.textContent = 'How to plot these data?';
      panel.appendChild(title);

      const hint = document.createElement('p');
      hint.className = 'workspace-import-choice-hint';
      hint.textContent = 'Reorganize your data at any time from the browser.';
      panel.appendChild(hint);

      const actionsRow = document.createElement('div');
      actionsRow.className = 'workspace-import-choice-actions';
      panel.appendChild(actionsRow);

      const rememberWrapper = document.createElement('label');
      rememberWrapper.className = 'workspace-import-choice-remember form-check';
      const rememberInput = document.createElement('input');
      rememberInput.type = 'checkbox';
      rememberInput.className = 'form-check-input';
      rememberWrapper.appendChild(rememberInput);
      const rememberCopy = document.createElement('span');
      rememberCopy.textContent = 'Do not ask me again';
      rememberWrapper.appendChild(rememberCopy);
      const rememberNote = document.createElement('span');
      rememberNote.className = 'workspace-import-choice-remember-note';
      rememberNote.textContent = '(You can change this later in Preferences)';
      rememberWrapper.appendChild(rememberNote);

      const makeButton = (label, classes) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = classes;
        btn.textContent = label;
        return btn;
      };

      const separateBtn = makeButton('Separate graphs', 'btn btn-primary workspace-import-choice-btn');
      const combinedBtn = makeButton('Same graph', 'btn btn-outline-secondary workspace-import-choice-btn');
      actionsRow.appendChild(separateBtn);
      actionsRow.appendChild(combinedBtn);
      panel.appendChild(rememberWrapper);

      const cleanup = () => {
        document.removeEventListener('keydown', keyHandler, true);
        overlay.classList.remove('is-visible');
        window.setTimeout(() => {
          overlay.remove();
        }, 180);
      };

      const finish = (mode) => {
        cleanup();
        resolve({
          mode,
          remember: rememberInput.checked
        });
      };

      const keyHandler = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish('separate');
        }
      };
      document.addEventListener('keydown', keyHandler, true);

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          finish('separate');
        }
      });

      separateBtn.addEventListener('click', () => finish('separate'));
      combinedBtn.addEventListener('click', () => finish('combined'));

      document.body.appendChild(overlay);
      const schedule = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(cb, 0);
      schedule(() => {
        overlay.classList.add('is-visible');
        separateBtn.focus();
      });
    });
  };

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

    const shouldPrompt = origin === 'browse' && safeFiles.length > 1;
    let importMode = 'separate';
    if (shouldPrompt) {
      if (cachedMultiImportPreference) {
        importMode = cachedMultiImportPreference;
      } else {
        const choice = await promptMultiImportMode();
        importMode = choice?.mode === 'combined' ? 'combined' : 'separate';
        if (choice?.remember) {
          rememberMultiImportPreference(importMode);
        }
      }
    }

    const normalizedPayloads = [];
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
        normalizedPayloads.push({
          ...payload,
          name: decodeName(payload?.name) || decodeName(file?.name) || 'Trace',
          filename: decodeName(payload?.filename || file?.name || '')
        });
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

    const ingestedCount = normalizedPayloads.length;
    if (!ingestedCount) {
      if (failures.length) {
        showToast('No files were added. Some files could not be parsed.', 'warning');
      }
      return;
    }

    let historyPushed = false;
    let lastPanelId = null;
    const ensureHistory = () => {
      if (!historyPushed) {
        pushHistory();
        historyPushed = true;
      }
    };

    if (importMode === 'combined' && normalizedPayloads.length > 1) {
      ensureHistory();
      const panelId = ingestPanel(normalizedPayloads, { skipHistory: true, skipPersist: true });
      if (panelId) {
        lastPanelId = panelId;
      }
    } else {
      for (const payload of normalizedPayloads) {
        ensureHistory();
        const panelId = ingestPanel(payload, { skipHistory: true, skipPersist: true });
        if (panelId) {
          lastPanelId = panelId;
        }
      }
    }

    persist();
    updateHistoryButtons();

    if (origin === 'browse' && ingestedCount === 1 && lastPanelId) {
      try {
        focusPanel(lastPanelId, { scrollBrowser: true });
      } catch {
        /* ignore focus failures */
      }
    }

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
    handleImportedFiles,
    setMultiImportPreference,
    getMultiImportPreference
  };
}
