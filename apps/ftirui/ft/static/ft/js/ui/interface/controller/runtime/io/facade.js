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
    importFolderButton = null,
    fileInput = null,
    folderInput = null,
    demoButton = null,
    addPlotButton = null,
    resetButton = null
  } = {
    canvas: dom.canvas,
    emptyOverlay: dom.emptyOverlay,
    browseButton: dom.browseBtn,
    importFolderButton: dom.importFolderBtn,
    fileInput: dom.fileInput,
    folderInput: dom.folderInput,
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
    focusPanel = () => {},
    createSection = () => null,
    findSectionByName: lookupSectionByName = () => null
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

  const findSectionIdByName = (name, parentId = null) => {
    if (typeof lookupSectionByName !== 'function') return null;
    const result = lookupSectionByName(name, parentId);
    if (!result) return null;
    if (typeof result === 'string') return result;
    if (typeof result?.id === 'string') return result.id;
    return null;
  };

  const ensureSectionId = (name, parentId = null) => {
    const existingId = findSectionIdByName(name, parentId);
    if (existingId) return existingId;
    const created = createSection?.(name, { parentId }) || null;
    if (typeof created === 'string') return created;
    return created?.id || null;
  };

  const ROOT_FOLDER_KEY = '__root__';
  const MAX_FOLDER_FILES = 250;
  const DATA_EXTENSIONS = new Set([
    '.csv', '.txt', '.tsv', '.dat', '.spa', '.spc', '.jdx', '.dx', '.sp', '.mds', '.json'
  ]);
  const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.svg', '.webp'
  ]);
  const TYPE_LABELS = {
    data: 'Data files',
    image: 'Images',
    other: 'Other files'
  };

  const getExtension = (name = '') => {
    if (typeof name !== 'string') return '';
    const idx = name.lastIndexOf('.');
    if (idx === -1) return '';
    return name.slice(idx).toLowerCase();
  };

  const classifyFileType = (file, ext) => {
    const normalizedExt = ext || getExtension(file?.name || '');
    if (IMAGE_EXTENSIONS.has(normalizedExt)) return 'image';
    if (DATA_EXTENSIONS.has(normalizedExt)) return 'data';
    if ((file?.type || '').startsWith('image/')) return 'image';
    if ((file?.type || '').includes('text')) return 'data';
    return 'other';
  };

  const deriveRootName = (fallbackEntries = []) => {
    const sample = fallbackEntries.find((entry) => entry?.relativePath)?.relativePath
      || fallbackEntries.find((entry) => entry?.file)?.file?.webkitRelativePath
      || '';
    if (!sample) return 'Imported folder';
    const [first] = sample.split(/[/\\]/).filter(Boolean);
    return first || 'Imported folder';
  };

  const normalizeRelativePath = (value = '') => value.replace(/^[\\/]+/, '');
  const sortEntries = (entries = []) => entries.slice().sort((a, b) => {
    return a.relativePath.localeCompare(b.relativePath);
  });

  const collectFromDirectoryHandle = async () => {
    if (typeof window?.showDirectoryPicker !== 'function') return null;
    try {
      const dirHandle = await window.showDirectoryPicker();
      const entries = [];
      let truncated = false;
      const walk = async (handle, pathSegments = []) => {
        if (entries.length >= MAX_FOLDER_FILES) {
          truncated = true;
          return;
        }
        if (!handle || typeof handle.values !== 'function') return;
        for await (const entry of handle.values()) {
          if (entries.length >= MAX_FOLDER_FILES) {
            truncated = true;
            break;
          }
          if (entry.kind === 'file') {
            try {
              const file = await entry.getFile();
              entries.push({
                file,
                relativePath: normalizeRelativePath([...pathSegments, entry.name].join('/'))
              });
            } catch {
              /* skip problematic file */
            }
          } else if (entry.kind === 'directory') {
            await walk(entry, [...pathSegments, entry.name]);
          }
        }
      };
      await walk(dirHandle, []);
      if (!entries.length) {
        return {
          rootName: dirHandle.name || 'Imported folder',
          entries: [],
          truncated
        };
      }
      return {
        rootName: dirHandle.name || 'Imported folder',
        entries: sortEntries(entries),
        truncated
      };
    } catch (err) {
      if (err?.name === 'AbortError') {
        return null;
      }
      console.warn('Folder picker failed', err);
      return null;
    }
  };

  const collectFromFolderInput = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return null;
    const rootName = deriveRootName(files.map((file) => ({
      relativePath: file.webkitRelativePath || file.name
    })));
    const entries = [];
    let truncated = false;
    for (const file of files) {
      if (entries.length >= MAX_FOLDER_FILES) {
        truncated = true;
        break;
      }
      const rawPath = file.webkitRelativePath || file.name;
      let relativePath = rawPath;
      if (rawPath?.toLowerCase().startsWith(rootName.toLowerCase())) {
        relativePath = rawPath.slice(rootName.length);
      }
      relativePath = normalizeRelativePath(relativePath) || file.name;
      entries.push({
        file,
        relativePath
      });
    }
    return {
      rootName: rootName || 'Imported folder',
      entries: sortEntries(entries),
      truncated: truncated || files.length > entries.length
    };
  };

  const buildFolderAnalysis = ({ rootName, entries, truncated }) => {
    const files = [];
    const extensionStats = new Map();
    const typeStats = new Map();
    const groups = new Map();
    entries.slice(0, MAX_FOLDER_FILES).forEach((entry) => {
      const file = entry.file;
      if (!file) return;
      const rawPath = normalizeRelativePath(entry.relativePath || file.name || '');
      const segments = rawPath ? rawPath.split(/[/\\]+/).filter(Boolean) : [file.name];
      const folderKey = segments.length > 1 ? segments[0] : ROOT_FOLDER_KEY;
      const folderLabel = folderKey === ROOT_FOLDER_KEY ? 'Loose files' : folderKey;
      const ext = getExtension(file.name);
      const type = classifyFileType(file, ext);
      const extKey = ext || '__noext__';
      const typeStat = typeStats.get(type) || { type, label: TYPE_LABELS[type] || 'Other', count: 0 };
      typeStat.count += 1;
      typeStats.set(type, typeStat);
      const extStat = extensionStats.get(extKey) || { ext, extKey, count: 0, type };
      extStat.count += 1;
      extensionStats.set(extKey, extStat);
      if (!groups.has(folderKey)) {
        groups.set(folderKey, { key: folderKey, label: folderLabel, files: [] });
      }
      const record = {
        file,
        relativePath: rawPath || file.name,
        ext,
        extKey,
        type,
        folderKey,
        folderLabel
      };
      groups.get(folderKey).files.push(record);
      files.push(record);
    });
    return {
      rootName: rootName || 'Imported folder',
      totalFiles: entries.length,
      limitedCount: files.length,
      truncated: !!truncated,
      maxFiles: MAX_FOLDER_FILES,
      files,
      typeStats: Array.from(typeStats.values()),
      extensions: Array.from(extensionStats.values()).sort((a, b) => b.count - a.count || a.ext.localeCompare(b.ext)),
      groups
    };
  };

  const formatExtensionLabel = (ext) => {
    if (!ext) return 'No extension';
    return ext.startsWith('.') ? ext : `.${ext}`;
  };

  const createTypeButton = (stat, selectedTypes, update) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm workspace-folder-type-btn';
    btn.dataset.type = stat.type;
    btn.innerHTML = `<span>${stat.label || TYPE_LABELS[stat.type] || 'Other'}</span><small>${stat.count}</small>`;
    const syncState = () => {
      btn.classList.toggle('is-active', selectedTypes.has(stat.type));
    };
    btn.addEventListener('click', () => {
      if (selectedTypes.has(stat.type)) {
        selectedTypes.delete(stat.type);
      } else {
        selectedTypes.add(stat.type);
      }
      if (!selectedTypes.size) {
        selectedTypes.add(stat.type);
      }
      syncState();
      update();
    });
    syncState();
    return btn;
  };

  const showFolderSummaryDialog = (analysis) => {
    if (typeof document === 'undefined') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'workspace-import-choice workspace-import-choice--folder';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');

      const panel = document.createElement('div');
      panel.className = 'workspace-import-choice-panel workspace-import-folder-panel';
      overlay.appendChild(panel);

      const title = document.createElement('h3');
      title.className = 'workspace-import-choice-title';
      title.textContent = `Import “${analysis.rootName}”`;
      panel.appendChild(title);

      const summary = document.createElement('p');
      summary.className = 'workspace-folder-summary';
      panel.appendChild(summary);

      const typeFilters = document.createElement('div');
      typeFilters.className = 'workspace-folder-type-filters';
      panel.appendChild(typeFilters);

      const extList = document.createElement('div');
      extList.className = 'workspace-folder-ext-list';
      panel.appendChild(extList);

      if (analysis.truncated) {
        const limitNote = document.createElement('div');
        limitNote.className = 'workspace-folder-limit';
        limitNote.textContent = `Import limited to first ${analysis.maxFiles} files.`;
        panel.appendChild(limitNote);
      }

      const footer = document.createElement('div');
      footer.className = 'workspace-import-choice-actions workspace-folder-actions';
      panel.appendChild(footer);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn btn-outline-secondary';
      cancelBtn.textContent = 'Cancel';
      footer.appendChild(cancelBtn);

      const importBtn = document.createElement('button');
      importBtn.type = 'button';
      importBtn.className = 'btn btn-primary';
      importBtn.textContent = 'Import';
      footer.appendChild(importBtn);

      const selectedTypes = new Set(analysis.typeStats.map((stat) => stat.type));
      if (!selectedTypes.size) {
        selectedTypes.add('data');
      }
      const selectedExtensions = new Set(analysis.extensions.map((ext) => ext.extKey));
      if (!selectedExtensions.size) {
        selectedExtensions.add('__noext__');
      }

      const updateSummary = () => {
        const selected = analysis.files.filter(
          (record) => selectedTypes.has(record.type) && selectedExtensions.has(record.extKey)
        );
        summary.textContent = `${selected.length} of ${analysis.limitedCount} files selected (${analysis.totalFiles} total)`;
        importBtn.disabled = selected.length === 0;
        importBtn.textContent = selected.length
          ? `Import ${selected.length} file${selected.length === 1 ? '' : 's'}`
          : 'Import';
      };

      analysis.typeStats.forEach((stat) => {
        typeFilters.appendChild(createTypeButton(stat, selectedTypes, updateSummary));
      });
      if (!analysis.typeStats.length) {
        typeFilters.style.display = 'none';
      }

      analysis.extensions.forEach((stat) => {
        const label = document.createElement('label');
        label.className = 'workspace-folder-ext-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.checked = true;
        checkbox.dataset.extKey = stat.extKey;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            selectedExtensions.add(stat.extKey);
          } else {
            selectedExtensions.delete(stat.extKey);
          }
          if (!selectedExtensions.size) {
            selectedExtensions.add(stat.extKey);
            checkbox.checked = true;
          }
          updateSummary();
        });
        const extLabel = document.createElement('span');
        extLabel.textContent = `${formatExtensionLabel(stat.ext)} (${stat.count})`;
        label.appendChild(checkbox);
        label.appendChild(extLabel);
        extList.appendChild(label);
      });

      const cleanup = () => {
        document.removeEventListener('keydown', keyHandler, true);
        overlay.classList.remove('is-visible');
        setTimeout(() => overlay.remove(), 180);
      };
      const finish = (payload) => {
        cleanup();
        resolve(payload);
      };
      const keyHandler = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      };
      document.addEventListener('keydown', keyHandler, true);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          finish(null);
        }
      });
      cancelBtn.addEventListener('click', () => finish(null));
      importBtn.addEventListener('click', () => {
        const selected = analysis.files.filter(
          (record) => selectedTypes.has(record.type) && selectedExtensions.has(record.extKey)
        );
        if (!selected.length) {
          return;
        }
        finish({
          selectedFiles: selected,
          selectedTypes: new Set(selectedTypes),
          selectedExtensions: new Set(selectedExtensions)
        });
      });

      document.body.appendChild(overlay);
      const schedule = typeof window?.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb) => setTimeout(cb, 0);
      schedule(() => {
        overlay.classList.add('is-visible');
      });
      updateSummary();
    });
  };

  const ingestFolderAnalysis = async (analysis, selection) => {
    if (!selection || !selection.selectedFiles?.length) {
      showToast('No files selected for folder import.', 'warning');
      return;
    }
    const filesByFolder = new Map();
    selection.selectedFiles.forEach((record) => {
      const key = record.folderKey || ROOT_FOLDER_KEY;
      if (!filesByFolder.has(key)) {
        filesByFolder.set(key, []);
      }
      filesByFolder.get(key).push(record);
    });
    if (!filesByFolder.size) {
      showToast('No files selected for folder import.', 'warning');
      return;
    }
    let rootSectionId = null;
    const subgroupIds = new Map();
    const getSubgroupId = (folderKey) => {
      if (!rootSectionId) {
        rootSectionId = ensureSectionId(analysis.rootName) || null;
      }
      if (!rootSectionId) return null;
      if (folderKey === ROOT_FOLDER_KEY) return rootSectionId;
      if (subgroupIds.has(folderKey)) return subgroupIds.get(folderKey);
      const id = ensureSectionId(folderKey, rootSectionId) || rootSectionId;
      subgroupIds.set(folderKey, id);
      return id;
    };

    let panelsCreated = 0;
    let tracesIngested = 0;
    let historyPushed = false;
    let lastPanelId = null;
    const failures = [];
    const ensureHistory = () => {
      if (!historyPushed) {
        pushHistory();
        historyPushed = true;
      }
    };

    for (const [folderKey, records] of filesByFolder.entries()) {
      const payloads = [];
      for (const record of records) {
        try {
          const payload = await uploadTraceFile(record.file, 'auto');
          payloads.push({
            ...payload,
            name: payload?.name || record.file.name,
            filename: payload?.filename || record.file.name
          });
        } catch (err) {
          console.warn('Failed to parse file from folder import', record.file?.name, err);
          failures.push(record.file?.name || 'Unknown file');
        }
      }
      if (!payloads.length) continue;
      // Only create the root section if we actually ingested something.
      ensureHistory();
      const sectionId = getSubgroupId(folderKey);
      const panelId = ingestPanel(payloads, {
        skipHistory: true,
        skipPersist: true,
        sectionId
      });
      if (panelId) {
        panelsCreated += 1;
        tracesIngested += payloads.length;
        lastPanelId = panelId;
      }
    }

    if (!panelsCreated) {
      if (failures.length) {
        showToast('No panels created. Files could not be parsed.', 'warning');
      } else {
        showToast('No panels were created from the selected folder.', 'warning');
      }
      updateHistoryButtons();
      return;
    }

    persist();
    updateHistoryButtons();
    updateCanvasState();
    renderBrowser();
    if (lastPanelId) {
      focusPanel(lastPanelId, { scrollBrowser: true });
    }
    const message = `Imported ${tracesIngested} file${tracesIngested === 1 ? '' : 's'} into ${panelsCreated} panel${panelsCreated === 1 ? '' : 's'}.`;
    showToast(message, 'success');
    if (failures.length) {
      const label = failures.length === 1 ? failures[0] : `${failures.length} files`;
      showToast(`Skipped ${label} that could not be parsed.`, 'warning');
    }
  };

  const handleFolderSelection = async (selection) => {
    if (!selection || !selection.entries?.length) {
      showToast('Selected folder is empty.', 'warning');
      return;
    }
    const analysis = buildFolderAnalysis(selection);
    if (!analysis.files.length) {
      showToast('No supported files found in that folder.', 'warning');
      return;
    }
    const choice = await showFolderSummaryDialog(analysis);
    if (!choice) return;
    await ingestFolderAnalysis(analysis, choice);
  };

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

  const onFolderButtonClick = async () => {
    if (typeof window?.showDirectoryPicker === 'function') {
      const selection = await collectFromDirectoryHandle();
      if (selection) {
        await handleFolderSelection(selection);
      }
    } else if (folderInput) {
      try {
        folderInput.value = '';
      } catch {
        /* ignore */
      }
      folderInput.click();
    } else {
      showToast('Folder import is not available in this browser.', 'warning');
    }
  };

  const onFolderInputChange = async () => {
    const selection = collectFromFolderInput(folderInput?.files || []);
    if (folderInput) {
      try {
        folderInput.value = '';
      } catch {
        /* ignore */
      }
    }
    if (selection) {
      await handleFolderSelection(selection);
    }
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
    const sampleIndex = getNextPanelSequence();
    const baseWavenumbers = [4000, 3600, 3200, 2800, 2400, 2000, 1800, 1600, 1400, 1200, 1000, 800, 600, 400];
    const sampleTrace = {
      name: `Sample ${sampleIndex}`,
      x: baseWavenumbers, // descending to match FTIR convention
      y: baseWavenumbers.map((wn, idx) => Math.sin(idx / 1.8) * 0.2 + 1 - idx * 0.02),
      meta: {
        X_INVERTED: true,
        X_UNITS: 'Wavenumber (cm^-1)',
        Y_UNITS: 'Absorbance'
      }
    };
    ingestPanel(sampleTrace);
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
    addListener(importFolderButton, 'click', onFolderButtonClick);
    addListener(fileInput, 'change', onFileInputChange);
    addListener(folderInput, 'change', onFolderInputChange);
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
